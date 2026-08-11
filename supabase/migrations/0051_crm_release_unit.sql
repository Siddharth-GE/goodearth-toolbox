-- 0051 — releasing a plot gets its own function.
--
-- A correction to 0050, as a later file rather than an edit to an applied
-- one (CLAUDE.md; 0014 fixing 0013 is the precedent).
--
-- WHAT 0050 GOT WRONG, and it is a typing problem rather than a SQL one:
-- crm_assign_unit takes `p_client_id uuid`, and passing null was meant to
-- be how a booking is undone. But `supabase gen types` cannot express a
-- nullable function argument — it emits `p_client_id: string` for every
-- uuid parameter — so the only way to call it that way from TypeScript is
-- a cast that tells the compiler something untrue. A cast that lies is
-- worth avoiding for a rarely-trodden path, because the rarely-trodden
-- path is exactly where nobody notices it has started lying.
--
-- Two functions, each with one unambiguous signature, instead. 0050's
-- crm_assign_unit keeps working unchanged and is left alone; releasing is
-- now its own verb, which reads better at the call site anyway.
--
-- Re-runnable.

create or replace function crm_release_unit(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SECURITY DEFINER BYPASSES RLS. This check IS the permission boundary,
  -- exactly as in crm_assign_unit. Without it any signed-in user could
  -- strip the buyer off every villa in the company.
  if not has_app('/client-relations') then
    raise exception 'You need the Client Relations app to release a plot';
  end if;

  update units
     set client_id = null,
         status = 'available',
         updated_by = auth.uid()
   where id = p_unit_id;

  if not found then
    raise exception 'That plot no longer exists';
  end if;
end $$;

revoke all on function crm_release_unit(uuid) from public, anon;
grant execute on function crm_release_unit(uuid) to authenticated;
