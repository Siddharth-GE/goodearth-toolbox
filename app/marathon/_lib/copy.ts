// This is app/marathon/_lib/ (route-local, Next.js's "_" = not a
// route), not the top-level lib/marathon/ — different things that
// happen to share a word. This folder holds small UI-only helpers
// private to Marathon's screens; lib/marathon/ holds the tool's real
// server data layer (actions/queries/session). See CLAUDE.md.
//
// Bilingual labels for agent-facing screens (home, PIN, entry, success).
// Admin/list screens stay English-only, per the approved mockup. Only
// fields the mockup actually translates get an `ml` pair — most labels
// on the agent-facing screens are English-only too.
export const copy = {
  runnerRegistration: { en: "Runner Registration", ml: "റണ്ണർ രജിസ്ട്രേഷൻ" },
  newRunner: { en: "New Runner", ml: "പുതിയ റണ്ണർ" },
  myEntries: { en: "My Entries", ml: "എന്റെ എൻട്രികൾ" },
} as const;
