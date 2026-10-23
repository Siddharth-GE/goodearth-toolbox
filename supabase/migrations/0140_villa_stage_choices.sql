-- 0140 — Each villa bends the sequence; the workbook's days marked where they are a guess (plan.md, "After the founder's
-- look at the site board", piece 2; founder 2026-10-23: "some works are not needed in some houses, and some may need to be
-- rearranged").
-- No policy, grant, view, definer or money: columns and checks on Supervisors' own tables, so no Fable review is needed.
--
--   site_stages.not_needed — the stage is left off this villa; only a stage not begun can be.
--   site_stages.follows_group_id + link — on this villa the stage follows another than the sequence says; both or neither.
--   site_sequence.days_to_confirm — typical days put in as a stand-in for the site team to replace; typing days clears it.

alter table site_stages add column if not exists not_needed boolean not null default false;
alter table site_stages add column if not exists follows_group_id uuid references work_groups (id);
alter table site_stages add column if not exists link text check (link in ('after', 'alongside'));

alter table site_stages drop constraint if exists site_stages_not_needed_not_begun;
alter table site_stages add constraint site_stages_not_needed_not_begun
  check (not not_needed or status = 'not_started');

alter table site_stages drop constraint if exists site_stages_follows_shape;
alter table site_stages add constraint site_stages_follows_shape
  check ((follows_group_id is null) = (link is null) and follows_group_id is distinct from work_group_id);

alter table site_sequence add column if not exists days_to_confirm boolean not null default false;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'site_stages' and column_name = 'not_needed') then
    raise exception '0140: site_stages.not_needed is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'site_sequence' and column_name = 'days_to_confirm') then
    raise exception '0140: site_sequence.days_to_confirm is missing';
  end if;
end $$;
