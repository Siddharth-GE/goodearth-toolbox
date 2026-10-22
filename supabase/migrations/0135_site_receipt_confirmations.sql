-- 0135 — The site confirms what reached it (plan.md, OS process updates, Wave 3b). DRAFT FOR A
-- FABLE REVIEW: new tables and their policies. Not applied.
--
-- After the store issues material to a villa, or a delivery goes straight to site, the supervisor
-- confirms what arrived, line by line, and says why anything is short. A design change from
-- plan.md: the confirmation is Supervisors' own record pointing at Inventory's issue or delivery,
-- not columns written into Inventory's tables by a definer. Inventory's line tables carry quantity
-- and permanence guards that an update would wake; a separate record needs no cross-tool write,
-- only a cross-tool read (Inventory shows the shortage on its issue note and delivery note).
--
-- Append-only: a confirmation is what the site said that day. One per issue or delivery.

create table if not exists site_receipt_confirmations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid unique references stock_issues (id),
  receipt_id uuid unique references goods_receipts (id),
  note text,
  confirmed_by uuid not null references profiles (id),
  confirmed_at timestamptz not null default now(),
  constraint site_receipt_confirmations_one_source check ((issue_id is null) <> (receipt_id is null))
);

create table if not exists site_receipt_confirmation_lines (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references site_receipt_confirmations (id),
  issue_line_id uuid unique references stock_issue_lines (id),
  receipt_line_id uuid unique references goods_receipt_lines (id),
  received_quantity numeric not null check (received_quantity >= 0),
  constraint site_receipt_confirmation_lines_one_source check ((issue_line_id is null) <> (receipt_line_id is null))
);
create index if not exists site_receipt_confirmation_lines_confirmation on site_receipt_confirmation_lines (confirmation_id);

-- What may be confirmed: a villa's issue or a delivery straight to site, a line of that very
-- document, never more than went out. Invoker: the stock tables are open to every signed-in person.
create or replace function site_receipt_confirmations_guard()
returns trigger
language plpgsql
as $$
begin
  if new.issue_id is not null and not exists (
    select 1 from stock_issues where id = new.issue_id and plot_id is not null
  ) then
    raise exception 'Only material issued to a villa is confirmed on site.';
  end if;
  if new.receipt_id is not null and not exists (
    select 1 from goods_receipts where id = new.receipt_id and to_site
  ) then
    raise exception 'Only a delivery straight to site is confirmed there; a store''s delivery is the store''s.';
  end if;
  if new.confirmed_by is distinct from auth.uid() and auth.uid() is not null then
    raise exception 'A confirmation is signed by whoever makes it.';
  end if;
  return new;
end $$;

drop trigger if exists site_receipt_confirmations_guard on site_receipt_confirmations;
create trigger site_receipt_confirmations_guard before insert on site_receipt_confirmations
  for each row execute function site_receipt_confirmations_guard();

create or replace function site_receipt_confirmation_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_issue uuid;
  v_receipt uuid;
  v_sent numeric;
begin
  select issue_id, receipt_id into v_issue, v_receipt
    from site_receipt_confirmations where id = new.confirmation_id;
  if new.issue_line_id is not null then
    select quantity into v_sent from stock_issue_lines
     where id = new.issue_line_id and issue_id = v_issue;
  else
    select quantity into v_sent from goods_receipt_lines
     where id = new.receipt_line_id and receipt_id = v_receipt;
  end if;
  if v_sent is null then
    raise exception 'That line is not on the issue or delivery being confirmed.';
  end if;
  if new.received_quantity > v_sent then
    raise exception 'More than was sent cannot be received — check the quantity.';
  end if;
  return new;
end $$;

drop trigger if exists site_receipt_confirmation_lines_guard on site_receipt_confirmation_lines;
create trigger site_receipt_confirmation_lines_guard before insert on site_receipt_confirmation_lines
  for each row execute function site_receipt_confirmation_lines_guard();

revoke all on function site_receipt_confirmations_guard() from public, anon, authenticated;
revoke all on function site_receipt_confirmation_lines_guard() from public, anon, authenticated;

-- RLS: written by /supervisors, read by /supervisors and the store; never changed or removed.
do $$
declare
  t text;
begin
  for t in select unnest(array['site_receipt_confirmations', 'site_receipt_confirmation_lines'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke update, delete, truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

drop policy if exists "site_receipt_confirmations readable by supervisors and inventory" on site_receipt_confirmations;
create policy "site_receipt_confirmations readable by supervisors and inventory" on site_receipt_confirmations
  for select to authenticated using (has_app('/supervisors') or has_app('/inventory'));
drop policy if exists "site_receipt_confirmations insertable by supervisors app" on site_receipt_confirmations;
create policy "site_receipt_confirmations insertable by supervisors app" on site_receipt_confirmations
  for insert to authenticated with check (has_app('/supervisors'));

drop policy if exists "site_receipt_confirmation_lines readable by supervisors and inventory" on site_receipt_confirmation_lines;
create policy "site_receipt_confirmation_lines readable by supervisors and inventory" on site_receipt_confirmation_lines
  for select to authenticated using (has_app('/supervisors') or has_app('/inventory'));
drop policy if exists "site_receipt_confirmation_lines insertable by supervisors app" on site_receipt_confirmation_lines;
create policy "site_receipt_confirmation_lines insertable by supervisors app" on site_receipt_confirmation_lines
  for insert to authenticated with check (has_app('/supervisors'));

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class
              where relname in ('site_receipt_confirmations', 'site_receipt_confirmation_lines')
                and not relrowsecurity) then
    raise exception '0135: both tables must have RLS on';
  end if;
  if exists (select 1 from pg_policies
              where tablename in ('site_receipt_confirmations', 'site_receipt_confirmation_lines')
                and cmd in ('UPDATE', 'DELETE', 'ALL')) then
    raise exception '0135: confirmations are append-only';
  end if;
  if has_table_privilege('authenticated', 'site_receipt_confirmations', 'update')
     or has_table_privilege('authenticated', 'site_receipt_confirmation_lines', 'delete') then
    raise exception '0135: no client may change or remove a confirmation';
  end if;
end $$;
