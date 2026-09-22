import Link from "next/link";
import type { ClientRow, IndicadoresCliente } from "@/lib/queries";
import type { Score } from "@/lib/score";
import { brlShort, currentMonth, dateBR, num, pct, variacaoMensal } from "@/lib/format";
import { marketplaceLabel } from "@/lib/types";
import { ordenarClientes, type Ordem } from "@/lib/ordem-clientes";
import { EXPLICA_ROAS_GERAL, roasExibido } from "@/lib/ads-analise";
import { Avatar, Chip, Delta, MarketplaceChip, StatusChip } from "./ui";
import { ColunaOrdenavel } from "./coluna-ordenavel";
import { ScoreChip } from "./score-saude";

export type LinhaCliente = ClientRow & IndicadoresCliente;

/**
 * Junta o fechamento do mês com os indicadores e troca o mês anterior pelo
 * que dá para comparar. No mês corrente isso é o anterior até o mesmo dia;
 * sem o dia a dia do anterior, fica sem comparação em vez de inventar queda.
 */
export function montarLinhas(
  rows: ClientRow[],
  indicadores: Map<string, IndicadoresCliente>,
  refMonth: string,
): LinhaCliente[] {
  const corrente = refMonth === currentMonth();
  return rows.map((r) => {
    const i = indicadores.get(r.id);
    return {
      ...r,
      // o fechamento sincronizado só tem o Ads que a API leu; o lançado à
      // mão (canal que o marketplace não deixa ler) entra somado aqui
      ads: r.ads + (i?.ads_manual ?? 0),
      ads_revenue: i?.ads_revenue ?? 0,
      ads_manual: i?.ads_manual ?? 0,
      ads_com_retorno: i?.ads_com_retorno ?? 0,
      vendas30: i?.vendas30 ?? 0,
      vendas30_ant: i?.vendas30_ant ?? 0,
      faturamento30: i?.faturamento30 ?? 0,
      advertencias: i?.advertencias ?? 0,
      advertencias_criticas: i?.advertencias_criticas ?? 0,
      prev_revenue_comparavel: i?.prev_revenue_comparavel ?? null,
      prev_revenue: corrente ? (i?.prev_revenue_comparavel ?? 0) : r.prev_revenue,
    };
  });
}

export function TabelaClientes({
  linhas,
  ordem,
  href,
  scores,
  completa = false,
  onboardings,
}: {
  linhas: LinhaCliente[];
  ordem: { ordem: Ordem; asc: boolean };
  href: (ordem: string) => string;
  scores: Map<string, Score>;
  /** a página Clientes mostra também responsável, canais, tarefas e última nota */
  completa?: boolean;
  onboardings?: Map<string, { progresso: number }>;
}) {
  const ordenadas = ordenarClientes(linhas, ordem.ordem, ordem.asc);
  const col = (coluna: Ordem, rotulo: string, className = "num") => (
    <ColunaOrdenavel coluna={coluna} atual={ordem} href={href} className={className}>
      {rotulo}
    </ColunaOrdenavel>
  );

  return (
    <div className="table-wrap">
      <table className="data responsiva">
        <thead>
          <tr>
            {col("nome", "Cliente", "")}
            {completa && <th>Responsável</th>}
            {completa && <th>Canais</th>}
            {col("faturamento", "Faturamento")}
            {col("crescimento", "vs. ant.")}
            {col("investido", "Investido")}
            {col("pct_ads", "% Ads")}
            {col("roas", "ROAS")}
            {col("vendas30", "Vendas 30d")}
            {col("advertencias", "Advert.")}
            {completa && <th className="num">Tarefas</th>}
            <th>Saúde</th>
            {completa && <th>Última nota</th>}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => {
            const roas = roasExibido(c.ads, c.ads_com_retorno, c.ads_revenue, c.revenue);
            const pctAds = c.ads && c.revenue ? c.ads / c.revenue : null;
            const sc = scores.get(c.id);
            return (
              <tr key={c.id}>
                <td data-label="Cliente">
                  <Link href={`/clientes/${c.id}`} className="block min-w-36">
                    <span className="block font-semibold text-ink hover:text-brand">{c.name}</span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <StatusChip value={c.status} />
                      {completa && c.segment && <span className="text-[0.7rem] text-dim">{c.segment}</span>}
                      {onboardings?.has(c.id) && (
                        <span className="text-[0.7rem] text-warn">onboarding {pct(onboardings.get(c.id)!.progresso)}</span>
                      )}
                    </span>
                  </Link>
                </td>
                {completa && (
                  <td data-label="Responsável">
                    {c.owner_name ? (
                      <span className="flex items-center gap-2">
                        <Avatar name={c.owner_name} color={c.owner_color} size={24} />
                        <span className="text-xs text-muted">{c.owner_name.split(" ")[0]}</span>
                      </span>
                    ) : (
                      <Chip tone="warn">definir</Chip>
                    )}
                  </td>
                )}
                {completa && (
                  <td data-label="Canais">
                    <span className="flex flex-wrap gap-1">
                      {c.marketplaces ? (
                        c.marketplaces.split(",").map((m) => <MarketplaceChip key={m} value={m} />)
                      ) : (
                        <span className="text-xs text-dim">—</span>
                      )}
                    </span>
                  </td>
                )}
                <td className="num font-semibold text-ink" data-label="Faturamento">
                  {brlShort(c.revenue)}
                </td>
                <td className="num" data-label="vs. ant.">
                  <Delta value={variacaoMensal(c.revenue, c.prev_revenue)} />
                </td>
                <td className="num text-muted" data-label="Investido">
                  {c.ads ? brlShort(c.ads) : "—"}
                  {c.ads_pendente && !c.ads_manual && (
                    <span
                      className="ml-1 text-warn"
                      title={`Sem o Ads de ${c.ads_pendente.split(",").map(marketplaceLabel).join(" e ")}: o marketplace ainda não liberou a leitura`}
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td className="num text-muted" data-label="% Ads">
                  {pctAds === null ? "—" : pct(pctAds)}
                </td>
                <td
                  className={`num ${roas === null ? "text-dim" : roas.geral ? "text-ink" : roas.valor >= 4 ? "text-ok" : roas.valor >= 2 ? "text-warn" : "text-bad"}`}
                  data-label="ROAS"
                >
                  {roas === null ? (
                    "—"
                  ) : roas.geral ? (
                    <span title={EXPLICA_ROAS_GERAL}>
                      {roas.valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x{" "}
                      <span className="text-[0.65rem] text-dim">geral</span>
                    </span>
                  ) : (
                    `${roas.valor.toFixed(2)}x`
                  )}
                </td>
                <td className="num" data-label="Vendas 30d">
                  <span className="text-ink">{num(c.vendas30)}</span>{" "}
                  <Delta value={variacaoMensal(c.vendas30, c.vendas30_ant)} />
                </td>
                <td className="num" data-label="Advert.">
                  {c.advertencias ? (
                    <Link href={`/penalidades?cliente=${c.id}`} className="hover:opacity-80">
                      <Chip tone={c.advertencias_criticas ? "bad" : "warn"}>{c.advertencias}</Chip>
                    </Link>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </td>
                {completa && (
                  <td className="num" data-label="Tarefas">
                    {c.open_tasks > 0 ? <Chip tone="accent">{c.open_tasks}</Chip> : <span className="text-dim">—</span>}
                  </td>
                )}
                <td data-label="Saúde">{sc && <ScoreChip score={sc} mostrarMotivo={completa} />}</td>
                {completa && (
                  <td className="text-xs text-dim" data-label="Última nota">
                    {c.last_note_at ? dateBR(c.last_note_at) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
