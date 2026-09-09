import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Card, Chip, Empty, MARKETPLACE_COLOR, MarketplaceChip, StatusChip } from "@/components/ui";
import { SplitBar } from "@/components/charts";
import { ConectarLojas } from "@/components/conectar-lojas";
import { brlShort, dateBR, num, relativeBR } from "@/lib/format";
import { marketplaceLabel, type Client, type ClientMarketplace, type ClientNote, type User } from "@/lib/types";
import type { TaskRow, Totals } from "@/lib/queries";

export function TabVisao({
  client,
  team,
  accounts,
  notes,
  tasks,
  breakdown,
  chart,
  manager,
  destaqueAcesso,
  marketplacesDisponiveis,
  refMonth,
}: {
  client: Client;
  team: (User & { team_role: string })[];
  accounts: ClientMarketplace[];
  notes: (ClientNote & { user_name: string | null; user_color: string | null })[];
  tasks: TaskRow[];
  breakdown: (Totals & { marketplace: string })[];
  chart: ReactNode;
  manager: boolean;
  destaqueAcesso?: string;
  marketplacesDisponiveis: string[];
  refMonth: string;
}) {
  const openTasks = tasks.filter((t) => t.status !== "concluida");

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <ConectarLojas
          client={client}
          accounts={accounts}
          manager={manager}
          destaque={destaqueAcesso}
          disponiveis={marketplacesDisponiveis}
          refMonth={refMonth}
        />

        {client.summary && (
          <Card title="Resumo da operação">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{client.summary}</p>
          </Card>
        )}

        {chart}

        <Card title="Composição do mês" subtitle="Faturamento por marketplace">
          {breakdown.length ? (
            <SplitBar
              parts={breakdown.map((b) => ({
                label: marketplaceLabel(b.marketplace),
                value: b.revenue,
                color: MARKETPLACE_COLOR[b.marketplace] ?? "var(--primary)",
              }))}
            />
          ) : (
            <Empty
              title="Sem fechamento neste mês"
              hint="Lance os números na aba Financeiro ou sincronize a conta do marketplace."
              action={
                <Link href={`/clientes/${client.id}?tab=financeiro`} className="btn btn-primary btn-sm">
                  Lançar fechamento
                </Link>
              }
            />
          )}
        </Card>

        <Card
          title="Tarefas ligadas ao cliente"
          actions={
            <Link href={`/tarefas?cliente=${client.id}`} className="btn btn-ghost btn-sm">
              Ver todas
            </Link>
          }
          bodyClassName={openTasks.length ? "p-0" : "p-5"}
        >
          {openTasks.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                    <span className="text-xs text-muted">
                      {t.assignee_name ? `com ${t.assignee_name}` : "disponível no mural"}
                      {t.due_date && ` · vence ${dateBR(t.due_date)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <StatusChip value={t.priority} />
                    <StatusChip value={t.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">Nenhuma tarefa aberta para este cliente.</p>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Time responsável">
          {team.length ? (
            <ul className="space-y-2.5">
              {team.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} color={m.color} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                    <span className="text-xs text-muted">{m.job_title ?? m.role}</span>
                  </span>
                  {m.id === client.owner_id ? <Chip tone="accent">responsável</Chip> : <Chip>{m.team_role}</Chip>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Sem equipe definida"
              action={
                <Link href={`/clientes/${client.id}?tab=equipe`} className="btn btn-primary btn-sm">
                  Definir equipe
                </Link>
              }
            />
          )}
        </Card>

        <Card title="Marketplaces">
          {accounts.length ? (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <MarketplaceChip value={a.marketplace} />
                    <StatusChip value={a.status} />
                  </div>
                  <div className="mt-1.5 text-xs text-muted">
                    {a.nickname ?? "conta sem apelido"}
                    {a.last_sync_at ? ` · sincronizada ${relativeBR(a.last_sync_at)}` : " · nunca sincronizada"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Nenhum canal cadastrado"
              action={
                <Link href={`/clientes/${client.id}?tab=marketplaces`} className="btn btn-primary btn-sm">
                  Adicionar canal
                </Link>
              }
            />
          )}
        </Card>

        <Card title="Contato e contrato">
          <dl className="space-y-2 text-sm">
            <Row label="Contato" value={client.contact_name} />
            <Row label="E-mail" value={client.contact_email} />
            <Row label="Telefone" value={client.contact_phone} />
            <Row label="CNPJ/CPF" value={client.doc} />
            <Row label="Fee mensal" value={brlShort(client.monthly_fee)} />
            <Row
              label="Comissão"
              value={client.commission_pct ? `${(client.commission_pct * 100).toFixed(1)}%` : "—"}
            />
            <Row label="Início" value={client.started_at ? dateBR(client.started_at) : null} />
          </dl>
        </Card>

        <Card
          title="Últimas anotações"
          actions={
            <Link href={`/clientes/${client.id}?tab=historico`} className="btn btn-ghost btn-sm">
              Histórico
            </Link>
          }
        >
          {notes.length ? (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="border-l-2 border-brand pl-3">
                  <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.user_name ?? "equipe"} · {relativeBR(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">Nada registrado ainda.</p>
          )}
        </Card>

        <Card title="Números rápidos">
          <div className="grid grid-cols-2 gap-2 text-center">
            <Mini label="Tarefas abertas" value={num(openTasks.length)} />
            <Mini label="Pessoas no time" value={num(team.length)} />
            <Mini label="Canais ativos" value={num(accounts.filter((a) => a.status !== "desativado").length)} />
            <Mini label="Anotações" value={num(notes.length)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-0">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="truncate text-right text-xs font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-2.5">
      <div className="text-lg font-bold text-ink">{value}</div>
      <div className="text-[0.65rem] text-dim">{label}</div>
    </div>
  );
}
