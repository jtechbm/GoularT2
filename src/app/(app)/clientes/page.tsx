import Link from "next/link";
import { Suspense } from "react";
import { visibleClientIds, requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { avaliarOnboardingEmLote, clientRows, indicadoresDosClientes, scoresEmLote } from "@/lib/queries";
import { brlShort, currentMonth, lastMonths, pct } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { montarLinhas, TabelaClientes } from "@/components/tabela-clientes";
import { lerOrdem } from "@/lib/ordem-clientes";
import { roasDaTela, textoAds } from "@/lib/ads-analise";
import { CLIENT_STATUS, MARKETPLACES } from "@/lib/types";

/**
 * Atalhos para as perguntas que o Kadu mais faz da lista. Cada um é só uma
 * ordem (e às vezes um filtro) pronta: o mesmo que clicar na coluna.
 */
const ATALHOS: { rotulo: string; ordem: string; soAds?: boolean }[] = [
  { rotulo: "Mais investem em Ads", ordem: "investido" },
  { rotulo: "Melhor ROAS", ordem: "roas", soAds: true },
  { rotulo: "Pior ROAS", ordem: "-roas", soAds: true },
  { rotulo: "Maior % em Ads", ordem: "pct_ads", soAds: true },
  { rotulo: "Mais cresceram", ordem: "crescimento" },
  { rotulo: "Com advertências", ordem: "advertencias" },
];

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    q?: string;
    status?: string;
    resp?: string;
    canal?: string;
    ordem?: string;
    ads?: string;
  }>;
}) {
  const user = await requirePermission("clientes.ver");
  const params = await searchParams;
  const months = lastMonths(12);
  const ref = params.mes && months.includes(params.mes) ? params.mes : currentMonth();

  const query = (params.q ?? "").toLowerCase().trim();
  const status = params.status ?? "";
  const canal = params.canal ?? "";
  const onlyMine = params.resp === "eu";
  const soAds = params.ads === "1";
  const ordem = lerOrdem(params.ordem);

  const escopo = await visibleClientIds(user);
  const semClientesVisiveis = escopo !== null && escopo.length === 0;
  const [todos, indicadores] = await Promise.all([
    clientRows(ref, "cliente", escopo),
    indicadoresDosClientes(ref, escopo),
  ]);
  // onboarding e score só dependem da carteira: saem juntos
  const [onboardings, scores] = await Promise.all([
    avaliarOnboardingEmLote(todos.filter((c) => c.status === "onboarding"), ref),
    scoresEmLote(todos, ref),
  ]);

  const linhas = montarLinhas(todos, indicadores, ref).filter((c) => {
    if (status && c.status !== status) return false;
    if (canal && !c.marketplaces.split(",").includes(canal)) return false;
    if (onlyMine && c.owner_id !== user.id) return false;
    if (soAds && !c.ads) return false;
    if (query && ![c.name, c.trade_name, c.segment, c.owner_name].some((v) => v?.toLowerCase().includes(query)))
      return false;
    return true;
  });

  const totais = linhas.reduce(
    (acc, c) => ({
      revenue: acc.revenue + c.revenue,
      profit: acc.profit + c.profit,
      ads: acc.ads + c.ads,
      adsRevenue: acc.adsRevenue + c.ads_revenue,
      comRetorno: acc.comRetorno + c.ads_com_retorno,
      fee: acc.fee + (c.status === "encerrado" ? 0 : c.monthly_fee),
    }),
    { revenue: 0, profit: 0, ads: 0, adsRevenue: 0, comRetorno: 0, fee: 0 },
  );

  /** URL da lista com os filtros atuais, trocando só o que vier em `extra` */
  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ mes: ref });
    if (query) p.set("q", query);
    if (status) p.set("status", status);
    if (canal) p.set("canal", canal);
    if (onlyMine) p.set("resp", "eu");
    if (soAds) p.set("ads", "1");
    if (params.ordem) p.set("ordem", params.ordem);
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k);
    return `/clientes?${p}`;
  };

  const chip = (label: string, href: string, active: boolean) => (
    <Link key={label} href={href} className={`chip ${active ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${linhas.length} de ${todos.length} clientes na carteira`}
        actions={
          <>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
            {can(user, "clientes.cadastrar") && (
              <Link href="/clientes/novo" className="btn btn-primary">
                + Novo cliente
              </Link>
            )}
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento (filtro)" value={brlShort(totais.revenue)} tone="brand" />
        <Stat
          label="Lucro (filtro)"
          value={brlShort(totais.profit)}
          hint={totais.revenue ? `margem ${pct(totais.profit / totais.revenue)}` : "—"}
          tone="accent"
        />
        <Stat
          label="Investido em Ads (filtro)"
          value={brlShort(totais.ads)}
          hint={
            totais.ads
              ? textoAds(
                  totais.ads,
                  totais.revenue,
                  { ads: linhas.reduce((s, c) => s + c.ads_3m, 0), faturamento: linhas.reduce((s, c) => s + c.fat_3m, 0) },
                  roasDaTela(totais.ads, totais.comRetorno, totais.adsRevenue, linhas.reduce((s, c) => s + (c.ads ? c.revenue : 0), 0)),
                )
              : "nenhum investimento no mês"
          }
          tone="warn"
          href={base({ ordem: "investido" })}
        />
        <Stat label="Fee recorrente" value={brlShort(totais.fee)} hint="contratos vigentes" tone="ok" />
      </div>

      <Card bodyClassName="p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" action="/clientes" method="get">
          <input type="hidden" name="mes" value={ref} />
          {params.ordem && <input type="hidden" name="ordem" value={params.ordem} />}
          {onlyMine && <input type="hidden" name="resp" value="eu" />}
          {soAds && <input type="hidden" name="ads" value="1" />}
          <div className="min-w-52 flex-1">
            <label className="label">Buscar</label>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              className="input"
              placeholder="nome, segmento ou responsável…"
            />
          </div>
          <div className="w-40">
            <label className="label">Status</label>
            <select name="status" defaultValue={status} className="select">
              <option value="">Todos</option>
              {CLIENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="label">Canal</label>
            <select name="canal" defaultValue={canal} className="select">
              <option value="">Todos</option>
              {MARKETPLACES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">
            Filtrar
          </button>
          <div className="flex items-center gap-1.5">
            {chip("Todos", base({ resp: "" }), !onlyMine)}
            {chip("Meus clientes", base({ resp: "eu" }), onlyMine)}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
          <span className="mr-1 text-xs text-dim">Ordenar por:</span>
          {ATALHOS.map((a) =>
            chip(
              a.rotulo,
              base({ ordem: a.ordem, ads: a.soAds ? "1" : "" }),
              params.ordem === a.ordem && soAds === Boolean(a.soAds),
            ),
          )}
          {(params.ordem || soAds) && (
            <Link href={base({ ordem: "", ads: "" })} className="ml-1 text-xs text-dim hover:text-brand">
              limpar
            </Link>
          )}
        </div>

        {linhas.length ? (
          <TabelaClientes
            linhas={linhas}
            ordem={ordem}
            href={(o) => base({ ordem: o })}
            scores={scores}
            onboardings={onboardings}
            completa
          />
        ) : (
          <div className="p-5">
            <Empty
              title={
                todos.length
                  ? "Nenhum cliente para este filtro"
                  : semClientesVisiveis
                    ? "Nenhum cliente seu ainda"
                    : "Carteira vazia"
              }
              hint={
                todos.length
                  ? soAds
                    ? "Nenhum cliente com investimento em Ads neste mês e filtro."
                    : "Ajuste a busca, o status ou o canal para ver outros clientes."
                  : semClientesVisiveis
                    ? "Cadastre um cliente ou peça ao super admin para atribuir um cliente existente a você."
                    : "Cadastre o primeiro cliente para começar."
              }
              action={
                can(user, "clientes.cadastrar") && !todos.length ? (
                  <Link href="/clientes/novo" className="btn btn-primary btn-sm">
                    Cadastrar cliente
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}
      </Card>
    </>
  );
}
