-- 0030 — Management group tools become known grant slugs
--
-- Six new tools registered in lib/tools.ts under the "Management"
-- group, all Coming Soon stubs for now: Dashboard, Project Management,
-- Design Management, Client Relations, Financial Management, Business
-- Planning. Unbuilt tools still appear as grant checkboxes in Settings
-- (GRANTABLE_TOOLS), so their slugs must pass the user_apps_app_known
-- CHECK (0017) or granting one fails at the database.
--
-- No tables, no data — just the drop + re-add the 0017 comment
-- prescribes, with the six new slugs appended. Re-runnable.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (app in (
  '/selections', '/budgets', '/masters', '/marathon',
  '/indents', '/purchase-orders', '/inventory', '/bills',
  '/directory', '/training',
  '/management-dashboard', '/project-management', '/design-management',
  '/client-relations', '/financial-management', '/business-planning'
));
