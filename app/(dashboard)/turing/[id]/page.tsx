import { getConversation, listConversations, requireTuring } from "@/lib/turing/queries";
import { notFound } from "next/navigation";
import { Chat } from "../_components/chat";
import { TuringShell } from "../_components/turing-shell";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function TuringConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTuring();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [conversation, conversations] = await Promise.all([
    getConversation(id),
    listConversations(),
  ]);
  if (!conversation) notFound();
  return (
    <TuringShell conversations={conversations} activeId={conversation.id}>
      <Chat
        key={conversation.id}
        conversationId={conversation.id}
        initialTurns={conversation.turns}
      />
    </TuringShell>
  );
}
