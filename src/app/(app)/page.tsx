import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import {
  clientRows,
  leaderboard,
  marketplaceBreakdown,
  monthlySeries,
  tasks,
  totalsForMonth,
} from "@/lib/queries";
import { addMonths, brl, brlShort, currentMonth, dateBR, lastMonths, num, pct } from "@/lib/format";
import { Avatar, Card, Chip, Delta, Empty, MarketplaceChip, PageHeader, Stat, StatusChip } from "@/components/ui";
import { RevenueProfitChart, ChartLegend, SplitBar } from "@/components/charts";
import { MonthPicker } from "@/components/month-picker";
import { marketplaceLabel } from "@/lib/types";

function growth(current: number, previous: number): number {
  if (!previous) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const months = lastMonths(12);
  const ref = params.mes && months.includes(params.mes) ? params.mes : currentMonth();
  const prevRef = addMonths(ref, -1);

  const totals = totalsForMonth(ref);
  const prev = totalsForMonth(prevRef);
  const rows = clientRows(ref);
  const series = monthlySeries(6).map((p) => ({ ...p, ref_month: p.ref_month }));
  const byMarketplace = marketplaceBreakdown(ref);

  const active = rows.filter((r) => r.status === "ativo" || r.status === "atencao").length;
  const margin = totals.revenue ? totals.profit / totals.revenue : 0;
  const prevMargin = prev.revenue ? prev.profit / prev.revenue : 0;
  const mrr = rows
    .filter((r) => r.status !== "encerrado" && r.status !== "pausado")
    .reduce((s, r) => s + r.monthly_fee, 0);

  const attention = rows
    .filter((r) => r.status === "atencao" || (r.prev_revenue > 0 && growth(r.revenue, r.prev_revenue) < -0.15))
    .slice(0, 5);

  const openTasks = tasks({ status: "disponivel" });
  const myTasks = tasks({ status: "em_andamento", assignee: user.id });
  const board = leaderboard();
  const top = rows.slice(0, 8);

  const colors = ["var(--primary)", "var(--accent)", "var(--info)", "var(--success)"];

  return (
    <>
      <PageHeader
        eyebrow={`Olá, ${user.name.split(" ")[0]}`}
        title="Visão geral da carteira"
        subtitle={`Consolidado de ${rows.length} ${rows.length === 1 ? "cliente" : "clientes"} · Mercado Livre e Shopee`}
        actions={
          <Suspense fallback={null}>
            <MonthPicker months={months} value={ref} />
          </Suspense>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Faturamento"
          value={brl(totals.revenue)}
          delta={growth(totals.revenue, prev.revenue)}
          hint="vs. mês anterior"
          tone="brand"
        />
        <Stat
          label="Lucro"
          value={brl(totals.profit)}
          delta={growth(totals.profit, prev.profit)}
          hint={`margem ${pct(margin)}`}
          tone="accent"
        />
        <Stat
          label="Investimento em Ads"
          value={brl(totals.ads)}
          hint={totals.revenue ? `${pct(totals.ads / totals.revenue)} do faturamento` : "sem faturamento"}
          tone="warn"
          href="/ads"
        />
        <Stat
          label="Impostos"
          value={brl(totals.tax)}
          hint={totals.revenue ? `${pct(totals.tax / totals.revenue)} do faturamento` : "—"}
          tone="info"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clientes ativos" value={num(active)} hint={`${rows.length} na carteira`} tone="ok" href="/clientes" />
        <Stat label="Pedidos no mês" value={num(totals.orders)} hint="somando os marketplaces" tone="neutral" />
        <Stat label="Fee recorrente" value={brl(mrr)} hint="contratos ativos" tone="brand" />
        <Stat
          label="Margem da carteira"
          value={pct(margin)}
          delta={margin - prevMargin}
          hint="lucro ÷ faturamento"
          tone={margin >= 0.15 ? "ok" : margin > 0 ? "warn" : "bad"}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Faturamento e lucro — últimos 6 meses"
          actions={
            <ChartLegend
              items={[
                { label: "Faturamento", color: "var(--primary)" },
                { label: "Lucro", color: "var(--accent)" },
              ]}
            />
          }
        >
          {series.some((s) => s.revenue > 0) ? (
            <RevenueProfitChart data={series} />
          ) : (
            <Empty
              title="Ainda não há fechamento lançado"
              hint="Assim que as contas de marketplace forem sincronizadas — ou os números do mês lançados na página do cliente — o gráfico aparece aqui."
              action={
                <Link href="/integracoes" className="btn btn-primary btn-sm">
                  Configurar integrações
                </Link>
              }
            />
          )}
        </Card>

        <Card title="Onde está o faturamento" subtitle="Composição por marketplace no mês">
          {byMarketplace.length ? (
            <div className="space-y-5">
              <SplitBar
                parts={byMarketplace.map((m, i) => ({
                  label: marketplaceLabel(m.marketplace),
                  value: m.revenue,
                  color: colors[i % colors.length],
                }))}
              />
              <div className="space-y-3">
                {byMarketplace.map((m) => (
                  <div key={m.marketplace} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <MarketplaceChip value={m.marketplace} />
                      <span className="text-sm font-semibold text-ink">{brlShort(m.revenue)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[0.7rem]">
                      <div>
                        <div className="text-dim">Lucro</div>
                        <div className="font-semibold text-ink">{brlShort(m.profit)}</div>
                      </div>
                      <div>
                        <div className="text-dim">Ads</div>
                        <div className="font-semibold text-ink">{brlShort(m.ads)}</div>
                      </div>
                      <div>
                        <div className="text-dim">Pedidos</div>
                        <div className="font-semibold text-ink">{num(m.orders)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty title="Sem dados no mês" hint="Nenhum fechamento lançado para este período." />
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Carteira de clientes"
          subtitle="Ordenada por atenção e faturamento"
          actions={
            <Link href="/clientes" className="btn btn-ghost btn-sm">
              Ver todos
            </Link>
          }
          bodyClassName="p-0"
        >
          {top.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Responsável</th>
                    <th>Canais</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Lucro</th>
                    <th className="num">vs. mês ant.</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clientes/${c.id}`} className="flex items-center gap-2.5">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink hover:text-brand">{c.name}</span>
                            <span className="mt-0.5 block">
                              <StatusChip value={c.status} />
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        {c.owner_name ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={c.owner_name} color={c.owner_color} size={24} />
                            <span className="text-xs text-muted">{c.owner_name.split(" ")[0]}</span>
                          </span>
                        ) : (
                          <Chip tone="warn">sem responsável</Chip>
                        )}
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {c.marketplaces
                            ? c.marketplaces.split(",").map((m) => <MarketplaceChip key={m} value={m} />)
                            : <span className="text-xs text-dim">—</span>}
                        </span>
                      </td>
                      <td className="num font-semibold text-ink">{brlShort(c.revenue)}</td>
                      <td className="num">{brlShort(c.profit)}</td>
                      <td className="num">
                        <Delta value={growth(c.revenue, c.prev_revenue)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <Empty
                title="Nenhum cliente cadastrado"
                hint="Cadastre o primeiro cliente para começar a montar a carteira."
                action={
                  <Link href="/clientes/novo" className="btn btn-primary btn-sm">
                    Cadastrar cliente
                  </Link>
                }
              />
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Precisa de atenção" subtitle="Queda relevante ou status crítico">
            {attention.length ? (
              <ul className="space-y-2">
                {attention.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/clientes/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 transition-colors hover:border-line-strong"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                        <span className="text-[0.7rem] text-dim">{brlShort(c.revenue)} no mês</span>
                      </span>
                      <Delta value={growth(c.revenue, c.prev_revenue)} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Nenhum alerta no período. 👌</p>
            )}
          </Card>

          <Card
            title="Tarefas da equipe"
            actions={
              <Link href="/tarefas" className="btn btn-ghost btn-sm">
                Abrir
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-xl font-bold text-ink">{openTasks.length}</div>
                <div className="text-[0.7rem] text-dim">disponíveis no mural</div>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-xl font-bold text-accent">{myTasks.length}</div>
                <div className="text-[0.7rem] text-dim">comigo agora</div>
              </div>
            </div>
            {openTasks.slice(0, 3).map((t) => (
              <div key={t.id} className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                <span className="min-w-0 truncate text-xs text-muted">{t.title}</span>
                <StatusChip value={t.priority} />
              </div>
            ))}
          </Card>

          <Card title="Pontos nos últimos 30 dias" subtitle="Base da gamificação">
            {board.some((b) => b.points > 0) ? (
              <ul className="space-y-2">
                {board.slice(0, 5).map((b, i) => (
                  <li key={b.id} className="flex items-center gap-2.5">
                    <span className="w-4 text-xs font-bold text-dim">{i + 1}</span>
                    <Avatar name={b.name} color={b.color} size={24} />
                    <span className="flex-1 truncate text-xs text-muted">{b.name}</span>
                    <span className="text-xs font-bold text-accent">{b.points} pts</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Nenhuma tarefa concluída ainda neste período.</p>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-4 text-center text-[0.7rem] text-dim">
        Mês de referência: {dateBR(`${ref}-01`)} · dados consolidados de fechamentos manuais e sincronizações de API
      </p>
    </>
  );
}
