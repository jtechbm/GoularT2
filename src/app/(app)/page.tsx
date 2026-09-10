import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  clientRows,
  leaderboard,
  marketplaceBreakdown,
  monthlySeries,
  tasks,
  totalsForMonth,
  ownStoreTotals,
  integrationHealth,
  procedenciaDoMes,
  adsTotalsCarteira,
  scoresEmLote,
  alertasDaCarteira,
  adsRows,
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
import { SaudeIntegracoes } from "@/components/saude-integracoes";
import { Procedencia } from "@/components/procedencia";
import { ScoreChip } from "@/components/score-saude";
import { NIVEL_TOM, NIVEL_LABEL } from "@/lib/alertas";
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

  // membro só enxerga os clientes atribuídos a ele; gestor e admin, a carteira toda
  const escopo = await visibleClientIds(user);
  const verLojasProprias = can(user, "lojas.proprias");

  const totals = await totalsForMonth(ref, escopo);
  const prev = await totalsForMonth(prevRef, escopo);
  const rows = await clientRows(ref, "cliente", escopo);
  const propria = verLojasProprias ? await ownStoreTotals(ref) : null;
  const series = await monthlySeries(6, undefined, escopo);
  const byMarketplace = await marketplaceBreakdown(ref, undefined, escopo);

  const active = rows.filter((r) => r.status === "ativo" || r.status === "atencao").length;
  const margin = totals.revenue ? totals.profit / totals.revenue : 0;
  const prevMargin = prev.revenue ? prev.profit / prev.revenue : 0;
  const mrr = rows
    .filter((r) => r.status !== "encerrado" && r.status !== "pausado")
    .reduce((s, r) => s + r.monthly_fee, 0);

  const openTasks = await tasks({ status: "disponivel" });
  const myTasks = await tasks({ status: "em_andamento", assignee: user.id });
  const board = await leaderboard();
  const saude = await integrationHealth(escopo);
  const procedencia = await procedenciaDoMes(ref, { scope: escopo });
  const adsCarteira = await adsTotalsCarteira(ref, escopo);
  // receita atribuída de Ads por cliente, para o ROAS da tabela
  const adsPorCliente = new Map(
    (await adsRows({ refMonth: ref, scope: escopo })).reduce((acc, e) => {
      acc.set(e.client_id, (acc.get(e.client_id) ?? 0) + e.revenue);
      return acc;
    }, new Map<string, number>()),
  );
  const scores = await scoresEmLote(rows, ref);
  const alertas = await alertasDaCarteira(ref, escopo);
  const alertasAbertos = alertas.filter((a) => !a.resolvido);

  const roasCarteira = adsCarteira.invested ? adsCarteira.revenue / adsCarteira.invested : 0;
  const emOnboarding = rows.filter((r) => r.status === "onboarding").length;
  const semResponsavel = rows.filter((r) => !r.owner_id).length;
  const precisamAtencao = rows.filter((r) => {
    const sc = scores.get(r.id);
    return sc && sc.classe !== "saudavel";
  });
  const top = rows.slice(0, 8);

  const totalRevenue = byMarketplace.reduce((s, m) => s + m.revenue, 0);

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]} 👋`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Aqui está o resumo da sua operação.</span>
            <Procedencia
              origem={procedencia.origem}
              atualizadoEm={procedencia.atualizadoEm}
              contas={procedencia.contas}
              comDados={procedencia.comDados}
            />
          </span>
        }
        actions={
          <Suspense fallback={null}>
            <MonthPicker months={months} value={ref} />
          </Suspense>
        }
      />

      {/* quatro números. Antes eram oito, e oito números lado a lado não
          formam uma decisão: formam um painel de avião */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Faturamento da carteira"
          value={brl(totals.revenue)}
          delta={growth(totals.revenue, prev.revenue)}
          hint="vs. mês anterior"
          tone="brand"
          icon={<IconBarChart size={20} />}
        />
        <Stat
          label="Lucro"
          value={brl(totals.profit)}
          delta={margin - prevMargin}
          hint={`margem ${pct(margin)}`}
          tone={margin >= 0.15 ? "ok" : margin > 0 ? "warn" : "bad"}
          icon={<IconDollar size={20} />}
        />
        <Stat
          label="Ads"
          value={brl(totals.ads)}
          hint={roasCarteira ? `ROAS ${roasCarteira.toFixed(2)}x` : "sem receita atribuída"}
          tone={roasCarteira >= 3 ? "ok" : roasCarteira > 0 ? "warn" : "neutral"}
          href="/ads"
          icon={<IconTrendUp size={20} />}
        />
        <Stat
          label="Clientes em atenção"
          value={num(precisamAtencao.length)}
          hint={alertasAbertos.length ? `${alertasAbertos.length} alertas em aberto` : "nada pendente"}
          tone={precisamAtencao.length ? "bad" : "ok"}
          href="/alertas"
          icon={<IconUsers size={20} />}
        />
      </div>

      {/* a carteira em uma linha: quantos, em que estágio, e o que falta */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ativos" value={num(active)} hint={`${rows.length} na carteira`} tone="ok" href="/clientes" />
        <Stat
          label="Em onboarding"
          value={num(emOnboarding)}
          hint={emOnboarding ? "ainda entrando" : "nenhum"}
          tone={emOnboarding ? "warn" : "neutral"}
          href="/clientes?status=onboarding"
        />
        <Stat
          label="Precisam de atenção"
          value={num(precisamAtencao.length)}
          hint="score abaixo de 70"
          tone={precisamAtencao.length ? "bad" : "ok"}
        />
        <Stat
          label="Sem responsável"
          value={num(semResponsavel)}
          hint={semResponsavel ? "ninguém responde por eles" : "todos atribuídos"}
          tone={semResponsavel ? "bad" : "ok"}
        />
      </div>

      {/* resultado da agência fica separado do resultado das lojas: são
          bolsos diferentes e somar os dois dá um número que não existe */}
      {propria && propria.stores > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Lojas do Kadu"
            value={brl(propria.revenue)}
            hint={`${propria.stores} ${propria.stores === 1 ? "loja" : "lojas"} · fora da carteira`}
            tone="accent"
            icon={<IconBarChart size={20} />}
          />
          <Stat label="Lucro das lojas" value={brl(propria.profit)} tone="accent" />
          <Stat label="Fee recorrente" value={brl(mrr)} hint="contratos ativos da agência" tone="brand" />
          <Stat label="Pedidos no mês" value={num(totals.orders)} hint="carteira" tone="neutral" />
        </div>
      )}

      {alertasAbertos.length > 0 && (
        <Card
          className="mt-3"
          title="Atenção necessária"
          subtitle={`${alertasAbertos.length} ${alertasAbertos.length === 1 ? "item" : "itens"} esperando decisão`}
          actions={
            <Link href="/alertas" className="link-more">
              Ver todos
            </Link>
          }
        >
          <ul className="space-y-2">
            {alertasAbertos.slice(0, 5).map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2.5 transition-colors hover:border-line-strong"
                >
                  <Chip tone={NIVEL_TOM[a.nivel]}>{NIVEL_LABEL[a.nivel]}</Chip>
                  <span className="text-sm text-ink">{a.titulo}</span>
                  {a.clientName && <span className="text-xs text-dim">{a.clientName}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        className="mt-3"
        title="Carteira"
        subtitle="Quem precisa de você hoje, em ordem de faturamento"
        bodyClassName="p-0"
        actions={
          <Link href="/clientes" className="link-more">
            Ver tudo
          </Link>
        }
      >
        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Responsável</th>
                  <th className="num">Faturamento</th>
                  <th className="num">vs. ant.</th>
                  <th className="num">ROAS</th>
                  <th>Saúde</th>
                  <th>Principal pendência</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((c) => {
                  const sc = scores.get(c.id);
                  const doCliente = alertasAbertos.filter((a) => a.clientId === c.id);
                  const roasCliente = c.ads ? (adsPorCliente.get(c.id) ?? 0) / c.ads : 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clientes/${c.id}`} className="font-medium text-ink hover:text-brand">
                          {c.name}
                        </Link>
                        <StatusChip value={c.status} />
                      </td>
                      <td>
                        {c.owner_name ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={c.owner_name} color={c.owner_color} size={22} />
                            <span className="text-xs text-muted">{c.owner_name.split(" ")[0]}</span>
                          </span>
                        ) : (
                          <Chip tone="bad">definir</Chip>
                        )}
                      </td>
                      <td className="num font-semibold text-ink">{brlShort(c.revenue)}</td>
                      <td className="num">
                        <Delta value={growth(c.revenue, c.prev_revenue)} />
                      </td>
                      <td className="num text-muted">{roasCliente ? `${roasCliente.toFixed(2)}x` : "—"}</td>
                      <td>{sc && <ScoreChip score={sc} />}</td>
                      <td className="text-xs text-muted">
                        {doCliente.length ? (
                          <Link href={doCliente[0].href} className="hover:text-brand">
                            {doCliente[0].titulo}
                          </Link>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Carteira vazia" hint="Cadastre o primeiro cliente para começar." />
          </div>
        )}
      </Card>

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
        <div className="space-y-3">
          <SaudeIntegracoes
            conectadas={saude.conectadas}
            comErro={saude.comErro}
            paradas={saude.paradas}
            ultimoCron={saude.ultimoCron}
          />

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
