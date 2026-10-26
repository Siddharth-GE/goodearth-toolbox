-- 0155 — A day's labour counts in decimals (a helper for half a day is 0.5), two places at most. No view reads these columns.

alter table labour_logs alter column masons type numeric(6,2) using masons::numeric(6,2);
alter table labour_logs alter column helpers type numeric(6,2) using helpers::numeric(6,2);
alter table labour_logs alter column others type numeric(6,2) using others::numeric(6,2);

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'labour_logs'
         and column_name in ('masons', 'helpers', 'others') and data_type = 'numeric') <> 3 then
    raise exception '0155: labour_logs head counts are not numeric';
  end if;
  if not exists (select 1 from pg_class where relname = 'labour_logs' and relrowsecurity) then
    raise exception '0155: labour_logs has RLS off';
  end if;
end $$;
