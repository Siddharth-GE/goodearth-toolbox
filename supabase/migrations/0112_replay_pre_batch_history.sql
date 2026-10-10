-- 0112 — Stock moved before batches existed is drawn from its batches
--
-- B9's question (plan.md): batches start at 0108. batch_on_hand is every
-- store receipt line plus the movements allocate_batches() has written
-- since; an issue or a removal recorded before 0108 moved no batch. So a
-- store that received 100 and issued 60 before 0108 still showed a batch
-- of 100 against 40 on hand, the next issue drew — and valued — stock that
-- was gone, and opening stock ("no batch") was never reached.
--
-- THE FIX: replay that history through the same rule, in the order it
-- was recorded. Every issue line and removal recorded before 0108 was
-- applied (applied_migrations says when) draws its batches oldest first,
-- as the trigger would have — but only from the batches that existed at
-- the time: receipt lines and movements recorded no later than the event
-- itself, so an old issue never draws a delivery recorded after it.
-- Whatever no batch covered came from stock with no batch behind it, and
-- is left at that (0108's rule). A transfer lands its batches in the
-- receiving store. Each movement carries its event's own time and person.
--
-- Safe whichever way production's records go on ship day: kept, this
-- puts their batches right; cleared, it finds nothing to replay. Staging
-- was emptied before 0108, so there it replays nothing.
--
-- APPLY 0108 AND THIS TOGETHER. An issue recorded between the two drew
-- batches that this replay may draw again; the function refuses, and
-- rolls back, if any batch would end below zero.
--
-- It writes only stock_batch_movements — quantities, no money — and is
-- a plain function owned by the migration role: no client role may run
-- it (execute revoked), and it is not security definer. Kept so a trial
-- can prove it on built history; re-running it changes nothing.
--
-- Re-runnable.

create or replace function replay_pre_batch_history()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  e record;
  b record;
  v_left numeric;
  v_take numeric;
  v_moves int := 0;
begin
  select applied_at into v_cutoff
  from applied_migrations where filename = '0108_inventory_batches.sql';
  if v_cutoff is null then
    raise exception 'replay_pre_batch_history: 0108 is not in applied_migrations, so old history cannot be told from new';
  end if;

  for e in
    select l.id as issue_line_id, null::uuid as adjustment_id, i.store_id, i.to_store_id,
           l.item_id, l.quantity, l.created_at, l.created_by
    from stock_issue_lines l
    join stock_issues i on i.id = l.issue_id
    where l.created_at < v_cutoff
      and not exists (select 1 from stock_batch_movements m where m.issue_line_id = l.id)
    union all
    select null::uuid, a.id, a.store_id, null::uuid, a.item_id, -a.quantity, a.created_at, a.created_by
    from stock_adjustments a
    where a.quantity < 0
      and a.created_at < v_cutoff
      and not exists (select 1 from stock_batch_movements m where m.adjustment_id = a.id)
    order by created_at, issue_line_id nulls last, adjustment_id
  loop
    v_left := e.quantity;
    for b in
      select t.receipt_line_id, sum(t.quantity) as quantity
      from (
        select gl.id as receipt_line_id, gl.quantity, gr.received_at
        from goods_receipt_lines gl
        join goods_receipts gr on gr.id = gl.receipt_id
        where gr.store_id = e.store_id and gl.item_id = e.item_id and gl.created_at <= e.created_at
        union all
        select m.receipt_line_id, m.quantity, gr.received_at
        from stock_batch_movements m
        join goods_receipt_lines gl on gl.id = m.receipt_line_id
        join goods_receipts gr on gr.id = gl.receipt_id
        where m.store_id = e.store_id and gl.item_id = e.item_id and m.created_at <= e.created_at
      ) t
      group by t.receipt_line_id
      having sum(t.quantity) > 0
      order by min(t.received_at), t.receipt_line_id
    loop
      exit when v_left <= 0;
      v_take := least(v_left, b.quantity);
      insert into stock_batch_movements
        (receipt_line_id, store_id, quantity, issue_line_id, adjustment_id, created_by, created_at)
      values (b.receipt_line_id, e.store_id, -v_take, e.issue_line_id, e.adjustment_id, e.created_by, e.created_at);
      v_moves := v_moves + 1;
      if e.to_store_id is not null then
        insert into stock_batch_movements
          (receipt_line_id, store_id, quantity, issue_line_id, adjustment_id, created_by, created_at)
        values (b.receipt_line_id, e.to_store_id, v_take, e.issue_line_id, null, e.created_by, e.created_at);
        v_moves := v_moves + 1;
      end if;
      v_left := v_left - v_take;
    end loop;
  end loop;

  if exists (select 1 from batch_on_hand where quantity < 0) then
    raise exception 'replay_pre_batch_history: a batch would end below zero — stock was issued between 0108 and this replay; a person must look before it runs';
  end if;

  return v_moves;
end $$;

revoke execute on function replay_pre_batch_history() from public, anon, authenticated;

select replay_pre_batch_history();

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'replay_pre_batch_history' and prosecdef
  ) then
    raise exception '0112: replay_pre_batch_history must not be security definer';
  end if;
  if has_function_privilege('authenticated', 'replay_pre_batch_history()', 'execute')
     or has_function_privilege('anon', 'replay_pre_batch_history()', 'execute') then
    raise exception '0112: no client role may run replay_pre_batch_history';
  end if;
  if exists (select 1 from batch_on_hand where quantity < 0) then
    raise exception '0112: a batch is below zero';
  end if;
  -- A second run finds nothing left to replay.
  if replay_pre_batch_history() <> 0 then
    raise exception '0112: a second replay wrote movements — it must change nothing';
  end if;
end $$;
