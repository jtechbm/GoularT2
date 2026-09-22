import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { PERMISSION_LABEL, type Permission } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import {
  clientRows,
  leaderboard,
  marketplaceBreakdown,
  monthlySeries,
  tasks,
  ownStoreTotals,
  integrationHealth,
  procedenciaDoMes,
  scoresEmLote,
  alertasDaCarteira,
  indicadoresDosClientes,
} from "@/lib/queries";
import { brl, brlShort, currentMonth, dateBR, lastMonths, num, pct, variacaoMensal } from "@/lib/format";
import { lerOrdem } from "@/lib/ordem-clientes";
import { roasDoTotal, textoRoas } from "@/lib/ads-analise";
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
import { IconBarChart, IconPlus, IconReceipt, IconTrendUp, IconUsers } from "@/components/icons";
import { MonthPicker } from "@/components/month-picker";
import { SaudeIntegracoes } from "@/components/saude-integracoes";
import { Procedencia } from "@/components/procedencia";
import { montarLinhas, TabelaClientes, type LinhaCliente } from "@/components/tabela-clientes";
import { NIVEL_TOM, NIVEL_LABEL } from "@/lib/alertas";
import { atrasada } from "@/components/prazo-tarefa";
import { marketplaceLabel } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; sem_acesso?: string; ordem?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const months = lastMonths(12);
  const ref = params.mes && months.includes(params.mes) ? params.mes : currentMonth();
  const corrente = ref === currentMonth();

  // membro só enxerga os clientes atribuídos a ele; gestor e admin, a carteira toda
  const escopo = await visibleClientIds(user);
  const verLojasProprias = can(user, "lojas.proprias");

  // Tudo que não depende de outra consulta sai junto. Em fila, a tela
  // esperava a soma de todas; em paralelo, espera a mais lenta.
  const [rows, propria, series, byMarketplace, openTasks, emAndamento, board, saude, procedencia, indicadores] =
    await Promise.all([
      clientRows(ref, "cliente", escopo),
      verLojasProprias ? ownStoreTotals(ref) : Promise.resolve(null),
      monthlySeries(12, undefined, escopo),
      marketplaceBreakdown(ref, undefined, escopo),
      tasks({ status: "disponivel" }),
      tasks({ statuses: ["assumida", "em_andamento", "em_revisao"] }),
      leaderboard(),
      integrationHealth(escopo),
      procedenciaDoMes(ref, { scope: escopo }),
      indicadoresDosClientes(ref, escopo),
    ]);

  const mrr = rows
    .filter((r) => r.status !== "encerrado" && r.status !== "pausado")
    .reduce((s, r) => s + r.monthly_fee, 0);

  const linhas = montarLinhas(rows, indicadores, ref);
  const ordem = lerOrdem(params.ordem);
  const hrefOrdem = (o: string) => {
    const p = new URLSearchParams();
    if (params.mes) p.set("mes", params.mes);
    p.set("ordem", o);
    return `/?${p}#clientes`;
  };

  // score e alertas dependem da carteira; os dois saem juntos, e os alertas
  // reaproveitam a carteira já carregada em vez de buscá-la de novo
  const [scores, alertas] = await Promise.all([scoresEmLote(rows, ref), alertasDaCarteira(ref, escopo, rows)]);
  const alertasAbertos = alertas.filter((a) => !a.resolvido);

  // os quatro números saem da mesma lista da tabela: somar de outra fonte
  // dava total que não batia com as linhas logo abaixo
  const soma = (f: (l: LinhaCliente) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const faturamento = soma((l) => l.revenue);
  const faturamentoAnt = soma((l) => l.prev_revenue);
  const investido = soma((l) => l.ads);
  const receitaAds = soma((l) => l.ads_revenue);
  const investidoComRetorno = soma((l) => l.ads_com_retorno);
  const vendas30 = soma((l) => l.vendas30);
  const vendas30Ant = soma((l) => l.vendas30_ant);
  const advertencias = soma((l) => l.advertencias);
  const criticas = soma((l) => l.advertencias_criticas);
  const roasCarteira = roasDoTotal(investido, investidoComRetorno, receitaAds).roas ?? 0;
  const faturamentoDoAds = soma((l) => (l.ads ? l.revenue : 0));
  // canal sem leitura mas com valor lançado à mão já não está faltando
  const adsIncompleto = linhas.some((l) => l.ads_pendente && !l.ads_manual);

  // crescimento só conta com base mínima: R$ 50 virando R$ 500 é +900% e
  // não diz nada a quem olha a carteira
  const comVariacao = linhas
    .filter((l) => l.prev_revenue >= 1000)
    .map((l) => ({ l, v: variacaoMensal(l.revenue, l.prev_revenue)! }));
  const crescimentos = comVariacao
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 4);
  const quedas = comVariacao
    .filter((x) => x.v < 0)
    .sort((a, b) => a.v - b.v)
    .slice(0, 4);
  const periodo = corrente ? "até hoje, vs. mesmo período do mês anterior" : "vs. mês anterior";

  const emOnboarding = rows.filter((r) => r.status === "onboarding").length;
  const semResponsavel = rows.filter((r) => !r.owner_id).length;
  const totalRevenue = byMarketplace.reduce((s, m) => s + m.revenue, 0);
  const myTasks = emAndamento.filter((t) => t.assignee_id === user.id);
  const tarefasAtrasadas = emAndamento.filter(atrasada);

  // quando a pessoa cai aqui por falta de permissão, a tela diz qual foi
  const semAcesso = params.sem_acesso
    ? PERMISSION_LABEL[params.sem_acesso as Permission] ?? "esta área"
    : null;

  return (
    <>
      {semAcesso && (
        <div className="mb-4 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">Você não tem acesso a essa parte do sistema.</p>
          <p className="mt-1 text-xs text-muted">
            A permissão que falta é “{semAcesso}”. Quem libera é o admin, na tela de Equipe. Trouxemos você para o
            Dashboard.
          </p>
        </div>
      )}
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
          <>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
            {can(user, "clientes.gerenciar") && (
              <Link href="/clientes/novo" className="btn btn-primary">
                <IconPlus size={16} />
                Novo cliente
              </Link>
            )}
          </>
        }
      />

      {/* quatro números, e cada um leva ao detalhe: a tela inicial é o
          resumo, e o que explica o número está a um clique */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Faturamento da carteira"
          value={brl(faturamento)}
          delta={variacaoMensal(faturamento, faturamentoAnt)}
          hint={corrente ? "vs. mesmo período do mês anterior" : "vs. mês anterior"}
          tone="brand"
          href={hrefOrdem("faturamento")}
          icon={<IconBarChart size={20} />}
        />
        <Stat
          label="Investido em Ads"
          value={brl(investido)}
          hint={
            investido
              ? `${faturamento ? `${pct(investido / faturamento)} do faturamento · ` : ""}${textoRoas(investido, investidoComRetorno, receitaAds, faturamentoDoAds)}${adsIncompleto ? " · falta canal" : ""}`
              : adsIncompleto
                ? "falta ler o Ads de algum canal"
                : "nenhum investimento no mês"
          }
          tone={adsIncompleto ? "warn" : roasCarteira >= 3 ? "ok" : roasCarteira > 0 ? "warn" : "neutral"}
          href={hrefOrdem("investido")}
          icon={<IconTrendUp size={20} />}
        />
        <Stat
          label="Vendas nos últimos 30 dias"
          value={num(vendas30)}
          delta={variacaoMensal(vendas30, vendas30Ant)}
          hint="pedidos · vs. 30 dias anteriores"
          tone="info"
          href={hrefOrdem("vendas30")}
          icon={<IconReceipt size={20} />}
        />
        <Stat
          label="Advertências"
          value={num(advertencias)}
          hint={
            advertencias
              ? `${criticas ? `${criticas} críticas · ` : ""}penalidades abertas nos marketplaces`
              : "nenhuma penalidade aberta"
          }
          tone={criticas ? "bad" : advertencias ? "warn" : "ok"}
          href="/penalidades"
          icon={<IconUsers size={20} />}
        />
      </div>

      {/* o estado da carteira cabe numa linha; vira link só o que pede ação */}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>{num(rows.length)} clientes na carteira</span>
        {emOnboarding > 0 && (
          <Link href="/clientes?status=onboarding" className="hover:text-brand">
            {emOnboarding} em onboarding
          </Link>
        )}
        {semResponsavel > 0 && (
          <Link href="/clientes" className="text-bad hover:underline">
            {semResponsavel} sem responsável
          </Link>
        )}
        {propria && propria.stores > 0 && (
          <span>
            Lojas do Kadu: <span className="font-medium text-ink">{brlShort(propria.revenue)}</span> · lucro{" "}
            {brlShort(propria.profit)}
          </span>
        )}
        <span>Fee recorrente: {brlShort(mrr)}</span>
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Maiores crescimentos" subtitle={periodo}>
          <ListaVariacao itens={crescimentos} vazio="Nenhum cliente cresceu no período." />
        </Card>
        <Card title="Maiores quedas" subtitle={periodo}>
          <ListaVariacao itens={quedas} vazio="Nenhum cliente caiu no período." />
        </Card>
        <Card
          title="Atenção necessária"
          subtitle={
            alertasAbertos.length
              ? `${alertasAbertos.length} ${alertasAbertos.length === 1 ? "item" : "itens"} esperando decisão`
              : "nada esperando decisão"
          }
          actions={
            alertasAbertos.length > 0 && (
              <Link href="/alertas" className="link-more">
                Ver todos
              </Link>
            )
          }
        >
          {alertasAbertos.length ? (
            <ul className="space-y-1.5">
              {alertasAbertos.slice(0, 4).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-2 text-xs hover:text-brand">
                    <Chip tone={NIVEL_TOM[a.nivel]}>{NIVEL_LABEL[a.nivel]}</Chip>
                    <span className="min-w-0 truncate text-ink">{a.titulo}</span>
                    {a.clientName && <span className="shrink-0 text-dim">{a.clientName}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">Tudo em dia.</p>
          )}
        </Card>
      </div>

      <div id="clientes" className="scroll-mt-4" />
      <Card
        className="mt-3"
        title="Clientes"
        subtitle="Clique numa coluna para ordenar, ou no nome para ver o detalhe"
        bodyClassName="p-0"
        actions={
          <Link href="/clientes" className="link-more">
            Filtrar e gerenciar
          </Link>
        }
      >
        {rows.length ? (
          <TabelaClientes linhas={linhas} ordem={ordem} href={hrefOrdem} scores={scores} />
        ) : (
          <div className="p-5">
            <Empty title="Carteira vazia" hint="Cadastre o primeiro cliente para começar." />
          </div>
        )}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Faturamento e lucro — últimos 12 meses"
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
          {tarefasAtrasadas.length > 0 && (
            <Link
              href="/tarefas?aba=registro"
              className="mt-2 flex items-center justify-between rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-xs text-bad hover:opacity-90"
            >
              <span>
                {tarefasAtrasadas.length} {tarefasAtrasadas.length === 1 ? "tarefa estourou" : "tarefas estouraram"} o prazo
              </span>
              <span>ver registro →</span>
            </Link>
          )}
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

      <p className="mt-4 text-center text-xs text-dim">
        Mês de referência: {dateBR(`${ref}-01`)} · dados consolidados de fechamentos manuais e sincronizações de API
      </p>
    </>
  );
}

function ListaVariacao({ itens, vazio }: { itens: { l: LinhaCliente; v: number }[]; vazio: string }) {
  if (!itens.length) return <p className="text-sm text-dim">{vazio}</p>;
  return (
    <ul className="space-y-1.5">
      {itens.map(({ l, v }) => (
        <li key={l.id}>
          <Link href={`/clientes/${l.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-brand">
            <span className="min-w-0 truncate text-ink">{l.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted">{brlShort(l.revenue)}</span>
              <Delta value={v} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
