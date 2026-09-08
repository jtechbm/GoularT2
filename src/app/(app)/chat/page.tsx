import { requireUser } from "@/lib/auth";
import { channels, clientOptions } from "@/lib/queries";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ChatShell } from "./chat-shell";

export default async function ChatPage() {
  await requireUser();
  const list = channels();
  const clients = clientOptions();

  return (
    <>
      <PageHeader
        title="Chat interno"
        subtitle="Comunicação da equipe por canal — geral ou por cliente."
      />
      <ChatShell channels={list} clients={clients}>
        <Card bodyClassName="p-5">
          <Empty
            title={list.length ? "Escolha um canal ao lado" : "Nenhum canal criado ainda"}
            hint={
              list.length
                ? "As conversas ficam separadas por canal para não misturar assunto de clientes diferentes."
                : "Crie o primeiro canal — por exemplo #operacao-diaria — para a equipe começar a conversar."
            }
          />
        </Card>
      </ChatShell>
    </>
  );
}
