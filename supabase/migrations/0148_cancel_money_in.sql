-- 0148 — Delete or Cancel, step D2 (plan.md, Piece 4): money coming in is cancelled with a reason, never deleted.
--
-- Client receipts, funding movements, Birdwing receipts and Birdwing cross-charges were deletable by anyone holding
-- their tool. Now none is deleted or edited: an admin or the tool's team lead (is_lead — a lead exists only in a scoped
-- tool, so elsewhere that is an admin) cancels one with a reason (the founder, 2026-10-23). It stays on record and
-- leaves every total; the four views over these tables carry their WHERE forward unchanged and learn only that filter.

-- ---------------------------------------------------------------------
-- 1. One shape for every cancel
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['client_receipts', 'funding_movements', 'birdwing_receipts', 'birdwing_cross_charges'] loop
    execute format('alter table %I add column if not exists cancelled_at timestamptz', t);
    execute format('alter table %I add column if not exists cancelled_by uuid references profiles (id)', t);
    execute format('alter table %I add column if not exists cancel_reason text', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_cancel_shape');
    execute format(
      'alter table %I add constraint %I check ('
      '(cancelled_at is null and cancelled_by is null and cancel_reason is null) '
      'or (cancelled_at is not null and length(trim(coalesce(cancel_reason, ''''))) > 0))',
      t, t || '_cancel_shape');
  end loop;
end $$;

-- Invoker: is_lead() answers about the caller. The trigger's arguments are the tool and what the row is called.
create or replace function money_in_cancel_guard()
returns trigger
language plpgsql
as $$
declare
  v_noun text := tg_argv[1];
  v_kept text[] := array['cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by'];
begin
  if old.cancelled_at is not null then
    raise exception 'A cancelled % can no longer be changed', v_noun;
  end if;
  if (to_jsonb(new) - v_kept) is distinct from (to_jsonb(old) - v_kept)
     or (new.cancelled_at is null and new.cancelled_by is null and new.cancel_reason is null) then
    raise exception 'A % is never edited — cancel it and record it again', v_noun;
  end if;
  if not is_lead(tg_argv[0]) then
    raise exception 'Only an admin or the tool''s team lead can cancel a %', v_noun;
  end if;
  if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
    raise exception 'Say why it is cancelled';
  end if;
  new.cancelled_at := now();
  new.cancelled_by := auth.uid();
  new.cancel_reason := trim(new.cancel_reason);
  return new;
end $$;

revoke execute on function money_in_cancel_guard() from public, anon, authenticated;

drop trigger if exists client_receipts_cancel_guard on client_receipts;
create trigger client_receipts_cancel_guard
  before update on client_receipts
  for each row execute function money_in_cancel_guard('/client-relations', 'payment');
drop trigger if exists funding_movements_cancel_guard on funding_movements;
create trigger funding_movements_cancel_guard
  before update on funding_movements
  for each row execute function money_in_cancel_guard('/financial-management', 'movement');
drop trigger if exists birdwing_receipts_cancel_guard on birdwing_receipts;
create trigger birdwing_receipts_cancel_guard
  before update on birdwing_receipts
  for each row execute function money_in_cancel_guard('/birdwing', 'receipt');
drop trigger if exists birdwing_cross_charges_cancel_guard on birdwing_cross_charges;
create trigger birdwing_cross_charges_cancel_guard
  before update on birdwing_cross_charges
  for each row execute function money_in_cancel_guard('/birdwing', 'settlement');

-- ---------------------------------------------------------------------
-- 2. Policies: no delete; a cancel is the only update
-- ---------------------------------------------------------------------
-- The two tables that had an update policy keep it (its qual is still the row's reach, and the guard narrows it to a
-- lead's cancel); Birdwing's two, which had none, get one admitting the leads alone.

drop policy if exists "client_receipts deletable by client relations app" on client_receipts;
drop policy if exists "movements deletable by financial management app" on funding_movements;
drop policy if exists "birdwing_receipts deletable by birdwing app" on birdwing_receipts;
drop policy if exists "birdwing_cross_charges deletable by birdwing app" on birdwing_cross_charges;

drop policy if exists "birdwing_receipts cancellable by birdwing leads" on birdwing_receipts;
create policy "birdwing_receipts cancellable by birdwing leads"
  on birdwing_receipts for update to authenticated
  using ((select is_lead('/birdwing'))) with check ((select is_lead('/birdwing')));
drop policy if exists "birdwing_cross_charges cancellable by birdwing leads" on birdwing_cross_charges;
create policy "birdwing_cross_charges cancellable by birdwing leads"
  on birdwing_cross_charges for update to authenticated
  using ((select is_lead('/birdwing'))) with check ((select is_lead('/birdwing')));

-- ---------------------------------------------------------------------
-- 3. The views leave a cancelled row out
-- ---------------------------------------------------------------------
-- Each is its migration's text (0123 §3, 0058 §5, 0117 §1) with `cancelled_at is null` added where it reads these
-- tables, and nothing else. The WHEREs are the boundary and are carried forward exactly (SECURITY.md).

create or replace view crm_milestone_facts
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
       and cancelled_at is null
     group by milestone_id
  ) rs on rs.milestone_id = m.id
 where has_app('/reporter')
    or has_app('/financial-management');

revoke all on crm_milestone_facts from public, anon;
revoke insert, update, delete, truncate on crm_milestone_facts from authenticated;
grant select on crm_milestone_facts to authenticated;

create or replace view crm_receipt_facts
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
 where r.cancelled_at is null
   and (has_app('/reporter')
    or has_app('/financial-management'));

revoke all on crm_receipt_facts from public, anon;
revoke insert, update, delete, truncate on crm_receipt_facts from authenticated;
grant select on crm_receipt_facts to authenticated;

create or replace view business_plan_target_facts
with (security_barrier) as
select t.id,
       t.plan_id,
       t.plan_name,
       t.scenario_name,
       t.project_id,
       p.name as project_name,
       t.revenue,
       t.total_cost,
       t.pbt,
       t.margin_pct,
       t.peak_funding,
       coalesce((
         select sum(b.total_amount) from bills b where b.project_id = t.project_id
       ), 0) as actual_spend,
       coalesce((
         select sum(r.amount)
           from client_receipts r
           join client_engagements e on e.id = r.engagement_id
          where e.project_id = t.project_id
            and r.cancelled_at is null
       ), 0) as actual_collections,
       t.updated_at as published_at
  from business_plan_targets t
  join projects p on p.id = t.project_id
 where has_app('/business-planning')
    or has_app('/reporter')
    or has_app('/financial-management');

revoke all on business_plan_target_facts from public, anon;
revoke insert, update, delete, truncate on business_plan_target_facts from authenticated;
grant select on business_plan_target_facts to authenticated;

create or replace view birdwing_stay_facts
with (security_barrier = true) as
with base as (
  select
    s.id,
    s.ref,
    s.accounting_month,
    g.name as guest_name,
    s.use,
    s.channel,
    s.status,
    cc.name as cost_centre,
    s.arrival,
    s.departure,
    case when s.status = 'cancelled' then 0 else s.departure - s.arrival end as nights,
    s.adults + s.children as guests,
    s.legacy_room_count,
    s.ota_commission,
    s.discount,
    s.source_key is not null as imported,
    coalesce((select sum(c.amount) from birdwing_stay_charges c where c.stay_id = s.id), 0)
      as charged,
    coalesce((select sum(c.amount) from birdwing_stay_charges c
              where c.stay_id = s.id and c.kind = 'room'), 0) as room_revenue,
    coalesce((select sum(r.amount) from birdwing_receipts r
              where r.stay_id = s.id and r.cancelled_at is null), 0)
      as collected,
    coalesce((select sum(x.amount) from birdwing_cross_charges x
              where x.stay_id = s.id and x.kind = 'cross_charge' and x.cancelled_at is null), 0) as cross_charged,
    coalesce((select sum(x.amount) from birdwing_cross_charges x
              where x.stay_id = s.id and x.kind = 'write_off' and x.cancelled_at is null), 0) as written_off,
    (select sum(r.to_date - r.from_date) from birdwing_stay_rooms r
      where r.stay_id = s.id and r.released_at is null) as booked_room_nights,
    (select i.number from birdwing_invoices i
      where i.stay_id = s.id and i.status = 'issued') as invoice_number
  from birdwing_stays s
  left join birdwing_guests g on g.id = s.guest_id
  left join birdwing_cost_centres cc on cc.id = s.cost_centre_id
  where not s.is_block
)
select
  id as stay_id,
  ref,
  accounting_month as month,
  guest_name,
  use,
  case when use = 'guest' then 'guest' else 'internal' end as segment,
  channel,
  status,
  cost_centre,
  arrival,
  departure,
  nights,
  case
    when status = 'cancelled' then 0
    when booked_room_nights is not null then booked_room_nights
    else round(coalesce(legacy_room_count, 0) * nights, 2)
  end::numeric as room_nights,
  status <> 'cancelled' and booked_room_nights is null and coalesce(legacy_room_count, 0) > 0
    as room_nights_estimated,
  guests,
  room_revenue,
  charged,
  ota_commission,
  discount,
  charged - ota_commission - discount as billed,
  collected,
  cross_charged,
  written_off,
  charged - ota_commission - discount - collected - cross_charged - written_off as pending,
  invoice_number,
  imported
from base
where has_app('/financial-management') or has_app('/reporter');

revoke insert, update, delete, truncate on birdwing_stay_facts from anon, authenticated;
grant select on birdwing_stay_facts to authenticated;

-- ---------------------------------------------------------------------
-- 4. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v text;
  c text;
begin
  foreach t in array array['client_receipts', 'funding_movements', 'birdwing_receipts', 'birdwing_cross_charges'] loop
    foreach c in array array['cancelled_at', 'cancelled_by', 'cancel_reason'] loop
      if not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = t and column_name = c) then
        raise exception '0148: %.% is missing', t, c;
      end if;
    end loop;
    if not exists (select 1 from pg_constraint where conname = t || '_cancel_shape' and conrelid = t::regclass) then
      raise exception '0148: %_cancel_shape is missing', t;
    end if;
    if not exists (select 1 from pg_trigger where tgname = t || '_cancel_guard' and tgrelid = t::regclass
                    and not tgisinternal and tgenabled <> 'D') then
      raise exception '0148: %_cancel_guard is missing or off', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd in ('DELETE', 'ALL')) then
      raise exception '0148: % can still be deleted', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT') <> 1
       or (select count(*) from pg_policies where schemaname = 'public' and tablename = t and cmd = 'UPDATE') <> 1 then
      raise exception '0148: % should have one select and one update policy', t;
    end if;
  end loop;

  foreach v in array array['crm_milestone_facts', 'crm_receipt_facts', 'business_plan_target_facts', 'birdwing_stay_facts']
  loop
    if position('cancelled_at' in pg_get_viewdef(v::regclass)) = 0 then
      raise exception '0148: % still counts cancelled money', v;
    end if;
    if not coalesce((select 'security_barrier=true' = any(reloptions) from pg_class where oid = v::regclass), false) then
      raise exception '0148: % lost its security barrier', v;
    end if;
    if has_table_privilege('authenticated', v, 'insert') or has_table_privilege('authenticated', v, 'update')
       or has_table_privilege('anon', v, 'select') then
      raise exception '0148: % is writable or open to anon', v;
    end if;
  end loop;
  if position('reporter' in pg_get_viewdef('crm_receipt_facts'::regclass)) = 0
     or position('financial-management' in pg_get_viewdef('crm_milestone_facts'::regclass)) = 0
     or position('client-relations' in pg_get_viewdef('crm_receipt_facts'::regclass)) > 0
     or position('business-planning' in pg_get_viewdef('business_plan_target_facts'::regclass)) = 0
     or position('financial-management' in pg_get_viewdef('birdwing_stay_facts'::regclass)) = 0 then
    raise exception '0148: a view''s WHERE was not carried forward';
  end if;

  if (select prosecdef from pg_proc where oid = 'money_in_cancel_guard()'::regprocedure)
     or has_function_privilege('authenticated', 'money_in_cancel_guard()', 'execute') then
    raise exception '0148: money_in_cancel_guard must run as the caller and be reached only by its triggers';
  end if;
end $$;
