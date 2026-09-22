import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeClient, listUsers, requireUser } from "@/lib/auth";
import { Procedencia } from "@/components/procedencia";
import { SerieDiaria } from "@/components/serie-diaria";
import { calcularScore } from "@/lib/score";
import { can } from "@/lib/permissions";
import {
  clientAds,
  clientMarketplaces,
  clientNotes,
  clientSnapshots,
  clientTeam,
  marketplaceBreakdown,
  monthlySeries,
  adsTotals,
  avaliarOnboardingDoCliente,
  clientGoals,
  getClient,
  goalHistory,
  penalidades,
  periodoDe,
  procedenciaDoMes,
  saudeContasML,
  serieDiaria,
  tasks,
  totalsForClient,
  indicadoresDosClientes,
} from "@/lib/queries";
import { addMonths, brl, brlShort, currentMonth, dateBR, lastMonths, monthLabel, num, pct, variacaoMensal } from "@/lib/format";
import { Avatar, Card, Chip, Delta, PageHeader, Stat, StatusChip } from "@/components/ui";
import { RevenueProfitChart, ChartLegend } from "@/components/charts";
import { integrationStatus } from "@/lib/integrations";
import { TabVisao } from "./tab-visao";
import { TabFinanceiro } from "./tab-financeiro";
import { TabMarketplaces } from "./tab-marketplaces";
import { TabAds } from "./tab-ads";
import { TabMetas } from "./tab-metas";
import { TabHistorico } from "./tab-historico";
import { TabEquipe } from "./tab-equipe";
import { TabDados } from "./tab-dados";

// a sincronização com os marketplaces pode levar dezenas de segundos
export const maxDuration = 60;

const TABS = [
  { key: "visao", label: "Visão geral" },
  { key: "financeiro", label: "Resultados" },
  { key: "marketplaces", label: "Lojas" },
  { key: "ads", label: "Ads" },
  { key: "metas", label: "Metas" },
  { key: "historico", label: "Histórico" },
  { key: "equipe", label: "Equipe" },
  { key: "dados", label: "Dados cadastrais" },
];

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    mes?: string;
    ok?: string;
    sync?: string;
    acesso?: string;
    erro?: string;
    periodo?: string;
    de?: string;
    ate?: string;
  }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const client = await getClient(id);
  if (!client) notFound();
  // um cliente fora da carteira da pessoa não existe para ela
  if (!(await canSeeClient(user, client.id))) notFound();

  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "visao";

  // histórico diário: atalho padrão é o mês de referência
  const atalho = sp.periodo ?? "mes";
  const periodo = periodoDe(atalho, ref, sp.de, sp.ate);

  // Mais de quinze consultas independentes. Em fila, a tela esperava a
  // soma de todas; disparadas juntas, espera a mais lenta.
  const [
    totals,
    prev,
    series,
    team,
    accounts,
    snapshots,
    notes,
    ads,
    clientTasks,
    breakdown,
    procedencia,
    metas,
    metasHistorico,
    adsMes,
    onboarding,
    dias,
    penalidadesCliente,
    contasML,
    allUsers,
    integracoes,
  ] = await Promise.all([
    totalsForClient(client.id, ref),
    totalsForClient(client.id, addMonths(ref, -1)),
    monthlySeries(6, client.id),
    clientTeam(client.id),
    clientMarketplaces(client.id),
    clientSnapshots(client.id, 12),
    clientNotes(client.id),
    clientAds(client.id, 300),
    tasks({ clientId: client.id }),
    marketplaceBreakdown(ref, client.id),
    procedenciaDoMes(ref, { clientId: client.id }),
    clientGoals(client.id, ref),
    goalHistory(client.id, 12),
    adsTotals(client.id, ref),
    avaliarOnboardingDoCliente(client.id, ref),
    serieDiaria(periodo.inicio, periodo.fim, { clientId: client.id }),
    penalidades({ clientId: client.id, status: "aberta" }),
    saudeContasML(undefined, client.id),
    listUsers(),
    integrationStatus(),
  ]);

  // no mês corrente, o anterior só até o mesmo dia: meio mês contra o mês
  // cheio punha o cliente "em queda" até o dia 30
  const corrente = ref === currentMonth();
  const anteriorComparavel = corrente
    ? ((await indicadoresDosClientes(ref, [client.id])).get(client.id)?.prev_revenue_comparavel ?? null)
    : prev.revenue;

  const metaGeral = metas.find((m) => m.marketplace === null);
  const realizado = {
    revenue: totals.revenue,
    orders: totals.orders,
    profit: totals.profit,
    ads: adsMes.invested,
    adsRevenue: adsMes.revenue,
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const score = calcularScore({
    revenue: totals.revenue,
    prevRevenue: prev.revenue,
    profit: totals.profit,
    goal: metaGeral,
    realizado,
    onboarding,
    status: client.status,
    temResponsavel: Boolean(client.owner_id),
    contasComProblema: accounts.filter(
      (a) =>
        a.status === "erro" ||
        (a.status === "conectado" &&
          (!a.last_sync_at || new Date(a.last_sync_at).getTime() < Date.now() - 3 * 864e5)),
    ).length,
    contasConectadas: accounts.filter((a) => a.status === "conectado").length,
    tarefasAtrasadas: clientTasks.filter((t) => t.status !== "concluida" && t.due_date && t.due_date < hoje).length,
    penalidades: {
      criticas: penalidadesCliente.filter((p) => p.severity === "critico").length,
      total: penalidadesCliente.filter((p) => p.severity !== "informativo").length,
    },
  });
  const marketplacesDisponiveis = integracoes.filter((i) => i.configured).map((i) => i.marketplace);
  const manager = can(user, "clientes.gerenciar");
  const margin = totals.revenue ? totals.profit / totals.revenue : 0;
  // as campanhas do mês têm o que a API leu e o que foi lançado à mão; o
  // fechamento sincronizado só tem o primeiro
  const adsDoMes = Math.max(totals.ads, adsMes.invested);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/clientes" className="hover:text-brand">Clientes</Link>}
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip value={client.status} />
            {client.segment && <Chip>{client.segment}</Chip>}
            <Chip tone="brand">{client.tier}</Chip>
            {client.started_at && <span className="text-xs text-dim">cliente desde {dateBR(client.started_at)}</span>}
          </span>
        }
        actions={
          <>
            <Link href={`/tarefas?cliente=${client.id}`} className="btn btn-ghost">
              Tarefas ({clientTasks.filter((t) => t.status !== "concluida").length})
            </Link>
            <Link href={`/clientes/${client.id}/relatorio?mes=${ref}`} className="btn btn-ghost">
              Relatório
            </Link>
            <Link href={`/clientes/${client.id}?tab=historico`} className="btn btn-accent">
              + Anotação
            </Link>
          </>
        }
      />

      {sp.ok && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Alterações salvas.
        </div>
      )}
      {sp.erro === "env" && (
        <div className="flash mb-4 rounded-[10px] bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn">
          A conexão com essa loja ainda não foi liberada. Avise o administrador do Elleva.
        </div>
      )}
      {sp.sync && (
        <div
          className={`flash mb-4 rounded-lg border px-4 py-2.5 text-sm font-medium ${
            sp.sync === "ok"
              ? "border-ok/30 bg-ok-soft text-ok"
              : sp.sync === "parcial"
                ? "border-warn/30 bg-warn-soft text-warn"
                : "border-bad/30 bg-bad-soft text-bad"
          }`}
        >
          {sp.sync === "ok"
            ? "Sincronização concluída."
            : sp.sync === "parcial"
              ? "Carga em andamento: parte dos pedidos já foi lida e o resto continua na próxima rodada."
              : "Falha na sincronização — veja o detalhe na conta."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Faturamento · ${monthLabel(ref)}`}
          value={brl(totals.revenue)}
          delta={anteriorComparavel === null ? null : variacaoMensal(totals.revenue, anteriorComparavel)}
          hint={corrente ? "vs. mesmo período do mês anterior" : "vs. mês anterior"}
          tone="brand"
        />
        <Stat label="Lucro" value={brl(totals.profit)} hint={`margem ${pct(margin)}`} tone="accent" />
        <Stat label="Impostos" value={brl(totals.tax)} hint={`${num(totals.orders)} pedidos`} tone="info" />
        <Stat
          label="Ads no mês"
          value={brl(adsDoMes)}
          hint={totals.revenue ? `${pct(adsDoMes / totals.revenue)} do faturamento` : "—"}
          tone="warn"
        />
      </div>

      <nav className="mt-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/clientes/${client.id}?tab=${t.key}&mes=${ref}`}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-accent text-ink"
                : "border-transparent text-dim hover:border-line-strong hover:text-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "visao" && (
          <TabVisao
            client={client}
            team={team}
            accounts={accounts}
            notes={notes.slice(0, 5)}
            manager={manager}
            destaqueAcesso={sp.acesso}
            marketplacesDisponiveis={marketplacesDisponiveis}
            refMonth={ref}
            onboarding={onboarding}
            score={score}
            penalidades={penalidadesCliente}
            contasML={contasML}
            tasks={clientTasks}
            breakdown={breakdown}
            chart={
              series.some((s) => s.revenue > 0) ? (
                <Card
                  title="Faturamento e lucro — 6 meses"
                  actions={
                    <ChartLegend
                      items={[
                        { label: "Faturamento", color: "var(--primary)" },
                        { label: "Lucro", color: "var(--accent)" },
                      ]}
                    />
                  }
                >
                  <RevenueProfitChart data={series} height={180} />
                </Card>
              ) : null
            }
          />
        )}
        {tab === "financeiro" && (
          <div className="mb-3">
            <SerieDiaria
              dias={dias}
              label={periodo.label}
              atalhoAtivo={atalho}
              hrefBase={(a) => `/clientes/${client.id}?tab=financeiro&mes=${ref}&periodo=${a}`}
              metaAds={metaGeral?.ads_budget ?? null}
            />
          </div>
        )}
        {tab === "financeiro" && (
          <TabFinanceiro client={client} snapshots={snapshots} accounts={accounts} refMonth={ref} months={months} />
        )}
        {tab === "marketplaces" && <TabMarketplaces client={client} accounts={accounts} refMonth={ref} manager={manager} />}
        {tab === "ads" && (
          <TabAds client={client} entries={ads} accounts={accounts} snapshots={snapshots} refMonth={ref} />
        )}
        {tab === "metas" && (
          <TabMetas
            client={client}
            goal={metaGeral}
            porLoja={metas.filter((m) => m.marketplace !== null)}
            accounts={accounts}
            realizado={realizado}
            refMonth={ref}
            historico={metasHistorico}
            manager={manager}
          />
        )}
        {tab === "historico" && <TabHistorico client={client} notes={notes} currentUserId={user.id} manager={manager} />}
        {tab === "equipe" && <TabEquipe client={client} team={team} users={allUsers} manager={manager} />}
        {tab === "dados" && <TabDados client={client} users={allUsers} manager={manager} />}
      </div>

      <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-center text-[0.7rem] text-dim">
        <Procedencia
          origem={procedencia.origem}
          atualizadoEm={procedencia.atualizadoEm}
          contas={procedencia.contas}
          comDados={procedencia.comDados}
        />
        <span>
          · faturamento acumulado de {brlShort(snapshots.reduce((s, r) => s + r.revenue, 0))} nos últimos 12 meses
        </span>
      </p>
    </>
  );
}
