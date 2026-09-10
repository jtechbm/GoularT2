import Link from "next/link";
import { Card, Chip, Empty, Stat } from "./ui";
import { brl, brlShort, num, pct } from "@/lib/format";
import type { DiaFinanceiro } from "@/lib/queries";

const ATALHOS = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Mês" },
];

/**
 * Barras por dia.
 *
 * Desenha um dia sem venda como espaço vazio, não como buraco no eixo. Um
 * gráfico que pula os dias zerados faz uma operação irregular parecer
 * constante, que é justamente o que o dia a dia deveria revelar.
 */
function Barras({ dias, campo, cor }: { dias: DiaFinanceiro[]; campo: keyof DiaFinanceiro; cor: string }) {
  const valores = dias.map((d) => Number(d[campo]) || 0);
  const maximo = Math.max(...valores, 1);

  return (
    <div className="flex h-32 items-end gap-[2px]">
      {dias.map((d, i) => {
        const v = valores[i];
        const altura = (v / maximo) * 100;
        return (
          <span
            key={d.day}
            className="group relative flex-1 rounded-t-[2px]"
            style={{ height: `${Math.max(v > 0 ? 4 : 1, altura)}%`, background: v > 0 ? cor : "var(--surface-3)" }}
            title={`${d.day.slice(8)}/${d.day.slice(5, 7)} · ${brl(v)}`}
          />
        );
      })}
    </div>
  );
}

export function SerieDiaria({
  dias,
  label,
  atalhoAtivo,
  hrefBase,
  metaAds,
}: {
  dias: DiaFinanceiro[];
  label: string;
  atalhoAtivo: string;
  /** base para montar os links dos atalhos, já com os outros filtros */
  hrefBase: (atalho: string) => string;
  /** teto de Ads combinado no mês, quando existir */
  metaAds?: number | null;
}) {
  const soma = dias.reduce(
    (a, d) => ({
      revenue: a.revenue + d.revenue,
      orders: a.orders + d.orders,
      ads: a.ads + d.ads,
      adsRevenue: a.adsRevenue + d.ads_revenue,
      clicks: a.clicks + d.clicks,
    }),
    { revenue: 0, orders: 0, ads: 0, adsRevenue: 0, clicks: 0 },
  );

  const comVenda = dias.filter((d) => d.revenue > 0).length;
  const ticket = soma.orders ? soma.revenue / soma.orders : 0;
  const roas = soma.ads ? soma.adsRevenue / soma.ads : 0;
  const melhor = [...dias].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <Card
      title="Dia a dia"
      subtitle={`${label} · ${dias.length} dias`}
      actions={
        <nav className="flex gap-1">
          {ATALHOS.map((a) => (
            <Link
              key={a.key}
              href={hrefBase(a.key)}
              className={`btn btn-sm ${atalhoAtivo === a.key ? "btn-primary" : "btn-ghost"}`}
            >
              {a.label}
            </Link>
          ))}
        </nav>
      }
    >
      {dias.some((d) => d.revenue > 0 || d.ads > 0) ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Faturamento" value={brl(soma.revenue)} hint={`${num(soma.orders)} pedidos`} tone="brand" />
            <Stat label="Ticket médio" value={brl(ticket)} tone="accent" />
            <Stat
              label="Dias com venda"
              value={`${comVenda}/${dias.length}`}
              hint={comVenda < dias.length ? `${dias.length - comVenda} sem nenhuma` : "todos"}
              tone={comVenda === dias.length ? "ok" : "warn"}
            />
            <Stat
              label="Ads no período"
              value={brl(soma.ads)}
              hint={
                metaAds
                  ? `${pct(soma.ads / metaAds)} do teto de ${brlShort(metaAds)}`
                  : roas
                    ? `ROAS ${roas.toFixed(2)}x`
                    : "sem retorno atribuído"
              }
              tone={metaAds && soma.ads > metaAds ? "bad" : "warn"}
            />
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[0.7rem] text-dim">
              <span>Faturamento por dia</span>
              {melhor && melhor.revenue > 0 && (
                <span>
                  melhor dia {melhor.day.slice(8)}/{melhor.day.slice(5, 7)} · {brlShort(melhor.revenue)}
                </span>
              )}
            </div>
            <Barras dias={dias} campo="revenue" cor="var(--primary)" />
          </div>

          {soma.ads > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-[0.7rem] text-dim">
                <span>Investimento em Ads por dia</span>
                <span>{num(soma.clicks)} cliques no período</span>
              </div>
              <Barras dias={dias} campo="ads" cor="var(--accent)" />
            </div>
          )}

          <div className="table-wrap mt-4">
            <table className="data">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th className="num">Faturamento</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Taxas</th>
                  <th className="num">Frete</th>
                  <th className="num">Ads</th>
                </tr>
              </thead>
              <tbody>
                {[...dias].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="text-xs text-muted">
                      {d.day.slice(8)}/{d.day.slice(5, 7)}
                    </td>
                    <td className="num font-semibold text-ink">{d.revenue ? brlShort(d.revenue) : "—"}</td>
                    <td className="num text-muted">{d.orders || "—"}</td>
                    <td className="num text-muted">{d.fees ? brlShort(d.fees) : "—"}</td>
                    <td className="num text-muted">{d.shipping ? brlShort(d.shipping) : "—"}</td>
                    <td className="num">
                      {d.ads ? (
                        d.revenue === 0 ? (
                          <Chip tone="bad">{brlShort(d.ads)} sem venda</Chip>
                        ) : (
                          <span className="text-muted">{brlShort(d.ads)}</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty
          title="Sem histórico diário neste período"
          hint="O dia a dia é preenchido a cada sincronização. Meses anteriores à conexão da loja não têm histórico."
        />
      )}
    </Card>
  );
}
