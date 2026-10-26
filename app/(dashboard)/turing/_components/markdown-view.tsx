import { parseMarkdown, type Inline } from "@/lib/turing/markdown";
import { Fragment } from "react";

/** Turing's answer, drawn from parsed blocks: text stays text, so nothing it says can become HTML. */
function Inlines({ parts }: { parts: Inline[] }) {
  return parts.map((part, index) =>
    part.bold ? (
      <strong key={index} className="font-semibold">
        {part.text}
      </strong>
    ) : part.code ? (
      <code key={index} className="bg-foreground/[0.05] rounded-md px-1 font-mono text-[0.85em]">
        {part.text}
      </code>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="text-foreground space-y-3 text-sm leading-relaxed">
      {parseMarkdown(text).map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <p key={index} className="pt-1 text-[15px] font-semibold">
                <Inlines parts={block.inline} />
              </p>
            );
          case "paragraph":
            return (
              <p key={index}>
                <Inlines parts={block.inline} />
              </p>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={index}
                className={
                  block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"
                }
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inlines parts={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={index} className="border-border overflow-x-auto rounded-2xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          className="text-muted border-border border-b px-3 py-2 text-[11px] font-medium tracking-[0.14em] whitespace-nowrap uppercase"
                        >
                          <Inlines parts={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-border border-b last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2 align-top tabular-nums">
                            <Inlines parts={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre
                key={index}
                className="bg-surface border-border overflow-x-auto rounded-xl border p-3 font-mono text-xs"
              >
                {block.text}
              </pre>
            );
        }
      })}
    </div>
  );
}
