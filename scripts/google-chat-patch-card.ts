/**
 * Rewrites one Google Chat card by hand, as the app.
 *
 *   npx tsx scripts/google-chat-patch-card.ts --message spaces/AAA.../messages/BBB...
 *       # dry run — says what it would send
 *
 *   npx tsx scripts/google-chat-patch-card.ts --message spaces/AAA.../messages/BBB... --commit
 *       # mints an app token and PATCHes the card
 *
 * WHAT THIS PROVES. plan.md's step 2 turns on one belief nobody can
 * check from the code: **may the Chat app rewrite a card it posted
 * privately to one person?** Everything round two builds — the court
 * card catching up with the press that just moved a baton — rests on
 * Google saying yes. So the belief is settled first, by hand, with a
 * one-widget card and no app code in the way: a 200 means yes, and a
 * 403 or 404 means the door falls back to Option A (answering with the
 * card and losing the public confirmation) and none of the rest gets
 * written. Whatever Google answers goes into BUGCATCHER #17 as trap (m),
 * verbatim.
 *
 * It is also the repair tool afterwards. The door logs one
 * `google-chat refresh` line per press carrying the message's resource
 * name; when a refresh fails, that name pasted into `--message` here is
 * how the card gets put right without waiting for the next press.
 *
 * It needs the founder's service-account key in `.env.local` under
 * `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` (the downloaded JSON, one line), and
 * it is the reason lib/google-chat/app-token.ts does not import
 * `server-only` — that package throws the moment `tsx` loads it.
 *
 * It prints the HTTP status and Google's own reason, and nothing else:
 * not the key, not the token, not the message.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import { fetchAppToken, patchCard } from "../lib/google-chat/app-token";
import { parseServiceAccountKey } from "../lib/google-chat/outbound-rules";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

/** The same shape `messageName()` accepts in events.ts — a typo here is a 404 nobody can explain. */
const MESSAGE_PATTERN = /^spaces\/[^/]+\/messages\/[^/]+$/;

/** One widget, dated, so it is obvious at a glance whether the card actually changed. */
function proofCard() {
  return [
    {
      cardId: "court",
      card: {
        header: { title: "Your court", subtitle: "refreshed by hand" },
        sections: [
          {
            widgets: [
              { textParagraph: { text: `Refreshed by hand at ${new Date().toISOString()}` } },
            ],
          },
        ],
      },
    },
  ];
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--message");
  const message = at === -1 ? undefined : argv[at + 1];
  const commit = argv.includes("--commit");

  if (!message || !MESSAGE_PATTERN.test(message)) {
    throw new Error(
      "--message is required and must look like spaces/<id>/messages/<id>.\n" +
        "It comes from the door's `google-chat refresh` log line:\n" +
        "  npx vercel logs staging.goodearthkannur.org --json",
    );
  }

  const key = parseServiceAccountKey(process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY);
  if (!key) {
    throw new Error(
      "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY in .env.local is missing or is not a service account key.\n" +
        "It is the downloaded JSON key file's contents, on one line.",
    );
  }

  console.log(`Message : ${message}`);
  console.log(`Signing : ${key.clientEmail}`);
  console.log(`Mode    : ${commit ? "COMMIT" : "dry run"}`);

  if (!commit) {
    console.log("\nDry run. Nothing was sent. Re-run with --commit to rewrite the card.");
    return;
  }

  const token = await fetchAppToken(key, Math.floor(Date.now() / 1000));
  if ("error" in token) {
    throw new Error(`Could not mint an app token: ${token.error}`);
  }

  const { status, reason } = await patchCard(token.token, message, proofCard());
  console.log(`\nHTTP ${status}${reason ? ` — ${reason}` : ""}`);
  if (status < 200 || status >= 300) {
    // A refusal here is the answer to plan.md step 2, not a bug to fix:
    // record it verbatim as trap (m) and take Option A.
    process.exitCode = 1;
    return;
  }
  console.log("The app may rewrite a card it posted. Record this as trap (m) in BUGCATCHER #17.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
