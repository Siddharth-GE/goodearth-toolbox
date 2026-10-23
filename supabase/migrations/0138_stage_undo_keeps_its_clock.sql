-- 0138 — Undo puts a stage's clock back (plan.md, Supervisors site board, phase A; founder 2026-10-23).
-- No policy, grant, view, definer or money: one invoker guard redefined, so no Fable review is needed.
--
-- Every change of status timed the stage afresh, so a stage waiting ten days, tapped Done by mistake and
-- undone, read "waiting since today" and lost its health warning. A change of status may now carry the
-- time the stage entered that status before, but only a time its own history records for that status —
-- so Undo can restore it and nobody can type one. Otherwise the clock is the database's, as before.

create or replace function site_stages_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (new.plot_id, new.work_group_id) is distinct from (old.plot_id, old.work_group_id) then
    raise exception 'A stage stays on its villa.';
  end if;
  if new.contractor_id is not null
     and (tg_op = 'INSERT' or new.contractor_id is distinct from old.contractor_id)
     and not exists (select 1 from vendors v where v.id = new.contractor_id and v.is_contractor) then
    raise exception 'Pick a contractor — that vendor is not marked as one in Masters.';
  end if;
  if tg_op = 'INSERT' then
    new.status_changed_at := now();
  elsif new.status is distinct from old.status then
    if new.status_changed_at is not distinct from old.status_changed_at
       or not exists (
         select 1 from site_stage_events e
          where e.plot_id = new.plot_id and e.work_group_id = new.work_group_id
            and e.kind = 'status' and e.to_status = new.status and e.at = new.status_changed_at) then
      new.status_changed_at := now();
    end if;
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end $$;

revoke all on function site_stages_guard() from public, anon, authenticated;

do $$
begin
  if (select prosecdef from pg_proc where oid = 'site_stages_guard()'::regprocedure) then
    raise exception '0138: site_stages_guard runs as the caller';
  end if;
  if has_function_privilege('authenticated', 'site_stages_guard()', 'execute') then
    raise exception '0138: site_stages_guard is executable by a client role';
  end if;
  if position('site_stage_events' in pg_get_functiondef('site_stages_guard()'::regprocedure)) = 0 then
    raise exception '0138: the guard no longer checks the history';
  end if;
end $$;
