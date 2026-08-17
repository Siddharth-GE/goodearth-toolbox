-- 0070 — remove the Marathon agent whose PIN is published in this repo
--
-- Why this exists
-- ---------------
-- 0002 seeded one agent, "Test Agent", with PIN 1234, and said in a
-- comment: "Delete this row once real field agents are added." Real
-- agents were added. The row stayed. TODO.md §4 has carried it since
-- 11 Aug 2026.
--
-- It became urgent on 17 Aug 2026 for a reason worth recording. Building
-- the fresh production database by replaying every migration **recreated
-- it** — a brand-new database, containing the real work of a real
-- company, born with a login whose PIN, hash and salt are all sitting in
-- plaintext in a public git repository. Nothing warned about this. The
-- replay reported sixty-nine successes.
--
-- That is the general shape of the thing: a seed written to make an
-- unfinished feature testable is a fixture in a development database and
-- a credential in a production one, and replaying migrations is exactly
-- what turns the first into the second.
--
-- What it does
-- ------------
-- Deletes any marathon_agents row whose pin_hash is the published one.
-- Matched on the hash, not the name: an agent someone has since renamed
-- but never re-PINned is the same hole, and a real agent who happens to
-- be called "Test Agent" with a proper PIN is not. Rotation is the only
-- remedy that works here — the value is in public git history for good,
-- so no amount of editing 0002 would help.
--
-- What it does NOT do
-- -------------------
-- It cannot find agents who chose 1234 for themselves. Their salts
-- differ, so their hashes differ, and PINs are scrypt — which Postgres
-- has no way to compute. That check needs Node and is a separate job.
--
-- 0002's other seeds (run distances, categories, the open group) are
-- ordinary configuration and stay.
--
-- Safe to run twice: the second run deletes nothing.

delete from marathon_agents
where pin_hash = 'ff8557f0e168aa676a95c229af658b0be23166a92d3eab5d3d7fdf810565b269bfb1ff68e9cadd7eb7923bafe521884beb9648cc5b86b24c53bc4d004b075c1b';

-- ---------------------------------------------------------------------
-- Assert what this migration claimed to do
-- ---------------------------------------------------------------------
do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from marathon_agents
  where pin_hash = 'ff8557f0e168aa676a95c229af658b0be23166a92d3eab5d3d7fdf810565b269bfb1ff68e9cadd7eb7923bafe521884beb9648cc5b86b24c53bc4d004b075c1b';

  if v_left <> 0 then
    raise exception '0070: % agent(s) are still on the published PIN', v_left;
  end if;
end $$;
