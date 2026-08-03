-- Phase 7 — Inventory.
--
-- The store-keeper's tool: what arrived against a purchase order, what
-- is in each store right now, and what went out. QUANTITIES ONLY —
-- there is no money anywhere on these tables and none may ever be added
-- (founder decision: money lives on the PO and the Bill; valuation is
-- the accountant's job). That is why reads here are open to any
-- signed-in staff member, the indents precedent (0019 §12).
--
-- Three movements, one balance:
--
--   * goods_receipts   — GRN/<project code>/NNN, always against a PO.
--                        Destination is a store OR the PO's site.
--   * stock_issues     — ISS/<project code>/NNN, out of a store to
--                        another store (a transfer) or to a plot
--                        (consumed at site). Founder's kickoff answer:
--                        a location is a store or a plot, nothing else.
--   * stock_adjustments— a signed correction with a mandatory reason.
--                        Opening stock is a positive adjustment.
--
-- Stock on hand is COMPUTED from those three, never stored — the
-- stock_on_hand view below is the only answer to "how much is there".
--
-- APPEND-ONLY, deliberately. A receipt/issue records a physical event
-- that already happened, so there are no DELETE policies on these
-- tables and their numbers/anchors are permanent. A mis-keyed quantity
-- is corrected by a stock adjustment carrying a reason, which is what
-- makes the correction visible in history instead of erasing it.
--
-- A NOTE ON A STALE COMMENT: 0021 §8 says "migration 0022" would
-- replace purchase_orders_guard() to admit issued -> completed. 0022
-- turned out to be the money-free fact views; the replacement is here,
-- in 0023 (§8). An applied migration is never edited, so that comment
-- stays wrong where it is.
--
-- /inventory is already in the user_apps_app_known CHECK (0017) — no
-- constraint change needed here.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. The two counters — numbering per project
-- ---------------------------------------------------------------------
-- The po_counters shape (0021 §3) with the indent_counters key: GRN and
-- ISS numbers carry no scope segment, so the primary key is the project
-- alone. Minted only inside create_goods_receipt() / create_stock_issue()
-- via the upsert-with-row-lock that serialises concurrent creates. No
-- `id` column and therefore no audit trigger — audit_row() reads new.id.

create table if not exists grn_counters (
  project_id uuid primary key references projects (id),
  last_no int not null default 0
);

create table if not exists iss_counters (
  project_id uuid primary key references projects (id),
  last_no int not null default 0
);

alter table grn_counters enable row level security;
alter table iss_counters enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['grn_counters', 'iss_counters'])
  loop
    execute format('drop policy if exists "%s readable by authenticated users" on %I', t, t);
    execute format(
      'create policy "%s readable by authenticated users" on %I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists "%s writable by inventory app" on %I', t, t);
    execute format(
      'create policy "%s writable by inventory app" on %I for insert to authenticated with check (has_app(''/inventory''))', t, t
    );
    execute format('drop policy if exists "%s updatable by inventory app" on %I', t, t);
    execute format(
      'create policy "%s updatable by inventory app" on %I for update to authenticated using (has_app(''/inventory'')) with check (has_app(''/inventory''))', t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. goods_receipts — what arrived, against which PO, and where it went
-- ---------------------------------------------------------------------
-- Always against a PO (founder decision: nothing arrives without an
-- order behind it). The destination is chosen per receipt:
--
--   * a store        — the goods enter that store's stock, or
--   * to_site        — they were unloaded at the PO's plot/unit and are
--                      consumed where they landed. Such a receipt counts
--                      toward PO fulfilment and shows in history tagged
--                      to its plot, but NEVER enters store stock (see
--                      the stock_on_hand view, §6).
--
-- plot_id/unit_id are copied from the PO at creation, not re-read later
-- — the same "stored, never recomputed" rule as a reference.

create table if not exists goods_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  -- The order this delivery fulfils. Not null: no PO, no receipt.
  po_id uuid not null references purchase_orders (id),

  -- Destination — exactly one of the two, enforced below.
  store_id uuid references stores (id),
  to_site boolean not null default false,
  -- Where "site" was, copied from the PO's scope when to_site.
  plot_id uuid references plots (id),
  unit_id uuid references units (id),

  grn_no int not null,
  -- Minted at creation and stored, so editing a project code later
  -- relabels nothing historical.
  reference text not null,

  -- The vendor's delivery paper, as written on it.
  challan_no text,
  received_at date not null default current_date,
  note text,

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check ((store_id is not null) <> to_site),
  check (not (plot_id is not null and unit_id is not null)),
  check (to_site or (plot_id is null and unit_id is null)),
  unique (project_id, grn_no),
  unique (reference)
);

create index if not exists goods_receipts_project_idx on goods_receipts (project_id);
create index if not exists goods_receipts_po_idx on goods_receipts (po_id);
create index if not exists goods_receipts_store_idx
  on goods_receipts (store_id) where store_id is not null;
create index if not exists goods_receipts_received_at_idx on goods_receipts (received_at);

create table if not exists goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NO cascade — the 0019 §5 lesson: a cascaded child
  -- delete fires guards after the parent row is already gone. Receipts
  -- are append-only anyway (see the header comment), so there is no
  -- sanctioned delete path at all.
  receipt_id uuid not null references goods_receipts (id),

  -- Provenance: the PO line this delivery is against. The CLAUDE.md
  -- anchor rule for PO consumers — a stable row id, never a bare key.
  po_line_id uuid not null references purchase_order_lines (id),

  -- Every line carries its own item, quantity and uom, so it stands
  -- alone whatever happens to the PO line it came from.
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  note text,

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same PO line at most once per receipt. Two part-deliveries of
  -- one line are two receipts, which is what a challan actually is.
  unique (receipt_id, po_line_id)
);

create index if not exists goods_receipt_lines_receipt_idx on goods_receipt_lines (receipt_id);
create index if not exists goods_receipt_lines_po_line_idx on goods_receipt_lines (po_line_id);
create index if not exists goods_receipt_lines_item_idx on goods_receipt_lines (item_id);

-- ---------------------------------------------------------------------
-- 3. stock_issues — what left a store, and where it went
-- ---------------------------------------------------------------------
-- Founder's kickoff answer (2026-08-03): a location is either a store
-- or a plot. So an issue goes to another store (a transfer: the stock
-- moves, the total doesn't change) or to a plot (consumed at site).
-- There is no "manufacturing" destination.

create table if not exists stock_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  -- The store the goods leave.
  store_id uuid not null references stores (id),

  -- Destination — exactly one of the two.
  to_store_id uuid references stores (id),
  plot_id uuid references plots (id),

  iss_no int not null,
  reference text not null,

  issued_at date not null default current_date,
  note text,

  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check ((to_store_id is not null) <> (plot_id is not null)),
  check (to_store_id is null or to_store_id <> store_id),
  unique (project_id, iss_no),
  unique (reference)
);

create index if not exists stock_issues_project_idx on stock_issues (project_id);
create index if not exists stock_issues_store_idx on stock_issues (store_id);
create index if not exists stock_issues_to_store_idx
  on stock_issues (to_store_id) where to_store_id is not null;
create index if not exists stock_issues_issued_at_idx on stock_issues (issued_at);

create table if not exists stock_issue_lines (
  id uuid primary key default gen_random_uuid(),
  -- No cascade, same reason as goods_receipt_lines.
  issue_id uuid not null references stock_issues (id),
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per item per issue; issuing the same item twice is one line
  -- with the total, which keeps the negative-stock guard honest.
  unique (issue_id, item_id)
);

create index if not exists stock_issue_lines_issue_idx on stock_issue_lines (issue_id);
create index if not exists stock_issue_lines_item_idx on stock_issue_lines (item_id);

-- ---------------------------------------------------------------------
-- 4. stock_adjustments — the only way a balance changes by hand
-- ---------------------------------------------------------------------
-- Signed: positive adds (opening stock, a found box), negative removes
-- (breakage, a recount). The reason is MANDATORY — an unexplained
-- correction is exactly the thing spreadsheets allowed and this system
-- must not.

create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id),
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity <> 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  reason text not null check (length(trim(reason)) > 0),
  adjusted_at date not null default current_date,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_adjustments_store_item_idx
  on stock_adjustments (store_id, item_id);
create index if not exists stock_adjustments_adjusted_at_idx
  on stock_adjustments (adjusted_at);

-- ---------------------------------------------------------------------
-- 5. stock_on_hand — the balance, always computed
-- ---------------------------------------------------------------------
-- Founder rule: never a hand-edited balance. Four movement sources,
-- summed per (store, item):
--
--   + receipt lines whose receipt landed in a store
--     (to_site receipts are deliberately absent — those goods were
--      consumed where they were unloaded and never entered stock)
--   - issue lines leaving their store
--   + issue lines arriving at a to_store (the transfer's other half)
--   + adjustments, signed
--
-- Owned by postgres, so it sees every base row; the base tables' reads
-- are open to authenticated anyway (no money exists here).

create or replace view stock_on_hand as
select m.store_id, m.item_id, sum(m.quantity) as quantity
from (
  select gr.store_id, l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  where gr.store_id is not null

  union all

  select si.store_id, l.item_id, -l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id

  union all

  select si.to_store_id, l.item_id, l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id
  where si.to_store_id is not null

  union all

  select a.store_id, a.item_id, a.quantity
  from stock_adjustments a
) m
group by m.store_id, m.item_id;

revoke all on stock_on_hand from public, anon;
grant select on stock_on_hand to authenticated;

-- One item in one store, for the guards below and for pre-flight checks
-- on screen. security definer so a guard always sees the true balance
-- regardless of who is acting.

create or replace function stock_qty_on_hand(p_store_id uuid, p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)
  from stock_on_hand
  where store_id = p_store_id and item_id = p_item_id;
$$;

revoke execute on function stock_qty_on_hand(uuid, uuid) from public;
grant execute on function stock_qty_on_hand(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. The over-receipt guard — receiving more than was ordered is refused
-- ---------------------------------------------------------------------
-- The po_lines_qty_guard shape (0021 §7), with one difference that
-- matters: that guard could read indent_lines directly because indent
-- reads are open. purchase_order_lines is NOT — SELECT there requires
-- /purchase-orders (0021 §12), and this trigger runs as the invoker,
-- who is a store-keeper. So the ordered quantity is read from
-- po_line_facts (0022), the sanctioned money-free window, which is open
-- to authenticated. Never widen the PO policies for this.
--
-- Serialisation is an advisory transaction lock on the PO line, not
-- "select ... for update" — a row lock would need UPDATE rights under
-- the PO tables' RLS, which the store-keeper does not hold. Same
-- reasoning as 0021 §7, spelled out there at length.

create or replace function grn_lines_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_ordered_qty numeric;
  v_po_status text;
  v_po_ref text;
  v_received numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.po_line_id::text, 0));

  select f.quantity, f.po_status, f.po_reference
    into v_ordered_qty, v_po_status, v_po_ref
  from po_line_facts f
  where f.id = new.po_line_id;

  if v_ordered_qty is null then
    raise exception 'That purchase order line no longer exists';
  end if;
  if v_po_status not in ('issued', 'completed') then
    raise exception 'Goods can only be received against an ISSUED purchase order (% is %)',
      v_po_ref, v_po_status;
  end if;

  -- l.id <> new.id so an UPDATE does not count itself twice.
  select coalesce(sum(l.quantity), 0) into v_received
  from goods_receipt_lines l
  where l.po_line_id = new.po_line_id
    and l.id <> new.id;

  if v_received + new.quantity > v_ordered_qty then
    raise exception 'Only % % of this line is still to come (recording %)',
      v_ordered_qty - v_received, new.uom, new.quantity;
  end if;

  return new;
end $$;

drop trigger if exists grn_lines_qty_guard on goods_receipt_lines;
create trigger grn_lines_qty_guard
  before insert or update on goods_receipt_lines
  for each row execute function grn_lines_qty_guard();

-- ---------------------------------------------------------------------
-- 7. A receipt's number, order and destination are permanent
-- ---------------------------------------------------------------------
-- The challan number, date and note can be corrected; what the receipt
-- IS cannot. Quantities are corrected by a stock adjustment with a
-- reason, never by rewriting history (see the header comment).

create or replace function goods_receipts_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.project_id, new.po_id, new.store_id, new.to_site, new.plot_id,
      new.unit_id, new.grn_no, new.reference)
     is distinct from
     (old.project_id, old.po_id, old.store_id, old.to_site, old.plot_id,
      old.unit_id, old.grn_no, old.reference) then
    raise exception 'A goods receipt''s order, destination and number are permanent';
  end if;
  return new;
end $$;

drop trigger if exists goods_receipts_guard on goods_receipts;
create trigger goods_receipts_guard
  before update on goods_receipts
  for each row execute function goods_receipts_guard();

-- ---------------------------------------------------------------------
-- 8. The PO status machine catches up with Phase 7
-- ---------------------------------------------------------------------
-- Two changes to purchase_orders_guard(), both promised by comments in
-- 0021 §8 (which name migration 0022 — see the stale-comment note in
-- this file's header):
--
--   * issued -> completed is now ADMITTED, but only when every line of
--     the PO has been fully received. The guard checks that itself
--     rather than trusting a flag, so the transition is self-validating
--     from any direction — the completion trigger below, or a manual
--     PATCH by a /purchase-orders holder.
--   * deletion_requested -> cancelled is REFUSED once any goods have
--     arrived: cancelling would return quantities to the indent pool
--     that are physically sitting in a store.
--
-- Everything else is character-for-character 0021 §8.

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
    -- Phase 7: goods already in a store cannot be un-ordered.
    if exists (
      select 1
      from goods_receipt_lines rl
      join purchase_order_lines l on l.id = rl.po_line_id
      where l.po_id = new.id
    ) then
      raise exception 'Goods have already been received against this purchase order — it can no longer be cancelled';
    end if;
    return new;
  end if;

  if old.status = 'issued' and new.status = 'completed' then
    -- Phase 7 admits this, but only for a PO that is genuinely finished.
    if exists (
      select 1
      from purchase_order_lines l
      where l.po_id = new.id
        and l.quantity > coalesce((
          select sum(rl.quantity) from goods_receipt_lines rl
          where rl.po_line_id = l.id
        ), 0)
    ) then
      raise exception 'A purchase order is completed by receiving its goods — some lines are still outstanding';
    end if;
    return new;
  end if;

  raise exception 'Invalid purchase order status change: % -> %', old.status, new.status;
end $$;

-- The trigger itself is unchanged (0021 §8) but re-created so this file
-- is re-runnable against a database where it is somehow absent.
drop trigger if exists purchase_orders_guard on purchase_orders;
create trigger purchase_orders_guard
  before update on purchase_orders
  for each row execute function purchase_orders_guard();

-- ---------------------------------------------------------------------
-- 9. A fully-received PO completes itself
-- ---------------------------------------------------------------------
-- security definer, owned by postgres: the store-keeper who records the
-- last delivery holds /inventory, NOT /purchase-orders, so they can
-- neither see nor update purchase_orders under their own RLS. Making
-- this one function run as the table owner is far narrower than
-- widening the purchase_orders UPDATE policy to /inventory, which would
-- let any store-keeper PATCH any PO field.
--
-- The guard above still fires inside this update and re-checks that
-- nothing is outstanding — the completion is validated, not asserted.

create or replace function grn_lines_complete_po()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_id uuid;
begin
  select po_id into v_po_id from purchase_order_lines where id = new.po_line_id;
  if v_po_id is null then
    return new;
  end if;

  update purchase_orders po
  set status = 'completed'
  where po.id = v_po_id
    and po.status = 'issued'
    and not exists (
      select 1
      from purchase_order_lines l
      where l.po_id = v_po_id
        and l.quantity > coalesce((
          select sum(rl.quantity) from goods_receipt_lines rl
          where rl.po_line_id = l.id
        ), 0)
    );

  return new;
end $$;

drop trigger if exists grn_lines_complete_po on goods_receipt_lines;
create trigger grn_lines_complete_po
  after insert or update on goods_receipt_lines
  for each row execute function grn_lines_complete_po();

-- ---------------------------------------------------------------------
-- 10. The negative-stock guard — a store cannot go below zero
-- ---------------------------------------------------------------------
-- Advisory lock keyed on (store, item) so two people issuing the same
-- material at the same moment queue instead of both reading the same
-- stale balance — the 0021 §7 pattern, one level up.
--
-- On UPDATE the row's old quantity is still in the table and therefore
-- already inside the computed balance, so it is added back before the
-- comparison.

create or replace function stock_issue_lines_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_store_id uuid;
  v_available numeric;
begin
  select store_id into v_store_id from stock_issues where id = new.issue_id;
  if v_store_id is null then
    raise exception 'That stock issue no longer exists';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_store_id::text || new.item_id::text, 0)
  );

  v_available := stock_qty_on_hand(v_store_id, new.item_id);
  if tg_op = 'UPDATE' then
    v_available := v_available + old.quantity;
  end if;

  if new.quantity > v_available then
    raise exception 'Only % % of this item is in that store (issuing %)',
      v_available, new.uom, new.quantity;
  end if;

  return new;
end $$;

drop trigger if exists stock_issue_lines_qty_guard on stock_issue_lines;
create trigger stock_issue_lines_qty_guard
  before insert or update on stock_issue_lines
  for each row execute function stock_issue_lines_qty_guard();

create or replace function stock_adjustments_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_available numeric;
begin
  -- Only a removal can take a store below zero.
  if new.quantity > 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.store_id::text || new.item_id::text, 0)
  );

  v_available := stock_qty_on_hand(new.store_id, new.item_id);
  if tg_op = 'UPDATE' then
    v_available := v_available - old.quantity;
  end if;

  if v_available + new.quantity < 0 then
    raise exception 'Only % % of this item is in that store (removing %)',
      v_available, new.uom, abs(new.quantity);
  end if;

  return new;
end $$;

drop trigger if exists stock_adjustments_qty_guard on stock_adjustments;
create trigger stock_adjustments_qty_guard
  before insert or update on stock_adjustments
  for each row execute function stock_adjustments_qty_guard();

-- ---------------------------------------------------------------------
-- 11. create_goods_receipt() — the only place a GRN number is minted
-- ---------------------------------------------------------------------
-- security invoker, so RLS is still the gate (the create_indent /
-- create_purchase_order rule). The PO is read through po_facts because
-- purchase_orders itself is /purchase-orders-gated and a store-keeper
-- is not — the same reason the over-receipt guard uses po_line_facts.

create or replace function create_goods_receipt(
  p_po_id uuid,
  p_store_id uuid,
  p_to_site boolean,
  p_challan_no text,
  p_received_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_plot_id uuid;
  v_unit_id uuid;
  v_status text;
  v_reference text;
  v_project_code text;
  v_store_active boolean;
  v_no int;
  v_id uuid;
begin
  if (p_store_id is not null) = coalesce(p_to_site, false) then
    raise exception 'Choose where the goods went: a store, or the site';
  end if;

  select f.project_id, f.plot_id, f.unit_id, f.status, f.reference
    into v_project_id, v_plot_id, v_unit_id, v_status, v_reference
  from po_facts f
  where f.id = p_po_id;

  if v_project_id is null then
    raise exception 'That purchase order no longer exists';
  end if;
  if v_status <> 'issued' then
    raise exception 'Goods can only be received against an ISSUED purchase order (% is %)',
      v_reference, v_status;
  end if;

  if p_store_id is not null then
    select is_active into v_store_active from stores where id = p_store_id;
    if v_store_active is null then
      raise exception 'Pick a store for this delivery';
    end if;
    if not v_store_active then
      raise exception 'That store is marked inactive in Masters';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before recording deliveries';
  end if;

  insert into grn_counters (project_id, last_no)
  values (v_project_id, 1)
  on conflict (project_id) do update set last_no = grn_counters.last_no + 1
  returning last_no into v_no;

  insert into goods_receipts (
    project_id, po_id, store_id, to_site, plot_id, unit_id,
    grn_no, reference, challan_no, received_at, note, created_by, updated_by
  )
  values (
    v_project_id, p_po_id, p_store_id, coalesce(p_to_site, false),
    case when coalesce(p_to_site, false) then v_plot_id end,
    case when coalesce(p_to_site, false) then v_unit_id end,
    v_no,
    -- greatest() because lpad TRUNCATES past its target (the 0019 §7
    -- rule); matches the TS mirror in lib/inventory/reference.ts.
    'GRN/' || v_project_code || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    nullif(trim(p_challan_no), ''), coalesce(p_received_at, current_date),
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text) from public;
grant execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. create_stock_issue() — the only place an ISS number is minted
-- ---------------------------------------------------------------------
-- The project the number belongs to is derived, not trusted: a plot
-- issue takes the plot's project; a store-to-store transfer takes the
-- issuing store's project, and asks for one when that store isn't tied
-- to a project (stores.project_id is nullable, 0004).

create or replace function create_stock_issue(
  p_store_id uuid,
  p_to_store_id uuid,
  p_plot_id uuid,
  p_project_id uuid,
  p_issued_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_project_code text;
  v_store_active boolean;
  v_no int;
  v_id uuid;
begin
  if (p_to_store_id is not null) = (p_plot_id is not null) then
    raise exception 'Send this to one place: another store, or a plot';
  end if;
  if p_to_store_id = p_store_id then
    raise exception 'A transfer needs a different store to go to';
  end if;

  select is_active into v_store_active from stores where id = p_store_id;
  if v_store_active is null then
    raise exception 'Pick the store the goods are leaving';
  end if;
  if not v_store_active then
    raise exception 'That store is marked inactive in Masters';
  end if;

  if p_to_store_id is not null then
    select is_active into v_store_active from stores where id = p_to_store_id;
    if v_store_active is null then
      raise exception 'Pick the store the goods are going to';
    end if;
    if not v_store_active then
      raise exception 'The receiving store is marked inactive in Masters';
    end if;
  end if;

  if p_plot_id is not null then
    select project_id into v_project_id from plots where id = p_plot_id;
    if v_project_id is null then
      raise exception 'That plot no longer exists';
    end if;
  else
    select project_id into v_project_id from stores where id = p_store_id;
    v_project_id := coalesce(v_project_id, p_project_id);
    if v_project_id is null then
      raise exception 'Pick the project this transfer belongs to — the issuing store is not tied to one';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before issuing material';
  end if;

  insert into iss_counters (project_id, last_no)
  values (v_project_id, 1)
  on conflict (project_id) do update set last_no = iss_counters.last_no + 1
  returning last_no into v_no;

  insert into stock_issues (
    project_id, store_id, to_store_id, plot_id, iss_no, reference,
    issued_at, note, created_by, updated_by
  )
  values (
    v_project_id, p_store_id, p_to_store_id, p_plot_id, v_no,
    'ISS/' || v_project_code || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    coalesce(p_issued_at, current_date), nullif(trim(p_note), ''),
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_stock_issue(uuid, uuid, uuid, uuid, date, text) from public;
grant execute on function create_stock_issue(uuid, uuid, uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 13. An issue's number, store and destination are permanent
-- ---------------------------------------------------------------------

create or replace function stock_issues_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.project_id, new.store_id, new.to_store_id, new.plot_id,
      new.iss_no, new.reference)
     is distinct from
     (old.project_id, old.store_id, old.to_store_id, old.plot_id,
      old.iss_no, old.reference) then
    raise exception 'A stock issue''s store, destination and number are permanent';
  end if;
  return new;
end $$;

drop trigger if exists stock_issues_guard on stock_issues;
create trigger stock_issues_guard
  before update on stock_issues
  for each row execute function stock_issues_guard();

-- ---------------------------------------------------------------------
-- 14. Audit, updated_at, RLS
-- ---------------------------------------------------------------------
-- All five transactional tables carry an `id`, so audit_row() (0006)
-- applies cleanly. The two counter tables are deliberately not audited
-- (no id; a counter's history is noise) — the 0019 §10 rule.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'goods_receipts', 'goods_receipt_lines', 'stock_issues',
    'stock_issue_lines', 'stock_adjustments'
  ])
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format(
      'create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t
    );
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

-- No money anywhere on these tables, so reads are open to any signed-in
-- staff member (the indents precedent, 0019 §12) — a site engineer must
-- be able to see whether their material has arrived. Writes are the
-- /inventory grant's.
--
-- There is NO delete policy on any of them, on purpose: these are
-- records of physical events (see the header comment). Corrections go
-- through stock_adjustments, which carry a mandatory reason.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'goods_receipts', 'goods_receipt_lines', 'stock_issues',
    'stock_issue_lines', 'stock_adjustments'
  ])
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s readable by authenticated users" on %I', t, t);
    execute format(
      'create policy "%s readable by authenticated users" on %I for select to authenticated using (true)', t, t
    );
    execute format('drop policy if exists "%s writable by inventory app" on %I', t, t);
    execute format(
      'create policy "%s writable by inventory app" on %I for insert to authenticated with check (has_app(''/inventory''))', t, t
    );
    execute format('drop policy if exists "%s updatable by inventory app" on %I', t, t);
    execute format(
      'create policy "%s updatable by inventory app" on %I for update to authenticated using (has_app(''/inventory'')) with check (has_app(''/inventory''))', t, t
    );
  end loop;
end $$;
