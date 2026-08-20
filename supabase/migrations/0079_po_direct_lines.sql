-- 0079 — Purchase orders without an indent
--
-- FOUNDER, 2026-08-19, reversing 0021's "POs come from indents only"
-- (recorded in STATUS.md's settled decisions until today): most
-- construction material is bought in BULK — a lorry of cement for the
-- project, not for a plot — and sometimes urgently. Forcing a paper
-- indent in front of every such buy adds a step that protects nothing:
-- the material is not plot-specific, so there is no approved quantity
-- to cap it against. What ties bulk material to a villa is the store
-- ISSUE (the next step), not the purchase.
--
-- So `purchase_order_lines.indent_line_id` relaxes to nullable. A line
-- with an indent anchor keeps every guard it has today — the approved-
-- indent check and the cannot-order-beyond-approved cap. A line without
-- one has NO quantity ceiling, deliberately: that is what a bulk buy
-- is, and the gates that still stand are the ones that matter — every
-- line must be priced before the PO can be issued (purchase_orders_guard,
-- 0021), and receiving is capped against the PO line (grn_lines_qty_guard,
-- 0023). Receipts and bills are untouched: they anchor on po_line_id
-- and po_id, never on the indent.
--
-- The relaxation is the whole migration; the guard body below is
-- 0021 §7 character for character, plus the one early return.
--
-- Re-runnable throughout (dropping NOT NULL twice is a no-op).

alter table purchase_order_lines
  alter column indent_line_id drop not null;

-- unique (po_id, indent_line_id) stays: NULLs are distinct, so direct
-- lines never collide with it — the same arrangement as indent_lines'
-- own anchors (0019).

create or replace function po_lines_qty_guard()
returns trigger
language plpgsql
as $$
declare
  v_indent_qty numeric;
  v_indent_status text;
  v_ordered numeric;
begin
  -- A direct line (0079): no indent, no approved quantity, no ceiling.
  -- The priced-before-issue gate and the receipt cap still apply.
  if new.indent_line_id is null then
    return new;
  end if;

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

-- The trigger itself is unchanged; recreated so a fresh database gets
-- it even if 0021 is ever compacted.
drop trigger if exists po_lines_qty_guard on purchase_order_lines;
create trigger po_lines_qty_guard
  before insert or update on purchase_order_lines
  for each row execute function po_lines_qty_guard();

-- Prove it landed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_order_lines'
      and column_name = 'indent_line_id'
      and is_nullable = 'NO'
  ) then
    raise exception '0079: indent_line_id is still NOT NULL';
  end if;

  if not exists (
    select 1 from pg_proc where proname = 'po_lines_qty_guard'
  ) then
    raise exception '0079: po_lines_qty_guard is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'po_lines_qty_guard' and not tgisinternal
  ) then
    raise exception '0079: the po_lines_qty_guard trigger is missing';
  end if;
end $$;
