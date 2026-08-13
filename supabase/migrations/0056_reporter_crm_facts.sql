-- 0056 — Reporter reads the client money: two CRM fact views.
--
-- Stage 7 of app/(dashboard)/reporter/PLAN.md. Milestone dues and
-- receipts join the Reporter — the money coming IN, beside 0055's money
-- going out.
--
-- AS VIEWS, NOT A WIDENED POLICY — the opposite mechanism to 0055, and
-- the reason is 0050 §10: the stronger reason the CRM tables are gated
-- is not money but PROSE. `client_engagements.details` holds notes
-- about a particular family's bank, their circumstances, and why they
-- are stalling; `note` on milestones and receipts, `registration_note`
-- and `bottlenecks` are the same kind of thing. A widened table policy
-- would carry every one of those columns with it. These views carry
-- none of them. **`details`, `registration_note`, `note` and
-- `bottlenecks` do not appear below — that omission is the boundary.**
--
-- Owner views (postgres bypasses the tables' RLS), so the WHERE clause
-- is the gate: has_app('/client-relations') or has_app('/reporter').
-- Anyone else gets zero rows. security_barrier on the 0019 precedent —
-- it stops the planner pushing a caller's leaky function below that
-- WHERE. This is the pattern 0050 itself said such a view must use.
--
-- TWO VIEWS, NEVER ONE JOIN. A milestone with three receipts fans out
-- to three rows, and any sum(due_amount) over the join then triples.
-- This is the easiest way for a report to produce a confidently wrong
-- number, so the split is structural, not advisory. The one crossing
-- allowed is an AGGREGATE: crm_milestone_facts carries the SUM of its
-- own receipts (received_amount, one row per milestone, no fan-out
-- possible). A receipt not yet allocated to a milestone appears only
-- in crm_receipt_facts — so "total received" questions belong to the
-- receipts view; a milestone's received_amount answers "how much of
-- THIS due is in".
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. crm_milestone_facts — one row per payment-schedule rung
-- ---------------------------------------------------------------------

drop view if exists crm_milestone_facts;

create view crm_milestone_facts
with (security_barrier) as
select m.id,
       m.engagement_id,
       e.project_id,
       e.unit_id,
       p.name  as project_name,
       u.name  as unit_name,
       u.client_id,
       c.name  as client_name,
       m.stage,
       m.sort_order,
       m.due_amount,
       m.due_on,
       m.invoice_no,
       m.invoiced_on,
       coalesce(rs.total, 0) as received_amount,
       m.created_at
  from client_payment_milestones m
  join client_engagements e on e.id = m.engagement_id
  join units u    on u.id = e.unit_id
  join projects p on p.id = e.project_id
  left join clients c on c.id = u.client_id
  left join (
    select milestone_id, sum(amount) as total
      from client_receipts
     where milestone_id is not null
     group by milestone_id
  ) rs on rs.milestone_id = m.id
 where has_app('/client-relations') or has_app('/reporter');

revoke all on crm_milestone_facts from public, anon;
grant select on crm_milestone_facts to authenticated;

-- ---------------------------------------------------------------------
-- 2. crm_receipt_facts — one row per rupee-in event
-- ---------------------------------------------------------------------
-- `reference` stays: a cheque number or UTR is a reconciliation fact,
-- not prose about a family. `note` goes.

drop view if exists crm_receipt_facts;

create view crm_receipt_facts
with (security_barrier) as
select r.id,
       r.engagement_id,
       e.project_id,
       e.unit_id,
       p.name  as project_name,
       u.name  as unit_name,
       u.client_id,
       c.name  as client_name,
       r.milestone_id,
       m.stage as milestone_stage,
       r.amount,
       r.received_on,
       r.mode,
       r.reference,
       r.created_at
  from client_receipts r
  join client_engagements e on e.id = r.engagement_id
  join units u    on u.id = e.unit_id
  join projects p on p.id = e.project_id
  left join clients c on c.id = u.client_id
  left join client_payment_milestones m on m.id = r.milestone_id
 where has_app('/client-relations') or has_app('/reporter');

revoke all on crm_receipt_facts from public, anon;
grant select on crm_receipt_facts to authenticated;

-- ---------------------------------------------------------------------
-- 3. Proof, not trust
-- ---------------------------------------------------------------------
-- Assert the prose columns really are absent — the boundary here is the
-- column list, so a careless column added later should fail loudly at
-- migration time, not leak silently.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name in ('crm_milestone_facts', 'crm_receipt_facts')
       and column_name in ('note', 'details', 'registration_note', 'bottlenecks')
  ) then
    raise exception 'a CRM fact view exposes a prose column';
  end if;
end $$;
