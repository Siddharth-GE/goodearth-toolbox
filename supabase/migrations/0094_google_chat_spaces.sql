-- 0094 — Google Chat spaces: which villa or project a chat space is for
--
-- The Relay bot, Phase 4 (plan.md at the repo root). A Google Chat space
-- can be linked to one villa (a unit) or to one project as a whole. In a
-- linked space every command defaults to that villa or project; in a DM
-- or an unlinked space, commands span everything. The bot links a space
-- itself when it joins and the space's name matches a villa or project
-- (founder's choice: self-configured on join), and /link sets or
-- changes it by hand.
--
-- Nothing signed-in ever reads or writes this table. The door has no
-- browser session — Google posts straight to it — and reaches this table
-- through the service-role client only (SECURITY.md, sanctioned). So it
-- is the 0062 shape: RLS on, ZERO policies, every privilege revoked from
-- the client roles by name, and an assertion at the end that proves it
-- took. A future screen that wants to show these links gets a view or a
-- definer function with its own gate, never a policy here.
--
-- Re-runnable throughout.

create table if not exists google_chat_spaces (
  -- Google's stable id for the space ("spaces/AAAA…"). It survives a
  -- rename, which is why the name below is a label and never a key.
  space_id text primary key,
  -- The display name at the moment of linking — for a person reading the
  -- row, never matched on again.
  space_name text,
  project_id uuid not null references projects (id),
  -- Null = the whole project; set = one villa of that project.
  unit_id uuid references units (id),
  -- Null when the bot linked the space itself on joining, by name; set
  -- to the person when /link did it.
  linked_by uuid references profiles (id),
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- The 0036 shape: a villa must belong to the project the row names.
  -- MATCH SIMPLE (the default) skips the check when unit_id is null.
  foreign key (project_id, unit_id) references units (project_id, id)
);

create index if not exists google_chat_spaces_project_idx
  on google_chat_spaces (project_id);
create index if not exists google_chat_spaces_unit_idx
  on google_chat_spaces (unit_id) where unit_id is not null;

drop trigger if exists set_updated_at on google_chat_spaces;
create trigger set_updated_at before update on google_chat_spaces
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Deny-all for every client role (0062 idiom)
-- ---------------------------------------------------------------------

alter table google_chat_spaces enable row level security;

-- Supabase's default privileges grant INSERT/UPDATE/DELETE/TRUNCATE (and
-- SELECT) on every new relation to anon and authenticated, and
-- `revoke ... from public` does not touch either — they must be named.
-- RLS with no policies already denies them; a privilege nobody holds
-- cannot be resurrected by a careless policy later.
revoke all on google_chat_spaces from public, anon, authenticated;

-- Assert it took. Fails loudly rather than reporting success on a
-- half-applied change.
do $$
declare
  v_rls_off int;
  v_grants int;
  v_policies int;
begin
  select count(*) into v_rls_off
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'google_chat_spaces'
    and not c.relrowsecurity;
  if v_rls_off <> 0 then
    raise exception '0094: google_chat_spaces does not have RLS enabled';
  end if;

  select count(*) into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'google_chat_spaces'
    and grantee in ('public', 'anon', 'authenticated');
  if v_grants <> 0 then
    raise exception '0094: % privileges still granted on google_chat_spaces', v_grants;
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'google_chat_spaces';
  if v_policies <> 0 then
    raise exception '0094: google_chat_spaces must have zero policies (deny-all)';
  end if;
end $$;
