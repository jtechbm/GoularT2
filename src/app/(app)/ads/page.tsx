import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import {
  adsRows,
  clientOptions,
  goalsForMonth,
  periodoDe,
  procedenciaDoMes,
  serieDiaria,
} from "@/lib/queries";
import { brl, brlShort, currentMonth, lastMonths, monthLabel, num, origemLabel, pct } from "@/lib/format";
import { Card, Chip, Empty, Field, MarketplaceChip, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { Procedencia } from "@/components/procedencia";
import { SerieDiaria } from "@/components/serie-diaria";
import { createAdsAction, deleteAdsAction } from "@/lib/actions/ads";
import { analisarCampanha, ordenarPorDesempenho, resumirAds } from "@/lib/ads-analise";
import { MARKETPLACES, marketplaceLabel } from "@/lib/types";

function Metrica({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-[0.65rem] uppercase tracking-wide text-dim">{label}</div>
      <div className="text-base font-semibold text-ink">{valor}</div>
      {hint && <div className="text-[0.65rem] text-dim">{hint}</div>}
    </div>
  );
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    cliente?: string;
    canal?: string;
    campanha?: string;
    periodo?: string;
    ok?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();

  const escopo = await visibleClientIds(user);
  const atalho = sp.periodo ?? "mes";
  const periodo = periodoDe(atalho, ref, undefined, undefined);

  const linhas = await adsRows({ refMonth: ref, clientId: sp.cliente, marketplace: sp.canal, scope: escopo });
  const clients = await clientOptions(escopo);
  const procedencia = await procedenciaDoMes(ref, { scope: escopo });
  const dias = await serieDiaria(periodo.inicio, periodo.fim, {
    clientId: sp.cliente,
    marketplace: sp.canal,
    scope: escopo,
  });
  const metas = await goalsForMonth(ref, escopo);

  const filtradas = sp.campanha
    ? linhas.filter((l) => (l.campaign ?? "").toLowerCase().includes(sp.campanha!.toLowerCase()))
    : linhas;

  const campanhas = filtradas.map(analisarCampanha);
  const prints = dias.reduce((s, d) => s + d.prints, 0);
  const resumo = resumirAds(campanhas, prints);
  const ranking = ordenarPorDesempenho(campanhas);
  const melhores = ranking.slice(0, 5);
  const piores = [...ranking].reverse().slice(0, 5);

  const automaticos = campanhas.filter((c) => c.automatica).length;
  const manuais = campanhas.length - automaticos;

  // orçamento e metas: quando o filtro é um cliente só, usa a meta dele;
  // com a carteira inteira, soma os tetos de quem tem meta definida
  const metasNoRecorte = sp.cliente ? metas.filter((m) => m.client_id === sp.cliente) : metas;
  const tetoAds = metasNoRecorte.reduce((s, m) => s + (m.ads_budget ?? 0), 0) || null;
  const metaRoas = sp.cliente ? (metasNoRecorte[0]?.min_roas ?? null) : null;
  const metaAcos = sp.cliente ? (metasNoRecorte[0]?.max_acos ?? null) : null;

  // vendas totais x vendas vindas de anúncio, para ver quanto do faturamento
  // depende de mídia paga
  const faturamentoTotal = dias.reduce((s, d) => s + d.revenue, 0);
  const parcelaPaga = faturamentoTotal ? resumo.revenue / faturamentoTotal : null;

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("mes", ref);
    if (sp.cliente) p.set("cliente", sp.cliente);
    if (sp.canal) p.set("canal", sp.canal);
    if (sp.campanha) p.set("campanha", sp.campanha);
    p.set("periodo", atalho);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    return `/ads?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Ads"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Investimento por cliente e loja · {monthLabel(ref)}</span>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Investido"
          value={brl(resumo.invested)}
          hint={
            tetoAds
              ? `${pct(resumo.invested / tetoAds)} do orçamento de ${brlShort(tetoAds)}`
              : origemLabel(automaticos, manuais)
          }
          tone={tetoAds && resumo.invested > tetoAds ? "bad" : "warn"}
        />
        <Stat
          label="Receita atribuída"
          value={brl(resumo.revenue)}
          hint={parcelaPaga !== null ? `${pct(parcelaPaga)} do faturamento` : "sem faturamento no período"}
          tone="brand"
        />
        <Stat
          label="ROAS"
          value={resumo.roas === null ? "—" : `${resumo.roas.toFixed(2)}x`}
          hint={metaRoas ? `meta ${metaRoas.toFixed(2)}x` : resumo.roas === null ? "sem investimento" : "sem meta"}
          tone={
            resumo.roas === null
              ? "neutral"
              : metaRoas
                ? resumo.roas >= metaRoas
                  ? "ok"
                  : "bad"
                : resumo.roas >= 3
                  ? "ok"
                  : "warn"
          }
        />
        <Stat
          label="ACOS"
          value={resumo.acos === null ? "—" : pct(resumo.acos)}
          hint={metaAcos ? `meta até ${pct(metaAcos)}` : resumo.acos === null ? "nenhuma venda atribuída" : "sem meta"}
          tone={
            resumo.acos === null
              ? "bad"
              : metaAcos
                ? resumo.acos <= metaAcos
                  ? "ok"
                  : "bad"
                : resumo.acos <= 0.2
                  ? "ok"
                  : "warn"
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Metrica label="Cliques" valor={num(resumo.clicks)} />
        <Metrica label="Impressões" valor={resumo.prints ? num(resumo.prints) : "—"} />
        <Metrica
          label="CTR"
          valor={resumo.ctr === null ? "—" : pct(resumo.ctr)}
          hint={resumo.ctr === null ? "sem impressões" : undefined}
        />
        <Metrica label="CPC" valor={resumo.cpc === null ? "—" : brl(resumo.cpc)} />
        <Metrica
          label="Conversão"
          valor={resumo.conversao === null ? "—" : pct(resumo.conversao)}
          hint={`${num(resumo.orders)} pedidos`}
        />
      </div>

      <Card className="mt-3" bodyClassName="p-4">
        <form className="grid gap-3 sm:grid-cols-5">
          <input type="hidden" name="mes" value={ref} />
          <input type="hidden" name="periodo" value={atalho} />
          <Field label="Cliente">
            <select name="cliente" defaultValue={sp.cliente ?? ""} className="select">
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Loja">
            <select name="canal" defaultValue={sp.canal ?? ""} className="select">
              <option value="">Todas</option>
              {MARKETPLACES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campanha">
            <input name="campanha" defaultValue={sp.campanha ?? ""} className="input" placeholder="parte do nome" />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <SubmitButton variant="ghost" size="sm">
              Filtrar
            </SubmitButton>
            <Link href={`/ads?mes=${ref}`} className="btn btn-ghost btn-sm">
              Limpar
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-3">
        <SerieDiaria
          dias={dias}
          label={periodo.label}
          atalhoAtivo={atalho}
          hrefBase={(a) => link({ periodo: a })}
          metaAds={tetoAds}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Melhores campanhas" subtitle="Maior retorno por real investido" bodyClassName="p-0">
          <TabelaCampanhas lista={melhores} vazio="Nenhuma campanha com investimento no período." />
        </Card>
        <Card title="Piores campanhas" subtitle="Onde o dinheiro está rendendo menos" bodyClassName="p-0">
          <TabelaCampanhas lista={piores} vazio="Nenhuma campanha com investimento no período." />
        </Card>
      </div>

      <Card className="mt-3" title="Todas as campanhas" bodyClassName="p-0">
        {campanhas.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Cliente</th>
                  <th>Loja</th>
                  <th className="num">Investido</th>
                  <th className="num">Receita</th>
                  <th className="num">ROAS</th>
                  <th className="num">ACOS</th>
                  <th className="num">CPC</th>
                  <th className="num">Conversão</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="text-sm text-ink">{c.nome}</span>
                      <Chip tone={c.automatica ? "info" : "neutral"}>{c.automatica ? "da loja" : "à mão"}</Chip>
                    </td>
                    <td className="text-xs text-muted">{c.clientName}</td>
                    <td>
                      <MarketplaceChip value={c.marketplace} />
                    </td>
                    <td className="num font-semibold text-ink">{brlShort(c.invested)}</td>
                    <td className="num text-muted">{c.revenue ? brlShort(c.revenue) : "—"}</td>
                    <td className={`num font-semibold ${roasTom(c.roas, metaRoas)}`}>
                      {c.roas === null ? "—" : `${c.roas.toFixed(2)}x`}
                    </td>
                    <td className="num text-muted">
                      {c.acos === null ? (
                        c.invested > 0 ? (
                          <Chip tone="bad">sem venda</Chip>
                        ) : (
                          "—"
                        )
                      ) : (
                        pct(c.acos)
                      )}
                    </td>
                    <td className="num text-muted">{c.cpc === null ? "—" : brl(c.cpc)}</td>
                    <td className="num text-muted">{c.conversao === null ? "—" : pct(c.conversao)}</td>
                    <td className="num">
                      {!c.automatica && (
                        <form action={deleteAdsAction}>
                          <input type="hidden" name="entry_id" value={c.id} />
                          <input type="hidden" name="client_id" value={c.clientId} />
                          <input type="hidden" name="redirect_to" value={link({})} />
                          <SubmitButton variant="ghost" size="sm" confirm="Excluir este lançamento?">
                            ✕
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty
              title="Nenhuma campanha no período"
              hint="Com a loja conectada, as campanhas entram sozinhas todo dia."
            />
          </div>
        )}
      </Card>

      <form action={createAdsAction} className="mt-3">
        <Card
          title="Lançar à mão"
          subtitle="Para loja sem conexão ou para completar o que ela não devolve"
          bodyClassName="p-5 pb-0"
        >
          <input type="hidden" name="redirect_to" value={link({})} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cliente *">
              <select name="client_id" required className="select" defaultValue={sp.cliente ?? ""}>
                <option value="">Selecione…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loja">
              <select name="marketplace" className="select" defaultValue={sp.canal ?? "mercado_livre"}>
                {MARKETPLACES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campanha">
              <input name="campaign" className="input" placeholder="nome da campanha" />
            </Field>
            <Field label="Início *">
              <input name="period_start" type="date" required defaultValue={`${ref}-01`} className="input" />
            </Field>
            <Field label="Fim">
              <input name="period_end" type="date" className="input" />
            </Field>
            <Field label="Investido (R$)">
              <input name="invested" inputMode="decimal" className="input" placeholder="0,00" />
            </Field>
            <Field label="Receita atribuída (R$)">
              <input name="revenue" inputMode="decimal" className="input" placeholder="0,00" />
            </Field>
            <Field label="Cliques">
              <input name="clicks" inputMode="numeric" className="input" />
            </Field>
            <Field label="Pedidos">
              <input name="orders" inputMode="numeric" className="input" />
            </Field>
          </div>
          <SaveBar label="Registrar investimento" hint="" />
        </Card>
      </form>
    </>
  );
}

function roasTom(roas: number | null, meta: number | null): string {
  if (roas === null) return "text-dim";
  if (meta) return roas >= meta ? "text-ok" : "text-bad";
  return roas >= 3 ? "text-ok" : roas >= 1 ? "text-warn" : "text-bad";
}

function TabelaCampanhas({
  lista,
  vazio,
}: {
  lista: ReturnType<typeof analisarCampanha>[];
  vazio: string;
}) {
  if (!lista.length) {
    return (
      <div className="p-5">
        <Empty title="Nada para mostrar" hint={vazio} />
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Campanha</th>
            <th className="num">Investido</th>
            <th className="num">ROAS</th>
            <th className="num">ACOS</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id}>
              <td>
                <span className="block text-sm text-ink">{c.nome}</span>
                <span className="text-[0.65rem] text-dim">{c.clientName}</span>
              </td>
              <td className="num text-muted">{brlShort(c.invested)}</td>
              <td className={`num font-semibold ${roasTom(c.roas, null)}`}>
                {c.roas === null ? "—" : `${c.roas.toFixed(2)}x`}
              </td>
              <td className="num text-muted">
                {c.acos === null ? <Chip tone="bad">sem venda</Chip> : pct(c.acos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
