-- 0154 — A mix's group (Concrete, Mortar, Plaster…): free text, so the Mixes list can be grouped and filtered by it.

alter table estimator_mixes add column if not exists group_name text;

alter table estimator_mixes drop constraint if exists estimator_mixes_group_name_check;
alter table estimator_mixes add constraint estimator_mixes_group_name_check
  check (group_name is null or length(trim(group_name)) between 1 and 60);

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'estimator_mixes' and column_name = 'group_name') then
    raise exception '0154: estimator_mixes.group_name is missing';
  end if;
  if not exists (select 1 from pg_class where relname = 'estimator_mixes' and relrowsecurity) then
    raise exception '0154: estimator_mixes has RLS off';
  end if;
end $$;
