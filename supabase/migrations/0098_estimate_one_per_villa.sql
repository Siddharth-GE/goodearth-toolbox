-- 0098 — One estimate per villa, made official in one step
--
-- The Estimator rework (root plan.md, step 5). FOUNDER, 2026-09-26:
-- "one estimate per villa"; every villa is different, so there is no
-- shared house type — each villa is estimated on its own.
--
-- THE SHAPE. A villa has ONE working estimate: always a draft, always
-- editable. "Make official" takes a numbered, frozen copy of it — the
-- 0077 official estimate the stores and site read — and the working
-- estimate stays open for the next change. Revise, "copy a template onto
-- a villa" and several parallel drafts per villa go; a new villa starts
-- blank or from another villa's estimate, as a one-time copy.
--
--   1. estimator_estimates.is_working — the villa's working estimate.
--      At most one per villa (a partial unique index), and only ever a
--      villa's draft (a CHECK). A plain unique index on drafts would not
--      do: making official briefly holds a second draft header for the
--      villa inside the transaction, and that one is not the working one.
--   2. estimator_copy_estimate_contents() — one estimate's works (and,
--      when asked, everything else: quantities, measurement sheets, its
--      own labour rates, materials and prices) into another. Replaces the
--      app's six-step copy choreography with one statement list.
--   3. make_estimate_official() — copies the working estimate into a new
--      header, writes the snapshot the APP computed (calc.ts stays the
--      only arithmetic; SQL never re-implements it), checks the snapshot
--      covers exactly the works and quantities copied — so an edit made
--      while the app was computing is refused, not frozen stale — and
--      calls 0077's submit_estimate() to mint the number and supersede
--      the villa's previous official. One transaction.
--   4. start_villa_estimate() — a villa's working estimate, blank or
--      from another estimate.
--   5. delete_draft_estimate() — a draft and everything under it, in
--      foreign-key order, in one transaction (the delete_draft_* shape
--      of 0019/0021/0091) — replaces a nine-request delete.
--
-- All four are SECURITY INVOKER: RLS and the /estimator policies apply to
-- every statement inside them, and the 0077/0087/0088/0096 draft-only
-- triggers still fire. They are a way to make several writes atomic,
-- never a way around the grant. Execute is revoked from public and anon
-- and granted to authenticated, in this file (SECURITY.md).
--
-- An official made here does NOT point back at the working estimate
-- (source_estimate_id stays null): that FK is ON DELETE SET NULL, and
-- the 0077 guard refuses any update to a submitted header — so an
-- official pointing at the working estimate would make the working one
-- impossible to discard.
--
-- Existing data: each villa's newest draft becomes its working estimate;
-- any others stay as older drafts the screen offers to delete. Staging
-- holds practice data only; production has no estimator rows.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The working estimate
-- ---------------------------------------------------------------------

alter table estimator_estimates
  add column if not exists is_working boolean not null default false;

comment on column estimator_estimates.is_working is
  'The villa''s working estimate — always a draft, at most one per villa (0098). Make official copies it into a numbered, frozen estimate and leaves it open.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'estimator_estimates_working_shape'
  ) then
    alter table estimator_estimates
      add constraint estimator_estimates_working_shape
      check (not is_working or (status = 'draft' and unit_id is not null and not is_template));
  end if;
end $$;

create unique index if not exists estimator_estimates_working_key
  on estimator_estimates (unit_id) where is_working;

update estimator_estimates e
set is_working = true
where e.id in (
    select distinct on (unit_id) id
    from estimator_estimates
    where status = 'draft' and unit_id is not null and not is_template
    order by unit_id, created_at desc, id
  )
  and not exists (
    select 1 from estimator_estimates w where w.unit_id = e.unit_id and w.is_working
  );

-- ---------------------------------------------------------------------
-- 2. Copy one estimate's contents into another
-- ---------------------------------------------------------------------
-- Lines are matched by work (unique per estimate, 0074), which is how
-- each child row finds its new line. The target must be a draft — the
-- draft-only triggers refuse anything else.

create or replace function estimator_copy_estimate_contents(
  p_from uuid,
  p_to uuid,
  p_everything boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into estimator_estimate_lines
    (estimate_id, work_item_id, qty, note, labour_rate, created_by, updated_by)
  select p_to, l.work_item_id,
         case when p_everything then l.qty end,
         l.note,
         case when p_everything then l.labour_rate end,
         auth.uid(), auth.uid()
  from estimator_estimate_lines l
  where l.estimate_id = p_from;

  if not p_everything then
    return;
  end if;

  insert into estimator_estimate_line_components
    (line_id, item_id, mix_id, material_id, qty_per_unit, created_by, updated_by)
  select t.id, c.item_id, c.mix_id, c.material_id, c.qty_per_unit, auth.uid(), auth.uid()
  from estimator_estimate_line_components c
  join estimator_estimate_lines s on s.id = c.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, created_by, updated_by)
  select t.id, m.description, m.nos, m.length, m.breadth, m.depth, m.sort_order,
         auth.uid(), auth.uid()
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines s on s.id = m.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_item_rates
    (estimate_id, item_id, material_id, rate, note, created_by, updated_by)
  select p_to, r.item_id, r.material_id, r.rate, r.note, auth.uid(), auth.uid()
  from estimator_estimate_item_rates r
  where r.estimate_id = p_from;
end $$;

-- ---------------------------------------------------------------------
-- 3. Make official
-- ---------------------------------------------------------------------
-- p_costs:   [{work_item_id, qty, uom, labour_rate, labour_cost,
--              material_cost, total_cost}] — one per line, from calc.ts
-- p_takeoff: [{work_item_id, item_id, material_name, uom, quantity,
--              rate}] — per (work, item), from calc.ts

create or replace function make_estimate_official(
  p_working uuid,
  p_costs jsonb,
  p_takeoff jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_working estimator_estimates%rowtype;
  v_new uuid;
  v_missing text;
  v_lines int;
begin
  select * into v_working
  from estimator_estimates
  where id = p_working
  for update;

  if not found then
    raise exception 'That estimate no longer exists';
  end if;
  if not v_working.is_working then
    raise exception 'Only a villa''s working estimate can be made official';
  end if;

  select count(*) into v_lines from estimator_estimate_lines where estimate_id = p_working;
  if v_lines = 0 then
    raise exception 'Add at least one work before making this estimate official';
  end if;

  select string_agg(w.code || ' ' || w.name, ', ' order by w.code) into v_missing
  from estimator_estimate_lines l
  join work_items w on w.id = l.work_item_id
  where l.estimate_id = p_working and l.qty is null;
  if v_missing is not null then
    raise exception 'Still to measure: % — measure them, or take them off, first', v_missing;
  end if;

  insert into estimator_estimates
    (project_id, unit_id, is_template, is_working, name, note, created_by, updated_by)
  values
    (v_working.project_id, v_working.unit_id, false, false,
     v_working.name, v_working.note, auth.uid(), auth.uid())
  returning id into v_new;

  perform estimator_copy_estimate_contents(p_working, v_new, true);

  insert into estimator_estimate_line_costs
    (estimate_id, line_id, work_item_id, qty, uom, labour_rate,
     labour_cost, material_cost, total_cost, created_by, updated_by)
  select v_new, l.id, c.work_item_id, c.qty, c.uom, c.labour_rate,
         c.labour_cost, c.material_cost, c.total_cost, auth.uid(), auth.uid()
  from jsonb_to_recordset(p_costs) as c(
    work_item_id uuid, qty numeric, uom text, labour_rate numeric,
    labour_cost numeric, material_cost numeric, total_cost numeric
  )
  join estimator_estimate_lines l on l.estimate_id = v_new and l.work_item_id = c.work_item_id;

  -- The snapshot must describe exactly what was copied: one cost row per
  -- line, at the line's own quantity. Anything else means the estimate
  -- changed while the app was computing — refuse rather than freeze it.
  if jsonb_array_length(p_costs) <> v_lines
     or exists (
       select 1
       from estimator_estimate_lines l
       left join estimator_estimate_line_costs c on c.line_id = l.id
       where l.estimate_id = v_new and (c.id is null or c.qty <> l.qty)
     ) then
    raise exception 'The estimate changed while it was being made official — try again';
  end if;

  insert into estimator_estimate_takeoff
    (estimate_id, work_item_id, item_id, material_name, uom, quantity, rate,
     created_by, updated_by)
  select v_new, t.work_item_id, t.item_id, t.material_name, t.uom, t.quantity, t.rate,
         auth.uid(), auth.uid()
  from jsonb_to_recordset(p_takeoff) as t(
    work_item_id uuid, item_id uuid, material_name text, uom text,
    quantity numeric, rate numeric
  );

  if exists (
    select 1 from estimator_estimate_takeoff t
    where t.estimate_id = v_new
      and not exists (
        select 1 from estimator_estimate_lines l
        where l.estimate_id = v_new and l.work_item_id = t.work_item_id
      )
  ) then
    raise exception 'The estimate changed while it was being made official — try again';
  end if;

  -- Mints EST/<code>/NNN, supersedes the villa's previous official and
  -- freezes this one (0077).
  return submit_estimate(v_new);
end $$;

-- ---------------------------------------------------------------------
-- 4. Start a villa's working estimate
-- ---------------------------------------------------------------------

create or replace function start_villa_estimate(
  p_unit uuid,
  p_source uuid,
  p_everything boolean,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project uuid;
  v_unit_name text;
  v_new uuid;
begin
  select project_id, name into v_project, v_unit_name from units where id = p_unit;
  if not found then
    raise exception 'That villa no longer exists';
  end if;
  if exists (select 1 from estimator_estimates where unit_id = p_unit and is_working) then
    raise exception 'This villa already has a working estimate — open it instead';
  end if;
  if p_source is not null
     and not exists (select 1 from estimator_estimates where id = p_source) then
    raise exception 'The estimate to start from no longer exists';
  end if;

  insert into estimator_estimates
    (project_id, unit_id, is_template, is_working, name, source_estimate_id,
     created_by, updated_by)
  values
    (v_project, p_unit, false, true,
     coalesce(nullif(btrim(p_name), ''), v_unit_name), p_source,
     auth.uid(), auth.uid())
  returning id into v_new;

  if p_source is not null then
    perform estimator_copy_estimate_contents(p_source, v_new, p_everything);
  end if;

  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Delete a draft, everything under it first
-- ---------------------------------------------------------------------

create or replace function delete_draft_estimate(p_estimate uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from estimator_estimates where id = p_estimate and status = 'draft' for update;
  if not found then
    raise exception 'Only a draft can be deleted — an official estimate is replaced by a newer one, never erased';
  end if;

  delete from estimator_estimate_takeoff where estimate_id = p_estimate;
  delete from estimator_estimate_line_costs where estimate_id = p_estimate;
  delete from estimator_estimate_item_rates where estimate_id = p_estimate;
  delete from estimator_estimate_line_components
    where line_id in (select id from estimator_estimate_lines where estimate_id = p_estimate);
  delete from estimator_estimate_line_measurements
    where line_id in (select id from estimator_estimate_lines where estimate_id = p_estimate);
  delete from estimator_estimate_lines where estimate_id = p_estimate;
  delete from estimator_estimates where id = p_estimate;
end $$;

-- ---------------------------------------------------------------------
-- Grants — named roles, never public alone (SECURITY.md)
-- ---------------------------------------------------------------------

revoke execute on function estimator_copy_estimate_contents(uuid, uuid, boolean) from public, anon;
revoke execute on function make_estimate_official(uuid, jsonb, jsonb) from public, anon;
revoke execute on function start_villa_estimate(uuid, uuid, boolean, text) from public, anon;
revoke execute on function delete_draft_estimate(uuid) from public, anon;

-- The copy helper is called from inside the other two, which run as the
-- caller — so the caller needs it too. It is invoker like them: RLS and
-- the draft-only triggers bound it exactly as they bound the app.
grant execute on function estimator_copy_estimate_contents(uuid, uuid, boolean) to authenticated;
grant execute on function make_estimate_official(uuid, jsonb, jsonb) to authenticated;
grant execute on function start_villa_estimate(uuid, uuid, boolean, text) to authenticated;
grant execute on function delete_draft_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'estimator_estimates_working_key'
  ) then
    raise exception '0098: the one-working-estimate-per-villa index is missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'estimator_estimates_working_shape'
  ) then
    raise exception '0098: the working-shape check is missing';
  end if;

  if exists (
    select unit_id from estimator_estimates where is_working group by unit_id having count(*) > 1
  ) then
    raise exception '0098: a villa has two working estimates';
  end if;

  foreach fn in array array[
    'estimator_copy_estimate_contents(uuid,uuid,boolean)',
    'make_estimate_official(uuid,jsonb,jsonb)',
    'start_villa_estimate(uuid,uuid,boolean,text)',
    'delete_draft_estimate(uuid)'
  ] loop
    if (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '0098: % must be security invoker', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception '0098: anon can still execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '0098: authenticated cannot execute %', fn;
    end if;
  end loop;
end $$;
