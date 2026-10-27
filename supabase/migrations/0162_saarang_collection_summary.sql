-- 0162 — Saarang Collections' worked-out figures, kept for Turing (plan.md, Saarang Collections)
--
-- The Summary is worked out in lib/saarang-collections/core.ts from the uploads, the rules and
-- the typed figures. Turing reads tables, not code, so every save in the tool writes the figures
-- it shows here too: Turing reads the same numbers the screen does, and never works them out
-- again from the raw rows. The screen still works them out live; this table only follows.
--
-- 0161's grant: /saarang-collections reads, inserts and updates, the writer pinned to the caller;
-- a row is never deleted, only rewritten.
-- No audit trigger: every row is derived from audited ones and rewritten on each save.
--
-- Re-runnable throughout.

create table if not exists saarang_collection_summary (
  id uuid primary key default gen_random_uuid(),
  project text not null check (project in ('plot', 'villa')),
  key text not null check (key in ('E', 'F', 'H', 'L', 'M', 'MTD', 'Munits', 'O', 'P', 'S')),
  -- The column as the Summary heads it: "Total collection".
  label text not null check (length(trim(label)) between 1 and 80),
  -- null: its Zoho report is not uploaded, so the figure cannot be known.
  value numeric(16, 2),
  computed_by uuid not null default auth.uid() references profiles (id),
  computed_at timestamptz not null default now(),
  unique (project, key)
);

alter table saarang_collection_summary enable row level security;
revoke all on saarang_collection_summary from public, anon;
revoke truncate, delete on saarang_collection_summary from authenticated;

do $$
declare
  app constant text := '(select has_app(''/saarang-collections''))';
  me constant text := '(select auth.uid())';
begin
  drop policy if exists "saarang_collection_summary read by grant" on saarang_collection_summary;
  execute format('create policy "saarang_collection_summary read by grant" on saarang_collection_summary for select to authenticated using (%s)', app);
  drop policy if exists "saarang_collection_summary insert by grant" on saarang_collection_summary;
  execute format('create policy "saarang_collection_summary insert by grant" on saarang_collection_summary for insert to authenticated with check (%s and computed_by = %s)', app, me);
  drop policy if exists "saarang_collection_summary update by grant" on saarang_collection_summary;
  execute format('create policy "saarang_collection_summary update by grant" on saarang_collection_summary for update to authenticated using (%s) with check (%s and computed_by = %s)', app, app, me);
end $$;

do $$
begin
  if not exists (
    select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'saarang_collection_summary' and cl.relrowsecurity
  ) then
    raise exception '0162: saarang_collection_summary is missing or has RLS off';
  end if;
  if (select string_agg(p.polcmd::text, ',' order by p.polcmd::text)
        from pg_policy p join pg_class cl on cl.oid = p.polrelid
       where cl.relname = 'saarang_collection_summary') is distinct from 'a,r,w' then
    raise exception '0162: saarang_collection_summary has the wrong policies';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'saarang_collection_summary'
      and (roles <> '{authenticated}' or permissive <> 'PERMISSIVE'
           or qual ilike '%role%' or with_check ilike '%role%')
  ) then
    raise exception '0162: a saarang_collection_summary policy is not the grant''s alone';
  end if;
  if has_table_privilege('anon', 'public.saarang_collection_summary', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.saarang_collection_summary', 'truncate, delete') then
    raise exception '0162: saarang_collection_summary is open to anon, or deletable';
  end if;
end $$;
