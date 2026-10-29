-- 0174 — Everything the SketchUp model sends lands on the estimate (plan.md, From the model, everything, piece 2)
--
-- The founder, 2026-10-29: until the final QS the model's values count, and a mix the toolbox lacks is added to it under
-- a name that says where it came from; at the final QS everything comes from the toolbox.
--
-- 1. estimator_estimates: use_model_materials (Materials from: the model / the Rate book), model_settings, model_bua_sqft.
-- 2. estimator_estimate_line_model_materials: what a row is made of as the model measured it, in each mix's own unit.
-- 3. estimator_estimate_other_costs: the allowances the rate book has no work for, from the model or typed.
-- 4. import_model_takeoff: import_model_rows (0157, unchanged), then the new mixes, the materials, the other costs and
--    the settings, in one transaction.
-- 5. estimator_copy_estimate_contents: a full copy (Make official, a revision) carries all of it.

-- 1 ------------------------------------------------------------------------------------------------------
alter table estimator_estimates add column if not exists use_model_materials boolean not null default true;
alter table estimator_estimates add column if not exists model_settings jsonb;
alter table estimator_estimates add column if not exists model_bua_sqft numeric;
alter table estimator_estimates drop constraint if exists estimator_estimates_model_settings_shape;
alter table estimator_estimates add constraint estimator_estimates_model_settings_shape
  check (model_settings is null or jsonb_typeof(model_settings) = 'object');
alter table estimator_estimates drop constraint if exists estimator_estimates_model_bua_sqft_check;
alter table estimator_estimates add constraint estimator_estimates_model_bua_sqft_check
  check (model_bua_sqft is null or model_bua_sqft > 0);

-- 2 ------------------------------------------------------------------------------------------------------
create table if not exists estimator_estimate_line_model_materials (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references estimator_estimate_lines (id) on delete cascade,
  mix_id uuid not null references estimator_mixes (id),
  qty numeric not null check (qty > 0 and qty < 'Infinity'),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, mix_id)
);
create index if not exists estimator_estimate_line_model_materials_mix
  on estimator_estimate_line_model_materials (mix_id);

-- 3 ------------------------------------------------------------------------------------------------------
create table if not exists estimator_estimate_other_costs (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id) on delete cascade,
  from_model boolean not null default false,
  code text check (code is null or length(trim(code)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 200),
  unit text check (unit is null or length(trim(unit)) between 1 and 40),
  qty numeric check (qty is null or (qty >= 0 and qty < 'Infinity')),
  rate numeric check (rate is null or (rate >= 0 and rate < 'Infinity')),
  note text check (note is null or length(note) <= 500),
  position integer not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists estimator_estimate_other_costs_estimate
  on estimator_estimate_other_costs (estimate_id, position);

-- Both change only while their estimate is a draft (0087's shape), and never move to another row or estimate. A parent
-- already gone inside a cascade (trigger depth above 1) is a delete its own guard allowed, so it passes; a direct
-- delete that cannot see its parent does not.
create or replace function estimator_model_materials_draft_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_status text;
  v_line uuid;
begin
  if tg_op = 'DELETE' then
    v_line := old.line_id;
  else
    v_line := new.line_id;
  end if;
  select e.status into v_status
  from estimator_estimate_lines l
  join estimator_estimates e on e.id = l.estimate_id
  where l.id = v_line
  for share of e;

  if tg_op = 'UPDATE' and new.line_id <> old.line_id then
    raise exception 'A material stays on its own row';
  end if;
  if tg_op = 'DELETE' and v_status is null and pg_trigger_depth() > 1 then
    return old;
  end if;
  if v_status is distinct from 'draft' then
    raise exception 'This estimate is % — what a work is made of can only change while it is a draft. Revise it instead.',
      coalesce(v_status, 'missing');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_model_materials_draft_only on estimator_estimate_line_model_materials;
create trigger estimator_model_materials_draft_only
  before insert or update or delete on estimator_estimate_line_model_materials
  for each row execute function estimator_model_materials_draft_only();

create or replace function estimator_other_costs_draft_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_status text;
  v_estimate uuid;
begin
  if tg_op = 'DELETE' then
    v_estimate := old.estimate_id;
  else
    v_estimate := new.estimate_id;
  end if;
  select status into v_status
  from estimator_estimates
  where id = v_estimate
  for share;

  if tg_op = 'UPDATE' and new.estimate_id <> old.estimate_id then
    raise exception 'An other cost stays on its own estimate';
  end if;
  if tg_op = 'DELETE' and v_status is null and pg_trigger_depth() > 1 then
    return old;
  end if;
  if v_status is distinct from 'draft' then
    raise exception 'This estimate is % — its other costs can only change while it is a draft. Revise it instead.',
      coalesce(v_status, 'missing');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_other_costs_draft_only on estimator_estimate_other_costs;
create trigger estimator_other_costs_draft_only
  before insert or update or delete on estimator_estimate_other_costs
  for each row execute function estimator_other_costs_draft_only();

-- Audit, updated_at, RLS: 0087's loop.
do $$
declare
  t text;
begin
  for t in select unnest(array['estimator_estimate_line_model_materials', 'estimator_estimate_other_costs'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);

    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);

    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s readable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s readable by estimator app" on %I
         for select to authenticated using ((select has_app(''/estimator'')))', t, t);

    execute format('drop policy if exists "%s writable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s writable by estimator app" on %I
         for insert to authenticated with check ((select has_app(''/estimator'')))', t, t);

    execute format('drop policy if exists "%s updatable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s updatable by estimator app" on %I
         for update to authenticated
         using ((select has_app(''/estimator''))) with check ((select has_app(''/estimator'')))', t, t);

    execute format('drop policy if exists "%s deletable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s deletable by estimator app" on %I
         for delete to authenticated using ((select has_app(''/estimator'')))', t, t);

    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

revoke execute on function estimator_model_materials_draft_only() from public, anon, authenticated;
revoke execute on function estimator_other_costs_draft_only() from public, anon, authenticated;

-- 4 ------------------------------------------------------------------------------------------------------
-- p_materials: [{work_item_id, mix_name, mix_uom, qty}], already planned by the app (model-takeoff.ts); p_other_costs:
-- [{code, name, unit, qty, rate, note}]; p_model also carries settings and bua_sqft.
create or replace function import_model_takeoff(
  p_estimate uuid, p_lines jsonb, p_model jsonb, p_materials jsonb, p_other_costs jsonb
)
returns uuid[]
language plpgsql
set search_path to 'public'
as $$
declare
  v_touched uuid[];
  v_prior uuid[];
  v_unit text;
begin
  if jsonb_typeof(p_materials) is distinct from 'array' or jsonb_typeof(p_other_costs) is distinct from 'array' then
    raise exception 'The takeoff''s materials or other costs are missing';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_materials) as m(mix_name text)
    where length(btrim(coalesce(m.mix_name, ''))) not between 1 and 120
  ) or (select count(distinct lower(btrim(m.mix_name))) from jsonb_to_recordset(p_materials) as m(mix_name text)) > 2000
  then
    raise exception 'The takeoff names a mix with no name, one longer than 120 letters, or more mixes than any villa has';
  end if;

  -- Locked before the first read; import_model_rows locks it again, harmlessly.
  perform 1 from estimator_estimates where id = p_estimate for update;

  -- The rows the model measured, or gave materials to, before this send: a work it sends no rows for this time keeps
  -- its materials on the same row (import_model_rows' choice).
  select coalesce(array_agg(distinct l.id), '{}') into v_prior
  from estimator_estimate_lines l
  where l.estimate_id = p_estimate
    and (exists (select 1 from estimator_estimate_line_measurements h where h.line_id = l.id and h.from_model)
         or exists (select 1 from estimator_estimate_line_model_materials mm where mm.line_id = l.id));

  -- Locks the estimate, refuses anything but the villa's working one, and lays the model's rows.
  v_touched := import_model_rows(p_estimate, p_lines, p_model);

  -- A new mix takes the toolbox's own spelling of its unit; a unit the toolbox doesn't know is refused by name.
  select btrim(m.mix_uom) into v_unit
  from jsonb_to_recordset(p_materials) as m(mix_name text, mix_uom text)
  where not exists (select 1 from estimator_mixes x where lower(x.name) = lower(btrim(m.mix_name)))
    and not exists (select 1 from uoms u where lower(u.name) = lower(btrim(m.mix_uom)))
  limit 1;
  if found then
    raise exception 'SketchUp sent a mix in "%", a unit the toolbox doesn''t have — add it in Masters, or fix the unit in SketchUp',
      coalesce(v_unit, 'no unit');
  end if;

  -- A mix the toolbox lacks is made, empty, under From SketchUp; one it has is never changed.
  insert into estimator_mixes (name, uom, group_name, description, created_by, updated_by)
  select distinct on (lower(btrim(m.mix_name)))
         btrim(m.mix_name), u.name, 'From SketchUp',
         'Made by a SketchUp import — add what one unit of it uses.', auth.uid(), auth.uid()
  from jsonb_to_recordset(p_materials) as m(mix_name text, mix_uom text)
  join uoms u on lower(u.name) = lower(btrim(m.mix_uom))
  where not exists (select 1 from estimator_mixes x where lower(x.name) = lower(btrim(m.mix_name)))
  order by lower(btrim(m.mix_name)), u.name
  on conflict ((lower(name))) do nothing;

  if exists (
    select 1
    from jsonb_to_recordset(p_materials) as m(work_item_id uuid, mix_name text, mix_uom text, qty numeric)
    where m.qty is null or m.qty <= 0 or m.qty >= 'Infinity'
       or not exists (
         select 1 from estimator_mixes x
         where lower(x.name) = lower(btrim(m.mix_name)) and lower(btrim(x.uom)) = lower(btrim(m.mix_uom))
       )
       or not exists (
         select 1 from estimator_estimate_lines f
         where f.estimate_id = p_estimate and f.work_item_id = m.work_item_id
       )
  ) then
    raise exception 'The rate book or the estimate changed while the model was importing — press Import again';
  end if;

  -- The model's materials from the last import go. The new ones land on the row the model's rows went to, else the
  -- row that held them before, else the work's first unlabelled row, else its first.
  delete from estimator_estimate_line_model_materials mm
  using estimator_estimate_lines l
  where l.id = mm.line_id and l.estimate_id = p_estimate;

  insert into estimator_estimate_line_model_materials (line_id, mix_id, qty, created_by, updated_by)
  select r.id, x.id, sum(m.qty), auth.uid(), auth.uid()
  from jsonb_to_recordset(p_materials) as m(work_item_id uuid, mix_name text, mix_uom text, qty numeric)
  join estimator_mixes x on lower(x.name) = lower(btrim(m.mix_name))
  join lateral (
    select f.id from estimator_estimate_lines f
     where f.estimate_id = p_estimate and f.work_item_id = m.work_item_id
     order by exists (select 1 from estimator_estimate_line_measurements h
                      where h.line_id = f.id and h.from_model) desc,
              (f.id = any(v_prior)) desc,
              (f.label is not null), f.created_at, f.id
     limit 1
  ) r on true
  group by r.id, x.id;

  -- The model's other costs are replaced; typed ones stay.
  delete from estimator_estimate_other_costs where estimate_id = p_estimate and from_model;
  insert into estimator_estimate_other_costs
    (estimate_id, from_model, code, name, unit, qty, rate, note, position, created_by, updated_by)
  select p_estimate, true, nullif(btrim(c.code), ''), btrim(c.name), nullif(btrim(c.unit), ''), c.qty, c.rate,
         nullif(btrim(c.note), ''), e.ord::int, auth.uid(), auth.uid()
  from jsonb_array_elements(p_other_costs) with ordinality as e(row, ord)
  cross join lateral jsonb_to_record(e.row) as c(code text, name text, unit text, qty numeric, rate numeric, note text);

  update estimator_estimates
  set model_settings = case when jsonb_typeof(p_model -> 'settings') = 'object' then p_model -> 'settings' end,
      model_bua_sqft = case when jsonb_typeof(p_model -> 'bua_sqft') = 'number'
                             and (p_model ->> 'bua_sqft')::numeric > 0
                            then (p_model ->> 'bua_sqft')::numeric end,
      updated_by = auth.uid()
  where id = p_estimate;

  return v_touched;
end $$;

revoke execute on function import_model_takeoff(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function import_model_takeoff(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 5 ------------------------------------------------------------------------------------------------------
create or replace function estimator_copy_estimate_contents(p_from uuid, p_to uuid, p_everything boolean)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  -- created_at is carried over so a work's rows keep their order in the copy.
  insert into estimator_estimate_lines
    (estimate_id, work_item_id, label, qty, note, labour_rate, copied_from, created_at, created_by, updated_by)
  select p_to, l.work_item_id, l.label,
         case when p_everything then l.qty end,
         l.note,
         case when p_everything then l.labour_rate end,
         l.id,
         l.created_at,
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
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, from_model, model_refs,
     is_deduction, created_by, updated_by)
  select t.id, m.description, m.nos, m.length, m.breadth, m.depth, m.sort_order,
         m.from_model, m.model_refs, m.is_deduction, auth.uid(), auth.uid()
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines s on s.id = m.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_item_rates
    (estimate_id, item_id, material_id, rate, note, created_by, updated_by)
  select p_to, r.item_id, r.material_id, r.rate, r.note, auth.uid(), auth.uid()
  from estimator_estimate_item_rates r
  where r.estimate_id = p_from;

  insert into estimator_estimate_line_model_materials (line_id, mix_id, qty, created_by, updated_by)
  select t.id, mm.mix_id, mm.qty, auth.uid(), auth.uid()
  from estimator_estimate_line_model_materials mm
  join estimator_estimate_lines s on s.id = mm.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_other_costs
    (estimate_id, from_model, code, name, unit, qty, rate, note, position, created_by, updated_by)
  select p_to, o.from_model, o.code, o.name, o.unit, o.qty, o.rate, o.note, o.position, auth.uid(), auth.uid()
  from estimator_estimate_other_costs o
  where o.estimate_id = p_from;

  update estimator_estimates t
  set use_model_materials = s.use_model_materials,
      model_settings = s.model_settings,
      model_bua_sqft = s.model_bua_sqft
  from estimator_estimates s
  where s.id = p_from and t.id = p_to;
end $$;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['estimator_estimate_line_model_materials', 'estimator_estimate_other_costs'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0174: % is missing or has RLS off', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 4 then
      raise exception '0174: % should have exactly four policies', t;
    end if;
    if has_table_privilege('anon', t, 'select') then
      raise exception '0174: anon can read %', t;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger where tgname = 'estimator_model_materials_draft_only')
     or not exists (select 1 from pg_trigger where tgname = 'estimator_other_costs_draft_only') then
    raise exception '0174: a draft-only guard is missing';
  end if;

  if (select prosecdef from pg_proc where oid = 'import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure) then
    raise exception '0174: an estimator function became a definer';
  end if;
  if has_function_privilege('anon', 'import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute') then
    raise exception '0174: import_model_takeoff is granted wrongly';
  end if;

  if position('estimator_estimate_other_costs' in
              pg_get_functiondef('estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0
     or position('estimator_estimate_line_model_materials' in
                 pg_get_functiondef('estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0 then
    raise exception '0174: a copy leaves the model''s materials or the other costs behind';
  end if;
end $$;
