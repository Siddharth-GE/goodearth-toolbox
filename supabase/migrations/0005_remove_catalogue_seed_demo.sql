-- Phase 1 follow-up — clear the three fictional catalogue seed items
-- 0004_masters.sql created, ahead of importing the real ~2,631-item
-- catalogue (scripts/import-catalogue.ts).
--
-- Why this is a deliberate exception to the additive-only rule in
-- CLAUDE.md: these are demo rows this project invented itself, never
-- entered by staff and never referenced by any transactional table
-- (nothing downstream of items exists yet). The real catalogue carries
-- categories 'Seating', 'Tables' and 'Lighting & Electrical Fixtures',
-- which would otherwise sit alongside near-identical fakes named
-- 'Sofas', 'Dining Tables' and 'Lighting' — two entries for the same
-- thing in every designer's category filter.
--
-- Scoped by exact seed code so it cannot touch a real row: the imported
-- catalogue uses a different code convention entirely (BENS001, HANL001).
--
-- The two material seeds (OPC 53 Grade Cement, Vitrified Tile) and their
-- categories are deliberately KEPT — they are realistic, and they are the
-- only material-side data until the construction lists arrive.

delete from items where code in ('GE-SOF-001', 'GE-DIN-001', 'GE-LGT-001');

-- Only removes these three if nothing else moved into them in the
-- meantime; a category still holding items is left alone rather than
-- failing the migration on the foreign key.
delete from item_categories
where name in ('Sofas', 'Dining Tables', 'Lighting')
  and kind = 'catalogue'
  and not exists (select 1 from items where items.category_id = item_categories.id);

-- 'Goodearth Collection' and 'Kajaria' brands are kept: both are real,
-- and Kajaria still labels the surviving vitrified tile seed.
