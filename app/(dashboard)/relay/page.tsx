import { redirect } from "next/navigation";

/**
 * Relay opens on Projects (founder, 2026-08-10). The list itself stays
 * at /relay/projects because that segment is the parent of
 * /relay/projects/[projectId] — moving it up here would either leave
 * /relay/projects a dead 404 or render the same list at two URLs.
 *
 * The sidebar still highlights Pusher throughout: it prefix-matches the
 * tool's href, so every /relay/* route lights it up.
 */
export default function RelayPage() {
  redirect("/relay/projects");
}
