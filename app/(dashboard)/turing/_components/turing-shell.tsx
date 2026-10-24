import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { formatShortDate } from "@/lib/format";
import type { ConversationSummary } from "@/lib/turing/queries";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeleteConversation } from "./delete-conversation";

function ConversationList({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
}) {
  if (conversations.length === 0) {
    return <p className="text-muted px-2.5 text-sm">Your conversations will be listed here.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        return (
          <li
            key={conversation.id}
            className={cn(
              "flex items-center gap-1 rounded-xl pr-1",
              active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.025]",
            )}
          >
            <Link
              href={`/turing/${conversation.id}`}
              aria-current={active ? "page" : undefined}
              className="min-w-0 flex-1 px-2.5 py-2"
            >
              <span className="text-foreground block truncate text-sm">{conversation.title}</span>
              <span className="text-muted block text-xs">
                {formatShortDate(conversation.updated_at)}
              </span>
            </Link>
            <DeleteConversation id={conversation.id} title={conversation.title} active={active} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Turing's frame. On a phone: the title, your conversations folded away, then the chat, the page
 * scrolling as usual. On a computer, a workspace filling everything right of the sidebar: your
 * conversations down the left, the chat's own header, and the chat scrolling inside with its
 * box pinned to the bottom — no page around it (data-bleed lifts the dashboard's padding).
 */
export function TuringShell({
  conversations,
  activeId,
  title,
  children,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      data-bleed
      className="space-y-6 md:flex md:h-[calc(100dvh-2rem)] md:space-y-0 md:in-data-[site=production]:h-dvh"
    >
      <div className="space-y-4 md:hidden">
        <PageTitle
          title="Turing"
          description="Claude, working inside the toolbox with you. Only you see your conversations; what you send goes to Anthropic."
          actions={
            <>
              <LinkButton href="/turing/pages" variant="secondary" size="sm">
                <LayoutDashboard className="size-4" aria-hidden />
                Pages
              </LinkButton>
              <LinkButton href="/turing" size="sm">
                <Plus className="size-4" aria-hidden />
                New
              </LinkButton>
            </>
          }
        />
        <details>
          <summary className="text-muted cursor-pointer text-sm font-medium">
            Your conversations ({conversations.length})
          </summary>
          <div className="mt-2">
            <ConversationList conversations={conversations} activeId={activeId} />
          </div>
        </details>
      </div>

      <aside className="border-border bg-surface hidden w-72 shrink-0 flex-col border-r md:flex">
        <div className="space-y-4 px-4 pt-6 pb-4">
          <p className="font-display px-1 text-3xl font-medium">Turing</p>
          <LinkButton href="/turing" className="w-full">
            <Plus className="size-4" aria-hidden />
            New conversation
          </LinkButton>
        </div>
        <p className="text-muted px-6 pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
          Your conversations
        </p>
        <nav aria-label="Your conversations" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <ConversationList conversations={conversations} activeId={activeId} />
        </nav>
        <div className="border-border border-t p-3">
          <Link
            href="/turing/pages"
            className="text-foreground hover:bg-foreground/[0.05] flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium"
          >
            <LayoutDashboard className="text-muted size-4" aria-hidden />
            Pages
          </Link>
          <p className="text-muted px-2.5 pt-1 text-xs">
            Only you see your conversations. What you send goes to Anthropic.
          </p>
        </div>
      </aside>

      <section className="min-w-0 md:flex md:flex-1 md:flex-col">
        <header className="border-border hidden h-14 shrink-0 items-center border-b px-8 md:flex">
          <h1 className="truncate text-[15px] font-semibold">{title}</h1>
        </header>
        {children}
      </section>
    </div>
  );
}
