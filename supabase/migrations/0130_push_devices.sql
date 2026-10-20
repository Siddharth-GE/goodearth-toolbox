-- 0130 — Push notifications: each person's phones.
-- (plan.md, Native apps C; the founder waived Fable's review for this build, 2026-10-18.)
--
-- A phone's push address (Firebase's token) belongs to whoever signed in on
-- it last. A person reads and forgets only their own phones. Sending to
-- someone else's phone happens in lib/push/ through the admin client
-- (SECURITY.md), which no policy here admits.
--
-- No insert or update policy: a shared site phone keeps one token across
-- people, so recording it may take the row from someone else, which RLS
-- would rightly refuse. claim_push_device() does that one move, for the
-- caller only.

create table if not exists push_devices (
  token text primary key check (length(token) between 20 and 4096),
  profile_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create index if not exists push_devices_profile_id on push_devices (profile_id);

alter table push_devices enable row level security;

drop policy if exists "push_devices readable by their owner" on push_devices;
create policy "push_devices readable by their owner"
  on push_devices for select to authenticated
  using (session_is_verified() and profile_id = auth.uid());

drop policy if exists "push_devices deletable by their owner" on push_devices;
create policy "push_devices deletable by their owner"
  on push_devices for delete to authenticated
  using (session_is_verified() and profile_id = auth.uid());

revoke insert, update, truncate on push_devices from anon, authenticated;
revoke all on push_devices from anon;

-- SECURITY DEFINER because the token's row may be someone else's. It checks
-- no grant: every signed-in person may have notifications. It touches only
-- the row with this token and gives it to the caller, never to anyone else.
create or replace function claim_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not session_is_verified() then
    raise exception 'Sign in to get notifications';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'That is not a phone this app runs on';
  end if;

  insert into push_devices (token, profile_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform,
        seen_at = now();
end;
$$;

revoke all on function claim_push_device(text, text) from public, anon;
grant execute on function claim_push_device(text, text) to authenticated;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'push_devices'::regclass) then
    raise exception '0130: push_devices must have RLS on';
  end if;
  if (select count(*) from pg_policies where tablename = 'push_devices') <> 2
     or exists (select 1 from pg_policies where tablename = 'push_devices'
                 and cmd not in ('SELECT', 'DELETE')) then
    raise exception '0130: push_devices must have exactly its read and delete policies';
  end if;
  if exists (select 1 from pg_policies where tablename = 'push_devices'
              and position('auth.uid()' in qual) = 0) then
    raise exception '0130: a push_devices policy has lost its owner check';
  end if;
  if has_table_privilege('authenticated', 'push_devices', 'insert')
     or has_table_privilege('authenticated', 'push_devices', 'update')
     or has_table_privilege('anon', 'push_devices', 'select') then
    raise exception '0130: push_devices is writable or readable beyond its policies';
  end if;
  if not (select prosecdef from pg_proc where oid = 'claim_push_device(text, text)'::regprocedure) then
    raise exception '0130: claim_push_device must be security definer';
  end if;
  if position('session_is_verified()' in
       pg_get_functiondef('claim_push_device(text, text)'::regprocedure)) = 0 then
    raise exception '0130: claim_push_device has lost its sign-in check';
  end if;
  if has_function_privilege('anon', 'claim_push_device(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'claim_push_device(text, text)', 'execute') then
    raise exception '0130: claim_push_device must be executable by authenticated and not anon';
  end if;
end $$;
