-- 0149 — Delete or Cancel, step E (plan.md, Piece 4): client actions and design actions.
--
-- An action nobody has changed since it was added deletes; once changed it is cancelled with a reason instead. Either
-- is its setter's or a manager's, the same hands that close it (0121, 0126). A cancelled action is closed: status
-- 'done', so every list and policy that reads "status <> 'done'" as open already leaves it out, and it is final.
-- "Changed" is the cards' own "Edited" rule: updated more than a minute after it was made.

-- ---------------------------------------------------------------------
-- 1. One shape for every cancel
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['client_actions', 'design_actions'] loop
    execute format('alter table %I add column if not exists cancelled_at timestamptz', t);
    execute format('alter table %I add column if not exists cancelled_by uuid references profiles (id)', t);
    execute format('alter table %I add column if not exists cancel_reason text', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_cancel_shape');
    execute format(
      'alter table %I add constraint %I check ('
      '(cancelled_at is null and cancelled_by is null and cancel_reason is null) '
      'or (cancelled_at is not null and status = ''done'' '
      'and length(trim(coalesce(cancel_reason, ''''))) between 1 and 500))',
      t, t || '_cancel_shape');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. The guards learn delete and cancel
-- ---------------------------------------------------------------------
-- Each is its migration's body (0121, 0126) carried forward, with the new branches ahead of the closing rule. A
-- session with no auth.uid() (the import and wipe scripts) still passes everything.

create or replace function client_actions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kept text[] := array[
    'status', 'done_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
      raise exception 'A new action cannot arrive cancelled';
    end if;
    -- Whoever inserts is the setter; a script's insert pins the owner.
    new.created_by := coalesce(v_me, new.created_by, new.owner_id);
    return new;
  end if;

  if v_me is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_me is distinct from coalesce(old.created_by, old.owner_id) and not is_admin() then
      raise exception 'Only whoever set this action, or a manager, can delete it';
    end if;
    if old.status <> 'open' or old.cancelled_at is not null
       or old.updated_at > old.created_at + interval '1 minute' then
      raise exception 'This action has been changed since it was added, so cancel it with a reason instead';
    end if;
    return old;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Who set an action cannot be changed';
  end if;

  if old.cancelled_at is not null then
    raise exception 'A cancelled action can no longer be changed';
  end if;

  if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
    if old.status = 'done' then
      raise exception 'A done action is already closed, so there is nothing to cancel';
    end if;
    if (to_jsonb(new) - v_kept) is distinct from (to_jsonb(old) - v_kept) then
      raise exception 'Cancel an action on its own, with nothing else changed';
    end if;
    if v_me is distinct from coalesce(old.created_by, old.owner_id) and not is_admin() then
      raise exception 'Only whoever set this action, or a manager, can cancel it';
    end if;
    if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'Say why it is cancelled';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := v_me;
    new.cancel_reason := trim(new.cancel_reason);
    new.status := 'done';
    new.done_on := (now() at time zone 'Asia/Kolkata')::date;
    return new;
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
  before insert or update or delete on client_actions
  for each row execute function client_actions_guard();

create or replace function design_actions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kept text[] := array[
    'status', 'done_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
      raise exception 'A new action cannot arrive cancelled';
    end if;
    new.created_by := coalesce(v_me, new.created_by, new.owner_id);
  elsif tg_op = 'DELETE' then
    if v_me is null then
      return old;
    end if;
    if v_me is distinct from coalesce(old.created_by, old.owner_id) and not is_admin() then
      raise exception 'Only whoever set this action, or a manager, can delete it';
    end if;
    if old.status <> 'open' or old.cancelled_at is not null
       or old.updated_at > old.created_at + interval '1 minute' then
      raise exception 'This action has been changed since it was added, so cancel it with a reason instead';
    end if;
    return old;
  elsif v_me is not null then
    if new.created_by is distinct from old.created_by then
      raise exception 'Who set an action cannot be changed';
    end if;
    if old.cancelled_at is not null then
      raise exception 'A cancelled action can no longer be changed';
    end if;
    if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
      if old.status = 'done' then
        raise exception 'A done action is already closed, so there is nothing to cancel';
      end if;
      if (to_jsonb(new) - v_kept) is distinct from (to_jsonb(old) - v_kept) then
        raise exception 'Cancel an action on its own, with nothing else changed';
      end if;
      if v_me is distinct from coalesce(old.created_by, old.owner_id) and not is_admin() then
        raise exception 'Only whoever set this action, or a manager, can cancel it';
      end if;
      if length(trim(coalesce(new.cancel_reason, ''))) = 0 then
        raise exception 'Say why it is cancelled';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := v_me;
      new.cancel_reason := trim(new.cancel_reason);
      new.status := 'done';
      new.done_on := (now() at time zone 'Asia/Kolkata')::date;
      return new;
    end if;
    if (new.status = 'done') <> (old.status = 'done')
       and v_me is distinct from coalesce(old.created_by, old.owner_id)
       and not is_admin() then
      raise exception 'Only whoever set this action, or a manager, can close it or open it again';
    end if;
  end if;

  if v_me is not null
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not exists (select 1 from design_team() t where t.id = new.owner_id) then
    raise exception 'That person does not hold Design Management, so they cannot own an action';
  end if;

  if new.status <> 'done' then
    new.done_on := null;
  elsif tg_op = 'UPDATE' and old.status = 'done' then
    new.done_on := old.done_on;
  else
    new.done_on := (now() at time zone 'Asia/Kolkata')::date;
  end if;

  return new;
end $$;

revoke all on function design_actions_guard() from public, anon, authenticated;

drop trigger if exists design_actions_guard on design_actions;
create trigger design_actions_guard
  before insert or update or delete on design_actions
  for each row execute function design_actions_guard();

-- ---------------------------------------------------------------------
-- 3. A delete policy each: the row's reach, as its SELECT; the guard decides the rest
-- ---------------------------------------------------------------------

drop policy if exists "client_actions deletable by client relations app" on client_actions;
create policy "client_actions deletable by client relations app"
  on client_actions for delete to authenticated
  using ((has_app('/client-relations') and auth.uid() in (owner_id, created_by))
         or crm_sees_action(id));

drop policy if exists "design_actions deletable by design management app" on design_actions;
create policy "design_actions deletable by design management app"
  on design_actions for delete to authenticated
  using (has_app('/design-management'));

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['client_actions', 'design_actions'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '0149: RLS is off on %', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 4
       or (select count(*) from pg_policies
            where schemaname = 'public' and tablename = t and cmd = 'DELETE') <> 1
       or exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t and (cmd = 'ALL' or 'anon' = any (roles))) then
      raise exception '0149: % should have one policy per command, none for anon', t;
    end if;
    foreach c in array array['cancelled_at', 'cancelled_by', 'cancel_reason'] loop
      if not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = t and column_name = c) then
        raise exception '0149: %.% is missing', t, c;
      end if;
    end loop;
    if not exists (select 1 from pg_constraint where conname = t || '_cancel_shape') then
      raise exception '0149: % has no cancel shape check', t;
    end if;
    -- tgtype: 2 before, 4 insert, 8 delete, 16 update.
    if not exists (select 1 from pg_trigger
                    where tgrelid = t::regclass and tgname = t || '_guard'
                      and tgenabled <> 'D' and (tgtype & 30) = 30) then
      raise exception '0149: %_guard is missing, disabled or not before insert, update and delete', t;
    end if;
  end loop;

  if position('crm_sees_action(id)' in (select qual from pg_policies
      where tablename = 'client_actions' and cmd = 'DELETE')) = 0
     or position('has_app(''/client-relations''::text)' in (select qual from pg_policies
      where tablename = 'client_actions' and cmd = 'DELETE')) = 0 then
    raise exception '0149: the client_actions delete policy is not the row''s reach';
  end if;
  if position('has_app(''/design-management''::text)' in (select qual from pg_policies
      where tablename = 'design_actions' and cmd = 'DELETE')) = 0 then
    raise exception '0149: the design_actions delete policy is not gated on /design-management';
  end if;

  foreach c in array array['client_actions_guard()', 'design_actions_guard()'] loop
    if (select prosecdef from pg_proc where oid = c::regprocedure) then
      raise exception '0149: % must be security invoker', c;
    end if;
    if has_function_privilege('anon', c, 'execute') or has_function_privilege('authenticated', c, 'execute') then
      raise exception '0149: a client role can execute %', c;
    end if;
  end loop;
  if position('design_team()' in pg_get_functiondef('design_actions_guard()'::regprocedure)) = 0 then
    raise exception '0149: design_actions_guard has lost its owner check';
  end if;
end $$;
