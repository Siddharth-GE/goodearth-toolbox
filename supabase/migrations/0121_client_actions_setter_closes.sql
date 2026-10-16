-- 0121 — Client Relations: only whoever set an action closes it
--
-- FOUNDER, 2026-10-16, after the Saarang tracker landed on staging: "i
-- would say you can only complete an action that you set, not everyone
-- can". Asked, the founder chose: whoever set it closes it, and so does a
-- manager (an admin); its owner, having done the work, marks it FINISHED
-- for the setter to confirm; an action brought in from the old tracker,
-- which never recorded a setter, counts its owner as the setter. Root
-- plan.md, eighth piece.
--
--   1. client_actions.status gains 'awaiting_confirmation' — finished by
--      its owner, waiting for its setter's tick.
--   2. created_by IS the setter, pinned: on insert it is the person
--      inserting, whatever the client sent; a maintenance insert (no
--      session — the import scripts) pins it to the owner; and it never
--      changes afterwards. Without the pin, an action with no setter
--      could be handed to yourself and then closed.
--   3. Moving an action INTO or OUT OF 'done' needs its setter or
--      is_admin(). Every other change stays open to the whole grant, as
--      before (0120): anyone may still edit, re-date or hand an action on.
--
-- The guard is a trigger, not a policy: a policy cannot compare a row's
-- old and new status. Its function runs as the caller (security invoker)
-- and is reached only by the trigger, so execute is revoked from every
-- client role. A session with no auth.uid() — db:apply, a script through
-- the management API — passes; no client role reaches this table without
-- one (no anon policy exists, 0120).
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The fifth status
-- ---------------------------------------------------------------------

alter table client_actions drop constraint if exists client_actions_status_check;
alter table client_actions add constraint client_actions_status_check
  check (status in ('open', 'waiting_client', 'waiting_management', 'awaiting_confirmation', 'done'));

-- ---------------------------------------------------------------------
-- 2 and 3. The guard
-- ---------------------------------------------------------------------

create or replace function client_actions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- Whoever inserts is the setter; a script's insert pins the owner.
    new.created_by := coalesce(v_me, new.created_by, new.owner_id);
    return new;
  end if;

  if v_me is null then
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Who set an action cannot be changed';
  end if;

  if (new.status = 'done') <> (old.status = 'done')
     and v_me is distinct from coalesce(old.created_by, old.owner_id)
     and not is_admin() then
    raise exception 'Only whoever set this action, or a manager, can close it or open it again';
  end if;

  return new;
end $$;

revoke all on function client_actions_guard() from public, anon, authenticated;

drop trigger if exists client_actions_guard on client_actions;
create trigger client_actions_guard
  before insert or update on client_actions
  for each row execute function client_actions_guard();

-- ---------------------------------------------------------------------
-- 4. The actions already here pin their owner as setter
-- ---------------------------------------------------------------------
-- The 42 brought in from the tracker (founder: their owner counts as the
-- setter). set_updated_at steps aside so they do not all read "Edited
-- today"; audit_row still records every row this touches.

alter table client_actions disable trigger set_updated_at;
update client_actions set created_by = owner_id where created_by is null;
alter table client_actions enable trigger set_updated_at;

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
begin
  if position('awaiting_confirmation' in (
       select pg_get_constraintdef(oid) from pg_constraint
        where conname = 'client_actions_status_check')) = 0 then
    raise exception '0121: the status CHECK does not admit awaiting_confirmation';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'client_actions_guard' and tgrelid = 'client_actions'::regclass
       and tgenabled <> 'D'
  ) then
    raise exception '0121: the client_actions_guard trigger is missing or disabled';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'set_updated_at' and tgrelid = 'client_actions'::regclass
       and tgenabled <> 'D'
  ) then
    raise exception '0121: set_updated_at was left disabled on client_actions';
  end if;

  if (select prosecdef from pg_proc where oid = 'client_actions_guard()'::regprocedure) then
    raise exception '0121: client_actions_guard must be security invoker';
  end if;
  if has_function_privilege('anon', 'client_actions_guard()', 'execute')
     or has_function_privilege('authenticated', 'client_actions_guard()', 'execute') then
    raise exception '0121: a client role can execute client_actions_guard';
  end if;

  if exists (select 1 from client_actions where created_by is null) then
    raise exception '0121: an action still has no setter';
  end if;

  -- Still three policies and no DELETE (0120).
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'client_actions') <> 3 then
    raise exception '0121: client_actions should still have 3 policies';
  end if;
end $$;
