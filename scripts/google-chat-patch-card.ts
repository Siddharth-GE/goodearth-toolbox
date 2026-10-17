/**
 * Rewrites one Google Chat card by hand, as the app.
 *
 *   npx tsx scripts/google-chat-patch-card.ts --message spaces/AAA.../messages/BBB...            # dry run
 *   npx tsx scripts/google-chat-patch-card.ts --message spaces/AAA.../messages/BBB... --commit   # mints an app token, PATCHes
 *
 * It settles whether the Chat app may rewrite a card it posted privately to one person:
 * 200 means yes; 403 or 404 means the door falls back to Option A. Record Google's answer
 * verbatim in BUGCATCHER #17 trap (m). It also repairs a card: paste the message name
 * from a failed `google-chat refresh` log line into `--message`.
 * Needs `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` in `.env.local`. lib/google-chat/app-token.ts
 * avoids `server-only` because that package throws under `tsx`.
 * It prints only the HTTP status and Google's reason, never the key, token or message.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import { fetchAppToken, patchCard } from "../lib/google-chat/app-token";
import { parseServiceAccountKey } from "../lib/google-chat/outbound-rules";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

const MESSAGE_PATTERN = /^spaces\/[^/]+\/messages\/[^/]+$/;

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
    // A refusal is the answer to plan.md step 2, not a bug: record it as trap (m).
    process.exitCode = 1;
    return;
  }
  console.log("The app may rewrite a card it posted. Record this as trap (m) in BUGCATCHER #17.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
