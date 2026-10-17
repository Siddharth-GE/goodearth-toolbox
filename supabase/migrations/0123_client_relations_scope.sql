-- 0123 — Client Relations: each person sees the work assigned to them
--
-- FOUNDER, 2026-10-17, replacing Client Relations' decision 6 ("anyone
-- with access can see is ok"): "only those who are assigned a task or own
-- a deal get to see the work except for admins" — and team leads (0122).
-- Asked how, the founder took every recommendation ("rest whatever you
-- said is fine"):
--
--   * A PLOT is yours if you are its Sales owner or its Kaadal owner, or
--     you own or set an open action on it. Its payment schedule and its
--     receipts go with it.
--   * An ACTION is yours if you own it, you set it, or it is on a plot you
--     own.
--   * A plot nobody owns is seen by admins and team leads only, until it
--     is given to someone.
--   * Anyone who can see a plot or an action can still hand it to a
--     colleague — the owner pickers list the whole team — and stops seeing
--     it unless one of the rules above still holds.
--   * Financial Management and Reporter keep every plot's money through
--     their own views. The client list stays Masters' shared list.
--
-- 1. Four helper functions, SECURITY DEFINER so the policies on
--    client_engagements and client_actions can ask about each other
--    without recursing (a definer reads as the owner, past RLS). Each
--    answers only about the caller, and every branch passes through
--    has_app('/client-relations') — directly or inside is_lead() — which
--    is its boundary (SECURITY.md).
-- 2. The four CRM tables' policies narrow IN PLACE: still one policy per
--    command, altered, never a second (CLAUDE.md's red line).
-- 3. crm_milestone_facts and crm_receipt_facts drop /client-relations
--    from their WHERE. Nothing in Client Relations reads them — its
--    screens read the tables above — and left as they were they would
--    hand every member every plot's payments. Columns byte-identical to
--    0058.
-- 4. crm_assign_unit and crm_release_unit, the two definer doors onto a
--    plot's buyer, stop at plots the caller cannot see — an unsold plot
--    can still be sold by anyone on the team — and a plot sold with
--    nobody owning it goes to whoever looks after the client, else to the
--    seller, so it does not leave their sight the moment they sell it.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The questions
-- ---------------------------------------------------------------------

-- Is the caller this plot's Sales owner or Kaadal owner?
create or replace function crm_owns_plot(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_app('/client-relations') and exists (
    select 1 from client_engagements e
     where e.id = p_engagement_id
       and auth.uid() in (e.crm_owner_id, e.kaadal_owner_id)
  )
$$;

-- Does the caller see this plot? A lead does; so does its owner, and
-- whoever owns or set an open action on it. Asked by id, so an updated
-- plot is checked as it was before the update (see crm_sees_action).
create or replace function crm_sees_plot(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_lead('/client-relations')
      or crm_owns_plot(p_engagement_id)
      or (has_app('/client-relations') and exists (
            select 1 from client_actions a
             where a.engagement_id = p_engagement_id
               and a.status <> 'done'
               and auth.uid() in (a.owner_id, a.created_by)))
$$;

-- Does the caller see this action? A lead does; so do its owner, its
-- setter and its plot's owners.
--
-- ASKED BY ID, NOT OVER THE ROW'S OWN COLUMNS, ON PURPOSE. Postgres checks
-- an updated row against the SELECT policy as well as the update's own,
-- and a function that looks the row up by id reads it as it was before
-- the update. So handing an action to a colleague is not refused for
-- taking it out of the hander's sight — the founder's "work can be handed
-- over". Where it may be put is crm_may_place_action's question.
create or replace function crm_sees_action(p_action_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_lead('/client-relations')
      or (has_app('/client-relations') and exists (
            select 1 from client_actions a
             where a.id = p_action_id
               and (auth.uid() in (a.owner_id, a.created_by)
                    or (a.engagement_id is not null and crm_owns_plot(a.engagement_id)))))
$$;

-- May the caller put this action here? With no plot; on a plot they see;
-- or on the plot it is already on — so a setter can still reopen (Undo)
-- an action whose plot they saw only while it was open. Nobody can make a
-- plot visible to themselves by hanging an action on it.
create or replace function crm_may_place_action(p_action_id uuid, p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_app('/client-relations') and (
    p_engagement_id is null
    or crm_sees_plot(p_engagement_id)
    or exists (
      select 1 from client_actions a
       where a.id = p_action_id and a.engagement_id = p_engagement_id))
$$;

-- Policies run as the person, so the person needs EXECUTE; anon never.
revoke execute on function crm_owns_plot(uuid) from public, anon;
revoke execute on function crm_sees_plot(uuid) from public, anon;
revoke execute on function crm_sees_action(uuid) from public, anon;
revoke execute on function crm_may_place_action(uuid, uuid) from public, anon;
grant execute on function crm_owns_plot(uuid) to authenticated;
grant execute on function crm_sees_plot(uuid) to authenticated;
grant execute on function crm_sees_action(uuid) to authenticated;
grant execute on function crm_may_place_action(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. The policies narrow, in place
-- ---------------------------------------------------------------------
-- A plot. Inserts stay as 0050 left them: every unit gets its one record
-- from units_seed_engagement, so there is nothing to insert. No delete
-- policy, as before.

alter policy "client_engagements readable by client relations app"
  on client_engagements using (crm_sees_plot(id));
-- Handing a plot on is allowed (the check reads the plot as it was).
alter policy "client_engagements updatable by client relations app"
  on client_engagements
  using (crm_sees_plot(id))
  with check (has_app('/client-relations'));

-- Its payment schedule and receipts go with it.
alter policy "client_payment_milestones readable by client relations app"
  on client_payment_milestones using (crm_sees_plot(engagement_id));
alter policy "client_payment_milestones insertable by client relations app"
  on client_payment_milestones with check (crm_sees_plot(engagement_id));
alter policy "client_payment_milestones updatable by client relations app"
  on client_payment_milestones
  using (crm_sees_plot(engagement_id))
  with check (crm_sees_plot(engagement_id));
alter policy "client_payment_milestones deletable by client relations app"
  on client_payment_milestones using (crm_sees_plot(engagement_id));

alter policy "client_receipts readable by client relations app"
  on client_receipts using (crm_sees_plot(engagement_id));
alter policy "client_receipts insertable by client relations app"
  on client_receipts with check (crm_sees_plot(engagement_id));
alter policy "client_receipts updatable by client relations app"
  on client_receipts
  using (crm_sees_plot(engagement_id))
  with check (crm_sees_plot(engagement_id));
alter policy "client_receipts deletable by client relations app"
  on client_receipts using (crm_sees_plot(engagement_id));

-- An action. Still no delete policy (0120: marked done, never deleted).
-- The first half reads the row's own columns so an insert that asks for
-- its row back passes — the row is not there yet for crm_sees_action to
-- find, and its setter is the person inserting it (0121 pins that).
alter policy "client_actions readable by client relations app"
  on client_actions
  using ((has_app('/client-relations') and auth.uid() in (owner_id, created_by))
         or crm_sees_action(id));
alter policy "client_actions insertable by client relations app"
  on client_actions with check (crm_may_place_action(id, engagement_id));
alter policy "client_actions updatable by client relations app"
  on client_actions
  using ((has_app('/client-relations') and auth.uid() in (owner_id, created_by))
         or crm_sees_action(id))
  with check (crm_may_place_action(id, engagement_id));

-- ---------------------------------------------------------------------
-- 3. The two CRM fact views: Reporter and Financial Management only
-- ---------------------------------------------------------------------
-- Everything except the WHERE is byte-identical to 0058 §4, and
-- `create or replace` keeps the views' grants; the revokes are restated
-- anyway (BUGCATCHER #3). Redefining these must carry this two-way WHERE
-- forward (SECURITY.md).

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
 where has_app('/reporter')
    or has_app('/financial-management');

revoke all on crm_receipt_facts from public, anon;
revoke insert, update, delete, truncate on crm_receipt_facts from authenticated;
grant select on crm_receipt_facts to authenticated;

-- ---------------------------------------------------------------------
-- 4. The definer doors onto a plot's buyer
-- ---------------------------------------------------------------------
-- 0050 §3's crm_assign_unit, with two additions marked 0123. SECURITY
-- DEFINER BYPASSES RLS, so the checks in the body are the boundary.

create or replace function crm_assign_unit(
  p_unit_id uuid,
  p_client_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_engagement uuid;
  v_owner uuid;
begin
  if not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to assign a plot';
  end if;

  if p_status not in ('available', 'reserved', 'sold') then
    raise exception 'Unknown unit status: %', p_status;
  end if;

  -- p_client_id null un-assigns, which is how a cancelled booking is
  -- undone. The status still has to be stated, so nobody ends up with an
  -- unassigned plot still marked sold.
  if p_client_id is not null and not exists (
    select 1 from clients where id = p_client_id and is_active
  ) then
    raise exception 'That client no longer exists';
  end if;

  select u.client_id, e.id into v_buyer, v_engagement
    from units u
    left join client_engagements e on e.unit_id = u.id
   where u.id = p_unit_id;
  if not found then
    raise exception 'That plot no longer exists';
  end if;

  -- 0123: a plot that has a buyer is changed only by someone who sees it.
  -- An unsold plot can be sold by anyone on the team.
  if v_buyer is not null and not crm_sees_plot(v_engagement) then
    raise exception 'That plot is not one of yours. Ask a team lead to change its buyer.';
  end if;

  update units
     set client_id = p_client_id,
         status = p_status,
         updated_by = auth.uid()
   where id = p_unit_id;

  -- 0123: a plot sold with nobody owning it goes to whoever looks after
  -- the client, if they are on the team, else to the seller, if they are.
  -- An admin selling for a client nobody looks after leaves it for a lead
  -- to give out — admins own no list (0120).
  if p_client_id is not null and v_engagement is not null then
    select t.id into v_owner
      from client_relations_team() t
     where t.id = (select c.crm_owner_id from clients c where c.id = p_client_id);
    if v_owner is null then
      select t.id into v_owner from client_relations_team() t where t.id = auth.uid();
    end if;
    if v_owner is not null then
      update client_engagements
         set crm_owner_id = v_owner,
             updated_by = auth.uid()
       where id = v_engagement
         and crm_owner_id is null;
    end if;
  end if;
end $$;

revoke all on function crm_assign_unit(uuid, uuid, text) from public, anon;
grant execute on function crm_assign_unit(uuid, uuid, text) to authenticated;

-- 0051's crm_release_unit, stopping at plots the caller cannot see. No
-- screen calls it today; over the REST API it would otherwise strip the
-- buyer off any plot.
create or replace function crm_release_unit(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SECURITY DEFINER BYPASSES RLS. This check IS the permission boundary,
  -- exactly as in crm_assign_unit.
  if not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to release a plot';
  end if;

  if not exists (select 1 from units where id = p_unit_id) then
    raise exception 'That plot no longer exists';
  end if;

  -- 0123.
  if not crm_sees_plot((select e.id from client_engagements e where e.unit_id = p_unit_id)) then
    raise exception 'That plot is not one of yours. Ask a team lead to release it.';
  end if;

  update units
     set client_id = null,
         status = 'available',
         updated_by = auth.uid()
   where id = p_unit_id;
end $$;

revoke all on function crm_release_unit(uuid) from public, anon;
grant execute on function crm_release_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  f text;
  v int;
  v_src text;
  v_definer boolean;
begin
  -- (a) Every CRM table: RLS on, ONE SELECT policy, and every policy but
  -- client_engagements' insert asks the new question.
  foreach t in array array[
    'client_engagements', 'client_payment_milestones', 'client_receipts', 'client_actions'
  ] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0123: % has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0123: % has % SELECT policies, expected 1', t, v; end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd in ('SELECT', 'UPDATE', 'DELETE')
        and coalesce(qual, '') not like '%crm_sees_%') then
      raise exception '0123: a read, update or delete policy on % is not scoped', t;
    end if;
    if t <> 'client_engagements' and exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and cmd in ('INSERT', 'UPDATE')
        and coalesce(with_check, '') not like '%crm_%') then
      raise exception '0123: an insert or update check on % is not scoped', t;
    end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and (cmd = 'ALL' or 'anon' = any(roles))) then
      raise exception '0123: % has an ALL or anon policy', t;
    end if;
  end loop;

  -- (b) Still never deleted: an action is marked done, a plot record stays.
  if exists (select 1 from pg_policies
    where schemaname = 'public' and tablename in ('client_actions', 'client_engagements')
      and cmd = 'DELETE') then
    raise exception '0123: client_actions or client_engagements has a delete policy';
  end if;

  -- (c) The helpers: definers whose bodies ask has_app, never for anon.
  foreach f in array array[
    'crm_owns_plot(uuid)', 'crm_sees_plot(uuid)', 'crm_sees_action(uuid)',
    'crm_may_place_action(uuid,uuid)'
  ] loop
    select prosrc, prosecdef into v_src, v_definer from pg_proc where oid = f::regprocedure;
    if not v_definer or v_src not like '%has_app(''/client-relations'')%' then
      raise exception '0123: % must be a definer that checks has_app', f;
    end if;
    if has_function_privilege('anon', f, 'execute')
       or not has_function_privilege('authenticated', f, 'execute') then
      raise exception '0123: % privileges are wrong', f;
    end if;
  end loop;

  -- (d) The fact views: Reporter and Financial Management only, still
  -- without the CRM's prose, still read-only.
  if exists (select 1 from pg_views
    where schemaname = 'public' and viewname in ('crm_milestone_facts', 'crm_receipt_facts')
      and definition like '%/client-relations%') then
    raise exception '0123: a CRM fact view still admits /client-relations';
  end if;
  select count(*) into v from pg_views
    where schemaname = 'public' and viewname in ('crm_milestone_facts', 'crm_receipt_facts')
      and definition like '%/financial-management%' and definition like '%/reporter%';
  if v <> 2 then raise exception '0123: a CRM fact view lost Reporter or Financial Management'; end if;
  if exists (select 1 from information_schema.columns
    where table_name in ('crm_milestone_facts', 'crm_receipt_facts')
      and column_name in ('note', 'details', 'registration_note', 'bottlenecks')) then
    raise exception '0123: a CRM fact view exposes a prose column';
  end if;
  foreach t in array array['crm_milestone_facts', 'crm_receipt_facts'] loop
    if has_table_privilege('authenticated', t, 'insert')
       or has_table_privilege('authenticated', t, 'update')
       or has_table_privilege('authenticated', t, 'delete')
       or has_table_privilege('anon', t, 'select') then
      raise exception '0123: % has a write grant or is open to anon', t;
    end if;
  end loop;

  -- (e) The buyer doors stop at what the caller sees.
  foreach f in array array['crm_assign_unit(uuid,uuid,text)', 'crm_release_unit(uuid)'] loop
    select prosrc into v_src from pg_proc where oid = f::regprocedure;
    if v_src not like '%has_app(''/client-relations'')%' or v_src not like '%crm_sees_plot(%' then
      raise exception '0123: % does not check the grant and the plot', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception '0123: % is executable by anon', f;
    end if;
  end loop;
end $$;
