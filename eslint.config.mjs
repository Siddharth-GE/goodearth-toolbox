import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Assistant tooling. Gitignored, so CI never sees it — but it sits
    // on disk locally and buried the app's own output under 300
    // warnings, which is how a real one goes unnoticed.
    ".claude/**",
    ".impeccable/**",
    ".github/skills/**",
    ".github/agents/**",
    ".github/hooks/**",
  ]),
]);

export default eslintConfig;
