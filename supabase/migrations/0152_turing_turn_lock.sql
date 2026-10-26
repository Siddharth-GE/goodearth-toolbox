-- 0152 — Turing: one answer at a time per conversation
--
-- Two answers running at once on one conversation (a Stop then a quick re-send, or the same chat
-- open on a phone and a computer) would interleave their messages, and an append-only history
-- cannot be put right afterwards. A turn takes the conversation by stamping turn_started_at and
-- gives it back when it ends; a stamp older than any answer can run (Vercel stops one at five
-- minutes) is treated as free. Taking it is an update, so the conversation's updated_at moves
-- and it rises to the top of its owner's list.
--
-- The owner-only update policy (0151) already covers the column. Re-runnable.

alter table turing_conversations add column if not exists turn_started_at timestamptz;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'turing_conversations'
                    and column_name = 'turn_started_at') then
    raise exception '0152: turing_conversations.turn_started_at missing';
  end if;
end $$;
