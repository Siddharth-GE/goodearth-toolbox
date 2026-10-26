-- 0160 — The execute revoke 0159 left off its line guard: a trigger function nobody calls directly.
revoke all on function site_return_lines_qty_guard() from public, anon, authenticated;
