-- 0092 — Transmittal numbers count per villa
--
-- FOUNDER, 2026-08-22, vetting on staging: "each house should have
-- transmittals starting from 1". 0091 minted one company-wide TR-
-- sequence, so a villa's first transmittal could be TR-0007. Now each
-- villa counts its own: the counter's scope becomes the unit id, and
-- number uniqueness is per villa rather than global.
--
-- The consequence, accepted with the decision: "TR-0001" alone no
-- longer names one transmittal company-wide. Every screen already says
-- the villa beside the number, and the PDF cover sheet carries the
-- villa in its footer — the pair is the reference now.
--
-- Existing numbers are NOT rewritten — an issued transmittal is
-- immutable (0091's guard), and history keeping its numbers is what
-- history means. Each villa's counter seeds from the highest number it
-- already holds, so the next mint continues instead of colliding.
-- 0091's 'global' counter row stays behind, inert; nothing reads it.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. Uniqueness: per villa, not global
-- ---------------------------------------------------------------------
-- Multiple drafts (number null) per villa stay legal — Postgres unique
-- constraints ignore null rows.

alter table transmittals drop constraint if exists transmittals_number_key;
alter table transmittals drop constraint if exists transmittals_unit_number_key;
alter table transmittals
  add constraint transmittals_unit_number_key unique (unit_id, number);

-- ---------------------------------------------------------------------
-- 2. Seed each villa's counter from what it already issued
-- ---------------------------------------------------------------------

insert into transmittal_counters (scope, last_no)
select t.unit_id::text, max((substring(t.number from 'TR-(\d+)'))::int)
from transmittals t
where t.number is not null
group by t.unit_id
on conflict (scope) do update
  set last_no = greatest(transmittal_counters.last_no, excluded.last_no);

-- ---------------------------------------------------------------------
-- 3. issue_transmittal() minted per villa — restated WHOLE (the
--    pusher_chain_state lesson: a create-or-replace is a full
--    replacement, never a patch), with exactly one change: the counter
--    row's scope is the villa's unit id instead of 'global'.
-- ---------------------------------------------------------------------

create or replace function issue_transmittal(p_transmittal_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_line_count int;
  v_no int;
  v_number text;
  v_rev record;
begin
  -- Lock the row so two people pressing Issue at once cannot both go on.
  select unit_id into v_unit_id
  from transmittals
  where id = p_transmittal_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft transmittal can be issued.';
  end if;

  select count(*) into v_line_count
  from transmittal_lines where transmittal_id = p_transmittal_id;
  if v_line_count = 0 then
    raise exception 'Add at least one drawing before issuing this transmittal.';
  end if;

  for v_rev in
    select r.id, r.unit_id, r.drawing_set_id, r.status
    from transmittal_lines l
    join drawing_revisions r on r.id = l.drawing_revision_id
    where l.transmittal_id = p_transmittal_id
    order by l.sort_order, l.created_at
    for update of r
  loop
    -- A line may carry an ALREADY-RELEASED revision: the same set going
    -- out again at a new stage, which is normal — one set serves many
    -- activities. Nothing to do for those; they stay current.
    if v_rev.status = 'draft' then
      -- Release first, then retire the old one. In that order the villa
      -- is never momentarily left with no released drawing for this set,
      -- and superseded_by points at what replaced it (0007's ordering).
      update drawing_revisions
      set status = 'released',
          released_at = now(),
          released_by = auth.uid(),
          updated_at = now()
      where id = v_rev.id;

      update drawing_revisions
      set status = 'superseded',
          superseded_by = v_rev.id,
          updated_at = now()
      where unit_id = v_rev.unit_id
        and drawing_set_id = v_rev.drawing_set_id
        and status = 'released'
        and id <> v_rev.id;
    end if;
  end loop;

  -- Minted here and nowhere else — PER VILLA since 0092 (founder:
  -- "each house should have transmittals starting from 1"). greatest()
  -- because lpad TRUNCATES a string longer than its target —
  -- lpad('12345', 4) is '1234' (0019).
  insert into transmittal_counters (scope, last_no)
  values (v_unit_id::text, 1)
  on conflict (scope) do update set last_no = transmittal_counters.last_no + 1
  returning last_no into v_no;

  v_number := 'TR-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');

  update transmittals
  set status = 'issued',
      number = v_number,
      issued_at = now(),
      issued_by = auth.uid(),
      updated_at = now()
  where id = p_transmittal_id;

  return v_number;
end $$;

-- create or replace preserves existing grants, but restate them anyway —
-- the 0059 lesson is that assumed privileges are how holes ship.
revoke execute on function issue_transmittal(uuid) from public, anon;
grant execute on function issue_transmittal(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  -- The per-villa uniqueness exists and the global one is gone.
  if not exists (
    select 1 from pg_constraint
    where conname = 'transmittals_unit_number_key' and conrelid = 'transmittals'::regclass
  ) then
    raise exception '0092: transmittals_unit_number_key is missing';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'transmittals_number_key' and conrelid = 'transmittals'::regclass
  ) then
    raise exception '0092: the global transmittals_number_key still exists';
  end if;

  -- The mint is scoped to the villa, not 'global'.
  if position('v_unit_id::text' in pg_get_functiondef('issue_transmittal(uuid)'::regprocedure)) = 0 then
    raise exception '0092: issue_transmittal still mints globally';
  end if;

  -- Every villa with an issued transmittal has a counter at least as
  -- high as its highest number.
  select count(*) into v
  from (
    select t.unit_id, max((substring(t.number from 'TR-(\d+)'))::int) as top
    from transmittals t where t.number is not null group by t.unit_id
  ) issued
  left join transmittal_counters c on c.scope = issued.unit_id::text
  where c.last_no is null or c.last_no < issued.top;
  if v <> 0 then
    raise exception '0092: % villa counter(s) seeded below their issued numbers', v;
  end if;

  -- anon still locked out of the mint.
  if has_function_privilege('anon', 'public.issue_transmittal(uuid)', 'execute') then
    raise exception '0092: anon can execute issue_transmittal';
  end if;
end $$;
