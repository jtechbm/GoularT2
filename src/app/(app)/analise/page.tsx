import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { brl, currentMonth, dateTimeBR, lastMonths, monthLabel, pct, relativeBR } from "@/lib/format";
import { marketplaceLabel } from "@/lib/types";
import { Card, Chip, Empty, Field, PageHeader, Stat, type Tone } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { analisarLojaAction } from "@/lib/actions/analise";
import { lojasVisiveis } from "@/lib/analise/coleta";
import { analisePorId, historicoDaLoja, ultimaAnalise } from "@/lib/analise/repositorio";

/**
 * A análise tem teto próprio de 30 segundos, bem abaixo dos 60 da plataforma.
 * O limite maior fica declarado porque o padrão de 10s cortaria a chamada no
 * meio, e isso só apareceria em produção.
 */
export const maxDuration = 60;

const TOM_GRAVIDADE: Record<string, Tone> = { alta: "bad", media: "warn", baixa: "info" };
const TOM_IMPACTO: Record<string, Tone> = { alto: "ok", medio: "info", baixo: "neutral" };

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; mes?: string; a?: string; pronta?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const escopo = await visibleClientIds(user);
  const podeRodar = can(user, "analise.rodar");

  const lojas = await lojasVisiveis(escopo);
  const loja = lojas.find((l) => l.id === sp.loja) ?? lojas[0];
  const refMonth = sp.mes ?? currentMonth();

  const [analise, historico] = await Promise.all([
    loja ? (sp.a ? analisePorId(sp.a, escopo) : ultimaAnalise(loja.id, escopo)) : null,
    loja ? historicoDaLoja(loja.id, escopo) : [],
  ]);

  const d = analise?.dossie;
  const r = analise?.resultado;

  return (
    <>
      <PageHeader
        title="Análise da loja"
        subtitle="A IA lê os números da loja e diz o que fazer. Leva uns 30 segundos e custa por execução."
        actions={
          loja && podeRodar ? (
            <form action={analisarLojaAction}>
              <input type="hidden" name="loja_id" value={loja.id} />
              <input type="hidden" name="mes" value={refMonth} />
              <SubmitButton pendingLabel="Analisando… (~30s)">Analisar agora</SubmitButton>
            </form>
          ) : null
        }
      />

      {sp.erro && (
        <div className="mb-4 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">Não deu para analisar agora.</p>
          <p className="mt-1 text-xs text-muted">{sp.erro}</p>
        </div>
      )}
      {sp.pronta && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Análise concluída{analise?.duration_ms ? ` em ${(analise.duration_ms / 1000).toFixed(1)}s` : ""}.
        </div>
      )}

      <Card title="Loja" subtitle="Só lojas conectadas: a análise se apoia nos números que a integração trouxe">
        <div className="flex flex-wrap items-end gap-3">
          {/* trocar de loja é formulário GET; o mês vai escondido para não se
              perder na troca. O seletor de mês navega sozinho e preserva a loja. */}
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="mes" value={refMonth} />
            <Field label="Loja">
              <select name="loja" defaultValue={loja?.id} className="input">
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.client_name} — {marketplaceLabel(l.marketplace)}
                    {l.nickname ? ` (${l.nickname})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton size="sm" variant="ghost" pendingLabel="Abrindo…">
              Abrir
            </SubmitButton>
          </form>
          <Suspense fallback={null}>
            <MonthPicker months={lastMonths(6, refMonth)} value={refMonth} />
          </Suspense>
        </div>
      </Card>

      {!loja ? (
        <Card className="mt-3">
          <Empty
            title="Nenhuma loja conectada"
            hint="A análise precisa de uma loja com integração ativa para ter número de onde partir."
          />
        </Card>
      ) : !analise || !d ? (
        <Card className="mt-3">
          <Empty
            title="Esta loja ainda não foi analisada"
            hint={
              podeRodar
                ? "Clique em Analisar agora. Leva uns 30 segundos e o resultado fica guardado, então abrir a tela depois não gasta nada."
                : "Peça ao admin para rodar a primeira análise. Depois ela fica guardada e aparece aqui."
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Score do cliente"
              value={d.score ? String(d.score.valor) : "—"}
              hint={d.score?.classe ?? "sem score"}
              tone={d.score ? (d.score.valor >= 70 ? "ok" : d.score.valor >= 45 ? "warn" : "bad") : "neutral"}
            />
            <Stat
              label={`Faturamento · ${monthLabel(d.mes)}`}
              value={brl(d.atual.revenue)}
              hint={d.derivado.temAnterior ? `${d.atual.orders} pedidos` : `${d.atual.orders} pedidos · sem mês anterior`}
              delta={d.derivado.temAnterior ? d.derivado.variacaoFaturamento * 100 : null}
            />
            <Stat
              label="Margem"
              value={pct(d.derivado.margem)}
              hint={`lucro ${brl(d.atual.profit)}`}
              tone={d.derivado.margem <= 0 ? "bad" : d.derivado.margem < 0.05 ? "warn" : "ok"}
            />
            <Stat
              label="Anúncios pagos"
              value={d.derivado.ads ? brl(d.derivado.ads.invested) : "—"}
              hint={
                d.derivado.ads
                  ? d.derivado.ads.roas === null
                    ? "gastou e não vendeu"
                    : `ROAS ${d.derivado.ads.roas.toFixed(2)}`
                  : "sem investimento"
              }
              tone={d.derivado.ads && d.derivado.ads.roas !== null && d.derivado.ads.roas < 3 ? "warn" : "brand"}
            />
            <Stat
              label="Penalidades abertas"
              value={String(d.penalidades.length)}
              hint={d.penalidades.length ? "ver em Penalidades" : "nenhuma"}
              tone={d.penalidades.length ? "bad" : "ok"}
              href={d.penalidades.length ? "/penalidades" : undefined}
            />
          </div>

          <Card
            className="mt-3"
            title="Diagnóstico"
            subtitle={`${marketplaceLabel(loja.marketplace)} · escrita em ${dateTimeBR(analise.created_at)}${
              analise.autor ? ` por ${analise.autor}` : ""
            }`}
            actions={
              <div className="flex items-center gap-2">
                {analise.status === "parcial" && <Chip tone="warn">incompleta</Chip>}
                {r && r.naoConferidos > 0 && <Chip tone="warn">{r.naoConferidos} sem conferir</Chip>}
              </div>
            }
          >
            {r?.aviso && (
              <p className="mb-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-xs">{r.aviso}</p>
            )}
            {r?.diagnostico ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.diagnostico}</p>
            ) : (
              <p className="text-sm text-muted">
                A parte escrita não ficou pronta. Os números que a análise usou continuam abaixo.
              </p>
            )}
          </Card>

          {r && r.acoes.length > 0 && (
            <Card className="mt-3" title="O que fazer" subtitle="Em ordem de importância, segundo a análise">
              <ol className="space-y-3">
                {r.acoes.map((a, i) => (
                  <li key={`${a.titulo}-${i}`} className="rounded-[12px] border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {i + 1}. {a.titulo}
                      </span>
                      <Chip tone={TOM_IMPACTO[a.impacto] ?? "neutral"}>impacto {a.impacto}</Chip>
                      <Chip tone="neutral">esforço {a.esforco}</Chip>
                      <Chip tone="info">{a.prazo}</Chip>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">{a.porQue}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card title="Problemas" bodyClassName="p-0">
              {!r?.problemas.length ? (
                <Empty title="Nenhum problema apontado" />
              ) : (
                <ul className="divide-y divide-line">
                  {r.problemas.map((p, i) => (
                    <li key={`${p.titulo}-${i}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-ink">{p.titulo}</span>
                        <Chip tone={TOM_GRAVIDADE[p.gravidade ?? ""] ?? "neutral"}>{p.gravidade}</Chip>
                        {!p.conferido && <Chip tone="warn">número não confere</Chip>}
                      </div>
                      <p className="mt-1 text-xs text-muted">{p.evidencia}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Pontos fortes" bodyClassName="p-0">
              {!r?.pontosFortes.length ? (
                <Empty title="Nenhum ponto forte apontado" />
              ) : (
                <ul className="divide-y divide-line">
                  {r.pontosFortes.map((p, i) => (
                    <li key={`${p.titulo}-${i}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-ink">{p.titulo}</span>
                        {!p.conferido && <Chip tone="warn">número não confere</Chip>}
                      </div>
                      <p className="mt-1 text-xs text-muted">{p.evidencia}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {r && r.semResposta.length > 0 && (
            <Card className="mt-3" title="O que faltou de dado" subtitle="A análise deixou isso em aberto de propósito">
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                {r.semResposta.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            className="mt-3"
            title="Números que a análise usou"
            subtitle={`Origem: ${d.procedencia} · ${d.dias.length} dias de histórico`}
            bodyClassName="p-0"
          >
            <div className="table-wrap">
              <table className="data responsiva">
                <tbody>
                  <tr>
                    <td data-label="Faturamento">Faturamento do mês</td>
                    <td data-label="Valor" className="num">
                      {brl(d.atual.revenue)}
                      {d.derivado.temAnterior
                        ? ` · anterior ${brl(d.anterior.revenue)} (${pct(d.derivado.variacaoFaturamento)})`
                        : " · sem mês anterior gravado"}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Pedidos">Pedidos e ticket</td>
                    <td data-label="Valor" className="num">
                      {d.atual.orders} pedidos · ticket {brl(d.derivado.ticket)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Custos">Custos do mês</td>
                    <td data-label="Valor" className="num">
                      taxas {brl(d.atual.fees)} · frete {brl(d.atual.shipping)} · produto {brl(d.atual.cogs)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Ritmo">Ritmo de venda</td>
                    <td data-label="Valor" className="num">
                      {d.derivado.diasSemVenda} dias sem venda · maior sequência {d.derivado.maiorSequenciaSeca} ·
                      top 5 dias {pct(d.derivado.concentracaoTopDias)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Catálogo">Catálogo</td>
                    <td data-label="Valor" className="num">
                      {d.derivado.catalogo.total} anúncios · de {brl(d.derivado.catalogo.precoMin)} a{" "}
                      {brl(d.derivado.catalogo.precoMax)} · mediano {brl(d.derivado.catalogo.precoMediano)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Preço">Posição de preço</td>
                    <td data-label="Valor" className="num">
                      {d.derivado.posicao.acima} acima · {d.derivado.posicao.dentro} no mercado ·{" "}
                      {d.derivado.posicao.abaixo} abaixo · {d.derivado.posicao.semComparacao} sem comparação
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Metas">Metas do mês</td>
                    <td data-label="Valor" className="num">
                      {d.metas.length
                        ? `${d.derivado.metasCumpridas} de ${d.metas.length} cumpridas`
                        : "nenhuma meta cadastrada"}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Alertas">Alertas abertos</td>
                    <td data-label="Valor" className="num">
                      {d.alertas.length || "nenhum"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {historico.length > 1 && (
            <Card className="mt-3" title="Análises anteriores" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {historico.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/analise?loja=${loja.id}&mes=${h.ref_month}&a=${h.id}`}
                      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-surface-2 ${
                        h.id === analise.id ? "bg-surface-2" : ""
                      }`}
                    >
                      <span className="text-ink">
                        {monthLabel(h.ref_month)} · {relativeBR(h.created_at)}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {h.autor ?? "—"}
                        {h.status === "parcial" && <Chip tone="warn">incompleta</Chip>}
                        {h.duration_ms ? `${(h.duration_ms / 1000).toFixed(1)}s` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
