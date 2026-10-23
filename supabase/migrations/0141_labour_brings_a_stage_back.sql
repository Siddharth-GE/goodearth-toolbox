-- 0141 — Labour logged on a stage marked not needed brings it back (review of 0140).
-- No policy, grant, view, definer or money: one invoker trigger function redefined, so no Fable review is needed.
--
-- 0140 lets a villa leave a stage off, and its check keeps a stage left off from being begun. The first labour on a stage
-- starts it, so labour on a stage left off failed the whole log. Work logged on it is the site saying it is needed: the
-- stage comes back and starts, as any untouched stage does.

create or replace function labour_logs_start_stage()
returns trigger
language plpgsql
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from work_items where id = new.work_item_id;
  if v_group is null then
    return null;
  end if;
  insert into site_stages as s (plot_id, work_group_id, status, started_on, created_by, updated_by)
  values (new.plot_id, v_group, 'working', new.log_date, auth.uid(), auth.uid())
  on conflict (plot_id, work_group_id) do update
    set status = case when s.status = 'not_started' then 'working' else s.status end,
        started_on = excluded.started_on,
        not_needed = false,
        updated_by = excluded.updated_by
    where s.status = 'not_started' or (s.status = 'waiting' and s.started_on is null);
  return null;
end $$;

revoke all on function labour_logs_start_stage() from public, anon, authenticated;

do $$
begin
  if (select prosecdef from pg_proc where oid = 'labour_logs_start_stage()'::regprocedure) then
    raise exception '0141: labour_logs_start_stage runs as the caller';
  end if;
  if has_function_privilege('authenticated', 'labour_logs_start_stage()', 'execute') then
    raise exception '0141: labour_logs_start_stage is executable by a client role';
  end if;
  if position('not_needed' in pg_get_functiondef('labour_logs_start_stage()'::regprocedure)) = 0 then
    raise exception '0141: labour no longer brings a stage back';
  end if;
end $$;
