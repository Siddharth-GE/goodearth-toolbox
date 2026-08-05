-- Bill approvers get a ceiling.
--
-- Until now approval was all-or-nothing: whoever was on bill_approvers
-- could approve a ₹2,000 bill and a ₹20,00,000 one alike. A limit lets
-- the founder delegate the small stuff without delegating everything —
-- the one approval upgrade asked for, and deliberately the only one.
--
-- Only bills. Indents carry no money by design (locked architecture),
-- so an amount limit there would have nothing to compare against;
-- indent_approvers stays a flat list and gains only its audit trail.
--
-- NULL means unlimited, so every existing approver keeps working exactly
-- as they did — the column arrives empty and nothing changes until an
-- admin types a number.
--
-- Also lands the conjunct deferred from 0032: a DEACTIVATED approver
-- can no longer approve. 0032 narrowed is_admin()/has_app() but left
-- these two branches reading bill_approvers directly, so a live JWT
-- could still have approved by raw PATCH. Folded in here rather than
-- rewriting this function twice.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The limit, and an audit trail for both approver lists
-- ---------------------------------------------------------------------
alter table bill_approvers add column if not exists approval_limit numeric;
alter table bill_approvers drop constraint if exists bill_approvers_limit_positive;
alter table bill_approvers add constraint bill_approvers_limit_positive
  check (approval_limit is null or approval_limit > 0);

-- The table was insert/delete only (0025) — a limit is edited in place,
-- so it needs an UPDATE policy. Admin-only, like the other two.
drop policy if exists "bill_approvers updatable by admins" on bill_approvers;
create policy "bill_approvers updatable by admins"
  on bill_approvers for update to authenticated
  using (is_admin()) with check (is_admin());

-- Both lists were explicitly unaudited (0025/0019 say so) because
-- neither had the surrogate id audit_row() records. Who could approve
-- what, and up to how much, is exactly the kind of question the audit
-- log exists to answer — so both get one now (the 0018 pattern).
alter table bill_approvers add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists bill_approvers_id_key on bill_approvers (id);
drop trigger if exists audit_bill_approvers on bill_approvers;
create trigger audit_bill_approvers
  after insert or update or delete on bill_approvers
  for each row execute function audit_row();

alter table indent_approvers add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists indent_approvers_id_key on indent_approvers (id);
drop trigger if exists audit_indent_approvers on indent_approvers;
create trigger audit_indent_approvers
  after insert or update or delete on indent_approvers
  for each row execute function audit_row();

-- ---------------------------------------------------------------------
-- 2. bills_guard() — the limit is checked where it cannot be bypassed
-- ---------------------------------------------------------------------
-- Verbatim from 0026 except the two approver branches. The status
-- machine must not regress, so every other branch is reproduced
-- unchanged rather than patched.
--
-- Two deliberate choices:
--   * The limit applies to APPROVAL only. Send-back is not limit-gated:
--     returning a bill authorises no spending, and someone who spots a
--     problem on a large bill should always be able to say so.
--   * The comparison is `<=`, so a limit of ₹50,000 approves a bill of
--     exactly ₹50,000. A limit reads as "up to and including".
create or replace function bills_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
  v_is_approver boolean;
begin
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.vendor_id,
      new.po_id, new.labour_contract_id, new.kind, new.bill_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.vendor_id,
      old.po_id, old.labour_contract_id, old.kind, old.bill_no, old.reference) then
    raise exception 'A bill''s anchor, vendor, scope and number are permanent';
  end if;

  if new.status = old.status then
    if old.status <> 'recorded' then
      raise exception 'A % bill can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'recorded' and new.status = 'approved' then
    -- Self-approval allowed (founder decision): the recorder may sit on
    -- this list — no recorder <> approver check, deliberately.
    select true, a.approval_limit into v_is_approver, v_cap
    from bill_approvers a
    where a.user_id = auth.uid() and profile_is_active(a.user_id);

    if not (is_admin() or coalesce(v_is_approver, false)) then
      raise exception 'Only a named bill approver or an admin can approve a bill';
    end if;
    -- Admins are exempt: the limit delegates downward, it doesn't cap
    -- the person who hands the limits out.
    if not is_admin() and v_cap is not null and new.total_amount > v_cap then
      raise exception 'This bill is above your approval limit of %', v_cap;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    if new.rejection_note is not null then
      raise exception 'Approving must clear the rejection note';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'recorded' then
    if not (is_admin() or exists (
      select 1 from bill_approvers a
      where a.user_id = auth.uid() and profile_is_active(a.user_id)
    )) then
      raise exception 'Only a named bill approver or an admin can send a bill back';
    end if;
    if new.rejection_note is null or length(trim(new.rejection_note)) = 0 then
      raise exception 'Say what needs changing — a send-back needs a note';
    end if;
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'Sending back must clear the approval fields';
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'paid' then
    if new.payment_ref is null or length(trim(new.payment_ref)) = 0 then
      raise exception 'Record the payment reference before marking this bill paid';
    end if;
    if new.paid_by is null or new.paid_at is null then
      raise exception 'Marking paid must record who paid and when';
    end if;
    return new;
  end if;

  raise exception 'Invalid bill status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 3. labour_contracts_guard() — the same two corrections
-- ---------------------------------------------------------------------
-- A contract is approved by the same list (0026 §1). Its own value is
-- the amount at stake, so the limit applies there too; and a
-- deactivated approver must not approve one either.
create or replace function labour_contracts_guard()
returns trigger
language plpgsql
as $$
declare
  v_cap numeric;
  v_is_approver boolean;
begin
  if new.status = old.status then
    -- Everything is editable while pending. Once approved, the TERMS
    -- are permanent — bills compare against the approved value, so
    -- changing it would rewrite what the approval meant. Deactivate
    -- and create a new contract instead. (is_active and the actor
    -- stamps stay editable — deactivating an approved contract is the
    -- founder's off-switch for new billing.)
    if old.status = 'approved'
       and (new.vendor_id, new.project_id, new.plot_id, new.unit_id,
            new.description, new.contract_value)
           is distinct from
           (old.vendor_id, old.project_id, old.plot_id, old.unit_id,
            old.description, old.contract_value) then
      raise exception 'An approved labour contract''s terms are permanent — deactivate it and record a new one';
    end if;
    return new;
  end if;

  if old.status = 'pending_approval' and new.status = 'approved' then
    select true, a.approval_limit into v_is_approver, v_cap
    from bill_approvers a
    where a.user_id = auth.uid() and profile_is_active(a.user_id);

    if not (is_admin() or coalesce(v_is_approver, false)) then
      raise exception 'Only a named bill approver or an admin can approve a labour contract';
    end if;
    if not is_admin() and v_cap is not null and new.contract_value > v_cap then
      raise exception 'This contract is above your approval limit of %', v_cap;
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Approving must record who approved and when';
    end if;
    return new;
  end if;

  -- No un-approve: a wrongly approved contract is deactivated.
  raise exception 'Invalid labour contract status change: % -> %', old.status, new.status;
end $$;
