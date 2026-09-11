import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeClient, requireUser } from "@/lib/auth";
import {
  adsTotals,
  alertasDaCarteira,
  clientGoals,
  clientNotes,
  getClient,
  marketplaceBreakdown,
  tasks,
  totalsForClient,
} from "@/lib/queries";
import { addMonths, brl, currentMonth, dateBR, lastMonths, monthLabel, num, pct } from "@/lib/format";
import { Card, Chip, PageHeader } from "@/components/ui";
import { marketplaceLabel } from "@/lib/types";
import { evolucoes, metasDoRelatorio, resumoWhatsApp, type DadosRelatorio } from "@/lib/relatorio";
import { AcoesRelatorio } from "./acoes";

export const maxDuration = 60;

export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const client = await getClient(id);
  if (!client) notFound();
  if (!(await canSeeClient(user, client.id))) notFound();

  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const anteriorRef = addMonths(ref, -1);

  const atual = await totalsForClient(client.id, ref);
  const anterior = await totalsForClient(client.id, anteriorRef);
  const breakdown = await marketplaceBreakdown(ref, client.id);
  const ads = await adsTotals(client.id, ref);
  const metas = await clientGoals(client.id, ref);
  const todosAlertas = await alertasDaCarteira(ref, [client.id]);
  const tarefasCliente = await tasks({ clientId: client.id });
  const notas = await clientNotes(client.id, 20);

  const concluidas = tarefasCliente.filter(
    (t) => t.status === "concluida" && (t.completed_at ?? "").slice(0, 7) === ref,
  );
  const proximas = tarefasCliente.filter((t) => t.status !== "concluida");

  const dados: DadosRelatorio = {
    cliente: { id: client.id, name: client.name },
    refMonth: ref,
    atual: {
      revenue: atual.revenue,
      orders: atual.orders,
      profit: atual.profit,
      tax: atual.tax,
      ads: atual.ads,
      units: 0,
    },
    anterior: { revenue: anterior.revenue, orders: anterior.orders, profit: anterior.profit },
    porMarketplace: breakdown.map((b) => ({
      marketplace: b.marketplace,
      revenue: b.revenue,
      orders: b.orders,
      profit: b.profit,
    })),
    ads: { invested: ads.invested, revenue: ads.revenue, clicks: 0, orders: 0 },
    goal: metas.find((m) => m.marketplace === null),
    realizado: {
      revenue: atual.revenue,
      orders: atual.orders,
      profit: atual.profit,
      ads: ads.invested,
      adsRevenue: ads.revenue,
    },
    alertas: todosAlertas.filter((a) => !a.resolvido),
    tarefasConcluidas: concluidas.map((t) => ({ title: t.title, completed_at: t.completed_at })),
    proximasAcoes: proximas.map((t) => ({ title: t.title, due_date: t.due_date })),
    anotacoes: notas
      .filter((n) => n.pinned === 1 || n.kind === "reuniao")
      .slice(0, 5)
      .map((n) => ({ body: n.body, created_at: n.created_at })),
  };

  const evolucao = evolucoes(dados);
  const progresso = metasDoRelatorio(dados);
  const margem = atual.revenue ? atual.profit / atual.revenue : 0;
  const resumo = resumoWhatsApp(dados);

  return (
    <>
      {/* a barra de ações some na impressão: PDF não precisa de botão */}
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <Link href={`/clientes/${client.id}`} className="hover:text-brand">
              {client.name}
            </Link>
          }
          title={`Relatório de ${monthLabel(ref)}`}
          subtitle="Pronto para imprimir, salvar em PDF ou mandar pelo WhatsApp"
          actions={
            <AcoesRelatorio
              clientId={client.id}
              refMonth={ref}
              resumo={resumo}
              telefone={client.contact_phone}
            />
          }
        />

        <nav className="mb-4 flex flex-wrap gap-1">
          {months.slice(0, 6).map((m) => (
            <Link
              key={m}
              href={`/clientes/${client.id}/relatorio?mes=${m}`}
              className={`btn btn-sm ${m === ref ? "btn-primary" : "btn-ghost"}`}
            >
              {monthLabel(m)}
            </Link>
          ))}
        </nav>
      </div>

      <article className="space-y-3">
        <Card>
          <h1 className="text-2xl font-bold text-ink">{client.name}</h1>
          <p className="text-sm text-muted">Resultado de {monthLabel(ref)}</p>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Bloco label="Faturamento" valor={brl(atual.revenue)} nota={`${num(atual.orders)} pedidos`} />
          <Bloco label="Lucro" valor={brl(atual.profit)} nota={`margem ${pct(margem)}`} />
          <Bloco
            label="Ticket médio"
            valor={brl(atual.orders ? atual.revenue / atual.orders : 0)}
            nota={`${num(atual.orders)} pedidos no mês`}
          />
          <Bloco
            label="Investimento em Ads"
            valor={brl(ads.invested)}
            nota={ads.invested ? `retorno ${(ads.revenue / ads.invested).toFixed(2)}x` : "sem investimento"}
          />
        </div>

        <Card title="Comparação com o mês anterior" bodyClassName="p-0">
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th />
                  <th className="num">{monthLabel(anteriorRef)}</th>
                  <th className="num">{monthLabel(ref)}</th>
                  <th className="num">Variação</th>
                </tr>
              </thead>
              <tbody>
                <Comparacao label="Faturamento" antes={anterior.revenue} agora={atual.revenue} moeda />
                <Comparacao label="Pedidos" antes={anterior.orders} agora={atual.orders} />
                <Comparacao label="Lucro" antes={anterior.profit} agora={atual.profit} moeda />
              </tbody>
            </table>
          </div>
        </Card>

        {progresso.length > 0 && (
          <Card title="Meta e realizado" bodyClassName="p-0">
            <div className="table-wrap">
              <table className="data responsiva">
                <thead>
                  <tr>
                    <th>Meta</th>
                    <th className="num">Combinado</th>
                    <th className="num">Realizado</th>
                    <th className="num">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {progresso.map((p) => (
                    <tr key={p.key}>
                      <td className="text-sm text-ink" data-label="Meta">{p.label}</td>
                      <td className="num text-muted" data-label="Combinado">{formatar(p.goal, p.format)}</td>
                      <td className="num font-semibold text-ink" data-label="Realizado">{formatar(p.realized, p.format)}</td>
                      <td className="num" data-label="Situação">
                        <Chip tone={p.bom ? "ok" : "bad"}>{p.bom ? "cumprida" : "não cumprida"}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {dados.porMarketplace.length > 0 && (
          <Card title="Resultado por loja" bodyClassName="p-0">
            <div className="table-wrap">
              <table className="data responsiva">
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Lucro</th>
                    <th className="num">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porMarketplace.map((m) => (
                    <tr key={m.marketplace}>
                      <td className="text-sm text-ink" data-label="Loja">{marketplaceLabel(m.marketplace)}</td>
                      <td className="num font-semibold text-ink" data-label="Faturamento">{brl(m.revenue)}</td>
                      <td className="num text-muted" data-label="Pedidos">{num(m.orders)}</td>
                      <td className="num text-muted" data-label="Lucro">{brl(m.profit)}</td>
                      <td className="num text-muted" data-label="Participação">
                        {atual.revenue ? pct(m.revenue / atual.revenue) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {evolucao.length > 0 && (
          <Card title="Principais evoluções">
            <ul className="space-y-1.5">
              {evolucao.map((e) => (
                <li key={e.texto} className="flex items-start gap-2 text-sm">
                  <span className={e.bom ? "text-ok" : "text-bad"}>{e.bom ? "▲" : "▼"}</span>
                  <span className="text-muted">{e.texto}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {dados.alertas.length > 0 && (
          <Card title="Pontos de atenção">
            <ul className="space-y-1.5">
              {dados.alertas.slice(0, 8).map((a) => (
                <li key={a.key} className="flex items-start gap-2 text-sm">
                  <Chip tone={a.nivel === "critico" ? "bad" : "warn"}>{a.nivel}</Chip>
                  <span className="text-muted">
                    <span className="text-ink">{a.titulo}</span>
                    <span className="block text-xs text-dim">{a.detalhe}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {dados.tarefasConcluidas.length > 0 && (
          <Card title="O que foi entregue no mês" subtitle={`${dados.tarefasConcluidas.length} tarefas concluídas`}>
            <ul className="space-y-1">
              {dados.tarefasConcluidas.map((t) => (
                <li key={t.title} className="text-sm text-muted">
                  <span className="text-ok">✓</span> {t.title}
                  {t.completed_at && <span className="ml-1 text-xs text-dim">{dateBR(t.completed_at)}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {dados.proximasAcoes.length > 0 && (
          <Card title="Próximas ações" subtitle="O que já está encaminhado">
            <ul className="space-y-1">
              {dados.proximasAcoes.slice(0, 10).map((t) => (
                <li key={t.title} className="text-sm text-muted">
                  <span className="text-dim">○</span> {t.title}
                  {t.due_date && <span className="ml-1 text-xs text-dim">até {dateBR(t.due_date)}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {dados.anotacoes.length > 0 && (
          <Card title="Anotações estratégicas">
            <ul className="space-y-2">
              {dados.anotacoes.map((n) => (
                <li key={n.created_at} className="text-sm text-muted">
                  <span className="block whitespace-pre-wrap">{n.body}</span>
                  <span className="text-xs text-dim">{dateBR(n.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </article>
    </>
  );
}

function Bloco({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface px-4 py-3">
      <div className="text-[0.7rem] uppercase tracking-wide text-dim">{label}</div>
      <div className="text-xl font-bold text-ink">{valor}</div>
      {nota && <div className="text-xs text-dim">{nota}</div>}
    </div>
  );
}

function Comparacao({
  label,
  antes,
  agora,
  moeda,
}: {
  label: string;
  antes: number;
  agora: number;
  moeda?: boolean;
}) {
  const f = (v: number) => (moeda ? brl(v) : num(v));
  const variacao = antes ? (agora - antes) / antes : agora > 0 ? 1 : 0;
  return (
    <tr>
      <td className="text-sm text-ink">{label}</td>
      <td className="num text-muted">{f(antes)}</td>
      <td className="num font-semibold text-ink">{f(agora)}</td>
      <td className={`num font-semibold ${variacao > 0 ? "text-ok" : variacao < 0 ? "text-bad" : "text-dim"}`}>
        {antes ? `${variacao > 0 ? "+" : ""}${Math.round(variacao * 100)}%` : "—"}
      </td>
    </tr>
  );
}

function formatar(v: number, formato: string): string {
  if (formato === "brl") return brl(v);
  if (formato === "int") return num(Math.round(v));
  if (formato === "pct") return pct(v);
  return `${v.toFixed(2)}x`;
}
