/**
 * Two stubs so the Google Chat door can be imported by plain Node: `server-only` (not an
 * installed package under `node`) and `next/cache` (throws outside a Next request).
 * Only those two specifiers are stubbed, so nothing under `lib/` is weakened.
 *
 * Used as (package.json's `chat:usage`):
 *   node --import tsx --import ./scripts/google-chat-usage-loader.mjs scripts/google-chat-usage-test.ts --as someone@goodearthkannur.org
 *
 * `registerHooks` (synchronous, Node 22.15+) beats `module.register`. A `resolve` hook
 * alone is not enough: the repo has no `"type": "module"`, so tsx loads `.ts` as CommonJS,
 * which would readFileSync the stub's `data:` URL. The `load` hook supplies the source.
 */
import { registerHooks } from "node:module";

const STUBS = new Map([
  // The marker package exists to fail a build; there is no runtime behaviour.
  ["data:text/javascript,server-only", "module.exports = {};"],
  // Only `revalidatePath` is reached; the other two avoid a puzzling resolve error later.
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
