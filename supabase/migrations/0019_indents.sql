-- Phase 5 — Indents, and the Construction tree inside Budgets.
--
-- Two things ship together here because one feeds the other:
--
-- 1. CONSTRUCTION BUDGETS — a stage-wise quantity plan per unit
--    (Foundation, Sill, Lintel…), owned and edited by the QS team under
--    the /budgets grant. Materials and quantities ONLY — no money
--    anywhere on these tables, which is why (unlike the interiors
--    budgets in 0011) their reads are open to any signed-in staff
--    member and they need none of the cost/margin secrecy machinery.
--    No status, no approval, no revisions: it is a living plan.
--
-- 2. INDENTS — a site request for materials, numbered IND/<CODE>/001
--    per project, moving draft -> submitted -> approved. Lines come
--    from three sources: a construction budget stage, an APPROVED
--    interiors budget line, or a direct pick from the item master.
--    Every line carries its own item/quantity/uom, so it stands alone
--    whatever happens to its source.
--
-- The one deliberate hole in the 0011 margin boundary is at the bottom:
-- two views exposing ONLY non-secret columns of approved interiors
-- budgets to /indents holders. Read the comment there before touching.
--
-- Re-runnable throughout (the 0016 convention): if-not-exists tables and
-- indexes, create-or-replace functions, drop-if-exists before triggers,
-- policies and constraints. No preflight needed — everything is new, and
-- projects.code starts NULL on every existing row.

-- ---------------------------------------------------------------------
-- 1. projects.code — the short code indent numbers are built from
-- ---------------------------------------------------------------------
-- IND/ASHRAM/001 needs an "ASHRAM". Nullable: existing projects have
-- none, and raising an indent on a code-less project fails with a
-- friendly message (see create_indent below). The app normalises to
-- uppercase before writing; the CHECK is the backstop, not the UX.

alter table projects add column if not exists code text;
alter table projects drop constraint if exists projects_code_key;
alter table projects add constraint projects_code_key unique (code);
alter table projects drop constraint if exists projects_code_shape;
alter table projects add constraint projects_code_shape
  check (code is null or code ~ '^[A-Z0-9-]{2,10}$');

-- ---------------------------------------------------------------------
-- 2. indent_approvers — the named list who may approve an indent
-- ---------------------------------------------------------------------
-- Managed from Settings by admins, exactly like user_apps grants.
-- Admins themselves always may approve (checked alongside this list in
-- indents_guard). No `id` column and therefore NO audit trigger —
-- audit_row() records new.id and would raise at runtime (the lesson
-- item_margins' comment in 0011 records); user_apps lived the same way
-- until 0018. If auditing is ever wanted here, add the surrogate id
-- first.

create table if not exists indent_approvers (
  user_id uuid primary key references profiles (id) on delete cascade,
  granted_by uuid references profiles (id),
  granted_at timestamptz not null default now()
);

alter table indent_approvers enable row level security;

-- Readable by everyone signed in: indents_guard() runs as the invoker
-- and must see the list, and the Approve button needs to know whether to
-- render. Who may approve is not a secret; only admins decide it.
drop policy if exists "indent_approvers readable by authenticated users" on indent_approvers;
create policy "indent_approvers readable by authenticated users"
  on indent_approvers for select to authenticated using (true);
drop policy if exists "indent_approvers grantable by admins" on indent_approvers;
create policy "indent_approvers grantable by admins"
  on indent_approvers for insert to authenticated with check (is_admin());
drop policy if exists "indent_approvers revocable by admins" on indent_approvers;
create policy "indent_approvers revocable by admins"
  on indent_approvers for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- 3. Construction budgets — the stage-wise quantity plan per unit
-- ---------------------------------------------------------------------

create table if not exists construction_budgets (
  id uuid primary key default gen_random_uuid(),
  -- One living plan per unit. Not per revision, not versioned — the QS
  -- team edits it in place as the build progresses.
  unit_id uuid not null unique references units (id),
  -- Denormalised the way budgets.unit_id is: every transactional table
  -- links to a project, and screens filter by it constantly.
  project_id uuid not null references projects (id),
  note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists construction_budgets_project_idx
  on construction_budgets (project_id);

create table if not exists construction_budget_lines (
  id uuid primary key default gen_random_uuid(),
  -- Cascade is safe here, unlike indent_lines below: these lines have no
  -- guard trigger that reads the parent, so a parent delete cannot
  -- misfire one.
  budget_id uuid not null references construction_budgets (id) on delete cascade,
  -- Free-form by decision: the QS team types stage names as they go
  -- ("Foundation", "Sill"...). Screens group lines by this text; a
  -- rename is one UPDATE across the stage's lines.
  stage text not null check (length(trim(stage)) > 0),
  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  note text,
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists construction_budget_lines_budget_idx
  on construction_budget_lines (budget_id);
create index if not exists construction_budget_lines_item_idx
  on construction_budget_lines (item_id);

alter table construction_budgets enable row level security;
alter table construction_budget_lines enable row level security;

-- No money on these tables, so reads follow the selections precedent
-- (open to any signed-in staff member) — Indents' pull screen and the
-- Overview page read them under their own footing. Writes are the QS
-- team's, i.e. the /budgets grant.
drop policy if exists "construction_budgets readable by authenticated users" on construction_budgets;
create policy "construction_budgets readable by authenticated users"
  on construction_budgets for select to authenticated using (true);
drop policy if exists "construction_budgets writable by budgets app" on construction_budgets;
create policy "construction_budgets writable by budgets app"
  on construction_budgets for insert to authenticated with check (has_app('/budgets'));
drop policy if exists "construction_budgets updatable by budgets app" on construction_budgets;
create policy "construction_budgets updatable by budgets app"
  on construction_budgets for update to authenticated
  using (has_app('/budgets')) with check (has_app('/budgets'));
drop policy if exists "construction_budgets deletable by budgets app" on construction_budgets;
create policy "construction_budgets deletable by budgets app"
  on construction_budgets for delete to authenticated using (has_app('/budgets'));

drop policy if exists "construction_budget_lines readable by authenticated users" on construction_budget_lines;
create policy "construction_budget_lines readable by authenticated users"
  on construction_budget_lines for select to authenticated using (true);
drop policy if exists "construction_budget_lines writable by budgets app" on construction_budget_lines;
create policy "construction_budget_lines writable by budgets app"
  on construction_budget_lines for insert to authenticated with check (has_app('/budgets'));
drop policy if exists "construction_budget_lines updatable by budgets app" on construction_budget_lines;
create policy "construction_budget_lines updatable by budgets app"
  on construction_budget_lines for update to authenticated
  using (has_app('/budgets')) with check (has_app('/budgets'));
drop policy if exists "construction_budget_lines deletable by budgets app" on construction_budget_lines;
create policy "construction_budget_lines deletable by budgets app"
  on construction_budget_lines for delete to authenticated using (has_app('/budgets'));

-- ---------------------------------------------------------------------
-- 4. indent_counters — per-project numbering that can't mint twice
-- ---------------------------------------------------------------------
-- Numbers are minted ONLY inside create_indent() below, via an upsert
-- whose row lock serialises concurrent creates: two people raising
-- indents on the same project at the same moment get consecutive
-- numbers, never the same one. This must be a database function —
-- PostgREST cannot express `last_no + 1` atomically (the same reason
-- reopen_budget() exists, 0012).
--
-- Numbers from deleted drafts are never reused; a gap in the sequence is
-- expected and harmless — a reused number on two different pieces of
-- paper is not.

create table if not exists indent_counters (
  project_id uuid primary key references projects (id),
  last_no int not null default 0
);

alter table indent_counters enable row level security;

drop policy if exists "indent_counters readable by authenticated users" on indent_counters;
create policy "indent_counters readable by authenticated users"
  on indent_counters for select to authenticated using (true);
drop policy if exists "indent_counters writable by indents app" on indent_counters;
create policy "indent_counters writable by indents app"
  on indent_counters for insert to authenticated with check (has_app('/indents'));
drop policy if exists "indent_counters updatable by indents app" on indent_counters;
create policy "indent_counters updatable by indents app"
  on indent_counters for update to authenticated
  using (has_app('/indents')) with check (has_app('/indents'));

-- ---------------------------------------------------------------------
-- 5. indents
-- ---------------------------------------------------------------------

create table if not exists indents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  plot_id uuid references plots (id),
  unit_id uuid references units (id),
  -- The construction stage this indent belongs to ("Sill"). Free text,
  -- stamped automatically when lines are pulled from a construction
  -- budget stage; null for interiors pulls and pure direct requests.
  stage text,
  indent_no int not null,
  -- Stored at mint time, never recomputed from projects.code — so
  -- editing a project's code later relabels nothing historical.
  reference text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved')),
  required_by date,
  note text,
  -- Set when an approver sends a submitted indent back; cleared on
  -- resubmit. The reason lives here so the site team sees it on the
  -- draft they're fixing.
  rejection_note text,
  created_by uuid references profiles (id),
  submitted_by uuid references profiles (id),
  submitted_at timestamptz,
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, indent_no),
  unique (reference)
);
create index if not exists indents_project_idx on indents (project_id);
create index if not exists indents_status_idx on indents (status);
create index if not exists indents_unit_idx on indents (unit_id) where unit_id is not null;

create table if not exists indent_lines (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NO on delete cascade: a cascaded child delete fires the
  -- draft-only guard after the parent row is already gone, which reads
  -- the status as 'missing' and raises — the exact failure
  -- delete_draft_selection() exists to avoid (0017 §8).
  -- delete_draft_indent() below is the one sanctioned delete path.
  indent_id uuid not null references indents (id),

  -- Every line carries its own item, quantity and uom — it stands alone
  -- whatever happens to the budget it came from. The two anchors below
  -- are provenance, and at most one may be set.

  item_id uuid not null references items (id),
  quantity numeric not null check (quantity > 0),
  uom text not null check (
    uom in ('each', 'rft', 'sqft', 'lumpsum', 'bag', 'kg', 'litre', 'cft')
  ),
  note text,

  -- Anchor A: an APPROVED interiors budget line. The composite FK is the
  -- CLAUDE.md rule — never a bare line_key, which is only unique within
  -- one revision. MATCH SIMPLE (the default) skips the check when the
  -- pair is NULL, which is what makes the anchor optional.
  budget_id uuid,
  line_key uuid,

  -- Anchor B: a construction budget line. SET NULL on delete because the
  -- QS team may freely reshape a living plan — the indent line keeps its
  -- own item and quantity; only the back-link is lost.
  construction_line_id uuid references construction_budget_lines (id) on delete set null,

  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- No half-anchored interiors lines, and never both anchors at once.
  check ((budget_id is null) = (line_key is null)),
  check (not (budget_id is not null and construction_line_id is not null)),

  foreign key (budget_id, line_key) references budget_lines (budget_id, line_key),

  -- Each source line at most once per indent. NULLS are distinct in a
  -- unique constraint, so direct lines (all anchors null) never collide.
  unique (indent_id, budget_id, line_key),
  unique (indent_id, construction_line_id)
);
create index if not exists indent_lines_indent_idx on indent_lines (indent_id);
create index if not exists indent_lines_item_idx on indent_lines (item_id);
create index if not exists indent_lines_budget_anchor_idx
  on indent_lines (budget_id, line_key) where budget_id is not null;
create index if not exists indent_lines_construction_anchor_idx
  on indent_lines (construction_line_id) where construction_line_id is not null;

-- ---------------------------------------------------------------------
-- 6. The status machine, enforced where it can't be forgotten
-- ---------------------------------------------------------------------
-- Same shape as 0011/0017's budget guards: lines only writable while the
-- parent is a draft (FOR SHARE read so a line write and a status change
-- serialise instead of interleaving), and every header transition
-- whitelisted — including the rule that only a named approver or an
-- admin may approve, which holds against a raw PostgREST PATCH, not just
-- against the button.

create or replace function indent_lines_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_indent uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_indent := old.indent_id;
  else
    target_indent := new.indent_id;
  end if;

  select status into parent_status
  from indents where id = target_indent
  for share;

  if parent_status is distinct from 'draft' then
    raise exception 'Indent % is % — lines can only be changed while it is a draft',
      target_indent, coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists indent_lines_draft_only on indent_lines;
create trigger indent_lines_draft_only
  before insert or update or delete on indent_lines
  for each row execute function indent_lines_draft_only();

create or replace function indents_guard()
returns trigger
language plpgsql
as $$
begin
  -- The number on the paper is permanent.
  if (new.project_id, new.indent_no, new.reference)
     is distinct from (old.project_id, old.indent_no, old.reference) then
    raise exception 'An indent''s project, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (plot, unit, stage, required_by, note) only while
    -- it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % indent can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    -- The UPDATE's row lock serialises this count against concurrent
    -- line writes, which take FOR SHARE on this row (above).
    if not exists (select 1 from indent_lines where indent_id = new.id) then
      raise exception 'Add at least one line before submitting this indent';
    end if;
    if new.submitted_by is null or new.submitted_at is null then
      raise exception 'Submitting must record who submitted and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Resubmitting must clear the rejection note';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'approved' then
    if not (is_admin() or exists (
      select 1 from indent_approvers a where a.user_id = auth.uid()
    )) then
      raise exception 'Only a named indent approver or an admin can approve an indent';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    -- A rejection: the reason is mandatory, and the submission record is
    -- cleared so a resubmit stamps fresh.
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a rejection needs a note';
    end if;
    if new.submitted_by is not null or new.submitted_at is not null
       or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Rejecting must clear the submission and approval fields';
    end if;
    return new;
  end if;

  raise exception 'Invalid indent status change: % -> %', old.status, new.status;
end $$;

drop trigger if exists indents_guard on indents;
create trigger indents_guard
  before update on indents
  for each row execute function indents_guard();

-- ---------------------------------------------------------------------
-- 7. create_indent() — the only place a number is minted
-- ---------------------------------------------------------------------
-- security invoker: RLS still applies, so this is not a way around the
-- /indents grant — the INSERT policies on indents and indent_counters
-- are the gate.

create or replace function create_indent(
  p_project_id uuid,
  p_plot_id uuid,
  p_unit_id uuid,
  p_stage text,
  p_required_by date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
  v_no int;
  v_id uuid;
begin
  select code into v_code from projects where id = p_project_id;
  if v_code is null then
    raise exception 'This project has no short code yet — set one in Masters before raising indents';
  end if;

  insert into indent_counters (project_id, last_no)
  values (p_project_id, 1)
  on conflict (project_id) do update set last_no = indent_counters.last_no + 1
  returning last_no into v_no;

  insert into indents (
    project_id, plot_id, unit_id, stage, indent_no, reference,
    required_by, note, created_by
  )
  values (
    p_project_id, p_plot_id, p_unit_id, nullif(trim(p_stage), ''),
    v_no,
    -- greatest() because lpad TRUNCATES a string longer than its target:
    -- lpad('1234', 3) is '123'. This pads to 3 and never truncates,
    -- matching the TS mirror in lib/indents/reference.ts exactly.
    'IND/' || v_code || '/' || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    p_required_by, nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_indent(uuid, uuid, uuid, text, date, text) from public;
grant execute on function create_indent(uuid, uuid, uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. delete_draft_indent() — deleting a draft is atomic
-- ---------------------------------------------------------------------
-- Mirrors delete_draft_selection() (0017 §8), for the same reason: lines
-- then header in one transaction, locked against a concurrent submit.

create or replace function delete_draft_indent(p_indent_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from indents
  where id = p_indent_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Only a draft indent can be deleted';
  end if;

  delete from indent_lines where indent_id = p_indent_id;
  delete from indents where id = p_indent_id;
end $$;

revoke execute on function delete_draft_indent(uuid) from public;
grant execute on function delete_draft_indent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. The one narrow window through the 0011 margin boundary
-- ---------------------------------------------------------------------
-- Indents pulls lines from APPROVED interiors budgets, and legitimately
-- needs the budget team's quantity and expected vendor — but SELECT on
-- budgets/budget_lines is gated to /budgets so cost and margin can never
-- leak (0011, rule 2). These two views are the answer:
--
--   * They are owned by postgres, which owns the tables, and a table's
--     owner bypasses its RLS — so the views can see the rows.
--   * The grant gate is re-imposed in their WHERE: /indents or /budgets.
--     (anon has neither — has_app() is false with no auth.uid() — but
--     the revoke below closes it explicitly.)
--   * Only APPROVED budgets appear at all.
--   * The column list IS the security boundary. unit_cost, margin_pct,
--     client_rate and everything in item_margins are ABSENT. NEVER add a
--     column to either view without asking whether it sits on the secret
--     side of the 0011 boundary — this is the same "a template cannot
--     print what its props don't contain" principle as QuoteData.
--
-- security_barrier stops a caller's leaky function being pushed below
-- the grant qual by the planner. Do NOT solve this need with a second
-- row-level SELECT policy on budget_lines instead: permissive policies
-- OR together, and a row-level policy exposes every column of the row.

drop view if exists approved_budget_lines;
drop view if exists approved_budgets;

create view approved_budgets
with (security_barrier) as
select b.id, b.selection_id, b.unit_id, b.version, b.approved_at
from budgets b
where b.status = 'approved'
  and (has_app('/indents') or has_app('/budgets'));

create view approved_budget_lines
with (security_barrier) as
select bl.budget_id, bl.selection_id, bl.line_key,
       bl.quantity, bl.expected_vendor_id, bl.budget_status
from budget_lines bl
join budgets b on b.id = bl.budget_id
where b.status = 'approved'
  and (has_app('/indents') or has_app('/budgets'));

revoke all on approved_budgets from public, anon;
revoke all on approved_budget_lines from public, anon;
grant select on approved_budgets to authenticated;
grant select on approved_budget_lines to authenticated;

-- ---------------------------------------------------------------------
-- 10. Audit, updated_at, and RLS for the indent tables
-- ---------------------------------------------------------------------
-- All four new transactional tables carry an `id`, so audit_row() (0006)
-- applies cleanly. indent_approvers and indent_counters are deliberately
-- not audited (no id; a counter's history is noise).

drop trigger if exists audit_construction_budgets on construction_budgets;
create trigger audit_construction_budgets
  after insert or update or delete on construction_budgets
  for each row execute function audit_row();

drop trigger if exists audit_construction_budget_lines on construction_budget_lines;
create trigger audit_construction_budget_lines
  after insert or update or delete on construction_budget_lines
  for each row execute function audit_row();

drop trigger if exists audit_indents on indents;
create trigger audit_indents
  after insert or update or delete on indents
  for each row execute function audit_row();

drop trigger if exists audit_indent_lines on indent_lines;
create trigger audit_indent_lines
  after insert or update or delete on indent_lines
  for each row execute function audit_row();

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'construction_budgets', 'construction_budget_lines', 'indents', 'indent_lines'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t
    );
  end loop;
end $$;

alter table indents enable row level security;
alter table indent_lines enable row level security;

-- Reads open to any signed-in staff member — no money on an indent, and
-- the Overview page plus Phase 6 (Purchase Orders) read them under
-- their own footing, exactly as Budgets reads selections. Writes are
-- the /indents grant's.
drop policy if exists "indents readable by authenticated users" on indents;
create policy "indents readable by authenticated users"
  on indents for select to authenticated using (true);
drop policy if exists "indents writable by indents app" on indents;
create policy "indents writable by indents app"
  on indents for insert to authenticated with check (has_app('/indents'));
drop policy if exists "indents updatable by indents app" on indents;
create policy "indents updatable by indents app"
  on indents for update to authenticated
  using (has_app('/indents')) with check (has_app('/indents'));
-- A draft raised by mistake can be thrown away (via delete_draft_indent);
-- a submitted or approved indent never can.
drop policy if exists "draft indents deletable by indents app" on indents;
create policy "draft indents deletable by indents app"
  on indents for delete to authenticated
  using (has_app('/indents') and status = 'draft');

drop policy if exists "indent_lines readable by authenticated users" on indent_lines;
create policy "indent_lines readable by authenticated users"
  on indent_lines for select to authenticated using (true);
drop policy if exists "indent_lines writable by indents app" on indent_lines;
create policy "indent_lines writable by indents app"
  on indent_lines for insert to authenticated with check (has_app('/indents'));
drop policy if exists "indent_lines updatable by indents app" on indent_lines;
create policy "indent_lines updatable by indents app"
  on indent_lines for update to authenticated
  using (has_app('/indents')) with check (has_app('/indents'));
drop policy if exists "indent_lines deletable by indents app" on indent_lines;
create policy "indent_lines deletable by indents app"
  on indent_lines for delete to authenticated using (has_app('/indents'));
