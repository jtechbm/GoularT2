import Link from "next/link";
import { notFound } from "next/navigation";
import { isManager, requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { channels, clientOptions, messages } from "@/lib/queries";
import { Avatar, Card, Chip, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { deleteChannelAction, sendMessageAction } from "@/lib/actions/chat";
import { dateTimeBR, relativeBR } from "@/lib/format";
import { ChatShell } from "../chat-shell";

export default async function CanalPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const channel = await one<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: string;
    client_id: string | null;
  }>("SELECT * FROM chat_channels WHERE slug = ?", slug);
  if (!channel) notFound();

  const list = await channels();
  const clients = await clientOptions();
  const msgs = await messages(channel.id);

  // agrupa mensagens seguidas da mesma pessoa
  const groups: { user_id: string | null; user_name: string | null; user_color: string | null; at: string; items: typeof msgs }[] =
    [];
  for (const m of msgs) {
    const last = groups[groups.length - 1];
    if (last && last.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(last.at).getTime() < 6e5) {
      last.items.push(m);
    } else {
      groups.push({ user_id: m.user_id, user_name: m.user_name, user_color: m.user_color, at: m.created_at, items: [m] });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/chat" className="hover:text-brand">
            Chat
          </Link>
        }
        title={`# ${channel.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {channel.description && <span>{channel.description}</span>}
            {channel.client_id && (
              <Link href={`/clientes/${channel.client_id}`} className="chip bg-brand-soft text-brand">
                cliente vinculado
              </Link>
            )}
            <Chip>{msgs.length} mensagens</Chip>
          </span>
        }
        actions={
          isManager(user) && (
            <form action={deleteChannelAction}>
              <input type="hidden" name="slug" value={channel.slug} />
              <SubmitButton variant="ghost" size="sm" confirm="Excluir o canal e todas as mensagens?">
                Excluir canal
              </SubmitButton>
            </form>
          )
        }
      />

      <ChatShell channels={list} activeSlug={channel.slug} clients={clients}>
        <Card bodyClassName="p-0">
          <div className="max-h-[58vh] min-h-72 space-y-5 overflow-y-auto p-5">
            {groups.length ? (
              groups.map((g, i) => (
                <div key={`${g.at}-${i}`} className="flex gap-3">
                  <Avatar name={g.user_name ?? "Equipe"} color={g.user_color} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-ink">{g.user_name ?? "Equipe"}</span>
                      <span className="text-xs text-muted" title={dateTimeBR(g.at)}>
                        {relativeBR(g.at)}
                      </span>
                      {g.user_id === user.id && <Chip tone="accent">você</Chip>}
                    </div>
                    <div className="mt-1 space-y-1.5">
                      {g.items.map((m) => (
                        <p key={m.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                          {m.body}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty title="Canal vazio" hint="Escreva a primeira mensagem abaixo." />
            )}
          </div>

          <form action={sendMessageAction} className="border-t border-line p-4">
            <input type="hidden" name="slug" value={channel.slug} />
            <div className="flex items-end gap-2">
              <textarea
                name="body"
                rows={2}
                required
                className="textarea"
                placeholder={`Mensagem em #${channel.name}…`}
              />
              <SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton>
            </div>
          </form>
        </Card>
      </ChatShell>
    </>
  );
}
