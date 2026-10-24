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
    return <p className="text-muted px-2 text-sm">Your conversations will be listed here.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        return (
          <li
            key={conversation.id}
            className={cn(
              "group flex items-center gap-1 rounded-xl pr-1",
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

/** Turing's frame: the title, your conversations beside the chat (folded away on a phone). */
export function TuringShell({
  conversations,
  activeId,
  children,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
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
              New conversation
            </LinkButton>
          </>
        }
      />
      <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="md:sticky md:top-6 md:self-start">
          <details className="md:hidden">
            <summary className="text-muted cursor-pointer text-sm font-medium">
              Your conversations ({conversations.length})
            </summary>
            <div className="mt-2">
              <ConversationList conversations={conversations} activeId={activeId} />
            </div>
          </details>
          <div className="hidden md:block">
            <p className="text-muted mb-2 px-2 text-[11px] font-medium tracking-[0.14em] uppercase">
              Your conversations
            </p>
            <ConversationList conversations={conversations} activeId={activeId} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
