-- 0171 — Turing: which Claude answered, so the routing can be studied
--
-- A quick judge (Haiku) sorts each question into quick, standard or deep, and the turn goes to
-- Haiku, Sonnet or Opus; Think harder sends it straight to Opus. Beside the tokens already kept:
--   * model — on an answer, the Claude that wrote it (as the API reported it, so a server-side
--     fallback shows); on a question, the judge's model, its tokens in the token columns.
--   * route — on a question only: the level the turn went to, or 'asked' for Think harder.
--     A question with a route but no model is one the judge failed on, sent to the standard model.
-- Rows from before stay null in both.
--
-- The owner-only insert policy (0151) already covers the columns; messages stay append-only.
-- Re-runnable.

alter table turing_messages add column if not exists model text;
alter table turing_messages add column if not exists route text;

alter table turing_messages drop constraint if exists turing_messages_route_known;
alter table turing_messages add constraint turing_messages_route_known
  check (route is null or (role = 'user' and route in ('quick', 'standard', 'deep', 'asked')));

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'turing_messages'
         and column_name in ('model', 'route')) <> 2 then
    raise exception '0171: turing_messages.model or .route missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'turing_messages_route_known'
                    and conrelid = 'public.turing_messages'::regclass) then
    raise exception '0171: turing_messages_route_known missing';
  end if;
end $$;
