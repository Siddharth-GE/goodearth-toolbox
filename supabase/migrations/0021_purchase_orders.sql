-- Phase 6 — Purchase Orders.
--
-- POs are raised from APPROVED indent lines only (founder decision), one
-- vendor per PO, one plot/unit (or "general") per PO — the scope is part
-- of the number: PO/<project code>/<plot-or-unit code>/NNN. Money enters
-- the system here: a line's rate is the price agreed with the vendor, a
-- brand-new figure — nothing from Budgets (cost, margin, client rate)
-- appears on these tables or ever may.
--
-- Status: draft -> issued -> (deletion_requested -> cancelled | issued)
-- and issued -> completed, which only Phase 7's goods-receipt trigger
-- may perform (refused outright here; 0022 replaces the guard to admit
-- it). Deleting an issued PO is request-then-admin-approves — the
-- founder's rule; a draft is deletable by its creator or an admin.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. plots.code / units.code — the scope segment of a PO number
-- ---------------------------------------------------------------------
-- Same shape and rules as projects.code (0019 §1): nullable, short,
-- uppercase; the app normalises, the CHECK is the backstop. A PO scoped
-- to a code-less plot/unit is refused with a friendly pointer to Masters
-- (see create_purchase_order below). Unique within a project — two
-- projects may both have a "V12A".

alter table plots add column if not exists code text;
alter table plots drop constraint if exists plots_code_key;
alter table plots add constraint plots_code_key unique (project_id, code);
alter table plots drop constraint if exists plots_code_shape;
alter table plots add constraint plots_code_shape
  check (code is null or code ~ '^[A-Z0-9-]{2,10}$');

alter table units add column if not exists code text;
alter table units drop constraint if exists units_code_key;
alter table units add constraint units_code_key unique (project_id, code);
alter table units drop constraint if exists units_code_shape;
alter table units add constraint units_code_shape
  check (code is null or code ~ '^[A-Z0-9-]{2,10}$');

-- ---------------------------------------------------------------------
-- 2. gst_rates — the managed list a PO line's GST % is picked from
-- ---------------------------------------------------------------------
-- Founder decision: an operable master, not a hardcoded enum. Seeded
-- with the real slabs; admins add/deactivate from Masters. A line
-- SNAPSHOTS the number into gst_pct (no FK) — deactivating a rate stops
-- new picks without relabelling history, the price-snapshot principle.

create table if not exists gst_rates (
  rate numeric primary key check (rate >= 0 and rate <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into gst_rates (rate) values (0), (5), (12), (18), (28)
on conflict (rate) do nothing;

alter table gst_rates enable row level security;

drop policy if exists "gst_rates readable by authenticated users" on gst_rates;
create policy "gst_rates readable by authenticated users"
  on gst_rates for select to authenticated using (true);
drop policy if exists "gst_rates writable by admins" on gst_rates;
create policy "gst_rates writable by admins"
  on gst_rates for insert to authenticated with check (is_admin());
drop policy if exists "gst_rates updatable by admins" on gst_rates;
create policy "gst_rates updatable by admins"
  on gst_rates for update to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 3. po_counters — numbering per (project, scope)
-- ---------------------------------------------------------------------
-- PO/SAA/V12A/003 and PO/SAA/GEN/001 run independently. Minted only
-- inside create_purchase_order() via the upsert-with-row-lock that
-- serialises concurrent creates (the 0019 §4 pattern). Gaps from deleted
-- drafts are accepted; a reused number is not.

create table if not exists po_counters (
  project_id uuid not null references projects (id),
  scope text not null,
  last_no int not null default 0,
  primary key (project_id, scope)
);

alter table po_counters enable row level security;

drop policy if exists "po_counters readable by authenticated users" on po_counters;
create policy "po_counters readable by authenticated users"
  on po_counters for select to authenticated using (true);
drop policy if exists "po_counters writable by purchase orders app" on po_counters;
create policy "po_counters writable by purchase orders app"
  on po_counters for insert to authenticated with check (has_app('/purchase-orders'));
drop policy if exists "po_counters updatable by purchase orders app" on po_counters;
create policy "po_counters updatable by purchase orders app"
  on po_counters for update to authenticated
  using (has_app('/purchase-orders')) with check (has_app('/purchase-orders'));

-- ---------------------------------------------------------------------
-- 4. purchase_orders
-- ---------------------------------------------------------------------

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  -- The scope: at most one of plot/unit; neither means a general
  -- purchase ("GEN"). Permanent once minted — the number embeds it.
  plot_id uuid references plots (id),
  unit_id uuid references units (id),
  -- The scope segment as minted into the reference ("V12A" / "GEN").
  -- Stored, never recomputed — editing a code later relabels nothing.
  scope_code text not null,
  vendor_id uuid not null references vendors (id),
  po_no int not null,
  reference text not null,
  status text not null default 'draft' check (
    status in ('draft', 'issued', 'deletion_requested', 'cancelled', 'completed')
  ),
  -- Where the goods should go: a store from Masters, a free-text site
  -- address, or both (a store plus an instruction). Phase 7 records
  -- where they actually landed.
  deliver_store_id uuid references stores (id),
  deliver_note text,
  expected_by date,
  terms text,
  note text,
  -- Why an issued PO should be removed — set with the request, shown to
  -- the admin who decides, kept on the cancelled row.
  deletion_note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  issued_by uuid references profiles (id),
  issued_at timestamptz,
  deletion_requested_by uuid references profiles (id),
  deletion_requested_at timestamptz,
  cancelled_by uuid references profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (plot_id is not null and unit_id is not null)),
  unique (project_id, scope_code, po_no),
  unique (reference)
);

create index if not exists purchase_orders_project_idx on purchase_orders (project_id);
create index if not exists purchase_orders_vendor_idx on purchase_orders (vendor_id);
create index if not exists purchase_orders_status_idx on purchase_orders (status);
create index if not exists purchase_orders_unit_idx
  on purchase_orders (unit_id) where unit_id is not null;
create index if not exists purchase_orders_plot_idx
  on purchase_orders (plot_id) where plot_id is not null;

-- ---------------------------------------------------------------------
-- 5. purchase_order_lines
-- ---------------------------------------------------------------------

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NO cascade — the 0019 §5 lesson: a cascaded child
  -- delete fires the draft-only guard after the parent is gone.
  -- delete_draft_purchase_order() is the one sanctioned delete path.
  po_id uuid not null references purchase_orders (id),

  -- Every line carries its own item, quantity and uom — it stands alone
  -- whatever happens to the indent it came from (the independence rule).
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  -- The purchase price agreed with the vendor, per uom. Nullable while
  -- drafting; issuing requires every line priced. Amounts are computed
  -- (qty x rate, + GST) — never stored, so a total can't disagree with
  -- its own lines.
  rate numeric check (rate is null or rate >= 0),
  -- Snapshot of the picked gst_rates row. No FK on purpose — see §2.
  gst_pct numeric check (gst_pct is null or (gst_pct >= 0 and gst_pct <= 100)),
  note text,

  -- Provenance: the approved indent line this purchase fulfils. NOT
  -- NULL — POs are raised from indents only (founder decision). Stable
  -- row id, per the PLAN.md anchoring note for indent consumers.
  indent_line_id uuid not null references indent_lines (id),

  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same indent line never appears twice on one PO. Cross-PO
  -- over-ordering is the qty guard trigger's job (§7) — a constraint
  -- can't see the parent PO's status.
  unique (po_id, indent_line_id)
);

create index if not exists purchase_order_lines_po_idx on purchase_order_lines (po_id);
create index if not exists purchase_order_lines_item_idx on purchase_order_lines (item_id);
create index if not exists purchase_order_lines_indent_line_idx
  on purchase_order_lines (indent_line_id);

-- ---------------------------------------------------------------------
-- 6. Lines writable only while the PO is a draft
-- ---------------------------------------------------------------------
-- The indent_lines_draft_only shape (0019 §6): FOR SHARE on the parent
-- so a line write and a status change serialise instead of interleaving.

create or replace function po_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_po uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_po := old.po_id;
  else
    target_po := new.po_id;
  end if;

  select status into parent_status
  from purchase_orders where id = target_po
  for share;

  if parent_status is distinct from 'draft' then
    raise exception 'Purchase order % is % — lines can only be changed while it is a draft',
      target_po, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists po_lines_draft_only on purchase_order_lines;
create trigger po_lines_draft_only
  before insert or update or delete on purchase_order_lines
  for each row execute function po_lines_draft_only();

-- ---------------------------------------------------------------------
-- 7. The over-ordering guard — duplication impossible at the database
-- ---------------------------------------------------------------------
-- Founder rule: no indent line may ever be ordered beyond its approved
-- quantity, across ALL live POs, no matter how many people are building
-- POs at once.
--
-- Serialisation is an advisory transaction lock keyed on the indent
-- line, NOT "select ... for update" on indent_lines: a row lock there
-- needs UPDATE rights under indents' RLS, which a purchase-orders user
-- doesn't hold. The advisory lock needs no table privilege, is held to
-- transaction end, and makes two concurrent inserts against the same
-- indent line queue rather than both reading the same stale sum.
-- Everything the guard then reads is visible to the acting user:
-- indent_lines/indents are open reads, and PO rows are visible to any
-- /purchase-orders holder.

create or replace function po_lines_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_indent_qty numeric;
  v_indent_status text;
  v_ordered numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.indent_line_id::text, 0));

  select il.quantity, i.status into v_indent_qty, v_indent_status
  from indent_lines il
  join indents i on i.id = il.indent_id
  where il.id = new.indent_line_id;

  if v_indent_qty is null then
    raise exception 'This indent line no longer exists';
  end if;
  if v_indent_status is distinct from 'approved' then
    raise exception 'Purchase orders can only be raised from APPROVED indent lines (this one is %)',
      coalesce(v_indent_status, 'missing');
  end if;

  select coalesce(sum(l.quantity), 0) into v_ordered
  from purchase_order_lines l
  join purchase_orders po on po.id = l.po_id
  where l.indent_line_id = new.indent_line_id
    and po.status <> 'cancelled'
    and l.id <> new.id;

  if v_ordered + new.quantity > v_indent_qty then
    raise exception 'Only % % of this indent line is still unordered (asked for %)',
      v_indent_qty - v_ordered, new.uom, new.quantity;
  end if;

  return new;
end $$;

drop trigger if exists po_lines_qty_guard on purchase_order_lines;
create trigger po_lines_qty_guard
  before insert or update on purchase_order_lines
  for each row execute function po_lines_qty_guard();

-- ---------------------------------------------------------------------
-- 8. The status machine, enforced where it can't be forgotten
-- ---------------------------------------------------------------------

create or replace function purchase_orders_guard()
returns trigger
language plpgsql
as $$
begin
  -- The number on the paper is permanent — and so is the scope it was
  -- minted from. To re-scope a draft, delete it and raise it again.
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.po_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.po_no, old.reference) then
    raise exception 'A purchase order''s project, scope, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (vendor, deliver-to, expected_by, terms, note) only
    -- while it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % purchase order can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    if not exists (select 1 from purchase_order_lines where po_id = new.id) then
      raise exception 'Add at least one line before issuing this purchase order';
    end if;
    if exists (
      select 1 from purchase_order_lines
      where po_id = new.id and (rate is null or gst_pct is null)
    ) then
      raise exception 'Every line needs a rate and a GST %% before the purchase order can be issued';
    end if;
    if new.issued_by is null or new.issued_at is null then
      raise exception 'Issuing must record who issued and when';
    end if;
    return new;
  end if;

  if old.status = 'issued' and new.status = 'deletion_requested' then
    if new.deletion_note is null or length(trim(new.deletion_note)) = 0 then
      raise exception 'Say why this purchase order should be removed — a deletion request needs a note';
    end if;
    if new.deletion_requested_by is null or new.deletion_requested_at is null then
      raise exception 'Requesting deletion must record who asked and when';
    end if;
    return new;
  end if;

  if old.status = 'deletion_requested' and new.status = 'issued' then
    -- Withdrawing or refusing the request: the requester may take it
    -- back; an admin may refuse it. Either way the request fields clear
    -- so the PO reads as plainly issued again.
    if not (is_admin() or old.deletion_requested_by = auth.uid()) then
      raise exception 'Only an admin or the person who asked can withdraw a deletion request';
    end if;
    if new.deletion_note is not null or new.deletion_requested_by is not null
       or new.deletion_requested_at is not null then
      raise exception 'Withdrawing a deletion request must clear the request fields';
    end if;
    return new;
  end if;

  if old.status = 'deletion_requested' and new.status = 'cancelled' then
    -- The founder's rule: removing an issued PO takes an admin's yes.
    if not is_admin() then
      raise exception 'Only an admin can approve deleting a purchase order';
    end if;
    if new.cancelled_by is null or new.cancelled_at is null then
      raise exception 'Cancelling must record who approved and when';
    end if;
    -- Phase 7 adds: refuse when goods have been received against it.
    return new;
  end if;

  if old.status = 'issued' and new.status = 'completed' then
    -- Only the goods-receipt trigger may complete a PO, and goods
    -- receipts arrive with the Inventory tool (Phase 7, migration 0022,
    -- which replaces this function to admit it).
    raise exception 'A purchase order is completed by receiving its goods — that arrives with the Inventory tool';
  end if;

  raise exception 'Invalid purchase order status change: % -> %', old.status, new.status;
end $$;

drop trigger if exists purchase_orders_guard on purchase_orders;
create trigger purchase_orders_guard
  before update on purchase_orders
  for each row execute function purchase_orders_guard();

-- ---------------------------------------------------------------------
-- 9. create_purchase_order() — the only place a number is minted
-- ---------------------------------------------------------------------
-- security invoker: RLS still applies — the INSERT policies are the
-- gate, exactly like create_indent().

create or replace function create_purchase_order(
  p_project_id uuid,
  p_plot_id uuid,
  p_unit_id uuid,
  p_vendor_id uuid,
  p_deliver_store_id uuid,
  p_deliver_note text,
  p_expected_by date,
  p_terms text,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_code text;
  v_scope text;
  v_no int;
  v_id uuid;
  v_vendor_active boolean;
begin
  if p_plot_id is not null and p_unit_id is not null then
    raise exception 'A purchase order is for one plot or one unit, not both';
  end if;

  select code into v_project_code from projects where id = p_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before raising purchase orders';
  end if;

  if p_unit_id is not null then
    select code into v_scope from units
    where id = p_unit_id and project_id = p_project_id;
    if not found then
      raise exception 'That unit does not belong to this project';
    end if;
    if v_scope is null then
      raise exception 'This unit has no short code yet — set one in Masters before raising purchase orders for it';
    end if;
  elsif p_plot_id is not null then
    select code into v_scope from plots
    where id = p_plot_id and project_id = p_project_id;
    if not found then
      raise exception 'That plot does not belong to this project';
    end if;
    if v_scope is null then
      raise exception 'This plot has no short code yet — set one in Masters before raising purchase orders for it';
    end if;
  else
    v_scope := 'GEN';
  end if;

  select is_active into v_vendor_active from vendors where id = p_vendor_id;
  if v_vendor_active is null then
    raise exception 'Pick a vendor for this purchase order';
  end if;
  if not v_vendor_active then
    raise exception 'This vendor is marked inactive in Masters';
  end if;

  insert into po_counters (project_id, scope, last_no)
  values (p_project_id, v_scope, 1)
  on conflict (project_id, scope) do update set last_no = po_counters.last_no + 1
  returning last_no into v_no;

  insert into purchase_orders (
    project_id, plot_id, unit_id, scope_code, vendor_id, po_no, reference,
    deliver_store_id, deliver_note, expected_by, terms, note, created_by, updated_by
  )
  values (
    p_project_id, p_plot_id, p_unit_id, v_scope, p_vendor_id, v_no,
    -- greatest() because lpad truncates past its target (the 0019 §7
    -- rule); matches the TS mirror in lib/purchase-orders/reference.ts.
    'PO/' || v_project_code || '/' || v_scope || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    p_deliver_store_id, nullif(trim(p_deliver_note), ''), p_expected_by,
    nullif(trim(p_terms), ''), nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_purchase_order(uuid, uuid, uuid, uuid, uuid, text, date, text, text) from public;
grant execute on function create_purchase_order(uuid, uuid, uuid, uuid, uuid, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. delete_draft_purchase_order() — atomic, creator-or-admin
-- ---------------------------------------------------------------------
-- The delete_draft_indent() mirror, plus the founder's ownership rule:
-- a draft is its creator's (or an admin's) to throw away, not anyone's.

create or replace function delete_draft_purchase_order(p_po_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator uuid;
begin
  select created_by into v_creator from purchase_orders
  where id = p_po_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft purchase order can be deleted';
  end if;
  if not (is_admin() or v_creator = auth.uid()) then
    raise exception 'Only the person who created this draft (or an admin) can delete it';
  end if;

  delete from purchase_order_lines where po_id = p_po_id;
  delete from purchase_orders where id = p_po_id;
end $$;

revoke execute on function delete_draft_purchase_order(uuid) from public;
grant execute on function delete_draft_purchase_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. updated_by on the indent tables — attribution catches up
-- ---------------------------------------------------------------------
-- The founder's attribution rule reaches Indents' screens this phase;
-- the columns land here so the actions can start stamping them.

alter table indents add column if not exists updated_by uuid references profiles (id);
alter table indent_lines add column if not exists updated_by uuid references profiles (id);

-- ---------------------------------------------------------------------
-- 12. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

drop trigger if exists audit_purchase_orders on purchase_orders;
create trigger audit_purchase_orders
  after insert or update or delete on purchase_orders
  for each row execute function audit_row();

drop trigger if exists audit_purchase_order_lines on purchase_order_lines;
create trigger audit_purchase_order_lines
  after insert or update or delete on purchase_order_lines
  for each row execute function audit_row();

do $$
declare
  t text;
begin
  for t in select unnest(array['purchase_orders', 'purchase_order_lines'])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;

-- MONEY LIVES HERE, so reads follow the Budgets precedent, not the
-- Indents one: SELECT requires the /purchase-orders grant. If Phase 7
-- or the Overview ever need line facts without rates, that is a narrow
-- money-free view to add then — never a wider policy here.
drop policy if exists "purchase_orders readable by purchase orders app" on purchase_orders;
create policy "purchase_orders readable by purchase orders app"
  on purchase_orders for select to authenticated using (has_app('/purchase-orders'));
drop policy if exists "purchase_orders writable by purchase orders app" on purchase_orders;
create policy "purchase_orders writable by purchase orders app"
  on purchase_orders for insert to authenticated with check (has_app('/purchase-orders'));
drop policy if exists "purchase_orders updatable by purchase orders app" on purchase_orders;
create policy "purchase_orders updatable by purchase orders app"
  on purchase_orders for update to authenticated
  using (has_app('/purchase-orders')) with check (has_app('/purchase-orders'));
-- Deletes only via delete_draft_purchase_order(); the policy narrows to
-- drafts owned by the actor (or an admin), belt to the function's braces.
drop policy if exists "draft purchase orders deletable by creator" on purchase_orders;
create policy "draft purchase orders deletable by creator"
  on purchase_orders for delete to authenticated
  using (
    has_app('/purchase-orders') and status = 'draft'
    and (is_admin() or created_by = auth.uid())
  );

drop policy if exists "purchase_order_lines readable by purchase orders app" on purchase_order_lines;
create policy "purchase_order_lines readable by purchase orders app"
  on purchase_order_lines for select to authenticated using (has_app('/purchase-orders'));
drop policy if exists "purchase_order_lines writable by purchase orders app" on purchase_order_lines;
create policy "purchase_order_lines writable by purchase orders app"
  on purchase_order_lines for insert to authenticated with check (has_app('/purchase-orders'));
drop policy if exists "purchase_order_lines updatable by purchase orders app" on purchase_order_lines;
create policy "purchase_order_lines updatable by purchase orders app"
  on purchase_order_lines for update to authenticated
  using (has_app('/purchase-orders')) with check (has_app('/purchase-orders'));
drop policy if exists "purchase_order_lines deletable by purchase orders app" on purchase_order_lines;
create policy "purchase_order_lines deletable by purchase orders app"
  on purchase_order_lines for delete to authenticated
  using (has_app('/purchase-orders'));
