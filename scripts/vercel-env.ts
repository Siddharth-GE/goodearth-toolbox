/**
 * Writes one environment variable to Vercel through its API.
 *
 *   npx tsx scripts/vercel-env.ts --name GOOGLE_CHAT_SERVICE_ACCOUNT_KEY --target preview            # dry run, never prints the value
 *   npx tsx scripts/vercel-env.ts --name GOOGLE_CHAT_SERVICE_ACCOUNT_KEY --target preview --commit   # upserts, prints the HTTP status
 *
 * Why (BUGCATCHER #18): a secret pasted into the dashboard carried invisible whitespace and
 * saved as an unreadable "sensitive" variable. This trims the value, says when trimming
 * changed anything, and writes it as `encrypted` (readable).
 * `--target` is required and never defaults, like `--project` (SHIPPING.md).
 * The value comes from `.env.local` (also when pasted on the line below `NAME=`), so no
 * secret reaches a command line. Neither it nor the Vercel token is printed, only its length.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(import.meta.dirname, "..", ".env.local");
const PROJECT_FILE = resolve(import.meta.dirname, "..", ".vercel", "project.json");

config({ path: ENV_FILE });

const TARGETS = ["preview", "production"];

function requireFlag(argv: string[], flag: string): string {
  const at = argv.indexOf(flag);
  const value = at === -1 ? undefined : argv[at + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} is required, with a value after it.`);
  }
  return value;
}

// A variable's value read from `.env.local` as text, as the fallback for what
// dotenv cannot see: a long secret pasted on the line after `NAME=`.
function fromEnvFile(name: string): string {
  let raw: string;
  try {
    raw = readFileSync(ENV_FILE, "utf8");
  } catch {
    return "";
  }

  const lines = raw.split(/\r?\n/);
  const at = lines.findIndex((line) => line.trimStart().startsWith(`${name}=`));
  if (at === -1) return "";

  const inline = lines[at].slice(lines[at].indexOf("=") + 1);
  if (inline.trim()) return inline;

  // The next non-empty line only counts as a continuation; another `NAME=` or a
  // comment belongs to someone else, and --commit would upload the WRONG secret.
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) continue;
    if (/^\s*#/.test(line)) return "";
    if (/^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line)) return "";
    return line;
  }
  return "";
}

function readValue(name: string): string {
  const parsed = process.env[name] ?? "";
  return parsed.trim() ? parsed : fromEnvFile(name);
}

async function main() {
  const argv = process.argv.slice(2);
  const name = requireFlag(argv, "--name");
  const target = requireFlag(argv, "--target");
  const commit = argv.includes("--commit");

  if (!TARGETS.includes(target)) {
    throw new Error(`--target must be one of ${TARGETS.join(", ")}, got ${target}.`);
  }

  const token = readValue("VERCEL_TOKEN").trim();
  if (!token) {
    throw new Error(
      "VERCEL_TOKEN is missing from .env.local. It is a Vercel account token — local only, never in app code.",
    );
  }

  const rawValue = readValue(name);
  if (!rawValue.trim()) {
    throw new Error(`${name} is missing from .env.local — there is nothing to send.`);
  }
  const value = rawValue.trim();

  let project: { projectId?: string; orgId?: string };
  try {
    project = JSON.parse(readFileSync(PROJECT_FILE, "utf8"));
  } catch {
    throw new Error(`Could not read ${PROJECT_FILE}. Run \`npx vercel link\` first.`);
  }
  const { projectId, orgId } = project;
  if (!projectId || !orgId) throw new Error(`${PROJECT_FILE} has no projectId/orgId.`);

  console.log(`Variable : ${name}`);
  console.log(`Target   : ${target}`);
  console.log(`Length   : ${value.length} characters`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}`);
  if (value.length !== rawValue.length) {
    // The exact fault of BUGCATCHER #18, caught before it is sent.
    console.log(
      `\nTrimmed  : ${rawValue.length - value.length} characters of whitespace off the value.\n` +
        "           Whitespace on a secret is what failed three production deploys.",
    );
  }

  if (!commit) {
    console.log(`\nWould POST ${name} to the ${target} environment of project ${projectId}.`);
    console.log("Dry run. Nothing was sent. Re-run with --commit to write it.");
    return;
  }

  // upsert=true so a re-run replaces the value. Type `encrypted`, never
  // "sensitive": unreadable means undebuggable (BUGCATCHER #18).
  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true&teamId=${orgId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: name, value, type: "encrypted", target: [target] }),
    },
  );

  console.log(`\nHTTP ${response.status}`);
  if (!response.ok) {
    let reason = "";
    try {
      const body = (await response.json()) as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string") reason = body.error.message;
    } catch {}
    throw new Error(reason || `Vercel refused the write (${response.status}).`);
  }

  console.log(
    "Set. Vercel does not redeploy on an env change — push a commit to the branch\n" +
      "(an empty one is fine) or redeploy from the dashboard.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
