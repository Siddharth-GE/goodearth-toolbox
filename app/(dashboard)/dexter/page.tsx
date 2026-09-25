import { getWelcomeCounts } from "@/lib/dexter/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen every Management tool opens on (founder,
// 2026-08-13). Counts only, never rupees — Dexter has no money anywhere
// in it.
export default async function DexterPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Presentation"
      intro={[
        "Dexter turns a design deck into a link a client can open without signing in — no attachment, no account.",
        "Make a project for the client, then upload a deck into it: one HTML file, or a zip with index.html at its top.",
        "The link is the whole gate. It can be switched off at any time, and re-issued if it ever needs to stop working — the old link dies the moment a new one is made.",
      ]}
      stats={[
        { label: "Projects", value: counts.projects },
        { label: "Decks", value: counts.decks },
        { label: "Links on", value: counts.sharedDecks },
      ]}
      links={[{ label: "Projects", href: "/dexter/projects", primary: true }]}
    />
  );
}
