-- 0090 — vendor_payment_details learns the audit log's one requirement
--
-- 0089 gave the table vendor_id as its primary key: the 1:1 shape is the
-- point, and a surrogate key looked like noise. The first real insert
-- proved otherwise: audit_row() (0006) stamps audit_log.row_id from the
-- row's `id` column on every audited table, and a table without one
-- refuses ALL writes the moment the trigger fires. Every audited table
-- carries an id; this one now does too. vendor_id stays the primary key
-- and the 1:1 guarantee; id exists so the audit trail has a stable name
-- for the row.
--
-- Re-runnable throughout.

alter table vendor_payment_details
  add column if not exists id uuid not null default gen_random_uuid();

drop index if exists vendor_payment_details_id_key;
create unique index vendor_payment_details_id_key on vendor_payment_details (id);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendor_payment_details' and column_name = 'id'
  ) then
    raise exception '0090: vendor_payment_details.id is missing';
  end if;
end $$;
