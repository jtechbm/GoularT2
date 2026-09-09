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
  ownStoreTotals,
} from "@/lib/queries";
import { addMonths, brl, brlShort, currentMonth, dateBR, lastMonths, num, pct } from "@/lib/format";
import {
  Avatar,
  Card,
  Chip,
  Delta,
  Empty,
  MARKETPLACE_COLOR,
  MarketplaceChip,
  PageHeader,
  Stat,
  StatusChip,
} from "@/components/ui";
import { RevenueProfitChart, ChartLegend, Donut } from "@/components/charts";
import { IconBarChart, IconDollar, IconPlus, IconReceipt, IconTrendUp, IconUsers } from "@/components/icons";
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

  const totals = await totalsForMonth(ref);
  const prev = await totalsForMonth(prevRef);
  const rows = await clientRows(ref, "cliente");
  const propria = await ownStoreTotals(ref);
  const series = await monthlySeries(6);
  const byMarketplace = await marketplaceBreakdown(ref);

  const active = rows.filter((r) => r.status === "ativo" || r.status === "atencao").length;
  const margin = totals.revenue ? totals.profit / totals.revenue : 0;
  const prevMargin = prev.revenue ? prev.profit / prev.revenue : 0;
  const mrr = rows
    .filter((r) => r.status !== "encerrado" && r.status !== "pausado")
    .reduce((s, r) => s + r.monthly_fee, 0);

  const attention = rows
    .filter((r) => r.status === "atencao" || (r.prev_revenue > 0 && growth(r.revenue, r.prev_revenue) < -0.15))
    .slice(0, 5);

  const openTasks = await tasks({ status: "disponivel" });
  const myTasks = await tasks({ status: "em_andamento", assignee: user.id });
  const board = await leaderboard();
  const top = rows.slice(0, 8);

  const totalRevenue = byMarketplace.reduce((s, m) => s + m.revenue, 0);

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]} 👋`}
        subtitle="Aqui está o resumo da sua operação."
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
          icon={<IconBarChart size={20} />}
        />
        <Stat
          label="Lucro"
          value={brl(totals.profit)}
          delta={growth(totals.profit, prev.profit)}
          hint={`margem ${pct(margin)}`}
          tone="accent"
          icon={<IconDollar size={20} />}
        />
        <Stat
          label="Investimento em Ads"
          value={brl(totals.ads)}
          hint={totals.revenue ? `${pct(totals.ads / totals.revenue)} do faturamento` : "sem faturamento"}
          tone="warn"
          href="/ads"
          icon={<IconTrendUp size={20} />}
        />
        <Stat
          label="Impostos"
          value={brl(totals.tax)}
          hint={totals.revenue ? `${pct(totals.tax / totals.revenue)} do faturamento` : "—"}
          tone="info"
          icon={<IconReceipt size={20} />}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Clientes ativos"
          value={num(active)}
          hint={`${rows.length} na carteira`}
          tone="ok"
          href="/clientes"
          icon={<IconUsers size={20} />}
        />
        <Stat label="Pedidos no mês" value={num(totals.orders)} hint="somando os marketplaces" tone="neutral" />
        {propria.stores > 0 ? (
          <Stat
            label="Loja própria"
            value={brl(propria.revenue)}
            hint={`lucro ${brlShort(propria.profit)} · fora da carteira`}
            tone="accent"
            icon={<IconBarChart size={20} />}
          />
        ) : (
          <Stat label="Fee recorrente" value={brl(mrr)} hint="contratos ativos" tone="brand" />
        )}
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
                { label: "Lucro", color: "var(--primary-light)" },
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
              <Donut
                parts={byMarketplace.map((m) => ({
                  label: marketplaceLabel(m.marketplace),
                  value: m.revenue,
                  color: MARKETPLACE_COLOR[m.marketplace] ?? "var(--primary)",
                }))}
                total={totalRevenue}
                totalLabel="faturamento"
                formatValue={(v) => brlShort(v)}
              />
              <div className="space-y-2">
                {byMarketplace.map((m) => (
                  <div key={m.marketplace} className="rounded-[10px] border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <MarketplaceChip value={m.marketplace} />
                      <span className="text-sm font-semibold text-ink">{brlShort(m.revenue)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="text-muted">Lucro</div>
                        <div className="font-medium text-ink">{brlShort(m.profit)}</div>
                      </div>
                      <div>
                        <div className="text-muted">Ads</div>
                        <div className="font-medium text-ink">{brlShort(m.ads)}</div>
                      </div>
                      <div>
                        <div className="text-muted">Pedidos</div>
                        <div className="font-medium text-ink">{num(m.orders)}</div>
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

      <section className="relative mt-3 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-soft to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <IconTrendUp size={20} />
            </span>
            <div>
              <p className="text-[0.95rem] font-semibold text-ink">Tudo no lugar, para você ir mais longe.</p>
              <p className="text-sm text-muted">Clientes, marketplaces, ads e finanças em um só sistema.</p>
            </div>
          </div>
          <Link href="/clientes/novo" className="btn btn-primary">
            <IconPlus size={16} />
            Novo cliente
          </Link>
        </div>
      </section>

      <p className="mt-4 text-center text-xs text-dim">
        Mês de referência: {dateBR(`${ref}-01`)} · dados consolidados de fechamentos manuais e sincronizações de API
      </p>
    </>
  );
}
