-- Rate limiting for the Marathon PIN screens.
--
-- /marathon is deliberately public — it is a kiosk, with no Supabase Auth
-- session, reachable by anyone who knows the URL (lib/supabase/proxy.ts
-- skips it entirely). The only thing between the internet and a field
-- agent's account is a 4-to-6 digit PIN, and nothing limited how many
-- times it could be guessed. Ten thousand combinations is minutes of
-- scripted requests.
--
-- One row per thing being guessed at: an agent's id, or the literal
-- 'admin' for the shared admin PIN. Rows are created on the first failure
-- and deleted on success, so this table stays empty in normal use.
--
-- Deliberately a table rather than in-memory counters: Vercel runs this
-- on serverless functions with no shared memory between invocations, so
-- an in-process counter would reset with every cold start and protect
-- nothing.

create table marathon_pin_attempts (
  -- An agent uuid as text, or 'admin'. Text rather than a foreign key
  -- because the admin PIN belongs to marathon_config, not an agent.
  target text primary key,
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

-- Same as every other marathon table (0002): RLS on, no policies, so the
-- only way in is the service-role client the kiosk already uses. There is
-- no signed-in user here to write a policy against.
alter table marathon_pin_attempts enable row level security;
