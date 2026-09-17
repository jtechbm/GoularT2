import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { brl, currentMonth, dateTimeBR, lastMonths, monthLabel, pct, relativeBR } from "@/lib/format";
import { Card, Chip, Empty, Field, PageHeader, Stat, type Tone } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { ClientePicker } from "@/components/cliente-picker";
import { analisarClienteAction } from "@/lib/actions/analise";
import { clientesAnalisaveis } from "@/lib/analise/coleta";
import { analisePorId, historicoDoCliente, ultimaAnalise } from "@/lib/analise/repositorio";

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
  searchParams: Promise<{ cliente?: string; mes?: string; a?: string; pronta?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const escopo = await visibleClientIds(user);
  const podeRodar = can(user, "analise.rodar");

  const clientes = await clientesAnalisaveis(escopo);
  const cliente = clientes.find((c) => c.id === sp.cliente) ?? clientes[0];
  const refMonth = sp.mes ?? currentMonth();

  const [analise, historico] = await Promise.all([
    cliente ? (sp.a ? analisePorId(sp.a, escopo) : ultimaAnalise(cliente.id, escopo)) : null,
    cliente ? historicoDoCliente(cliente.id, escopo) : [],
  ]);

  const d = analise?.dossie;
  const r = analise?.resultado;

  return (
    <>
      <PageHeader
        title="Análise do cliente"
        subtitle="A IA lê os números de todos os canais do cliente e diz o que fazer. Leva uns 30 segundos e custa por execução."
        actions={
          cliente && podeRodar ? (
            <form action={analisarClienteAction}>
              <input type="hidden" name="cliente_id" value={cliente.id} />
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

      <Card
        title="Cliente"
        subtitle="A análise cobre todos os canais conectados do cliente de uma vez, e compara um com o outro"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cliente">
            <Suspense fallback={null}>
              <ClientePicker
                clientes={clientes.map((c) => ({
                  id: c.id,
                  name: c.name,
                  hint: `${c.lojas} ${c.lojas === 1 ? "canal" : "canais"}`,
                }))}
                value={cliente?.id ?? ""}
              />
            </Suspense>
          </Field>
          <Suspense fallback={null}>
            <MonthPicker months={lastMonths(6, refMonth)} value={refMonth} />
          </Suspense>
        </div>
      </Card>

      {!cliente ? (
        <Card className="mt-3">
          <Empty
            title="Nenhum cliente com loja conectada"
            hint="A análise precisa de integração ativa para ter número de onde partir."
          />
        </Card>
      ) : !analise || !d ? (
        <Card className="mt-3">
          <Empty
            title="Este cliente ainda não foi analisado"
            hint={
              podeRodar
                ? "Clique em Analisar agora. Leva uns 30 segundos e o resultado fica guardado, então abrir a tela depois não gasta nada."
                : "Peça ao admin para rodar a primeira análise. Depois ela fica guardada e aparece aqui."
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat
              label="Score do cliente"
              value={d.score ? String(d.score.valor) : "—"}
              hint={d.score?.classe ?? "sem score"}
              tone={d.score ? (d.score.valor >= 70 ? "ok" : d.score.valor >= 45 ? "warn" : "bad") : "neutral"}
            />
            <Stat
              label={`Faturamento · ${monthLabel(d.mes)}`}
              value={brl(d.total.atual.revenue)}
              hint={
                d.derivado.temAnterior
                  ? `${d.total.atual.orders} pedidos`
                  : `${d.total.atual.orders} pedidos · sem mês anterior`
              }
              delta={d.derivado.temAnterior ? d.derivado.variacaoFaturamento * 100 : null}
            />
            <Stat
              label="Margem"
              value={pct(d.derivado.margem)}
              hint={`lucro ${brl(d.total.atual.profit)}`}
              tone={d.derivado.margem <= 0 ? "bad" : d.derivado.margem < 0.05 ? "warn" : "ok"}
            />
            <Stat
              label="Canais"
              value={String(d.porLoja.length)}
              hint={d.porLoja.map((l) => l.marketplace).join(" · ")}
              tone="brand"
            />
            <Stat
              label="Indicadores fora do alvo"
              value={String(d.derivado.indicadoresFora)}
              hint={d.derivado.indicadoresFora ? "alvo do próprio marketplace" : "tudo dentro do alvo"}
              tone={d.derivado.indicadoresFora ? "warn" : "ok"}
            />
            <Stat
              label="Penalidades abertas"
              value={String(d.derivado.penalidadesAbertas)}
              hint={d.derivado.penalidadesAbertas ? "ver em Penalidades" : "nenhuma"}
              tone={d.derivado.penalidadesAbertas ? "bad" : "ok"}
              href={d.derivado.penalidadesAbertas ? "/penalidades" : undefined}
            />
          </div>

          <Card
            className="mt-3"
            title="Diagnóstico"
            subtitle={`Escrita em ${dateTimeBR(analise.created_at)}${analise.autor ? ` por ${analise.autor}` : ""}`}
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

          <Card
            className="mt-3"
            title="Os canais lado a lado"
            subtitle="É aqui que aparece o canal que carrega o cliente e o que só dá trabalho"
            bodyClassName="p-0"
          >
            <div className="table-wrap">
              <table className="data responsiva">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Fatia</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Ticket</th>
                    <th className="num">Margem</th>
                    <th className="num">Anúncios</th>
                    <th className="num">Preço vs. mercado</th>
                    <th className="num">Saúde</th>
                    <th className="num">Penalidades</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porLoja.map((l) => (
                    <tr key={l.marketplace}>
                      <td data-label="Canal">
                        <span className="text-ink">{l.marketplace}</span>
                        {l.apelido && <span className="block text-xs text-muted">{l.apelido}</span>}
                      </td>
                      <td data-label="Faturamento" className="num">
                        {brl(l.atual.revenue)}
                      </td>
                      <td data-label="Fatia" className="num">
                        {pct(l.derivado.fatiaDoFaturamento)}
                      </td>
                      <td data-label="Pedidos" className="num">
                        {l.atual.orders}
                      </td>
                      <td data-label="Ticket" className="num">
                        {brl(l.derivado.ticket)}
                      </td>
                      <td data-label="Margem" className="num">
                        {pct(l.derivado.margem)}
                      </td>
                      <td data-label="Anúncios" className="num">
                        {l.derivado.ads
                          ? `${brl(l.derivado.ads.invested)} · ROAS ${
                              l.derivado.ads.roas === null ? "—" : l.derivado.ads.roas.toFixed(2)
                            }`
                          : "—"}
                      </td>
                      <td data-label="Preço vs. mercado" className="num">
                        {l.derivado.catalogo.comComparacao
                          ? `${l.derivado.posicao.acima} acima · ${l.derivado.posicao.abaixo} abaixo`
                          : `sem comparação (${l.derivado.catalogo.total} anúncios)`}
                      </td>
                      <td data-label="Saúde" className="num">
                        {l.notaDaLoja !== null && (
                          <Chip tone={l.notaDaLoja >= 4 ? "ok" : l.notaDaLoja >= 3 ? "warn" : "bad"}>
                            nota {l.notaDaLoja}
                          </Chip>
                        )}
                        {l.derivado.indicadoresFora.length > 0 ? (
                          <span className="block text-xs text-warn">
                            {l.derivado.indicadoresFora.length}{" "}
                            {l.derivado.indicadoresFora.length === 1 ? "indicador fora" : "indicadores fora"}
                          </span>
                        ) : l.indicadores.length ? (
                          <span className="block text-xs text-ok">dentro do alvo</span>
                        ) : (
                          <span className="block text-xs text-dim">sem indicador</span>
                        )}
                      </td>
                      <td data-label="Penalidades" className="num">
                        {l.penalidades.length || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            className="mt-3"
            title="Saúde dos canais"
            subtitle="Indicador fora do alvo, anúncio barrado e o que o marketplace não deixa ler"
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-line">
              {d.porLoja.map((l) => (
                <li key={`saude-${l.marketplace}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{l.marketplace}</span>
                    {l.reputacao && <Chip tone="info">reputação {l.reputacao.nivel}</Chip>}
                    {l.sinais.barrados > 0 && <Chip tone="bad">{l.sinais.barrados} barrados</Chip>}
                    {l.sinais.rebaixados > 0 && <Chip tone="warn">{l.sinais.rebaixados} rebaixados</Chip>}
                    {l.sinais.semPromocao === null ? (
                      <Chip tone="neutral">promoção não lida</Chip>
                    ) : l.sinais.semPromocao > 0 ? (
                      <Chip tone="neutral">{l.sinais.semPromocao} sem promoção</Chip>
                    ) : null}
                    {l.sinais.precoMudado > 0 && (
                      <Chip tone="info">{l.sinais.precoMudado} com preço mexido em 7 dias</Chip>
                    )}
                  </div>

                  {l.derivado.indicadoresFora.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {l.derivado.indicadoresFora.map((i) => (
                        <li key={i.nome} className="text-xs">
                          <Chip tone={i.severidade === "critico" ? "bad" : "warn"}>{i.severidade}</Chip>{" "}
                          <span className="text-muted">{i.texto}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      {l.indicadores.length
                        ? "Todos os indicadores dentro do alvo do marketplace."
                        : "Este canal não publica indicadores de saúde; o que existe é a reputação."}
                    </p>
                  )}

                  {l.pendencias.length > 0 && (
                    <p className="mt-2 text-xs text-warn">
                      Não medido por falta de permissão no app: {l.pendencias.join(", ")}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
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
                      {a.onde && <Chip tone="brand">{a.onde}</Chip>}
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
                        {p.onde && <Chip tone="brand">{p.onde}</Chip>}
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
                        {p.onde && <Chip tone="brand">{p.onde}</Chip>}
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
            subtitle={`Origem: ${d.procedencia} · metas: ${
              d.metas.length ? `${d.derivado.metasCumpridas} de ${d.metas.length} cumpridas` : "nenhuma cadastrada"
            } · alertas abertos: ${d.alertas.length || "nenhum"}`}
            bodyClassName="p-0"
          >
            <div className="table-wrap">
              <table className="data responsiva">
                <tbody>
                  <tr>
                    <td data-label="Total">Faturamento do cliente</td>
                    <td data-label="Valor" className="num">
                      {brl(d.total.atual.revenue)}
                      {d.derivado.temAnterior
                        ? ` · anterior ${brl(d.total.anterior.revenue)} (${pct(d.derivado.variacaoFaturamento)})`
                        : " · sem mês anterior gravado"}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Pedidos">Pedidos e ticket</td>
                    <td data-label="Valor" className="num">
                      {d.total.atual.orders} pedidos · ticket {brl(d.derivado.ticket)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Custos">Custos do mês</td>
                    <td data-label="Valor" className="num">
                      taxas {brl(d.total.atual.fees)} · frete {brl(d.total.atual.shipping)} · produto{" "}
                      {brl(d.total.atual.cogs)} · anúncios {brl(d.total.atual.ads)}
                    </td>
                  </tr>
                  {d.porLoja.map((l) => (
                    <tr key={`ritmo-${l.marketplace}`}>
                      <td data-label="Canal">Ritmo · {l.marketplace}</td>
                      <td data-label="Valor" className="num">
                        {l.dias.length} dias com dado · {l.derivado.diasSemVenda} sem venda · maior sequência{" "}
                        {l.derivado.maiorSequenciaSeca} · top 5 dias {pct(l.derivado.concentracaoTopDias)}
                      </td>
                    </tr>
                  ))}
                  {d.porLoja.map((l) => (
                    <tr key={`catalogo-${l.marketplace}`}>
                      <td data-label="Canal">Catálogo · {l.marketplace}</td>
                      <td data-label="Valor" className="num">
                        {l.derivado.catalogo.total} anúncios · de {brl(l.derivado.catalogo.precoMin)} a{" "}
                        {brl(l.derivado.catalogo.precoMax)} · mediano {brl(l.derivado.catalogo.precoMediano)} ·{" "}
                        {l.derivado.catalogo.comComparacao} comparados
                      </td>
                    </tr>
                  ))}
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
                      href={`/analise?cliente=${cliente.id}&mes=${h.ref_month}&a=${h.id}`}
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
