-- 0169 — Kaadal Billing (plan.md, top section)
--
-- The Kaadal interiors plots' vendor orders and what has been paid on each, by Kaadal or by the client.
-- Nothing here reads or writes another tool.
--
--   * kaadal_billing_vendors  — the shops paid from this ledger, with their bank details as typed.
--   * kaadal_billing_orders   — one order from one vendor for one or more plots: its value, the value per
--                               plot from the quote, a deduction for cancelled items.
--   * kaadal_billing_payments — each payment on an order; `alloc` names the plots it is for, empty means
--                               shared by each plot's value.
--
-- Grant-gated and not scoped: whoever holds /kaadal-billing sees and edits the whole ledger. Plots are the
-- ledger's own labels ("Plot 45-46", "Site"), not Masters plots. Edits and deletes are allowed, as on the sheet
-- it replaces; audit_row keeps every change. No views. No money is seeded.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically: 0161's list plus the one slug.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections',
    '/kaadal-billing'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections',
    '/kaadal-billing'
  )
);

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
-- created_by is null only on rows the import script wrote (no session).

create table if not exists kaadal_billing_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60 and name = btrim(name)),
  bank text not null default '' check (length(bank) <= 1000),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create unique index if not exists kaadal_billing_vendors_name_key
  on kaadal_billing_vendors (lower(name));

create table if not exists kaadal_billing_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references kaadal_billing_vendors (id) on delete restrict,
  plots text[] not null check (
    cardinality(plots) between 1 and 20
    and array_position(plots, '') is null
    and array_position(plots, null) is null
  ),
  gross numeric(14, 2) not null check (gross > 0),
  -- The value per plot from the quote, { "Plot 11": 267771.53, ... }; empty means split evenly.
  split jsonb not null default '{}' check (jsonb_typeof(split) = 'object'),
  deduction numeric(14, 2) not null default 0 check (deduction >= 0),
  -- The plot the deduction sits on; null means shared by value.
  deduction_plot text,
  deduction_note text not null default '' check (length(deduction_note) <= 80),
  item text not null default '' check (length(item) <= 80),
  pay_note text not null default '' check (length(pay_note) <= 80),
  notes text not null default '' check (length(notes) <= 2000),
  ordered_on date,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  constraint kaadal_billing_orders_deduction_below_value check (deduction < gross),
  constraint kaadal_billing_orders_deduction_plot_on_order
    check (deduction_plot is null or deduction_plot = any (plots))
);

create index if not exists kaadal_billing_orders_vendor_idx on kaadal_billing_orders (vendor_id);

create table if not exists kaadal_billing_payments (
  id uuid primary key default gen_random_uuid(),
  -- An order deleted takes its payments with it: inside this tool, never the line chain.
  order_id uuid not null references kaadal_billing_orders (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  -- Null only on imported rows the sheet had no date for; the Checks tab lists them.
  paid_on date,
  paid_by text not null default 'Kaadal' check (paid_by in ('Kaadal', 'Client')),
  kind text not null check (kind in ('Advance', 'Part payment', 'Final payment', 'Full payment')),
  -- The plots it is for, { "Plot 14": 21820.5 }; empty means shared by each plot's value.
  alloc jsonb not null default '{}' check (jsonb_typeof(alloc) = 'object'),
  reference text not null default '' check (length(reference) <= 60),
  notes text not null default '' check (length(notes) <= 120),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create index if not exists kaadal_billing_payments_order_idx on kaadal_billing_payments (order_id);

-- ---------------------------------------------------------------------
-- 3. Who made it and who changed it last — stamped by the database, never sent by the screen
-- ---------------------------------------------------------------------
-- A session's own id always wins; the import script has none, so its rows keep what it sent.

create or replace function kaadal_billing_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The sheet's money rules, held by the database as well as the screen
-- ---------------------------------------------------------------------
-- Each plot once; plot values on the order's own plots, every plot valued, adding up to the order value; a plot
-- leaves an order only once no payment is marked for it. Invoker: it reads only this tool's tables, as the person.

create or replace function kaadal_billing_orders_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_marked text;
begin
  if exists (select 1 from unnest(new.plots) p group by p having count(*) > 1)
     or exists (select 1 from unnest(new.plots) p where p <> btrim(p)) then
    raise exception 'Name each plot once, without spaces at the ends.' using errcode = 'check_violation';
  end if;
  if new.split <> '{}'::jsonb then
    if exists (
      select 1 from jsonb_each(new.split) e
      where not (e.key = any (new.plots))
         or case when jsonb_typeof(e.value) = 'number'
              then e.value::numeric <= 0 or e.value::numeric <> round(e.value::numeric, 2)
              else true end
    ) then
      raise exception 'Each plot value must be for a plot on this order, more than zero, in rupees and paise.'
        using errcode = 'check_violation';
    end if;
    if (select count(*) from jsonb_each(new.split)) <> cardinality(new.plots)
       or (select round(sum(e.value::numeric), 2) from jsonb_each(new.split) e) <> new.gross then
      raise exception 'Enter a value for every plot, adding up to the order value.' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.plots is distinct from old.plots then
    select k into v_marked
    from kaadal_billing_payments p, jsonb_object_keys(p.alloc) k
    where p.order_id = new.id and not (k = any (new.plots))
    limit 1;
    if v_marked is not null then
      raise exception 'Payments are marked for %. Change those payments first, then remove the plot.', v_marked
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function kaadal_billing_payments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plots text[];
begin
  if new.alloc <> '{}'::jsonb then
    -- For share: a plot being removed from the order at the same moment waits for this save, or this for it.
    select plots into v_plots from kaadal_billing_orders where id = new.order_id for share;
    if v_plots is null or exists (
      select 1 from jsonb_each(new.alloc) e
      where not (e.key = any (v_plots))
         or case when jsonb_typeof(e.value) = 'number'
              then e.value::numeric <= 0 or e.value::numeric <> round(e.value::numeric, 2)
              else true end
    ) then
      raise exception 'A payment can be marked only for plots on its order, each with more than zero, in rupees and paise.'
        using errcode = 'check_violation';
    end if;
    if (select round(sum(e.value::numeric), 2) from jsonb_each(new.alloc) e) <> new.amount then
      raise exception 'The plot amounts must add up to the payment exactly.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function kaadal_billing_stamp() from public, anon, authenticated;
revoke execute on function kaadal_billing_orders_guard() from public, anon, authenticated;
revoke execute on function kaadal_billing_payments_guard() from public, anon, authenticated;

drop trigger if exists kaadal_billing_orders_guard on kaadal_billing_orders;
create trigger kaadal_billing_orders_guard before insert or update on kaadal_billing_orders
  for each row execute function kaadal_billing_orders_guard();
drop trigger if exists kaadal_billing_payments_guard on kaadal_billing_payments;
create trigger kaadal_billing_payments_guard before insert or update on kaadal_billing_payments
  for each row execute function kaadal_billing_payments_guard();

-- ---------------------------------------------------------------------
-- 5. RLS, audit, stamps
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['kaadal_billing_vendors', 'kaadal_billing_orders', 'kaadal_billing_payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public, anon', t);
    execute format('revoke truncate on %I from authenticated', t);
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('drop trigger if exists kaadal_billing_stamp on %I', t);
    execute format('create trigger kaadal_billing_stamp before insert or update on %I for each row execute function kaadal_billing_stamp()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Policies — the grant, one per verb
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  app constant text := '(select has_app(''/kaadal-billing''))';
begin
  foreach t in array array['kaadal_billing_vendors', 'kaadal_billing_orders', 'kaadal_billing_payments']
  loop
    execute format('drop policy if exists "%s read by grant" on %I', t, t);
    execute format('create policy "%s read by grant" on %I for select to authenticated using (%s)', t, t, app);
    execute format('drop policy if exists "%s insert by grant" on %I', t, t);
    execute format('create policy "%s insert by grant" on %I for insert to authenticated with check (%s)', t, t, app);
    execute format('drop policy if exists "%s update by grant" on %I', t, t);
    execute format('create policy "%s update by grant" on %I for update to authenticated using (%s) with check (%s)', t, t, app, app);
    execute format('drop policy if exists "%s delete by grant" on %I', t, t);
    execute format('create policy "%s delete by grant" on %I for delete to authenticated using (%s)', t, t, app);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Asserts
-- ---------------------------------------------------------------------

do $$
declare
  c text;
  s text;
  def text;
  t text;
  x constant text := '( SELECT has_app(''/kaadal-billing''::text) AS has_app)';
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    select pg_get_constraintdef(oid) into def from pg_constraint where conname = c;
    foreach s in array array[
      '/marathon', '/settings', '/masters', '/selections', '/budgets',
      '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
      '/training', '/management-dashboard', '/project-management',
      '/design-management', '/client-relations', '/financial-management',
      '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
      '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections',
      '/kaadal-billing'
    ]
    loop
      if def is null or def not like '%''' || s || '''%' then
        raise exception '0169: % does not admit %', c, s;
      end if;
    end loop;
    if def like '%''/turing''%' then
      raise exception '0169: % admits /turing, which is never grantable', c;
    end if;
  end loop;

  foreach t in array array['kaadal_billing_vendors', 'kaadal_billing_orders', 'kaadal_billing_payments']
  loop
    if not exists (
      select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cl.relname = t and cl.relrowsecurity
    ) then
      raise exception '0169: % is missing or has RLS off', t;
    end if;
    if (select string_agg(p.polcmd::text, ',' order by p.polcmd::text)
          from pg_policy p join pg_class cl on cl.oid = p.polrelid
         where cl.relname = t) is distinct from 'a,d,r,w' then
      raise exception '0169: % should have exactly one policy per verb', t;
    end if;
    -- Every clause of every policy is the grant check and nothing else, for authenticated only.
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and (roles <> '{authenticated}'::name[]
             or coalesce(qual, x) <> x
             or coalesce(with_check, x) <> x)
    ) then
      raise exception '0169: a policy on % is not exactly the grant, for authenticated', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete')
       or has_table_privilege('authenticated', 'public.' || t, 'truncate') then
      raise exception '0169: % is open to anon or truncatable', t;
    end if;
  end loop;

  foreach s in array array['kaadal_billing_stamp()', 'kaadal_billing_orders_guard()', 'kaadal_billing_payments_guard()']
  loop
    if has_function_privilege('anon', s, 'execute') or has_function_privilege('authenticated', s, 'execute') then
      raise exception '0169: % can be called directly', s;
    end if;
  end loop;
end $$;
