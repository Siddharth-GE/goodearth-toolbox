-- Phase 6 prerequisite — audit triggers on items, vendors and
-- item_requests.
--
-- Deferred from the 2026-08-01 audit with an explicit trigger for
-- revisiting: "must land before Purchase Orders ship". Purchase Orders
-- makes vendors counterparties on money documents and items the subject
-- of purchase prices, so from here on a change to either needs a
-- who/when/what trail, exactly like every transactional table already
-- has (0019 §10).
--
-- All three tables carry a surrogate `id`, so the shared audit_row()
-- (0006) applies cleanly — no schema change, triggers only.
--
-- Re-runnable (the 0016 convention): drop-if-exists before each trigger.

drop trigger if exists audit_items on items;
create trigger audit_items
  after insert or update or delete on items
  for each row execute function audit_row();

drop trigger if exists audit_vendors on vendors;
create trigger audit_vendors
  after insert or update or delete on vendors
  for each row execute function audit_row();

drop trigger if exists audit_item_requests on item_requests;
create trigger audit_item_requests
  after insert or update or delete on item_requests
  for each row execute function audit_row();
