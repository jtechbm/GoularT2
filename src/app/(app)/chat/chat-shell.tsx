import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Chip, Field } from "@/components/ui";
import { SaveBar } from "@/components/submit";
import { createChannelAction } from "@/lib/actions/chat";
import { relativeBR } from "@/lib/format";

export interface ChannelSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  client_id: string | null;
  client_name: string | null;
  messages: number;
  last_at: string | null;
}

export function ChatShell({
  channels,
  activeSlug,
  clients,
  children,
}: {
  channels: ChannelSummary[];
  activeSlug?: string;
  clients: { id: string; name: string }[];
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      <div className="space-y-3">
        <Card title="Canais" bodyClassName="p-2">
          {channels.length ? (
            <ul className="space-y-1">
              {channels.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.slug}`}
                    className={`block rounded-lg px-3 py-2 transition-colors ${
                      activeSlug === c.slug ? "bg-brand-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium ${activeSlug === c.slug ? "text-ink" : "text-muted"}`}>
                        <span className="text-dim">#</span> {c.name}
                      </span>
                      {c.kind === "cliente" && <Chip tone="brand">cliente</Chip>}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {c.messages} {c.messages === 1 ? "mensagem" : "mensagens"}
                      {c.last_at && ` · ${relativeBR(c.last_at)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-dim">Nenhum canal ainda.</p>
          )}
        </Card>

        <form action={createChannelAction}>
          <Card title="Novo canal" bodyClassName="p-4 pb-0">
            <div className="space-y-3">
              <Field label="Nome">
                <input name="name" required className="input" placeholder="nome do canal" />
              </Field>
              <Field label="Descrição">
                <input name="description" className="input" placeholder="assunto tratado no canal" />
              </Field>
              <Field label="Vincular a um cliente">
                <select name="client_id" defaultValue="" className="select">
                  <option value="">Canal geral da equipe</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <SaveBar label="Criar canal" hint="" />
          </Card>
        </form>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
