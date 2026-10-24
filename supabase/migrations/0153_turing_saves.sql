-- 0153 — Turing T2: what an admin saved from a proposal (plan.md, T2)
--
-- Turing proposes changes; the admin edits them and presses Save, and each ticked row goes through
-- the owning tool's own save, as the admin. One row here per proposal saved: it stops a proposal
-- being saved twice (the unique key is taken before anything is written), keeps each row's result
-- to show under the proposal, and is told to Claude at the start of the admin's next turn
-- (`reported`). The writes themselves land in each tool's own tables, under that tool's rules.
--
-- Owner-only, through the conversation, like turing_files (0151). Re-runnable.

create table if not exists turing_saves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles (id),
  conversation_id uuid not null references turing_conversations (id) on delete cascade,
  -- The propose_changes call in that conversation's messages.
  tool_use_id text not null check (length(tool_use_id) between 1 and 200),
  -- [{ row, ok, message }] once the rows have run; null while they run.
  results jsonb check (results is null or jsonb_typeof(results) = 'array'),
  reported boolean not null default false,
  created_at timestamptz not null default now(),
  unique (conversation_id, tool_use_id)
);

alter table turing_saves enable row level security;
revoke truncate on turing_saves from anon, authenticated;
revoke all on turing_saves from anon;

do $$
declare
  mine constant text := '(select is_admin()) and owner_id = (select auth.uid()) and exists ('
    'select 1 from turing_conversations c where c.id = turing_saves.conversation_id '
    'and c.owner_id = (select auth.uid()))';
begin
  execute 'drop policy if exists "turing_saves readable by its owner" on turing_saves';
  execute format('create policy "turing_saves readable by its owner" on turing_saves for select to authenticated using (%s)', mine);
  execute 'drop policy if exists "turing_saves insertable by its owner" on turing_saves';
  execute format('create policy "turing_saves insertable by its owner" on turing_saves for insert to authenticated with check (%s)', mine);
  execute 'drop policy if exists "turing_saves updatable by its owner" on turing_saves';
  execute format('create policy "turing_saves updatable by its owner" on turing_saves for update to authenticated using (%s) with check (%s)', mine, mine);
end $$;

-- A save is a record of what happened: never deleted on its own (its conversation takes it), and
-- only its results and whether Claude was told ever change — not which proposal or conversation it is.
revoke delete on turing_saves from authenticated;
revoke update on turing_saves from authenticated;
grant update (results, reported) on turing_saves to authenticated;

do $$
declare
  v int;
begin
  if not exists (select 1 from pg_class where relname = 'turing_saves' and relrowsecurity) then
    raise exception '0153: turing_saves is missing or has RLS off';
  end if;
  select count(*) into v from pg_policies where schemaname = 'public' and tablename = 'turing_saves';
  if v <> 3 then
    raise exception '0153: turing_saves has % policies, expected 3', v;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'turing_saves'
              and coalesce(qual, '') || coalesce(with_check, '') not like '%is_admin()%') then
    raise exception '0153: a turing_saves policy does not ask is_admin()';
  end if;
  if has_table_privilege('authenticated', 'turing_saves', 'delete') then
    raise exception '0153: turing_saves must not be deletable';
  end if;
  if has_column_privilege('authenticated', 'turing_saves', 'tool_use_id', 'update')
     or has_column_privilege('authenticated', 'turing_saves', 'conversation_id', 'update')
     or has_column_privilege('authenticated', 'turing_saves', 'owner_id', 'update') then
    raise exception '0153: only results and reported may change on a save';
  end if;
end $$;
