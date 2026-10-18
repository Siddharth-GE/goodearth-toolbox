import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// "Today" is India's date (todayInIndia in lib/format.ts); this is UTC, so
// before 05:30 it gives yesterday.
const utcToday = {
  selector:
    "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.type='NewExpression'][callee.object.callee.object.arguments.length=0]",
  message: "That is today in UTC. Use todayInIndia() from lib/format.ts.",
};

// DESIGN.md: colours come from the theme's tokens, never Tailwind's raw palette.
const RAW_PALETTE =
  "/(^|[^a-z-])(text|bg|border|ring|fill|stroke|from|to|via|outline|divide|decoration|placeholder|caret|accent|shadow)-(red|green|blue|yellow|amber|orange|emerald|sky|slate|gray|zinc|neutral|stone|rose|pink|purple|violet|indigo|teal|cyan|lime|fuchsia)-[0-9]+/";
const rawPalette = [
  {
    selector: `Literal[value=${RAW_PALETTE}]`,
    message: "A raw palette colour. Use a theme token (DESIGN.md).",
  },
  {
    selector: `TemplateElement[value.raw=${RAW_PALETTE}]`,
    message: "A raw palette colour. Use a theme token (DESIGN.md).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/format.ts", "scripts/**"],
    rules: { "no-restricted-syntax": ["error", utcToday] },
  },
  {
    files: ["app/(dashboard)/**/*.tsx", "components/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", utcToday, ...rawPalette] },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Assistant tooling, gitignored: local warnings there would bury real ones.
    ".claude/**",
    ".impeccable/**",
    ".github/skills/**",
    ".github/agents/**",
    ".github/hooks/**",
  ]),
]);

export default eslintConfig;
