import { Card, Delta, Stat, StoreChip } from "./ui";
import { brl, dateBR, num, variacaoMensal } from "@/lib/format";
import { MARKETPLACES, marketplaceLabel, type ClientMarketplace } from "@/lib/types";

export interface DadosAnalise {
  clienteNome: string;
  inicio: string;
  fim: string;
  revenue: number;
  orders: number;
  units: number;
  lojas: (ClientMarketplace & { revenue: number; orders: number })[];
}

/** "12/09/2026" quando é um dia só; "01/09/2026 a 07/09/2026" quando é período. */
export function periodoEmTexto(inicio: string, fim: string): string {
  return inicio === fim ? dateBR(inicio) : `${dateBR(inicio)} a ${dateBR(fim)}`;
}

/** Quantos dias o intervalo cobre, contando as duas pontas. */
export function diasDoIntervalo(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 864e5) + 1;
}

function nomeDaLoja(loja: ClientMarketplace): string {
  return loja.nickname || loja.external_id || marketplaceLabel(loja.marketplace);
}

/** A diferença absoluta com sinal, para acompanhar a porcentagem. */
function diferenca(a: number, b: number, formatar: (v: number) => string): string {
  const d = a - b;
  if (Math.abs(d) < 0.005) return "igual";
  return `${d > 0 ? "+" : "−"}${formatar(Math.abs(d))}`;
}

/**
 * Comparativo lado a lado: os dois períodos em colunas de mesmo peso.
 *
 * A primeira versão punha um período como número grande e o outro numa
 * legenda pequena, e não dava para ler "o dia 10 vendeu isso, o dia 11 vendeu
 * aquilo" — que é a pergunta. Aqui cada período tem sua coluna, com o nome
 * dele no cabeçalho, e a diferença fica na terceira.
 */
function Comparativo({ a, b }: { a: DadosAnalise; b: DadosAnalise }) {
  const diasA = diasDoIntervalo(a.inicio, a.fim);
  const diasB = diasDoIntervalo(b.inicio, b.fim);
  const tamanhosDiferentes = diasA !== diasB;

  const ticketA = a.orders ? a.revenue / a.orders : 0;
  const ticketB = b.orders ? b.revenue / b.orders : 0;
  const inteiro = (v: number) => num(Math.round(v));

  const linhas: { rotulo: string; a: number; b: number; fmt: (v: number) => string; invertido?: boolean }[] = [
    { rotulo: "Faturamento", a: a.revenue, b: b.revenue, fmt: brl },
    { rotulo: "Vendas", a: a.orders, b: b.orders, fmt: inteiro },
    { rotulo: "Itens vendidos", a: a.units, b: b.units, fmt: inteiro },
    { rotulo: "Ticket médio", a: ticketA, b: ticketB, fmt: brl },
  ];

  // períodos de tamanhos diferentes: o total maior não quer dizer nada, então
  // entram duas linhas de média por dia, que é o que dá para comparar
  if (tamanhosDiferentes) {
    linhas.push(
      { rotulo: "Faturamento por dia", a: a.revenue / diasA, b: b.revenue / diasB, fmt: brl },
      { rotulo: "Vendas por dia", a: a.orders / diasA, b: b.orders / diasB, fmt: inteiro },
    );
  }

  return (
    <Card title="Comparativo" bodyClassName="p-0">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th />
              <th className="num">
                <span className="block text-ink">{periodoEmTexto(a.inicio, a.fim)}</span>
                <span className="block text-[0.7rem] font-normal text-dim">
                  {diasA} {diasA === 1 ? "dia" : "dias"}
                </span>
              </th>
              <th className="num">
                <span className="block text-ink">{periodoEmTexto(b.inicio, b.fim)}</span>
                <span className="block text-[0.7rem] font-normal text-dim">
                  {diasB} {diasB === 1 ? "dia" : "dias"}
                </span>
              </th>
              <th className="num">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo}>
                <td className="font-medium text-ink">{l.rotulo}</td>
                <td className="num font-semibold text-ink">{l.a ? l.fmt(l.a) : "—"}</td>
                <td className="num font-semibold text-ink">{l.b ? l.fmt(l.b) : "—"}</td>
                <td className="num">
                  <span className="flex items-center justify-end gap-2">
                    <span className="text-xs text-muted">{diferenca(l.a, l.b, l.fmt)}</span>
                    <Delta value={variacaoMensal(l.a, l.b)} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tamanhosDiferentes && (
        <p className="border-t border-line px-5 py-3 text-xs text-warn">
          Os períodos têm tamanhos diferentes. O total do período maior é naturalmente maior — quem
          compara de verdade são as duas últimas linhas, de média por dia.
        </p>
      )}
    </Card>
  );
}

/**
 * O resumo da loja no intervalo escolhido, com um segundo período ao lado
 * quando há comparativo.
 *
 * Serve à aba dentro do cliente e à página de impressão, que precisam mostrar
 * exatamente a mesma coisa — duas versões do mesmo número divergem na primeira
 * mudança. Só recebe dado pronto: quem busca é a tela.
 */
export function AnaliseRapida({
  dados,
  comparacao,
}: {
  dados: DadosAnalise;
  /** segundo período, quando a pessoa pediu comparativo */
  comparacao?: DadosAnalise | null;
}) {
  const dias = diasDoIntervalo(dados.inicio, dados.fim);
  const umDia = dados.inicio === dados.fim;
  const ticket = dados.orders ? dados.revenue / dados.orders : 0;

  const canais = MARKETPLACES.filter((m) => dados.lojas.some((l) => l.marketplace === m.value));
  const conectadas = dados.lojas.filter((l) => l.status === "conectado").length;

  const antesPorLoja = new Map((comparacao?.lojas ?? []).map((l) => [l.id, l]));
  const comMovimento = dados.lojas.filter((l) => l.revenue > 0 || (antesPorLoja.get(l.id)?.revenue ?? 0) > 0);
  const paradas = dados.lojas.length - comMovimento.length;

  return (
    <div className="space-y-3">
      {comparacao ? (
        <Comparativo a={dados} b={comparacao} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Faturamento"
            value={brl(dados.revenue)}
            hint={umDia ? dateBR(dados.inicio) : `${dias} dias · ${periodoEmTexto(dados.inicio, dados.fim)}`}
            tone="brand"
          />
          <Stat
            label="Vendas"
            value={num(dados.orders)}
            hint={dados.units ? `${num(dados.units)} itens` : "pedidos no período"}
            tone="accent"
          />
          <Stat
            label="Ticket médio"
            value={dados.orders ? brl(ticket) : "—"}
            hint={dados.orders ? "faturamento ÷ vendas" : "sem venda no período"}
            tone="info"
          />
          <Stat
            label="Lojas"
            value={String(dados.lojas.length)}
            hint={
              canais.length
                ? `${canais.map((c) => c.label).join(" e ")} · ${conectadas} conectada${conectadas === 1 ? "" : "s"}`
                : "nenhuma loja cadastrada"
            }
            tone="ok"
          />
        </div>
      )}

      <Card
        title="Por loja"
        subtitle={
          comparacao
            ? `${dados.lojas.length} lojas · ${canais.map((c) => c.label).join(" e ")}`
            : comMovimento.length
              ? `${comMovimento.length} com venda no período`
              : undefined
        }
        bodyClassName="p-0"
      >
        {comMovimento.length ? (
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Loja</th>
                  {comparacao ? (
                    <>
                      <th className="num">{periodoEmTexto(dados.inicio, dados.fim)}</th>
                      <th className="num">{periodoEmTexto(comparacao.inicio, comparacao.fim)}</th>
                      <th className="num">Diferença</th>
                    </>
                  ) : (
                    <>
                      <th className="num">Faturamento</th>
                      <th className="num">Vendas</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...comMovimento]
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((loja) => {
                    const antes = antesPorLoja.get(loja.id);
                    return (
                      <tr key={loja.id}>
                        <td data-label="Loja">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StoreChip marketplace={loja.marketplace} name={nomeDaLoja(loja)} />
                            {loja.status !== "conectado" && (
                              <span className="text-xs text-warn">{loja.status}</span>
                            )}
                          </span>
                        </td>
                        {comparacao ? (
                          <>
                            <td className="num font-semibold text-ink" data-label="Período">
                              <span className="block">{loja.revenue ? brl(loja.revenue) : "—"}</span>
                              <span className="block text-[0.7rem] font-normal text-dim">
                                {loja.orders ? `${num(loja.orders)} vendas` : "sem venda"}
                              </span>
                            </td>
                            <td className="num font-semibold text-ink" data-label="Comparado">
                              <span className="block">{antes?.revenue ? brl(antes.revenue) : "—"}</span>
                              <span className="block text-[0.7rem] font-normal text-dim">
                                {antes?.orders ? `${num(antes.orders)} vendas` : "sem venda"}
                              </span>
                            </td>
                            <td className="num" data-label="Diferença">
                              <span className="flex items-center justify-end gap-2">
                                <span className="text-xs text-muted">
                                  {diferenca(loja.revenue, antes?.revenue ?? 0, brl)}
                                </span>
                                <Delta value={variacaoMensal(loja.revenue, antes?.revenue ?? 0)} />
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="num font-semibold text-ink" data-label="Faturamento">
                              {loja.revenue ? brl(loja.revenue) : "—"}
                            </td>
                            <td className="num text-muted" data-label="Vendas">
                              {loja.orders ? num(loja.orders) : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                {comMovimento.length > 1 && (
                  <tr className="bg-surface-2">
                    <td className="text-xs font-semibold text-ink" data-label="Loja">
                      Total
                    </td>
                    {comparacao ? (
                      <>
                        <td className="num font-semibold text-ink" data-label="Período">
                          {brl(dados.revenue)}
                        </td>
                        <td className="num font-semibold text-ink" data-label="Comparado">
                          {brl(comparacao.revenue)}
                        </td>
                        <td className="num" data-label="Diferença">
                          <span className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted">
                              {diferenca(dados.revenue, comparacao.revenue, brl)}
                            </span>
                            <Delta value={variacaoMensal(dados.revenue, comparacao.revenue)} />
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num font-semibold text-ink" data-label="Faturamento">
                          {brl(dados.revenue)}
                        </td>
                        <td className="num font-semibold text-ink" data-label="Vendas">
                          {num(dados.orders)}
                        </td>
                      </>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-dim">Nenhuma loja vendeu no período.</p>
        )}

        {paradas > 0 && (
          <p className="border-t border-line px-5 py-3 text-xs text-dim">
            {paradas} {paradas === 1 ? "loja sem venda" : "lojas sem venda"} nos dois períodos, fora da tabela.
          </p>
        )}
      </Card>
    </div>
  );
}
