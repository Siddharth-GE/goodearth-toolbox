-- 0101 — Companies, and reusable terms
--
-- FOUNDER, 2026-10-08 (plan.md, B1): "company etc. also just derived".
-- Every document in the chain — indent, PO, work order, bill — prints the
-- company it is made by, and nobody picks it: a project belongs to one
-- company, and the document takes its project's. The same day: "add an
-- option to edit the terms and conditions description" (POs) and
-- "reusable templates" (work orders) — so terms are a small Masters list
-- of named texts, one default per kind, copied onto a document when it is
-- made and edited there.
--
--   * companies — a Masters list, read by every signed-in person (a
--     company's name, address and GSTIN are printed on paper sent out);
--     written by /masters. NO SEED: the founder enters Goodearth's real
--     details (PRODUCT.md — never invent letterhead facts). `state` drives
--     the PO's CGST+SGST / IGST split against the vendor's gst_state.
--   * projects.company_id — nullable; a project without one prints the
--     placeholder letterhead it prints today.
--   * document_terms — `kind` po | work_order, a name, the text, and at
--     most one default per kind (partial unique index). Masters reads are
--     open; writes /masters.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. companies
-- ---------------------------------------------------------------------

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  address text,
  gstin text,
  state text not null default 'Kerala' check (length(trim(state)) > 0),
  phone text,
  email text,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists companies_name_unique on companies (lower(trim(name)));

drop trigger if exists audit_companies on companies;
create trigger audit_companies
  after insert or update or delete on companies
  for each row execute function audit_row();

drop trigger if exists set_updated_at on companies;
create trigger set_updated_at
  before update on companies
  for each row execute function set_updated_at();

alter table companies enable row level security;

drop policy if exists "companies readable by authenticated users" on companies;
create policy "companies readable by authenticated users" on companies
  for select to authenticated using (true);

drop policy if exists "companies insertable by masters app" on companies;
create policy "companies insertable by masters app" on companies
  for insert to authenticated with check (has_app('/masters'));

drop policy if exists "companies updatable by masters app" on companies;
create policy "companies updatable by masters app" on companies
  for update to authenticated using (has_app('/masters')) with check (has_app('/masters'));
-- No delete policy: a company is deactivated, never erased — documents name it.

-- ---------------------------------------------------------------------
-- 2. A project belongs to a company
-- ---------------------------------------------------------------------

alter table projects add column if not exists company_id uuid references companies (id);
create index if not exists projects_company_id_idx on projects (company_id);

-- ---------------------------------------------------------------------
-- 3. document_terms — named texts, one default per kind
-- ---------------------------------------------------------------------

create table if not exists document_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('po', 'work_order')),
  name text not null check (length(trim(name)) > 0),
  body text not null check (length(trim(body)) > 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists document_terms_one_default_per_kind
  on document_terms (kind) where is_default;
create unique index if not exists document_terms_name_unique
  on document_terms (kind, lower(trim(name)));

drop trigger if exists audit_document_terms on document_terms;
create trigger audit_document_terms
  after insert or update or delete on document_terms
  for each row execute function audit_row();

drop trigger if exists set_updated_at on document_terms;
create trigger set_updated_at
  before update on document_terms
  for each row execute function set_updated_at();

alter table document_terms enable row level security;

drop policy if exists "document_terms readable by authenticated users" on document_terms;
create policy "document_terms readable by authenticated users" on document_terms
  for select to authenticated using (true);

drop policy if exists "document_terms insertable by masters app" on document_terms;
create policy "document_terms insertable by masters app" on document_terms
  for insert to authenticated with check (has_app('/masters'));

drop policy if exists "document_terms updatable by masters app" on document_terms;
create policy "document_terms updatable by masters app" on document_terms
  for update to authenticated using (has_app('/masters')) with check (has_app('/masters'));
-- No delete policy: a template is switched off; documents keep their copy.

-- ---------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
begin
  foreach t in array array['companies', 'document_terms'] loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0101: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then raise exception '0101: % has % SELECT policies, expected 1', t, v; end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'DELETE') then
      raise exception '0101: % must have no DELETE policy', t;
    end if;
    if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = t and 'anon' = any(roles)) then
      raise exception '0101: % has a policy for anon', t;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'company_id') then
    raise exception '0101: projects.company_id is missing';
  end if;
end $$;
