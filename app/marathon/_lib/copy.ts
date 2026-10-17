// Route-local UI helpers, not lib/marathon/ (the server layer).
// Bilingual labels for agent-facing screens only; admin and list screens are English-only.
export const copy = {
  runnerRegistration: { en: "Runner Registration", ml: "റണ്ണർ രജിസ്ട്രേഷൻ" },
  newRunner: { en: "New Runner", ml: "പുതിയ റണ്ണർ" },
  myEntries: { en: "My Entries", ml: "എന്റെ എൻട്രികൾ" },
} as const;
