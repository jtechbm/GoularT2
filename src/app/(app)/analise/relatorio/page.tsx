import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { brl, dateTimeBR, monthLabel, pct } from "@/lib/format";
import { analisePorId } from "@/lib/analise/repositorio";
import { Card, Chip, PageHeader, type Tone } from "@/components/ui";
import { BlocoAnuncios, FontesCitadas, TabelaFontes } from "@/components/analise-blocos";
import { BotaoImprimir } from "@/components/botao-imprimir";

const TOM_GRAVIDADE: Record<string, Tone> = { alta: "bad", media: "warn", baixa: "info" };
const TOM_IMPACTO: Record<string, Tone> = { alto: "ok", medio: "info", baixo: "neutral" };

/**
 * A análise em formato de apresentação, pronta para salvar em PDF.
 *
 * Mostra o que o cliente precisa ver (números, diagnóstico, anúncios, o que
 * fazer) e termina com o anexo "de onde vêm os números": cada afirmação da
 * IA aponta para a linha de origem, e o anexo é o que sustenta a conversa
 * quando o cliente pergunta "de onde você tirou isso?".
 */
export default async function RelatorioDaAnalise({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!sp.a) notFound();

  // o escopo vai na consulta: membro não abre análise de cliente que não é dele
  const analise = await analisePorId(sp.a, await visibleClientIds(user));
  if (!analise) notFound();

  const d = analise.dossie;
  const r = analise.resultado;
  const ads = d.derivado.ads;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <Link href={`/analise?cliente=${analise.client_id}&mes=${analise.ref_month}&a=${analise.id}`} className="hover:text-brand">
              Análise
            </Link>
          }
          title="Relatório da análise"
          subtitle="Confira e clique em Salvar em PDF. No diálogo, escolha “Salvar como PDF”."
          actions={<BotaoImprimir />}
        />
      </div>

      <article className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-dim uppercase">Análise da operação</p>
              <h1 className="mt-1 text-2xl font-bold text-ink">{d.cliente.nome}</h1>
              <p className="text-sm text-muted">
                {monthLabel(d.mes)} · {d.porLoja.map((l) => l.marketplace).join(" e ")}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-10 w-auto" />
          </div>
          <p className="mt-3 text-[0.7rem] text-dim">
            Gerada em {dateTimeBR(analise.created_at)}
            {analise.autor ? ` por ${analise.autor}` : ""}. Números lidos das lojas pela integração; cada afirmação
            aponta, entre colchetes, a linha de onde saiu (anexo no fim).
          </p>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Numero
            rotulo="Faturamento"
            valor={brl(d.total.atual.revenue)}
            nota={
              d.derivado.temAnterior
                ? `${d.derivado.variacaoFaturamento >= 0 ? "+" : "−"}${pct(Math.abs(d.derivado.variacaoFaturamento))} vs. mês anterior`
                : `${d.total.atual.orders} pedidos`
            }
          />
          <Numero
            rotulo="Margem"
            valor={pct(d.derivado.margem)}
            nota={`lucro ${brl(d.total.atual.profit)}`}
          />
          <Numero
            rotulo="Investido em Ads"
            valor={ads ? brl(ads.invested) : "—"}
            nota={
              ads
                ? `${ads.pctFaturamento === null ? "" : `${pct(ads.pctFaturamento)} do faturamento`}${ads.incompleto ? " · incompleto" : ""}`
                : d.porLoja.some((l) => l.derivado.adsNaoMedido)
                  ? "não medido em algum canal"
                  : "sem investimento"
            }
          />
          {ads?.roas != null ? (
            <Numero rotulo="ROAS" valor={`${ads.roas.toFixed(2)}x`} nota={`cada R$ 1 em anúncio trouxe ${brl(ads.roas)}`} />
          ) : (
            <Numero
              rotulo="ROAS"
              valor={ads?.pctFaturamento ? `${(1 / ads.pctFaturamento).toFixed(2)}x` : "—"}
              nota="faturamento ÷ investido em anúncios"
            />
          )}
        </div>

        <Card title="Diagnóstico">
          {r?.diagnostico ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{r.diagnostico}</p>
          ) : (
            <p className="text-sm text-muted">A parte escrita desta análise não ficou pronta.</p>
          )}
        </Card>

        <BlocoAnuncios d={d} r={r} />

        <Card title="Os canais lado a lado" bodyClassName="p-0">
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
                  <th className="num">Penalidades</th>
                </tr>
              </thead>
              <tbody>
                {d.porLoja.map((l) => (
                  <tr key={l.marketplace}>
                    <td data-label="Canal">{l.marketplace}</td>
                    <td className="num" data-label="Faturamento">{brl(l.atual.revenue)}</td>
                    <td className="num" data-label="Fatia">{pct(l.derivado.fatiaDoFaturamento)}</td>
                    <td className="num" data-label="Pedidos">{l.atual.orders}</td>
                    <td className="num" data-label="Ticket">{brl(l.derivado.ticket)}</td>
                    <td className="num" data-label="Margem">{pct(l.derivado.margem)}</td>
                    <td className="num" data-label="Penalidades">{l.penalidades.length || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {r && r.acoes.length > 0 && (
          <Card title="O que fazer" subtitle="Em ordem de importância">
            <ol className="space-y-3">
              {r.acoes.map((a, i) => (
                <li key={`${a.titulo}-${i}`} className="rounded-[12px] border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {i + 1}. {a.titulo}
                    </span>
                    {a.onde && <Chip tone="brand">{a.onde}</Chip>}
                    <Chip tone={TOM_IMPACTO[a.impacto] ?? "neutral"}>impacto {a.impacto}</Chip>
                    <Chip tone="info">{a.prazo}</Chip>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-muted">{a.porQue}</p>
                  <FontesCitadas fontes={a.fontes} />
                </li>
              ))}
            </ol>
          </Card>
        )}

        {r && (r.problemas.length > 0 || r.pontosFortes.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Problemas" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {r.problemas.map((p, i) => (
                  <li key={`${p.titulo}-${i}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink">{p.titulo}</span>
                      <Chip tone={TOM_GRAVIDADE[p.gravidade ?? ""] ?? "neutral"}>{p.gravidade}</Chip>
                    </div>
                    <p className="mt-1 text-xs text-muted">{p.evidencia}</p>
                    <FontesCitadas fontes={p.fontes} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Pontos fortes" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {r.pontosFortes.map((p, i) => (
                  <li key={`${p.titulo}-${i}`} className="px-4 py-3">
                    <span className="text-sm text-ink">{p.titulo}</span>
                    <p className="mt-1 text-xs text-muted">{p.evidencia}</p>
                    <FontesCitadas fontes={p.fontes} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {r && r.semResposta.length > 0 && (
          <Card title="O que ainda não dá para afirmar" subtitle="Faltou dado; a análise não chutou">
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {r.semResposta.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* o anexo começa em página nova no PDF */}
        <div className="print:break-before-page">
          <TabelaFontes d={d} />
        </div>
      </article>
    </>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-ink">{valor}</p>
      <p className="mt-0.5 text-[0.7rem] text-dim">{nota}</p>
    </Card>
  );
}
