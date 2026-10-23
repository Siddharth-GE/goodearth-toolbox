-- Counts every public table before the seed, for scripts/trials/test-project-delete.sql to compare after the red button.
-- Runs between 0142 and the seed in the same rolled-back dry run (that trial's header has the command).
do $before$
declare
  v_t text;
  v_n bigint;
begin
  create temp table trial_counts_before (t text primary key, n bigint, prices numeric) on commit drop;
  for v_t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and c.relname not in ('audit_log', 'auth_verified_sessions', 'login_attempts', 'applied_migrations')
  loop
    execute format('select count(*) from %I', v_t) into v_n;
    insert into trial_counts_before (t, n) values (v_t, v_n);
  end loop;
  insert into trial_counts_before (t, n, prices) select 'items.indicative_price', 0, sum(indicative_price) from items;
end $before$;
