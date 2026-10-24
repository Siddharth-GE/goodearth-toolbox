/**
 * The little of Markdown Turing's answers use — paragraphs, ## headings, lists, pipe tables,
 * **bold** and `code` — parsed into blocks the chat draws itself, so no HTML is ever injected. Pure.
 */

export type Inline = { text: string; bold?: true; code?: true };

export type MarkdownBlock =
  | { type: "heading"; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "code"; text: string };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push(
      match[1] !== undefined ? { text: match[1], bold: true } : { text: match[2], code: true },
    );
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const RULE_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", inline: parseInline(heading[1]) });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && RULE_ROW.test(lines[i + 1])) {
      const header = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim())
        rows.push(cells(lines[i++]));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length && marker.test(lines[i])) {
        items.push(parseInline(lines[i].replace(marker, "")));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !(lines[i].includes("|") && i + 1 < lines.length && RULE_ROW.test(lines[i + 1]))
    ) {
      paragraph.push(lines[i++].trim());
    }
    blocks.push({ type: "paragraph", inline: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
