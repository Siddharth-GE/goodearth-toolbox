-- 0037 — Pusher: let the log's server-stamped columns default themselves.
--
-- pusher_chain_events.actor_id and .seq are both NOT NULL and both
-- assigned by pusher_chain_events_guard() (0036 §8) — the client is not
-- trusted with either. But NOT NULL without a default forces every
-- caller to SEND something for them anyway, purely to satisfy PostgREST,
-- and the only honest thing to send is a placeholder. That put a magic
-- uuid in lib/pusher/actions.ts, where a reader would reasonably wonder
-- whether it meant anything.
--
-- Defaults remove the need. The guard still overwrites both on every
-- insert, so this changes nothing about who gets credited or how the log
-- is ordered — it only means push, bounce and finish are what they
-- should have been from the start: an insert naming the trail, the kind,
-- and the leg.
--
-- Re-runnable.

alter table pusher_chain_events alter column actor_id set default auth.uid();
alter table pusher_chain_events alter column seq set default 0;
