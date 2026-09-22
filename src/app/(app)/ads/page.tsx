import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { adsRows, canaisDeAds, clientOptions, procedenciaDoMes, serieDiaria } from "@/lib/queries";
import { brl, currentMonth, lastMonths, monthLabel, num, pct } from "@/lib/format";
import { Card, Chip, Empty, Field, MarketplaceChip, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { Procedencia } from "@/components/procedencia";
import { createAdsAction, deleteAdsAction } from "@/lib/actions/ads";
import { analisarCampanha, resumirAds, roasDoTotal, textoRoas } from "@/lib/ads-analise";
import { MARKETPLACES, marketplaceLabel } from "@/lib/types";

/**
 * Ads: quanto foi investido, quanto voltou, em qual cliente e em qual campanha.
 *
 * A versão anterior misturava o dia a dia da loja inteira (faturamento,
 * taxas, frete) com anúncio, repetia a mesma campanha em "melhores",
 * "piores" e "todas", e mostrava ROAS e ACOS (o mesmo número invertido) como
 * dois destaques. O Kadu e a equipe não conseguiam achar a resposta. Agora a
 * página segue a ordem das perguntas, e o que é detalhe fica embaixo.
 */
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string; canal?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const escopo = await visibleClientIds(user);
  const filtro = { clientId: sp.cliente || undefined, marketplace: sp.canal || undefined, scope: escopo };

  const fimDoMes = new Date(Date.UTC(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [linhas, canais, clients, procedencia, dias] = await Promise.all([
    adsRows({ refMonth: ref, ...filtro }),
    canaisDeAds(ref, filtro),
    clientOptions(escopo),
    procedenciaDoMes(ref, { scope: escopo }),
    serieDiaria(`${ref}-01`, fimDoMes, filtro),
  ]);

  // lançamento sem valor nenhum não é campanha: só polui a lista
  const campanhas = linhas
    .map(analisarCampanha)
    .filter((c) => c.invested > 0 || c.revenue > 0)
    .sort((a, b) => b.invested - a.invested);
  const resumo = resumirAds(campanhas);


  // uma linha por cliente e canal: o que investiu, o que voltou, e quanto
  // isso pesa no faturamento daquele canal
  const porCanal = canais
    .map((c) => {
      const doCanal = campanhas.filter((x) => x.clientId === c.client_id && x.marketplace === c.marketplace);
      const investido = doCanal.reduce((s, x) => s + x.invested, 0);
      const receita = doCanal.reduce((s, x) => s + x.revenue, 0);
      const comRetorno = doCanal.filter((x) => x.receitaInformada).reduce((s, x) => s + x.invested, 0);
      return {
        ...c,
        investido,
        receita,
        roas: roasDoTotal(investido, comRetorno, receita).roas,
        semRetorno: investido - comRetorno,
        naoLido: c.ads_permission === "pendente" && !doCanal.some((x) => !x.automatica),
      };
    })
    .sort((a, b) => b.investido - a.investido || Number(a.naoLido) - Number(b.naoLido));
  // canal sem leitura que já tem valor lançado à mão não está mais faltando
  const naoLidos = porCanal.filter((c) => c.naoLido);

  // % investido só sobre o faturamento dos canais cujo Ads foi lido: dividir
  // pelo total punha os R$ 202 mil da Shopee (sem Ads lido) no denominador e
  // mostrava "0% do faturamento"
  const faturamentoLido = porCanal.filter((c) => !c.naoLido).reduce((s, c) => s + c.revenue, 0);

  const diasComAds = dias.filter((d) => d.ads > 0);
  const maiorDia = Math.max(...dias.map((d) => d.ads), 0);

  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ mes: ref });
    if (sp.cliente) p.set("cliente", sp.cliente);
    if (sp.canal) p.set("canal", sp.canal);
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k);
    return `/ads?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Ads"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Quanto foi investido em anúncio e quanto voltou em vendas · {monthLabel(ref)}</span>
            <Procedencia
              origem={procedencia.origem}
              atualizadoEm={procedencia.atualizadoEm}
              contas={procedencia.contas}
              comDados={procedencia.comDados}
            />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex flex-wrap items-center gap-2" action="/ads">
              <input type="hidden" name="mes" value={ref} />
              <select name="cliente" defaultValue={sp.cliente ?? ""} className="select w-40" aria-label="Cliente">
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select name="canal" defaultValue={sp.canal ?? ""} className="select w-40" aria-label="Loja">
                <option value="">Todas as lojas</option>
                {MARKETPLACES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-ghost">
                Filtrar
              </button>
              {(sp.cliente || sp.canal) && (
                <Link href={`/ads?mes=${ref}`} className="text-xs text-dim hover:text-brand">
                  limpar
                </Link>
              )}
            </form>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
          </div>
        }
      />

      {sp.ok && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Investimento lançado.
        </div>
      )}

      {naoLidos.length > 0 && (
        <div className="mb-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">
            Os números abaixo estão sem o Ads de{" "}
            {naoLidos.map((c) => `${c.client_name} (${marketplaceLabel(c.marketplace)})`).join(", ")}.
          </p>
          <p className="mt-1 text-xs text-muted">
            O marketplace ainda não liberou a leitura de anúncios para o app da agência. Até liberar, lance o valor à
            mão no fim da página.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Investido"
          value={brl(resumo.invested)}
          hint={
            faturamentoLido
              ? `${pct(resumo.invested / faturamentoLido)} do faturamento${naoLidos.length ? " dos canais lidos" : ""}`
              : "sem faturamento no mês"
          }
          tone={naoLidos.length ? "warn" : "brand"}
        />
        <Stat
          label="Voltou em vendas"
          value={brl(resumo.revenue)}
          hint={
            resumo.semRetorno
              ? `sem o retorno de ${brl(resumo.semRetorno)} (recargas ou lançado à mão)`
              : resumo.orders
                ? `${num(resumo.orders)} vendas vindas de anúncio`
                : "vendas atribuídas ao anúncio"
          }
          tone="accent"
        />
        <Stat
          label="ROAS"
          value={resumo.roas === null ? "—" : `${resumo.roas.toFixed(2)}x`}
          hint={
            resumo.roas === null
              ? textoRoas(resumo.invested, resumo.invested - resumo.semRetorno, resumo.revenue)
              : `cada R$ 1 investido virou ${brl(resumo.roas)} em vendas`
          }
          tone={resumo.roas === null ? "neutral" : resumo.roas >= 4 ? "ok" : resumo.roas >= 2 ? "warn" : "bad"}
        />
        <Stat
          label="Cliques"
          value={num(resumo.clicks)}
          hint={resumo.cpc === null ? "—" : `${brl(resumo.cpc)} por clique`}
          tone="info"
        />
      </div>

      <Card
        className="mt-3"
        title="Por cliente"
        subtitle="Quem mais investe, quanto isso pesa no faturamento e quanto volta"
        bodyClassName="p-0"
      >
        {porCanal.length ? (
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Loja</th>
                  <th className="num">Investido</th>
                  <th className="num">% do faturamento</th>
                  <th className="num">Voltou em vendas</th>
                  <th className="num">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {porCanal.map((c) => (
                  <tr key={`${c.client_id}-${c.marketplace}`}>
                    <td data-label="Cliente">
                      <Link href={`/clientes/${c.client_id}?tab=ads`} className="font-medium text-ink hover:text-brand">
                        {c.client_name}
                      </Link>
                    </td>
                    <td data-label="Loja">
                      <MarketplaceChip value={c.marketplace} />
                    </td>
                    {c.naoLido ? (
                      <td colSpan={4} className="text-right" data-label="Ads">
                        <Chip tone="warn">não lido: o marketplace não libera</Chip>
                      </td>
                    ) : (
                      <>
                        <td className="num font-semibold text-ink" data-label="Investido">
                          {c.investido ? brl(c.investido) : <span className="font-normal text-dim">nada no mês</span>}
                        </td>
                        <td className="num" data-label="% do faturamento">
                          {c.investido && c.revenue ? pct(c.investido / c.revenue) : "—"}
                        </td>
                        <td className="num text-muted" data-label="Voltou em vendas">
                          {c.receita ? brl(c.receita) : c.semRetorno ? "não informado" : "—"}
                        </td>
                        <td className={`num font-semibold ${roasTom(c.roas)}`} data-label="ROAS">
                          {c.roas === null ? "—" : `${c.roas.toFixed(2)}x`}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nenhuma loja no filtro" hint="Ajuste o cliente ou a loja." />
          </div>
        )}
      </Card>

      <Card
        className="mt-3"
        title="Campanhas"
        subtitle={
          campanhas.length
            ? `${campanhas.length} ${campanhas.length === 1 ? "campanha" : "campanhas"} no mês, da que mais investe para a que menos investe`
            : undefined
        }
        bodyClassName="p-0"
      >
        {campanhas.length ? (
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th className="num">Investido</th>
                  <th className="num">Voltou em vendas</th>
                  <th className="num">ROAS</th>
                  <th className="num">Vendas</th>
                  <th className="num">Cliques</th>
                  <th className="num" title="Custo por clique">Custo/clique</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Campanha">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-ink">{c.nome}</span>
                        {!c.automatica && <Chip tone="neutral">lançado à mão</Chip>}
                        {c.recarga && (
                          <span title="Lido do extrato da carteira da Shopee: é o crédito comprado no mês, muito perto do gasto, mas sem o retorno em vendas">
                            <Chip tone="info">recarga de crédito</Chip>
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-dim">
                        {c.clientName} · <MarketplaceChip value={c.marketplace} />
                      </span>
                    </td>
                    <td className="num font-semibold text-ink" data-label="Investido">{brl(c.invested)}</td>
                    <td className="num text-muted" data-label="Voltou em vendas">
                      {c.revenue ? brl(c.revenue) : c.receitaInformada ? "—" : "não informado"}
                    </td>
                    <td className={`num font-semibold ${roasTom(c.roas)}`} data-label="ROAS">
                      {!c.receitaInformada ? (
                        "—"
                      ) : c.roas === null ? (
                        "—"
                      ) : c.revenue ? (
                        `${c.roas.toFixed(2)}x`
                      ) : (
                        <Chip tone="bad">não vendeu</Chip>
                      )}
                    </td>
                    <td className="num text-muted" data-label="Vendas">{c.orders ? num(c.orders) : "—"}</td>
                    <td className="num text-muted" data-label="Cliques">{c.clicks ? num(c.clicks) : "—"}</td>
                    <td className="num text-muted" data-label="Custo/clique">{c.cpc === null ? "—" : brl(c.cpc)}</td>
                    <td className="num">
                      {!c.automatica && (
                        <form action={deleteAdsAction}>
                          <input type="hidden" name="entry_id" value={c.id} />
                          <input type="hidden" name="client_id" value={c.clientId} />
                          <input type="hidden" name="redirect_to" value={link({})} />
                          <SubmitButton variant="ghost" size="sm" confirm="Excluir este lançamento?">
                            Excluir
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
              title="Nenhuma campanha no mês"
              hint="Com a loja conectada, as campanhas entram sozinhas todo dia. Loja sem leitura de Ads: lance à mão abaixo."
            />
          </div>
        )}
      </Card>

      <Card
        className="mt-3"
        title="Investimento por dia"
        subtitle={
          diasComAds.length
            ? `${diasComAds.length} de ${dias.length} dias com anúncio · passe o mouse na barra para ver o dia`
            : "Nenhum dia com investimento lido no mês"
        }
      >
        {diasComAds.length ? (
          <>
            <div className="flex h-32 items-end gap-[3px]">
              {dias.map((d) => (
                <span
                  key={d.day}
                  className="flex-1 rounded-t-[3px]"
                  style={{
                    height: `${Math.max(d.ads > 0 ? 4 : 1, (d.ads / Math.max(maiorDia, 1)) * 100)}%`,
                    background: d.ads > 0 ? "var(--primary)" : "var(--surface-3)",
                  }}
                  title={`${d.day.slice(8)}/${d.day.slice(5, 7)} · investido ${brl(d.ads)} · voltou ${brl(d.ads_revenue)}${d.ads ? ` · ROAS ${(d.ads_revenue / d.ads).toFixed(2)}x` : ""}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[0.65rem] text-dim">
              <span>{dias[0]?.day.slice(8)}/{ref.slice(5)}</span>
              <span>maior dia: {brl(maiorDia)}</span>
              <span>{dias[dias.length - 1]?.day.slice(8)}/{ref.slice(5)}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-dim">Quando a loja devolve o Ads dia a dia, ele aparece aqui.</p>
        )}
      </Card>

      <details className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink">
          Lançar investimento à mão
          <span className="ml-2 text-xs font-normal text-dim">para loja que não informa o Ads sozinha</span>
        </summary>
        <form action={createAdsAction} className="border-t border-line px-5 pt-4">
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
              <select name="marketplace" className="select" defaultValue={sp.canal || naoLidos[0]?.marketplace || "mercado_livre"}>
                {MARKETPLACES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campanha">
              <input name="campaign" className="input" placeholder="ex.: Shopee Ads do mês" />
            </Field>
            <Field label="Investido (R$) *">
              <input name="invested" inputMode="decimal" required className="input" placeholder="0,00" />
            </Field>
            <Field label="Voltou em vendas (R$)">
              <input name="revenue" inputMode="decimal" className="input" placeholder="0,00" />
            </Field>
          </div>
          <input type="hidden" name="period_start" value={`${ref}-01`} />
          <input type="hidden" name="period_end" value={fimDoMes} />
          <SaveBar label="Lançar investimento" hint={`Vale para ${monthLabel(ref)} inteiro. Para outro mês, troque o mês no topo.`} />
        </form>
      </details>
    </>
  );
}

function roasTom(roas: number | null): string {
  if (roas === null) return "text-dim";
  return roas >= 4 ? "text-ok" : roas >= 2 ? "text-warn" : "text-bad";
}
