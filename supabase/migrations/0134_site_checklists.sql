-- 0134 — Site checklists (plan.md, OS process updates, Wave 3a). DRAFT FOR A FABLE REVIEW: new
-- tables, their policies and a storage bucket. Not applied.
--
-- The operations team's workbook of inspection checklists (Blockwork, Dry Rubble, Floor PCC …,
-- and the concrete grade record) becomes templates a supervisor fills on a phone, per villa:
-- each item Pass, Fail or N/A with a remark, and the whole signed off. Supervisors own all four
-- tables: templates are the site's reference data, edited by /supervisors and read by anyone
-- signed in; a villa's checklists are /supervisors on every verb. A signed-off checklist is a
-- record and never changes; an open one may be deleted (it was started by mistake). One file may
-- be attached, a test certificate or a photo, in the private site-checklists bucket.

create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  work_refs text,
  note text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates (id),
  sort_order int not null default 0,
  text text not null check (length(trim(text)) > 0),
  -- The workbook's own marking: an original check, one added, or one whose detail needs confirming.
  origin text not null default 'source' check (origin in ('source', 'added', 'review')),
  review_note text,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklist_template_items_template on checklist_template_items (template_id, sort_order);

create table if not exists site_checklists (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots (id),
  template_id uuid not null references checklist_templates (id),
  location text,
  drawing_revision text,
  started_on date not null default current_date,
  finished_on date,
  inspected_on date,
  status text not null default 'open' check (status in ('open', 'signed_off')),
  signed_off_by uuid references profiles (id),
  signed_off_at timestamptz,
  attachment_path text,
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_checklists_signed_off_shape check (
    (status = 'open' and signed_off_by is null and signed_off_at is null)
    or (status = 'signed_off' and signed_off_by is not null and signed_off_at is not null)
  )
);
create index if not exists site_checklists_plot on site_checklists (plot_id, started_on desc);

create table if not exists site_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references site_checklists (id) on delete cascade,
  template_item_id uuid not null references checklist_template_items (id),
  status text not null default 'not_checked' check (status in ('not_checked', 'pass', 'fail', 'na')),
  remarks text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, template_item_id)
);

-- Audit, updated_at, RLS ------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['checklist_templates', 'checklist_template_items', 'site_checklists', 'site_checklist_items'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on %I for each row execute function audit_row()', t, t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Templates: read by anyone signed in, kept by /supervisors, switched off rather than deleted.
drop policy if exists "checklist_templates readable by signed-in" on checklist_templates;
create policy "checklist_templates readable by signed-in" on checklist_templates
  for select to authenticated using (session_is_verified());
drop policy if exists "checklist_templates insertable by supervisors app" on checklist_templates;
create policy "checklist_templates insertable by supervisors app" on checklist_templates
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "checklist_templates updatable by supervisors app" on checklist_templates;
create policy "checklist_templates updatable by supervisors app" on checklist_templates
  for update to authenticated using (has_app('/supervisors')) with check (has_app('/supervisors'));

drop policy if exists "checklist_template_items readable by signed-in" on checklist_template_items;
create policy "checklist_template_items readable by signed-in" on checklist_template_items
  for select to authenticated using (session_is_verified());
drop policy if exists "checklist_template_items insertable by supervisors app" on checklist_template_items;
create policy "checklist_template_items insertable by supervisors app" on checklist_template_items
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "checklist_template_items updatable by supervisors app" on checklist_template_items;
create policy "checklist_template_items updatable by supervisors app" on checklist_template_items
  for update to authenticated using (has_app('/supervisors')) with check (has_app('/supervisors'));

-- A villa's checklists: /supervisors on every verb; delete reaches only an open one.
drop policy if exists "site_checklists readable by supervisors app" on site_checklists;
create policy "site_checklists readable by supervisors app" on site_checklists
  for select to authenticated using (has_app('/supervisors'));
drop policy if exists "site_checklists insertable by supervisors app" on site_checklists;
create policy "site_checklists insertable by supervisors app" on site_checklists
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "site_checklists updatable by supervisors app" on site_checklists;
create policy "site_checklists updatable by supervisors app" on site_checklists
  for update to authenticated using (has_app('/supervisors')) with check (has_app('/supervisors'));
drop policy if exists "site_checklists deletable while open by supervisors app" on site_checklists;
create policy "site_checklists deletable while open by supervisors app" on site_checklists
  for delete to authenticated using (has_app('/supervisors') and status = 'open');

drop policy if exists "site_checklist_items readable by supervisors app" on site_checklist_items;
create policy "site_checklist_items readable by supervisors app" on site_checklist_items
  for select to authenticated using (has_app('/supervisors'));
drop policy if exists "site_checklist_items insertable by supervisors app" on site_checklist_items;
create policy "site_checklist_items insertable by supervisors app" on site_checklist_items
  for insert to authenticated with check (has_app('/supervisors'));
drop policy if exists "site_checklist_items updatable by supervisors app" on site_checklist_items;
create policy "site_checklist_items updatable by supervisors app" on site_checklist_items
  for update to authenticated using (has_app('/supervisors')) with check (has_app('/supervisors'));
revoke delete on site_checklist_items from authenticated;

-- The record's rules ----------------------------------------------------------------------------
-- Signed off is final; signing off needs every item answered, and a Fail or N/A says why.
create or replace function site_checklists_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.plot_id, new.template_id) is distinct from (old.plot_id, old.template_id) then
      raise exception 'A checklist''s villa and template never change — delete it and start another.';
    end if;
    if old.status = 'signed_off' then
      raise exception 'This checklist is signed off — it can no longer change.';
    end if;
    if new.status = 'signed_off' then
      if exists (select 1 from site_checklist_items where checklist_id = new.id and status = 'not_checked') then
        raise exception 'Answer every item before signing the checklist off.';
      end if;
      if exists (select 1 from site_checklist_items
                  where checklist_id = new.id and status in ('fail', 'na')
                    and length(trim(coalesce(remarks, ''))) = 0) then
        raise exception 'Say what was found, or why it does not apply, on every Fail and N/A.';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists site_checklists_guard on site_checklists;
create trigger site_checklists_guard before update on site_checklists
  for each row execute function site_checklists_guard();

create or replace function site_checklist_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from site_checklists where id = new.checklist_id for share;
  if v_status is distinct from 'open' then
    raise exception 'This checklist is signed off — it can no longer change.';
  end if;
  if tg_op = 'UPDATE' and (new.checklist_id, new.template_item_id) is distinct from (old.checklist_id, old.template_item_id) then
    raise exception 'An item stays on its checklist.';
  end if;
  return new;
end $$;

drop trigger if exists site_checklist_items_guard on site_checklist_items;
create trigger site_checklist_items_guard before insert or update on site_checklist_items
  for each row execute function site_checklist_items_guard();

revoke all on function site_checklists_guard() from public, anon, authenticated;
revoke all on function site_checklist_items_guard() from public, anon, authenticated;

-- The attachment ---------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-checklists', 'site-checklists', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "site-checklists readable by supervisors app" on storage.objects;
create policy "site-checklists readable by supervisors app"
  on storage.objects for select to authenticated
  using (bucket_id = 'site-checklists' and public.has_app('/supervisors'));
drop policy if exists "site-checklists writable by supervisors app" on storage.objects;
create policy "site-checklists writable by supervisors app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-checklists' and public.has_app('/supervisors'));

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class
              where relname in ('checklist_templates', 'checklist_template_items', 'site_checklists', 'site_checklist_items')
                and not relrowsecurity) then
    raise exception '0134: every checklist table must have RLS on';
  end if;
  if exists (select 1 from pg_policies
              where tablename in ('checklist_templates', 'checklist_template_items', 'site_checklists', 'site_checklist_items')
                and cmd = 'SELECT'
              group by tablename having count(*) > 1) then
    raise exception '0134: one SELECT policy per table';
  end if;
  if exists (select 1 from pg_policies
              where tablename in ('checklist_templates', 'checklist_template_items')
                and cmd = 'DELETE') then
    raise exception '0134: templates are switched off, never deleted';
  end if;
  if (select public from storage.buckets where id = 'site-checklists') then
    raise exception '0134: the site-checklists bucket must be private';
  end if;
end $$;
