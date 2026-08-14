-- 0065 — a trail files itself under a stage
--
-- Relay's project picture is drawn along a project's stages. A trail
-- with no `project_stage_id` cannot appear on it. Nothing ever set that
-- column on creation: `open_chain` and `apply_trail_set` both left it
-- null, and the only way to fill it was a dropdown two screens away
-- that nobody knew was load-bearing.
--
-- The result: six of Saarang's ten trails were invisible to the picture
-- meant to show them. Someone opened a trail called "Masterplan", looked
-- at the project, and saw nothing change. That is not a step they
-- forgot — it is a step that should never have existed.
--
-- So the database fills it in, on the way in, from what it already
-- knows:
--
--   1. A stage whose NAME matches the trail's own name. Someone opening
--      "Masterplan" against a project with a Masterplan stage has
--      already said where it belongs.
--   2. Otherwise the stage the PLAN says today is in — the honest
--      default, and the one a person would pick.
--   3. If the project has no stages at all, nothing. There is no stage
--      to file under and inventing one would be worse.
--
-- Always a default, never a lock: the stage picker still moves it, and
-- an explicit `project_stage_id` on insert is left exactly as given.
--
-- Safe to run twice.

-- 1 ─────────────────────────────────────────────────────────────────
-- Which stage does today fall in, for one project?
--
-- The same arithmetic as lib/relay/schedule.ts: stages are laid end to
-- end in sort_order, each as long as its `weeks`, from the project's
-- start date. Kept in SQL because the trigger needs it; kept identical
-- in shape so the two cannot disagree about which stage is current.

create or replace function pusher_current_stage(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with plan as (
    select start_date from pusher_project_plans where project_id = p_project_id
  ),
  ordered as (
    select s.id,
           sum(s.weeks) over (order by s.sort_order, s.id
                              rows between unbounded preceding and 1 preceding) as weeks_before,
           sum(s.weeks) over (order by s.sort_order, s.id) as weeks_through,
           s.sort_order
    from project_stages s
    where s.project_id = p_project_id
  ),
  elapsed as (
    select greatest(0,
      ((now() at time zone 'Asia/Kolkata')::date - (select start_date from plan))::numeric / 7
    ) as weeks
  )
  select coalesce(
    -- The stage today falls inside.
    (select o.id from ordered o, elapsed e
      where (select start_date from plan) is not null
        and e.weeks >= coalesce(o.weeks_before, 0)
        and e.weeks <  o.weeks_through
      order by o.sort_order limit 1),
    -- Past the end of the plan: the last stage. Before the start, or no
    -- start date set: the first. Either way, a real stage.
    (select o.id from ordered o, elapsed e
      where (select start_date from plan) is not null
        and e.weeks >= (select max(weeks_through) from ordered)
      order by o.sort_order desc limit 1),
    (select o.id from ordered o order by o.sort_order limit 1)
  );
$$;

revoke execute on function pusher_current_stage(uuid) from public, anon;
grant execute on function pusher_current_stage(uuid) to authenticated;

-- 2 ─────────────────────────────────────────────────────────────────
-- File the trail on the way in.

create or replace function pusher_chains_file_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Whatever the caller said explicitly wins, always.
  if new.project_stage_id is not null then
    return new;
  end if;

  -- The trail's own name, by the same precedence the state view uses to
  -- decide what to call it.
  select coalesce(a.name, ts.name, new.title)
  into v_name
  from (select 1) x
  left join pusher_activities a on a.id = new.activity_id
  left join pusher_trail_sets ts on ts.id = new.trail_set_id;

  if v_name is not null then
    select s.id into new.project_stage_id
    from project_stages s
    where s.project_id = new.project_id
      and lower(trim(s.name)) = lower(trim(v_name))
    order by s.sort_order
    limit 1;
  end if;

  if new.project_stage_id is null then
    new.project_stage_id := pusher_current_stage(new.project_id);
  end if;

  return new;
end $$;

drop trigger if exists pusher_chains_file_stage on pusher_chains;
create trigger pusher_chains_file_stage
  before insert on pusher_chains
  for each row execute function pusher_chains_file_stage();

-- 3 ─────────────────────────────────────────────────────────────────
-- The trails already stranded off the picture.
--
-- Only ever fills a null — an explicitly filed trail is never moved —
-- so this is safe to re-run and safe to correct by hand afterwards.

update pusher_chains c
set project_stage_id = coalesce(
      (select s.id from project_stages s
        where s.project_id = c.project_id
          and lower(trim(s.name)) = lower(trim(coalesce(
                (select a.name from pusher_activities a where a.id = c.activity_id),
                (select ts.name from pusher_trail_sets ts where ts.id = c.trail_set_id),
                c.title)))
        order by s.sort_order limit 1),
      pusher_current_stage(c.project_id)
    )
where c.project_stage_id is null
  and exists (select 1 from project_stages s where s.project_id = c.project_id);

-- 4 ─────────────────────────────────────────────────────────────────
-- Assert it.

do $$
declare
  v_unfiled int;
begin
  select count(*) into v_unfiled
  from pusher_chains c
  where c.project_stage_id is null
    and exists (select 1 from project_stages s where s.project_id = c.project_id);

  if v_unfiled > 0 then
    raise exception '% trails are still off the picture', v_unfiled;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'pusher_chains'::regclass
      and tgname = 'pusher_chains_file_stage'
      and not tgisinternal
  ) then
    raise exception 'the filing trigger is not attached';
  end if;

  -- Every project with stages can name a current one, or the trigger
  -- has nothing to fall back on.
  if exists (
    select 1 from projects p
    where exists (select 1 from project_stages s where s.project_id = p.id)
      and pusher_current_stage(p.id) is null
  ) then
    raise exception 'a project with stages has no current stage';
  end if;
end $$;
