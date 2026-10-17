-- 0125 — Client Relations: one owner per side, and every step on it is theirs
--
-- FOUNDER, 2026-10-17, trying the two sides on staging: "for the same track
-- i did 2 actions for 2 different owners, that shoudnt work right? the plot
-- for different tracks different owner is ok, but 1 track 1 owner". Asked:
--
--   * A side with no owner refuses a step: "Refuse until an owner is set".
--   * A step's owner is "Locked to the side's owner": to hand over, change
--     the side's owner on the plot, and its open steps move with it.
--
-- A plot's two sides are Construction (track 'sales', owner crm_owner_id)
-- and Interior (track 'kaadal', owner kaadal_owner_id) — the tracker's
-- stored names (Client Relations' PLAN.md, decision 8).
--
-- 1. client_actions_follow_side — before a step lands on a plot's side, or
--    moves to one, or is opened again: the side must have an owner, and the
--    step is that owner's. A step moved or reopened takes the side's owner;
--    a step given to anyone else is refused in a sentence. A step with no
--    plot keeps any owner; a closed step keeps its history.
-- 2. client_engagements_hand_over — after a side's owner changes, that
--    side's open steps go to the new owner. Setting a side to nobody while
--    it still has open steps is refused.
-- 3. The two steps on staging already off the rule (Plot 17's interior,
--    Anu's; W14's construction, Sayooj's — both sides with no owner) give
--    their side its owner, as a script's insert does from now on.
--
-- Both functions are SECURITY DEFINER, reached only by their triggers:
-- execute is revoked from every client role, so the grant is the boundary
-- (SECURITY.md). Definer so they read and move rows a person cannot see —
-- a setter reopening a step on a plot they no longer see; a hand-over
-- moving steps on a plot the hander sees through one action. A session with
-- no auth.uid() (db:apply, the tracker import) is a script: it fills a
-- blank side from its step and is never refused, as 0121's guard lets it.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. A step follows its side
-- ---------------------------------------------------------------------

create or replace function client_actions_follow_side()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text := case new.track when 'kaadal' then 'interior' else 'construction' end;
  v_owner uuid;
  v_name text;
begin
  if new.engagement_id is null or new.status = 'done' then
    return new;
  end if;

  -- Nothing to do unless the step is new, changes hands, plot or side, or
  -- is opened again — so ticking, dating and rewording never meet this.
  if tg_op = 'UPDATE'
     and new.owner_id = old.owner_id
     and new.engagement_id is not distinct from old.engagement_id
     and new.track = old.track
     and old.status <> 'done' then
    return new;
  end if;

  select case new.track when 'kaadal' then e.kaadal_owner_id else e.crm_owner_id end
    into v_owner
    from client_engagements e
   where e.id = new.engagement_id;

  -- A script fills a blank side from its step, and is never refused.
  if auth.uid() is null then
    if v_owner is null then
      if new.track = 'kaadal' then
        update client_engagements set kaadal_owner_id = new.owner_id where id = new.engagement_id;
      else
        update client_engagements set crm_owner_id = new.owner_id where id = new.engagement_id;
      end if;
    end if;
    return new;
  end if;

  if v_owner is null then
    raise exception 'This plot has no % owner yet. Give it one on the plot first.', v_side;
  end if;

  -- Moved to another plot or side, or opened again: it goes to that side's owner.
  if tg_op = 'UPDATE' and new.owner_id = old.owner_id then
    new.owner_id := v_owner;
    return new;
  end if;

  if new.owner_id is distinct from v_owner then
    select coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'its owner')
      into v_name from profiles p where p.id = v_owner;
    raise exception 'Every % step on this plot is %''s. To hand them over, change the plot''s % owner.',
      v_side, coalesce(v_name, 'its owner'), v_side;
  end if;

  return new;
end $$;

revoke all on function client_actions_follow_side() from public, anon, authenticated;

-- Named to run before client_actions_guard (0121): same-event triggers fire
-- in name order, and the guard only reads status and setter.
drop trigger if exists client_actions_follow_side on client_actions;
create trigger client_actions_follow_side
  before insert or update on client_actions
  for each row execute function client_actions_follow_side();

-- ---------------------------------------------------------------------
-- 2. A side handed over takes its open steps with it
-- ---------------------------------------------------------------------

create or replace function client_engagements_hand_over()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track text;
  v_old uuid;
  v_new uuid;
begin
  foreach v_track in array array['sales', 'kaadal'] loop
    if v_track = 'sales' then
      v_old := old.crm_owner_id; v_new := new.crm_owner_id;
    else
      v_old := old.kaadal_owner_id; v_new := new.kaadal_owner_id;
    end if;
    continue when v_new is not distinct from v_old;

    if v_new is null then
      if auth.uid() is not null and exists (
        select 1 from client_actions a
         where a.engagement_id = new.id and a.track = v_track and a.status <> 'done'
      ) then
        raise exception 'This plot still has open % steps. Give the % side to someone else instead of nobody.',
          case v_track when 'kaadal' then 'interior' else 'construction' end,
          case v_track when 'kaadal' then 'interior' else 'construction' end;
      end if;
    else
      update client_actions
         set owner_id = v_new,
             updated_by = coalesce(auth.uid(), updated_by)
       where engagement_id = new.id
         and track = v_track
         and status <> 'done'
         and owner_id is distinct from v_new;
    end if;
  end loop;
  return new;
end $$;

revoke all on function client_engagements_hand_over() from public, anon, authenticated;

drop trigger if exists client_engagements_hand_over on client_engagements;
create trigger client_engagements_hand_over
  after update of crm_owner_id, kaadal_owner_id on client_engagements
  for each row execute function client_engagements_hand_over();

-- ---------------------------------------------------------------------
-- 3. The steps already off the rule
-- ---------------------------------------------------------------------
-- A side with no owner whose open steps are all one person's takes that
-- person (on staging: Plot 17's interior → Anu, W14's construction →
-- Sayooj). Not a person's edit, so set_updated_at steps aside. Then any
-- open step on a side owned by someone else follows the side (none on
-- staging; a database brought in another way may have some).

alter table client_engagements disable trigger set_updated_at;

update client_engagements e
   set crm_owner_id = s.owner_id
  from (select engagement_id, (array_agg(owner_id))[1] as owner_id
          from client_actions
         where track = 'sales' and status <> 'done' and engagement_id is not null
         group by engagement_id
        having count(distinct owner_id) = 1) s
 where e.id = s.engagement_id and e.crm_owner_id is null;

update client_engagements e
   set kaadal_owner_id = s.owner_id
  from (select engagement_id, (array_agg(owner_id))[1] as owner_id
          from client_actions
         where track = 'kaadal' and status <> 'done' and engagement_id is not null
         group by engagement_id
        having count(distinct owner_id) = 1) s
 where e.id = s.engagement_id and e.kaadal_owner_id is null;

alter table client_engagements enable trigger set_updated_at;

update client_actions a
   set owner_id = case a.track when 'kaadal' then e.kaadal_owner_id else e.crm_owner_id end
  from client_engagements e
 where e.id = a.engagement_id
   and a.status <> 'done'
   and (case a.track when 'kaadal' then e.kaadal_owner_id else e.crm_owner_id end) is not null
   and a.owner_id <> (case a.track when 'kaadal' then e.kaadal_owner_id else e.crm_owner_id end);

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  f text;
  v int;
begin
  foreach f in array array['client_actions_follow_side()', 'client_engagements_hand_over()'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception '0125: % must be security definer', f;
    end if;
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      raise exception '0125: % is executable by a client role', f;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger
    where tgname = 'client_actions_follow_side' and tgrelid = 'client_actions'::regclass)
     or not exists (select 1 from pg_trigger
    where tgname = 'client_engagements_hand_over' and tgrelid = 'client_engagements'::regclass) then
    raise exception '0125: a trigger is missing';
  end if;

  if not exists (select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'client_engagements'::regclass
      and tgenabled <> 'D') then
    raise exception '0125: set_updated_at on client_engagements was left switched off';
  end if;

  select count(*) into v
    from client_actions a
    join client_engagements e on e.id = a.engagement_id
   where a.status <> 'done'
     and a.owner_id is distinct from
         (case a.track when 'kaadal' then e.kaadal_owner_id else e.crm_owner_id end);
  if v <> 0 then
    raise exception '0125: % open steps are not their side''s owner''s', v;
  end if;
end $$;
