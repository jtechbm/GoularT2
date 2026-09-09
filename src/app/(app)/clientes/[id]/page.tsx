import Link from "next/link";
import { notFound } from "next/navigation";
import { isManager, listUsers, requireUser } from "@/lib/auth";
import {
  clientAds,
  clientMarketplaces,
  clientNotes,
  clientSnapshots,
  clientTeam,
  marketplaceBreakdown,
  monthlySeries,
  getClient,
  tasks,
  totalsForClient,
} from "@/lib/queries";
import { addMonths, brl, brlShort, currentMonth, dateBR, lastMonths, num, pct } from "@/lib/format";
import { Avatar, Card, Chip, Delta, PageHeader, Stat, StatusChip } from "@/components/ui";
import { RevenueProfitChart, ChartLegend } from "@/components/charts";
import { TabVisao } from "./tab-visao";
import { TabFinanceiro } from "./tab-financeiro";
import { TabMarketplaces } from "./tab-marketplaces";
import { TabAds } from "./tab-ads";
import { TabHistorico } from "./tab-historico";
import { TabEquipe } from "./tab-equipe";
import { TabDados } from "./tab-dados";

// a sincronização com os marketplaces pode levar dezenas de segundos
export const maxDuration = 60;

const TABS = [
  { key: "visao", label: "Visão geral" },
  { key: "financeiro", label: "Financeiro" },
  { key: "marketplaces", label: "Marketplaces" },
  { key: "ads", label: "Ads" },
  { key: "historico", label: "Histórico" },
  { key: "equipe", label: "Equipe" },
  { key: "dados", label: "Dados cadastrais" },
];

function growth(current: number, previous: number): number {
  if (!previous) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mes?: string; ok?: string; sync?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const client = await getClient(id);
  if (!client) notFound();

  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "visao";

  const totals = await totalsForClient(client.id, ref);
  const prev = await totalsForClient(client.id, addMonths(ref, -1));
  const series = await monthlySeries(6, client.id);
  const team = await clientTeam(client.id);
  const accounts = await clientMarketplaces(client.id);
  const snapshots = await clientSnapshots(client.id, 12);
  const notes = await clientNotes(client.id);
  const ads = await clientAds(client.id);
  const clientTasks = await tasks({ clientId: client.id });
  const breakdown = await marketplaceBreakdown(ref, client.id);
  const allUsers = await listUsers();
  const manager = isManager(user);
  const margin = totals.revenue ? totals.profit / totals.revenue : 0;

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
      {sp.sync && (
        <div
          className={`flash mb-4 rounded-lg border px-4 py-2.5 text-sm font-medium ${
            sp.sync === "ok" ? "border-ok/30 bg-ok-soft text-ok" : "border-bad/30 bg-bad-soft text-bad"
          }`}
        >
          {sp.sync === "ok" ? "Sincronização concluída." : "Falha na sincronização — veja o detalhe na conta."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Faturamento · ${ref}`}
          value={brl(totals.revenue)}
          delta={growth(totals.revenue, prev.revenue)}
          tone="brand"
        />
        <Stat label="Lucro" value={brl(totals.profit)} hint={`margem ${pct(margin)}`} tone="accent" />
        <Stat label="Impostos" value={brl(totals.tax)} hint={`${num(totals.orders)} pedidos`} tone="info" />
        <Stat
          label="Ads no mês"
          value={brl(totals.ads)}
          hint={totals.revenue ? `${pct(totals.ads / totals.revenue)} do faturamento` : "—"}
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
          <TabFinanceiro client={client} snapshots={snapshots} accounts={accounts} refMonth={ref} months={months} />
        )}
        {tab === "marketplaces" && <TabMarketplaces client={client} accounts={accounts} refMonth={ref} manager={manager} />}
        {tab === "ads" && <TabAds client={client} entries={ads} accounts={accounts} />}
        {tab === "historico" && <TabHistorico client={client} notes={notes} currentUserId={user.id} manager={manager} />}
        {tab === "equipe" && <TabEquipe client={client} team={team} users={allUsers} manager={manager} />}
        {tab === "dados" && <TabDados client={client} users={allUsers} manager={manager} />}
      </div>

      <p className="mt-6 text-center text-[0.7rem] text-dim">
        Atualizado em {dateBR(client.updated_at)} · faturamento acumulado de {brlShort(
          snapshots.reduce((s, r) => s + r.revenue, 0),
        )} nos últimos 12 meses
      </p>
    </>
  );
}
