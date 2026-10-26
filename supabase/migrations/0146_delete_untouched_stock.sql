-- 0146 — Delete or Cancel, step C (plan.md, Piece 4): a delivery or a stock issue entered by mistake is deleted while
-- nothing has touched it. The founder chose this over return entries and waived Fable's design (2026-10-23).
--
-- Stock, batches, a PO's received figure and what is left to bill are all worked out from the rows, never stored, so
-- deleting the rows corrects every one of them; no view changes. What is stored follows by hand: a PO completed by the
-- delivery goes back to issued, and a site request the issue fulfilled is open again.
--
-- "Untouched" means: a delivery nothing has been issued or moved from, no bill counts on, and the site has not
-- confirmed; an issue the site has not confirmed, and, for a transfer, whose material is still in the receiving store.
-- Anything else is corrected with an adjustment, as before.
--
-- Both are security definer: the stock tables have no delete policy, a store-keeper cannot read bills or write POs, and
-- each function checks /inventory in its own body (SECURITY.md). Every deletion is kept in stock_deletions with its
-- reason; the audit log keeps the rows.

-- ---------------------------------------------------------------------
-- 1. The record of what was deleted, and why
-- ---------------------------------------------------------------------

create table if not exists stock_deletions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('delivery', 'issue')),
  reference text not null,
  reason text not null check (length(trim(reason)) > 0),
  -- Quantities and places only: the rates stay in their gated table's audit rows.
  snapshot jsonb not null,
  deleted_by uuid references profiles (id),
  deleted_at timestamptz not null default now()
);

create index if not exists stock_deletions_deleted_at_idx on stock_deletions (deleted_at desc);

alter table stock_deletions enable row level security;

drop policy if exists "stock_deletions readable by inventory" on stock_deletions;
create policy "stock_deletions readable by inventory"
  on stock_deletions for select to authenticated
  using ((select has_app('/inventory')));

-- ---------------------------------------------------------------------
-- 2. A PO completed by a delivery goes back to issued when it goes
-- ---------------------------------------------------------------------

create or replace function purchase_orders_guard()
returns trigger
language plpgsql
as $$
begin
  -- The number on the paper is permanent — and so is the scope it was
  -- minted from. To re-scope a draft, delete it and raise it again.
  if (new.project_id, new.plot_id, new.unit_id, new.scope_code, new.po_no, new.reference)
     is distinct from
     (old.project_id, old.plot_id, old.unit_id, old.scope_code, old.po_no, old.reference) then
    raise exception 'A purchase order''s project, scope, number and reference are permanent';
  end if;

  if new.status = old.status then
    -- Header edits (vendor, deliver-to, expected_by, terms, note) only
    -- while it's a draft.
    if old.status <> 'draft' then
      raise exception 'A % purchase order can no longer be edited', old.status;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    if not exists (select 1 from purchase_order_lines where po_id = new.id) then
      raise exception 'Add at least one line before issuing this purchase order';
    end if;
    if exists (
      select 1 from purchase_order_lines
      where po_id = new.id and (rate is null or gst_pct is null)
    ) then
      raise exception 'Every line needs a rate and a GST %% before the purchase order can be issued';
    end if;
    if new.issued_by is null or new.issued_at is null then
      raise exception 'Issuing must record who issued and when';
    end if;
    return new;
  end if;

  if old.status = 'issued' and new.status = 'deletion_requested' then
    if new.deletion_note is null or length(trim(new.deletion_note)) = 0 then
      raise exception 'Say why this purchase order should be removed — a deletion request needs a note';
    end if;
    if new.deletion_requested_by is null or new.deletion_requested_at is null then
      raise exception 'Requesting deletion must record who asked and when';
    end if;
    return new;
  end if;

  if old.status = 'deletion_requested' and new.status = 'issued' then
    -- Withdrawing or refusing the request: the requester may take it
    -- back; an admin may refuse it. Either way the request fields clear
    -- so the PO reads as plainly issued again.
    if not (is_admin() or old.deletion_requested_by = auth.uid()) then
      raise exception 'Only an admin or the person who asked can withdraw a deletion request';
    end if;
    if new.deletion_note is not null or new.deletion_requested_by is not null
       or new.deletion_requested_at is not null then
      raise exception 'Withdrawing a deletion request must clear the request fields';
    end if;
    return new;
  end if;

  if old.status = 'deletion_requested' and new.status = 'cancelled' then
    -- The founder's rule: removing an issued PO takes an admin's yes.
    if not is_admin() then
      raise exception 'Only an admin can approve deleting a purchase order';
    end if;
    if new.cancelled_by is null or new.cancelled_at is null then
      raise exception 'Cancelling must record who approved and when';
    end if;
    -- Phase 7: goods already in a store cannot be un-ordered.
    if exists (
      select 1
      from goods_receipt_lines rl
      join purchase_order_lines l on l.id = rl.po_line_id
      where l.po_id = new.id
    ) then
      raise exception 'Goods have already been received against this purchase order — it can no longer be cancelled';
    end if;
    return new;
  end if;

  if old.status = 'issued' and new.status = 'completed' then
    -- Phase 7 admits this, but only for a PO that is genuinely finished.
    if exists (
      select 1
      from purchase_order_lines l
      where l.po_id = new.id
        and l.quantity > coalesce((
          select sum(rl.quantity) from goods_receipt_lines rl
          where rl.po_line_id = l.id
        ), 0)
    ) then
      raise exception 'A purchase order is completed by receiving its goods — some lines are still outstanding';
    end if;
    return new;
  end if;

  -- 0146: a deleted delivery leaves a line outstanding again, and only then.
  if old.status = 'completed' and new.status = 'issued' then
    if not exists (
      select 1
      from purchase_order_lines l
      where l.po_id = new.id
        and l.quantity > coalesce((
          select sum(rl.quantity) from goods_receipt_lines rl
          where rl.po_line_id = l.id
        ), 0)
    ) then
      raise exception 'Every line of this purchase order is received, so it stays completed';
    end if;
    return new;
  end if;

  raise exception 'Invalid purchase order status change: % -> %', old.status, new.status;
end $$;

-- ---------------------------------------------------------------------
-- 3. A site request the deleted issue fulfilled is open again
-- ---------------------------------------------------------------------

create or replace function issue_requests_guard()
returns trigger
language plpgsql
as $$
begin
  -- 0146: raised only inside delete_stock_issue(), and it moves the request back to requested and nothing else.
  if current_setting('toolbox.issue_deleting', true) = 'on' then
    if old.status = 'fulfilled' and new.status = 'requested' and new.fulfilled_issue_id is null
       and (to_jsonb(new) - array['status', 'fulfilled_issue_id', 'updated_at', 'updated_by'])
           = (to_jsonb(old) - array['status', 'fulfilled_issue_id', 'updated_at', 'updated_by']) then
      return new;
    end if;
    raise exception 'Deleting an issue only reopens the request it fulfilled';
  end if;

  if new.plot_id <> old.plot_id
    or new.work_item_id <> old.work_item_id
    or new.item_id <> old.item_id
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at then
    raise exception 'A request''s villa, work, item and requester never change — withdraw it and raise another.';
  end if;

  if old.status <> 'requested' then
    raise exception 'This request is already % — it cannot change.', old.status;
  end if;

  if new.status = 'requested' then
    if not has_app('/supervisors') then
      raise exception 'Only the supervisors app edits an open request.';
    end if;
  elsif new.status in ('fulfilled', 'declined') then
    if not has_app('/inventory') then
      raise exception 'Only the store can fulfil or decline a request.';
    end if;
    if new.quantity <> old.quantity or new.note is distinct from old.note
       or new.off_estimate_reason is distinct from old.off_estimate_reason
       or new.work_class <> old.work_class then
      raise exception 'Resolving a request does not rewrite it — the issue records what was actually given.';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Deleting an untouched delivery
-- ---------------------------------------------------------------------

create or replace function delete_goods_receipt(p_receipt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt goods_receipts;
  v_line record;
  v_billed numeric;
  v_received_after numeric;
begin
  if not has_app('/inventory') then
    raise exception 'Only the store can delete a delivery';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why this delivery is deleted';
  end if;

  select * into v_receipt from goods_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'That delivery no longer exists';
  end if;

  -- The same locks a new receipt line (per PO line) and a new issue (per store and item) take, in a fixed order.
  for v_line in
    select id, po_line_id, item_id, quantity from goods_receipt_lines where receipt_id = p_receipt_id order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_line.po_line_id::text, 0));
    if v_receipt.store_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_receipt.store_id::text || v_line.item_id::text, 0));
    end if;
  end loop;

  if exists (select 1 from site_receipt_confirmations where receipt_id = p_receipt_id)
     or exists (
       select 1 from site_receipt_confirmation_lines c
       join goods_receipt_lines l on l.id = c.receipt_line_id
       where l.receipt_id = p_receipt_id
     ) then
    raise exception 'The site has confirmed this delivery, so it cannot be deleted';
  end if;

  if exists (
       select 1 from stock_batch_movements m
       join goods_receipt_lines l on l.id = m.receipt_line_id
       where l.receipt_id = p_receipt_id
     ) or exists (
       select 1 from stock_issue_lines s
       join goods_receipt_lines l on l.id = s.preferred_receipt_line_id
       where l.receipt_id = p_receipt_id
     ) then
    raise exception 'Material from this delivery has already been issued or moved — correct it with an adjustment instead';
  end if;

  if v_receipt.store_id is not null and exists (
       select 1 from goods_receipt_lines l
        where l.receipt_id = p_receipt_id
        group by l.item_id
       having stock_qty_on_hand(v_receipt.store_id, l.item_id) < sum(l.quantity)
     ) then
    raise exception 'Taking this delivery out would leave the store below zero — correct it with an adjustment instead';
  end if;

  -- bill_lines_guard takes its bill for share, so a line added to one of this PO's bills waits until this is done.
  perform 1 from bills where po_id = v_receipt.po_id for update;
  if v_receipt.invoice_no is not null and exists (
       select 1 from bills b
        where b.po_id = v_receipt.po_id
          and lower(trim(b.invoice_no)) = lower(trim(v_receipt.invoice_no))
     ) then
    raise exception 'A bill already counts this delivery, so it cannot be deleted';
  end if;

  for v_line in
    select id, po_line_id, item_id, quantity from goods_receipt_lines where receipt_id = p_receipt_id order by id
  loop
    select coalesce(sum(bl.quantity), 0) into v_billed from bill_lines bl where bl.po_line_id = v_line.po_line_id;
    select coalesce(sum(rl.quantity), 0) into v_received_after
      from goods_receipt_lines rl
     where rl.po_line_id = v_line.po_line_id and rl.receipt_id <> p_receipt_id;
    if v_billed > v_received_after then
      raise exception 'A bill already counts this delivery, so it cannot be deleted';
    end if;
  end loop;

  insert into stock_deletions (kind, reference, reason, snapshot, deleted_by)
  select 'delivery', coalesce(v_receipt.reference, 'Delivery'), trim(p_reason),
         jsonb_build_object(
           'receipt', to_jsonb(v_receipt),
           'lines', coalesce((
             select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
               from goods_receipt_lines l where l.receipt_id = p_receipt_id
           ), '[]'::jsonb)
         ),
         auth.uid();

  delete from goods_receipt_line_rates r
   using goods_receipt_lines l
   where r.receipt_line_id = l.id and l.receipt_id = p_receipt_id;
  delete from goods_receipt_lines where receipt_id = p_receipt_id;
  delete from goods_receipts where id = p_receipt_id;

  update purchase_orders set status = 'issued'
   where id = v_receipt.po_id
     and status = 'completed'
     and exists (
       select 1 from purchase_order_lines l
        where l.po_id = v_receipt.po_id
          and l.quantity > coalesce((
            select sum(rl.quantity) from goods_receipt_lines rl where rl.po_line_id = l.id
          ), 0)
     );
end $$;

revoke execute on function delete_goods_receipt(uuid, text) from public, anon;
grant execute on function delete_goods_receipt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Deleting an untouched issue
-- ---------------------------------------------------------------------

create or replace function delete_stock_issue(p_issue_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue stock_issues;
  v_line record;
  v_landed record;
begin
  if not has_app('/inventory') then
    raise exception 'Only the store can delete an issue';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why this issue is deleted';
  end if;

  select * into v_issue from stock_issues where id = p_issue_id for update;
  if not found then
    raise exception 'That issue no longer exists';
  end if;

  -- The negative-stock guard's lock, per store and item, so an issue out of the receiving store waits or is counted.
  for v_line in
    select id, item_id, quantity from stock_issue_lines where issue_id = p_issue_id order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_issue.store_id::text || v_line.item_id::text, 0));
    if v_issue.to_store_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_issue.to_store_id::text || v_line.item_id::text, 0));
    end if;
  end loop;

  if exists (select 1 from site_receipt_confirmations where issue_id = p_issue_id)
     or exists (
       select 1 from site_receipt_confirmation_lines c
       join stock_issue_lines l on l.id = c.issue_line_id
       where l.issue_id = p_issue_id
     ) then
    raise exception 'The site has confirmed this issue, so it cannot be deleted';
  end if;

  -- A transfer's material must still be in the receiving store, batch by batch.
  if v_issue.to_store_id is not null then
    for v_line in
      select id, item_id, quantity from stock_issue_lines where issue_id = p_issue_id order by id
    loop
      if stock_qty_on_hand(v_issue.to_store_id, v_line.item_id) < v_line.quantity then
        raise exception 'Material from this transfer has already left the receiving store — correct it with an adjustment instead';
      end if;
      for v_landed in
        select m.receipt_line_id, sum(m.quantity) as quantity
          from stock_batch_movements m
         where m.issue_line_id = v_line.id and m.store_id = v_issue.to_store_id
         group by m.receipt_line_id
      loop
        if coalesce((
             select sum(t.quantity) from (
               select gl.quantity from goods_receipt_lines gl
                 join goods_receipts gr on gr.id = gl.receipt_id
                where gl.id = v_landed.receipt_line_id and gr.store_id = v_issue.to_store_id
               union all
               select m.quantity from stock_batch_movements m
                where m.receipt_line_id = v_landed.receipt_line_id and m.store_id = v_issue.to_store_id
             ) t
           ), 0) < v_landed.quantity then
          raise exception 'Material from this transfer has already left the receiving store — correct it with an adjustment instead';
        end if;
      end loop;
    end loop;
  end if;

  insert into stock_deletions (kind, reference, reason, snapshot, deleted_by)
  select 'issue', coalesce(v_issue.reference, 'Issue'), trim(p_reason),
         jsonb_build_object(
           'issue', to_jsonb(v_issue),
           'lines', coalesce((
             select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
               from stock_issue_lines l where l.issue_id = p_issue_id
           ), '[]'::jsonb)
         ),
         auth.uid();

  perform set_config('toolbox.issue_deleting', 'on', true);
  update issue_requests
     set status = 'requested', fulfilled_issue_id = null, updated_by = auth.uid()
   where fulfilled_issue_id = p_issue_id;
  perform set_config('toolbox.issue_deleting', '', true);

  delete from stock_batch_movements m
   using stock_issue_lines l
   where m.issue_line_id = l.id and l.issue_id = p_issue_id;
  delete from stock_issue_lines where issue_id = p_issue_id;
  delete from stock_issues where id = p_issue_id;
end $$;

revoke execute on function delete_stock_issue(uuid, text) from public, anon;
grant execute on function delete_stock_issue(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  c text;
begin
  if not exists (select 1 from pg_class where relname = 'stock_deletions' and relrowsecurity) then
    raise exception '0146: stock_deletions is missing or has RLS off';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stock_deletions') <> 1
     or not exists (
       select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_deletions' and cmd = 'SELECT'
     ) then
    raise exception '0146: stock_deletions should have one SELECT policy and nothing else';
  end if;

  foreach c in array array['delete_goods_receipt(uuid,text)', 'delete_stock_issue(uuid,text)']
  loop
    if not (select prosecdef from pg_proc where oid = c::regprocedure) then
      raise exception '0146: % must be security definer', c;
    end if;
    if position('has_app(''/inventory'')' in pg_get_functiondef(c::regprocedure)) = 0 then
      raise exception '0146: % does not check /inventory in its body', c;
    end if;
    if has_function_privilege('anon', c, 'execute')
       or not has_function_privilege('authenticated', c, 'execute') then
      raise exception '0146: % has the wrong execute grants', c;
    end if;
  end loop;

  foreach c in array array['deletion_requested', 'is_admin()', 'Phase 7', 'stays completed']
  loop
    if position(c in pg_get_functiondef('purchase_orders_guard()'::regprocedure)) = 0 then
      raise exception '0146: purchase_orders_guard lost its % branch', c;
    end if;
  end loop;
  foreach c in array array['toolbox.issue_deleting', 'work_class', 'Only the store can fulfil']
  loop
    if position(c in pg_get_functiondef('issue_requests_guard()'::regprocedure)) = 0 then
      raise exception '0146: issue_requests_guard lost its % check', c;
    end if;
  end loop;
  foreach c in array array['purchase_orders_guard', 'issue_requests_guard']
  loop
    if not exists (select 1 from pg_trigger where tgname = c and not tgisinternal and tgenabled <> 'D') then
      raise exception '0146: trigger % is missing or off', c;
    end if;
  end loop;
end $$;
