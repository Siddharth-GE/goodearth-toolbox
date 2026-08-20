-- 0085 — The items master is the one material list (Phase 2, G2)
--
-- FOUNDER, 2026-08-20: "why does the estimator have one more material
-- list, when we already have a master? any work that requires that
-- should just use the master."
--
-- What stays and why: estimator_materials remains as the estimator's
-- RATE CARD — the rate is construction money and lives behind
-- /estimator, while the items master is readable by every signed-in
-- person, so the rate can never sit on the master itself. The
-- estimating unit also legitimately differs from the buying unit
-- (sand estimated in cum, bought in cft) — the 0076 factor bridges.
--
-- What changes: a material no longer EXISTS apart from the master.
-- Every new material starts from a picked catalogue item; the
-- estimator adds only the rate, the estimating unit and the
-- conversion. 0076's optional link becomes the identity.
--
-- A trigger, not a NOT VALID CHECK, on purpose: a NOT VALID check
-- still fires on UPDATE, so repricing a pre-0085 unlinked material
-- would be refused — history must stay editable while it is being
-- linked up. The trigger demands the link on INSERT, and refuses
-- UNLINKING on update; everything else about old rows keeps working.
--
-- Re-runnable throughout.

create or replace function estimator_materials_master_first()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.item_id is null then
    raise exception 'Pick the material from Masters — the catalogue is the one material list.';
  end if;
  if tg_op = 'UPDATE' and new.item_id is null and old.item_id is not null then
    raise exception 'A material stays linked to its master item — change the link rather than removing it.';
  end if;
  return new;
end;
$$;

drop trigger if exists estimator_materials_master_first on estimator_materials;
create trigger estimator_materials_master_first
  before insert or update on estimator_materials
  for each row execute function estimator_materials_master_first();

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'estimator_materials_master_first'
      and tgrelid = 'estimator_materials'::regclass
  ) then
    raise exception '0085: estimator_materials_master_first trigger missing';
  end if;
end $$;
