-- 0158 — Stage owners, and indents raised for a stage (plan.md, the team's additions, D).
--
-- 1. site_category_owners: each work category's lead (MEP → one person, Carpentry → another), set on Supervisors →
--    Sequence. site_stages.owner_id overrides it on one villa's stage. A stage's owner is the override, else its
--    category's lead; the app works that out, nothing stores it twice. Owners are people, not grants: an owner without
--    /supervisors simply cannot open the tool.
-- 2. indents.work_group_id: an indent is raised for a stage (a work group, as Supervisors' programme counts stages)
--    rather than one work, and its estimate pull offers every work of that stage. An older indent keeps its work; an
--    indent names a work or a stage, never both. indents_guard freezes every header field once past draft, and its
--    cancel branch now names the stage too (3).
-- 4. villa_cost_facts gains work_group_id, so budget against actual shows a stage indent's purchases under its stage.

-- 1 ------------------------------------------------------------------------------------------------------
create table if not exists site_category_owners (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null unique references work_categories (id),
  owner_id uuid not null references profiles (id),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_category_owners enable row level security;
revoke all on site_category_owners from public, anon;

drop trigger if exists audit_site_category_owners on site_category_owners;
create trigger audit_site_category_owners after insert or update or delete on site_category_owners
  for each row execute function audit_row();
drop trigger if exists set_updated_at on site_category_owners;
create trigger set_updated_at before update on site_category_owners
  for each row execute function set_updated_at();

-- Edited freely by the site team, as the sequence is: a lead is set, changed or taken off.
drop policy if exists "site_category_owners readable by supervisors app" on site_category_owners;
create policy "site_category_owners readable by supervisors app" on site_category_owners
  for select to authenticated using ((select has_app('/supervisors')));
drop policy if exists "site_category_owners insertable by supervisors app" on site_category_owners;
create policy "site_category_owners insertable by supervisors app" on site_category_owners
  for insert to authenticated with check ((select has_app('/supervisors')));
drop policy if exists "site_category_owners updatable by supervisors app" on site_category_owners;
create policy "site_category_owners updatable by supervisors app" on site_category_owners
  for update to authenticated using ((select has_app('/supervisors'))) with check ((select has_app('/supervisors')));
drop policy if exists "site_category_owners deletable by supervisors app" on site_category_owners;
create policy "site_category_owners deletable by supervisors app" on site_category_owners
  for delete to authenticated using ((select has_app('/supervisors')));

alter table site_stages add column if not exists owner_id uuid references profiles (id);
create index if not exists site_stages_owner on site_stages (owner_id) where owner_id is not null;

-- 2 ------------------------------------------------------------------------------------------------------
alter table indents add column if not exists work_group_id uuid references work_groups (id);
create index if not exists indents_work_group on indents (work_group_id) where work_group_id is not null;
alter table indents drop constraint if exists indents_work_or_stage;
alter table indents add constraint indents_work_or_stage
  check (work_item_id is null or work_group_id is null);

-- 3. A cancel changes nothing else on an indent, its stage included: indents_guard as 0143 left it, with work_group_id
--    in both lists.
create or replace function indents_guard()
returns trigger
language plpgsql
as $$
declare
  v_orders int;
begin
  -- The number on the paper is permanent.
  if (new.project_id, new.indent_no, new.reference)
     is distinct from (old.project_id, old.indent_no, old.reference) then
    raise exception 'An indent''s project, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (plot, unit, stage, required_by, note) only while
    -- it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % indent can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    -- The UPDATE's row lock serialises this count against concurrent
    -- line writes, which take FOR SHARE on this row (0019).
    if not exists (select 1 from indent_lines where indent_id = new.id) then
      raise exception 'Add at least one line before submitting this indent';
    end if;
    if new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must record who submitted and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Resubmitting must clear the rejection note';
    end if;
    -- 0113: a line outside the estimate says why it is needed.
    if exists (
      select 1 from indent_lines
       where indent_id = new.id
         and budget_id is null and construction_line_id is null and estimate_id is null
         and length(trim(coalesce(off_estimate_reason, ''))) = 0
    ) then
      raise exception 'Say why each line outside the estimate is needed before submitting';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'approved' then
    if not (is_admin() or can_approve_indents(auth.uid())) then
      raise exception 'Only a named indent approver or an admin can approve an indent';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    -- 0113: a line outside the estimate waits for the estimator's yes.
    if exists (
      select 1 from indent_lines
       where indent_id = new.id
         and budget_id is null and construction_line_id is null and estimate_id is null
         and estimator_decision is distinct from 'approved'
    ) then
      raise exception 'The estimator has not approved every line outside the estimate yet';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    -- A rejection: the reason is mandatory, and the submission record is
    -- cleared so a resubmit stamps fresh.
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a rejection needs a note';
    end if;
    if new.submitted_by is not null or new.submitted_at is not null
       or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Rejecting must clear the submission and approval fields';
    end if;
    return new;
  end if;

  if old.status in ('submitted', 'approved') and new.status = 'cancelled' then
    if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Say why this indent is cancelled';
    end if;
    if (new.plot_id, new.unit_id, new.stage, new.required_by, new.note, new.rejection_note, new.work_item_id, new.work_group_id,
        new.is_urgent, new.created_by, new.submitted_by, new.submitted_at, new.approved_by, new.approved_at)
       is distinct from
       (old.plot_id, old.unit_id, old.stage, old.required_by, old.note, old.rejection_note, old.work_item_id, old.work_group_id,
        old.is_urgent, old.created_by, old.submitted_by, old.submitted_at, old.approved_by, old.approved_at) then
      raise exception 'Cancelling an indent changes nothing else on it';
    end if;
    -- po_lines_qty_guard takes this lock per indent line before it reads the indent's status, so a PO line written
    -- at the same moment either lands first and is counted below, or waits and then finds the indent cancelled.
    perform pg_advisory_xact_lock(hashtextextended(il.id::text, 0))
       from indent_lines il
      where il.indent_id = new.id
      order by il.id;
    -- po_line_facts, not the PO tables: an /indents holder without /purchase-orders reads no PO table (BUGCATCHER #19).
    select count(distinct f.po_id) into v_orders
      from po_line_facts f
      join indent_lines il on il.id = f.indent_line_id
     where il.indent_id = new.id
       and f.po_status <> 'cancelled';
    if v_orders > 0 then
      raise exception '% from this indent — cancel % first',
        case when v_orders = 1 then 'A purchase order orders' else v_orders || ' purchase orders order' end,
        case when v_orders = 1 then 'it' else 'them' end;
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    new.cancel_reason := trim(new.cancel_reason);
    return new;
  end if;

  raise exception 'Invalid indent status change: % -> %', old.status, new.status;
end $$;

-- 4. Budget against actual keeps a stage indent's money under its stage: villa_cost_facts as 0136 left it, with the stage
--    a purchase was bought for (work_group_id, the last column) where it names no work. Gated and read-only as before.
create or replace view villa_cost_facts with (security_barrier = true) as
with villa as (
  select p.id as plot_id, u.id as unit_id from plots p left join units u on u.plot_id = p.id
),
official as (
  select e.id, e.unit_id from estimator_estimates e
   where e.status = 'submitted' and not e.is_template and e.unit_id is not null
),
estimated as (
  select v.plot_id, v.unit_id, c.work_item_id, null::uuid as work_group_id, 'estimated_labour'::text as kind,
         c.labour_cost as amount, c.labour_cost is null as unpriced
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
  union all
  select v.plot_id, v.unit_id, c.work_item_id, null::uuid, 'estimated_material', c.material_cost, c.material_cost is null
    from estimator_estimate_line_costs c
    join official o on o.id = c.estimate_id
    join villa v on v.unit_id = o.unit_id
),
indent_villa as (
  select il.id as indent_line_id, i.work_item_id, i.work_group_id,
         coalesce(i.plot_id, (select u.plot_id from units u where u.id = i.unit_id)) as plot_id
    from indent_lines il join indents i on i.id = il.indent_id
),
po_committed as (
  select iv.plot_id, iv.work_item_id, iv.work_group_id, 'po_committed'::text as kind,
         l.quantity * l.rate - coalesce(l.quantity * l.rate * l.discount_pct / 100, 0) - coalesce(l.discount_amount, 0) as amount,
         l.rate is null as unpriced
    from purchase_order_lines l
    join purchase_orders po on po.id = l.po_id and po.status in ('issued', 'deletion_requested', 'completed')
    join indent_villa iv on iv.indent_line_id = l.indent_line_id
),
issued_line as (
  select si.plot_id, si.work_item_id, sil.quantity,
         sum(m.quantity * r.rate) as valued,
         coalesce(sum(m.quantity) filter (where r.rate is not null), 0) as valued_quantity
    from stock_issue_lines sil
    join stock_issues si on si.id = sil.issue_id and si.plot_id is not null
    left join stock_batch_movements m on m.issue_line_id = sil.id
    left join goods_receipt_line_rates r on r.receipt_line_id = m.receipt_line_id
   group by sil.id, si.plot_id, si.work_item_id, sil.quantity
),
material_spent as (
  select plot_id, work_item_id, 'material_issued'::text as kind,
         coalesce(valued, 0) as amount, valued_quantity < quantity as unpriced
    from issued_line
  union all
  select gr.plot_id, gr.work_item_id, 'material_delivered',
         grl.quantity * r.rate, r.rate is null
    from goods_receipt_lines grl
    join goods_receipts gr on gr.id = grl.receipt_id and gr.to_site
    left join goods_receipt_line_rates r on r.receipt_line_id = grl.id
),
wo_committed as (
  select coalesce(lc.plot_id, (select u.plot_id from units u where u.id = lc.unit_id)) as plot_id,
         l.work_item_id, 'wo_committed'::text as kind,
         coalesce(l.quantity, 1) * l.rate as amount, false as unpriced
    from labour_contract_lines l
    join labour_contracts lc on lc.id = l.contract_id and lc.status = 'approved' and lc.is_active
),
billed as (
  select coalesce(ll.plot_id, b.plot_id, (select u.plot_id from units u where u.id = b.unit_id), iv.plot_id) as plot_id,
         coalesce(bl.work_item_id, ll.work_item_id, iv.work_item_id) as work_item_id,
         case when coalesce(bl.work_item_id, ll.work_item_id, iv.work_item_id) is null then iv.work_group_id end as work_group_id,
         case when b.kind = 'po' then 'material_billed' else 'labour_billed' end as kind,
         coalesce(bl.quantity, 1) * bl.rate - coalesce(bl.discount_amount, 0) as amount,
         false as unpriced
    from bill_lines bl
    join bills b on b.id = bl.bill_id
    left join labour_logs ll on ll.id = bl.labour_log_id
    left join purchase_order_lines pl on pl.id = bl.po_line_id
    left join indent_villa iv on iv.indent_line_id = pl.indent_line_id
),
everything as (
  select plot_id, work_item_id, work_group_id, kind, amount, unpriced from estimated
  union all select plot_id, work_item_id, work_group_id, kind, amount, unpriced from po_committed
  union all select plot_id, work_item_id, null::uuid, kind, amount, unpriced from material_spent
  union all select plot_id, work_item_id, null::uuid, kind, amount, unpriced from wo_committed
  union all select plot_id, work_item_id, work_group_id, kind, amount, unpriced from billed
)
select e.plot_id,
       v.unit_id,
       e.work_item_id,
       e.kind,
       round(sum(coalesce(e.amount, 0)), 2) as amount,
       bool_or(e.unpriced or e.amount is null) as unpriced,
       e.work_group_id
  from everything e
  join villa v on v.plot_id = e.plot_id
 where has_app('/estimator') or has_app('/bills') or has_app('/reporter')
 group by e.plot_id, v.unit_id, e.work_item_id, e.kind, e.work_group_id;

revoke insert, update, delete, truncate on villa_cost_facts from anon, authenticated;
revoke all on villa_cost_facts from anon;
grant select on villa_cost_facts to authenticated;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class where relname = 'site_category_owners' and relrowsecurity) then
    raise exception '0158: site_category_owners has RLS off';
  end if;
  if has_table_privilege('anon', 'site_category_owners', 'select') then
    raise exception '0158: anon can read site_category_owners';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'site_stages' and column_name = 'owner_id')
     or not exists (select 1 from information_schema.columns
                     where table_name = 'indents' and column_name = 'work_group_id') then
    raise exception '0158: a column is missing';
  end if;
  if position('work_group_id' in pg_get_functiondef('indents_guard()'::regprocedure)) = 0 then
    raise exception '0158: a cancel can still change an indent''s stage';
  end if;
  if position('has_app(''/estimator''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0
     or position('has_app(''/bills''' in pg_get_viewdef('villa_cost_facts'::regclass)) = 0 then
    raise exception '0158: villa_cost_facts must keep its gate';
  end if;
  if has_table_privilege('authenticated', 'villa_cost_facts', 'insert') then
    raise exception '0158: villa_cost_facts must stay read-only';
  end if;
end $$;
