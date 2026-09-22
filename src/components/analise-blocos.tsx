import { brl, pct } from "@/lib/format";
import { linhasDoDossie, type Dossie } from "@/lib/analise/dossie";
import type { FonteCitada, ResultadoAnalise } from "@/lib/analise/llm";
import { Card, Chip } from "./ui";

/**
 * De onde saiu uma afirmação da análise.
 *
 * Agrupa as linhas citadas pela fonte ("Shopee Ads · campanhas de 09/2026 ·
 * lido pela integração") e cada id leva à linha exata na tabela do fim da
 * página. Passar o mouse mostra o texto da linha.
 */
export function FontesCitadas({ fontes }: { fontes?: FonteCitada[] }) {
  // análise de antes da rastreabilidade: não inventa fonte para ela
  if (fontes === undefined) return null;
  if (!fontes.length) {
    return <p className="mt-1 text-[0.7rem] text-warn">Sem fonte citada: confira antes de usar.</p>;
  }

  const porFonte = new Map<string, FonteCitada[]>();
  for (const f of fontes) porFonte.set(f.fonte, [...(porFonte.get(f.fonte) ?? []), f]);

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-dim">
      <span className="font-medium">Fonte:</span>
      {[...porFonte.entries()].map(([fonte, linhas]) => (
        <span key={fonte}>
          {fonte}{" "}
          {linhas.map((l) => (
            <a key={l.id} href={`#${l.id}`} title={l.texto} className="text-brand hover:underline print:text-dim">
              [{l.id}]
            </a>
          ))}
        </span>
      ))}
    </p>
  );
}

function variacao(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : "−"}${pct(Math.abs(v))}`;
}

/**
 * Anúncios: quanto do faturamento vai para anúncio, o que volta, e contra o
 * mês anterior. Canal que o marketplace não deixa ler aparece como "não
 * medido", nunca como zero.
 */
export function BlocoAnuncios({ d, r }: { d: Dossie; r: ResultadoAnalise | null }) {
  const total = d.derivado.ads;
  const algumNaoMedido = d.porLoja.some((l) => l.derivado.adsNaoMedido);
  if (!total && !algumNaoMedido && !r?.anuncios) return null;

  return (
    <Card
      className="mt-3"
      title="Anúncios: ROAS e investimento"
      subtitle="Quanto do faturamento vai para anúncio, quanto volta, e como mudou"
      bodyClassName="p-0"
    >
      {r?.anuncios && (
        <p className="border-b border-line px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {r.anuncios}
        </p>
      )}
      <div className="table-wrap">
        <table className="data responsiva">
          <thead>
            <tr>
              <th>Canal</th>
              <th className="num">Investido</th>
              <th className="num">% do faturamento</th>
              <th className="num">Receita atribuída</th>
              <th className="num">ROAS</th>
              <th className="num">ACOS</th>
              <th className="num">Investido vs. mês ant.</th>
              <th className="num">ROAS mês ant.</th>
            </tr>
          </thead>
          <tbody>
            {d.porLoja.map((l) => {
              const a = l.derivado.ads;
              if (!a) {
                return (
                  <tr key={l.marketplace}>
                    <td data-label="Canal">{l.marketplace}</td>
                    <td colSpan={7} data-label="Anúncios" className="text-xs">
                      {l.derivado.adsNaoMedido ? (
                        <Chip tone="warn">não medido: o marketplace não deixa ler o Ads deste canal</Chip>
                      ) : (
                        <span className="text-dim">nenhum investimento no mês</span>
                      )}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={l.marketplace}>
                  <td data-label="Canal">
                    {l.marketplace}
                    {l.derivado.adsNaoMedido && <span className="block text-[0.7rem] text-warn">parte não medida</span>}
                  </td>
                  <td className="num" data-label="Investido">{brl(a.invested)}</td>
                  <td className="num" data-label="% do faturamento">
                    {a.pctFaturamento === null ? "—" : pct(a.pctFaturamento)}
                  </td>
                  <td className="num" data-label="Receita atribuída">{brl(a.revenue)}</td>
                  <td
                    className={`num font-medium ${a.roas === null ? "text-dim" : a.roas >= 4 ? "text-ok" : a.roas >= 2 ? "text-warn" : "text-bad"}`}
                    data-label="ROAS"
                  >
                    {a.roas !== null ? (
                      `${a.roas.toFixed(2)}x`
                    ) : (
                      <span title="O marketplace não informa quanto o anúncio vendeu. A medida é o % do faturamento.">—</span>
                    )}
                  </td>
                  <td className="num" data-label="ACOS">
                    {a.acos !== null ? pct(a.acos) : a.semRetorno ? "—" : <span className="text-bad">sem venda</span>}
                  </td>
                  <td className="num" data-label="Investido vs. mês ant.">{variacao(a.variacaoInvestido)}</td>
                  <td className="num text-muted" data-label="ROAS mês ant.">
                    {a.roasAnterior === null ? "—" : `${a.roasAnterior.toFixed(2)}x`}
                  </td>
                </tr>
              );
            })}
            {total && d.porLoja.length > 1 && (
              <tr className="font-semibold">
                <td data-label="Canal">Total{total.incompleto ? " (incompleto)" : ""}</td>
                <td className="num" data-label="Investido">{brl(total.invested)}</td>
                <td className="num" data-label="% do faturamento">
                  {total.pctFaturamento === null ? "—" : pct(total.pctFaturamento)}
                </td>
                <td className="num" data-label="Receita atribuída">{brl(total.revenue)}</td>
                <td className="num" data-label="ROAS">
                  {total.roas !== null ? `${total.roas.toFixed(2)}x` : "—"}
                </td>
                <td className="num" data-label="ACOS">
                  {total.roas !== null && total.revenue ? pct(1 / total.roas) : "—"}
                </td>
                <td />
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {d.porLoja.some((l) => l.campanhas.length > 0) && (
        <div className="table-wrap border-t border-line">
          <table className="data responsiva">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Canal</th>
                <th className="num">Investido</th>
                <th className="num">Receita</th>
                <th className="num">Vendas</th>
                <th className="num">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {d.porLoja.flatMap((l) =>
                l.campanhas.slice(0, 8).map((c, i) => (
                  <tr key={`${l.marketplace}-${c.nome}-${i}`}>
                    <td data-label="Campanha">{c.nome}</td>
                    <td className="text-xs text-muted" data-label="Canal">{l.marketplace}</td>
                    <td className="num" data-label="Investido">{brl(c.invested)}</td>
                    <td className="num" data-label="Receita">{brl(c.revenue)}</td>
                    <td className="num" data-label="Vendas">{c.orders}</td>
                    <td className="num" data-label="ROAS">{c.roas === null ? "—" : `${c.roas.toFixed(2)}x`}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      {algumNaoMedido && (
        <p className="border-t border-line px-4 py-3 text-xs text-warn">
          O investimento de algum canal não pôde ser lido: o marketplace ainda não liberou a leitura de anúncios para
          o app da agência. Os totais acima estão incompletos.
        </p>
      )}
    </Card>
  );
}

/**
 * Todas as linhas do dossiê que a IA recebeu, com id e fonte.
 *
 * É o destino dos links [F12] das afirmações: a linha citada fica marcada
 * quando se chega por ela (:target).
 */
export function TabelaFontes({ d }: { d: Dossie }) {
  const linhas = linhasDoDossie(d).filter((l) => l.id);
  return (
    <Card
      className="mt-3"
      title="De onde vêm os números"
      subtitle="Tudo o que a IA recebeu, linha a linha, com a origem de cada número. As afirmações acima citam estas linhas."
      bodyClassName="p-0"
    >
      <div className="table-wrap">
        <table className="data responsiva">
          <thead>
            <tr>
              <th>Id</th>
              <th>O que o sistema afirmou</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} id={l.id!} className="scroll-mt-24 target:bg-brand-soft">
                <td className="text-xs font-medium text-dim" data-label="Id">{l.id}</td>
                <td className="text-xs text-ink" data-label="Afirmação">{l.texto}</td>
                <td className="text-[0.7rem] text-muted" data-label="Fonte">{l.fonte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
