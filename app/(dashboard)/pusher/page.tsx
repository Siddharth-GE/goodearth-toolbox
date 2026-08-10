import { redirect } from "next/navigation";

/**
 * Pusher opens on Projects (founder, 2026-08-10). The list itself stays
 * at /pusher/projects because that segment is the parent of
 * /pusher/projects/[projectId] — moving it up here would either leave
 * /pusher/projects a dead 404 or render the same list at two URLs.
 *
 * The sidebar still highlights Pusher throughout: it prefix-matches the
 * tool's href, so every /pusher/* route lights it up.
 */
export default function PusherPage() {
  redirect("/pusher/projects");
}
