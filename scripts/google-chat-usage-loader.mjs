/**
 * Two stubs, so the Google Chat door can be imported by plain Node.
 *
 * The door's files are written for Next.js and say so out loud. They
 * import `server-only`, which is not a package anybody installed — Next
 * aliases the name at build time, so under `node` it simply fails to
 * resolve — and `relay-writes.ts` imports `revalidatePath` from
 * `next/cache`, which throws the moment it is called outside a Next
 * request. Both are boundaries worth keeping exactly as they are, so
 * nothing under `lib/` is weakened to make the usage test run: this file
 * answers those two specifiers, and only those two, with empty
 * stand-ins. Everything else resolves and loads normally.
 *
 * Used as (package.json's `chat:usage`):
 *   node --import tsx --import ./scripts/google-chat-usage-loader.mjs \
 *        scripts/google-chat-usage-test.ts --as someone@goodearthkannur.org
 *
 * TWO THINGS LEARNED HERE, both by watching it fail. `registerHooks`
 * (synchronous, same thread, Node 22.15+) is used rather than
 * `module.register`, which needs a second file and a worker thread for
 * hooks that have nothing asynchronous to do. And a `resolve` hook alone
 * is not enough: the repo has no `"type": "module"`, so tsx loads every
 * `.ts` file as CommonJS, and the CommonJS loader takes the URL a
 * resolve hook returns and tries to `readFileSync` it — a `data:` URL
 * becomes `ENOENT ...\data:text\javascript,...`. The `load` hook below
 * is what actually supplies the source, as `commonjs`, so the require
 * never reaches the filesystem.
 */
import { registerHooks } from "node:module";

/** The stub sources, keyed by the fake URL each specifier resolves to. */
const STUBS = new Map([
  // The marker package. It exists to make a build fail; there is no
  // runtime behaviour to reproduce.
  ["data:text/javascript,server-only", "module.exports = {};"],
  // Next's cache helpers. `revalidatePath` is the only one the door
  // reaches (relay-writes.ts, after every write); the other two are here
  // so a later import can never turn into a puzzling resolve error.
  // Nothing in a script has a page cache to invalidate.
  [
    "data:text/javascript,next-cache",
    "exports.revalidatePath = function () {};\n" +
      "exports.revalidateTag = function () {};\n" +
      "exports.unstable_cache = function (fn) { return fn; };\n",
  ],
]);

const SPECIFIERS = new Map([
  ["server-only", "data:text/javascript,server-only"],
  ["next/cache", "data:text/javascript,next-cache"],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = SPECIFIERS.get(specifier);
    if (url) return { url, format: "commonjs", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const source = STUBS.get(url);
    if (source) return { format: "commonjs", source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
