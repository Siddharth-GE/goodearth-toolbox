import { listConversations, requireTuring } from "@/lib/turing/queries";
import { Chat } from "./_components/chat";
import { TuringShell } from "./_components/turing-shell";

export default async function TuringPage() {
  await requireTuring();
  const conversations = await listConversations();
  return (
    <TuringShell conversations={conversations} activeId={null}>
      <Chat conversationId={null} initialTurns={[]} />
    </TuringShell>
  );
}
