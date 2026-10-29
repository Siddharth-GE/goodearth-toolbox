/**
 * Which Claude answers a turn. A quick judge sorts each question into a level; "asked" is the
 * admin pressing Think harder. Pure: the judge's call is judge.ts.
 */

import { CONTEXT_PREFIX } from "./display";

export const LEVELS = ["quick", "standard", "deep"] as const;
export type Level = (typeof LEVELS)[number];
export type Route = Level | "asked";

export const JUDGE_MODEL = "claude-haiku-5-5";

export const MODEL_FOR: Record<Route, string> = {
  quick: "claude-haiku-5-5",
  standard: "claude-sonnet-5-5",
  deep: "claude-opus-5-5",
  asked: "claude-opus-5-5",
};

/** Haiku has no server-side refusal fallback; a refusal there is asked again of this one. */
export const RESCUE_MODEL = MODEL_FOR.standard;

export const fallsBackOnServer = (model: string) => model !== MODEL_FOR.quick;

type Block = { type?: unknown; text?: unknown };
type Stored = { role: string; content: unknown; route?: string | null };

const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content)
    ? (content.filter((b) => typeof b === "object" && b !== null) as Block[])
    : [];

/** What the admin typed, without the context lines the server adds. */
export function typedText(content: unknown): string {
  return blocksOf(content)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .filter((text) => !text.startsWith(CONTEXT_PREFIX))
    .join("\n")
    .trim();
}

const fileCount = (content: unknown) =>
  blocksOf(content).filter((block) => block.type === "document" || block.type === "image").length;

/** The last routed question: its level (Think harder counts as deep) and what it asked. */
export function lastQuestion(stored: Stored[]): { level: Level; text: string } | null {
  for (let i = stored.length - 1; i >= 0; i--) {
    const route = stored[i].route;
    if (stored[i].role !== "user" || !route) continue;
    const level = route === "asked" ? "deep" : route;
    if (!(LEVELS as readonly string[]).includes(level)) continue;
    return { level: level as Level, text: typedText(stored[i].content) };
  }
  return null;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… (${text.length - max} more characters)` : text;

export function judgeInput(
  content: unknown,
  previous: { level: Level; text: string } | null,
): string {
  const files = fileCount(content);
  return [
    previous
      ? `Previous level: ${previous.level}\nPrevious question: """${clip(previous.text, 600)}"""`
      : "Previous level: none, this is the first message",
    files > 0 ? `Files dropped in with it: ${files}` : null,
    `New message:\n"""${clip(typedText(content), 4000) || "(only the files)"}"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function levelFrom(output: string): Level | null {
  try {
    const level = (JSON.parse(output) as { level?: unknown }).level;
    return typeof level === "string" && (LEVELS as readonly string[]).includes(level)
      ? (level as Level)
      : null;
  } catch {
    return null;
  }
}
