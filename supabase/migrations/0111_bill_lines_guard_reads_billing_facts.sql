-- 0111 — The billing team can put a PO's material on a bill
--
-- FOUND IN B7 (plan.md), before any screen used it. bill_lines_guard()
-- (0106) checks that a material line's PO line belongs to the bill's PO
-- by reading purchase_order_lines. The guard is an ordinary (invoker)
-- trigger, so it reads as the person saving the line — and
-- purchase_order_lines is readable only with /purchase-orders or
-- /reporter (0055). For the billing team, who hold /bills and not
-- /purchase-orders, the PO line is invisible, the check finds nothing,
-- and every material line is refused with "That material is not on this
-- bill's purchase order". Review #1's trial did not catch it: it ran as
-- the database owner, which row-level security does not apply to.
--
-- THE FIX: the check reads po_line_billing_facts instead — the window
-- 0106 made for exactly this, one row per PO line, WHERE-gated to
-- /purchase-orders or /bills. Same rule, same message, still invoker:
-- nothing about who may write a bill line changes, only that the person
-- allowed to write it can now see the PO line it names.
--
-- Proof: scripts/trials/bill-line-po-check.sql, run as a /bills-only
-- person under row-level security — refused without this migration,
-- accepted with it.
--
-- Re-runnable.

create or replace function bill_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_bill uuid;
  v_status text;
  v_po uuid;
begin
  v_bill := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  select status, po_id into v_status, v_po from bills where id = v_bill for share;
  if v_status is distinct from 'recorded' then
    raise exception 'This bill is % — its lines can no longer change', coalesce(v_status, 'gone');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.bill_id <> old.bill_id then
    raise exception 'A line stays on the bill it was made on';
  end if;
  -- po_line_billing_facts, not purchase_order_lines: the billing team
  -- holds /bills, and the view admits /purchase-orders or /bills.
  if new.po_line_id is not null and not exists (
    select 1 from po_line_billing_facts f where f.po_line_id = new.po_line_id and f.po_id = v_po
  ) then
    raise exception 'That material is not on this bill''s purchase order';
  end if;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'bill_lines_guard'
      and prosrc like '%po_line_billing_facts%'
      and prosrc not like '%from purchase_order_lines%'
      and not prosecdef
  ) then
    raise exception '0111: bill_lines_guard must read po_line_billing_facts, as the person';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bill_lines_guard' and tgrelid = 'public.bill_lines'::regclass
  ) then
    raise exception '0111: the bill_lines_guard trigger is missing';
  end if;
end $$;
