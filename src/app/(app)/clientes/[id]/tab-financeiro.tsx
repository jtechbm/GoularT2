import { Card, Chip, Empty, Field, MarketplaceChip } from "@/components/ui";
import { SaveBar } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { saveFinanceAction } from "@/lib/actions/clients";
import { brl, dateTimeBR, monthLabel, num, pct } from "@/lib/format";
import { MARKETPLACES, marketplaceLabel, type Client, type ClientMarketplace, type FinanceSnapshot } from "@/lib/types";
import { Suspense } from "react";

export function TabFinanceiro({
  client,
  snapshots,
  accounts,
  refMonth,
  months,
}: {
  client: Client;
  snapshots: FinanceSnapshot[];
  accounts: ClientMarketplace[];
  refMonth: string;
  months: string[];
}) {
  // canais do cliente; se ainda não houver, oferece os dois marketplaces suportados
  const channels = accounts.length
    ? [...new Set(accounts.map((a) => a.marketplace))]
    : MARKETPLACES.map((m) => m.value);

  const forMonth = new Map(snapshots.filter((s) => s.ref_month === refMonth).map((s) => [s.marketplace, s]));

  const byMonth = new Map<string, FinanceSnapshot[]>();
  for (const s of snapshots) {
    const list = byMonth.get(s.ref_month) ?? [];
    list.push(s);
    byMonth.set(s.ref_month, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Fechamento de {monthLabel(refMonth)}</h2>
          <p className="text-xs text-dim">
            Valores finais por marketplace. A sincronização das APIs preenche faturamento, taxas e impostos; custo de
            produto e Ads continuam com a equipe.
          </p>
        </div>
        <Suspense fallback={null}>
          <MonthPicker months={months} value={refMonth} />
        </Suspense>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {channels.map((mk) => {
          const snap = forMonth.get(mk);
          return (
            <form key={mk} action={saveFinanceAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="ref_month" value={refMonth} />
              <input type="hidden" name="marketplace" value={mk} />
              <Card
                title={<MarketplaceChip value={mk} />}
                subtitle={
                  snap
                    ? `${snap.source === "api" ? "Sincronizado da API" : "Lançado manualmente"} · ${dateTimeBR(snap.updated_at)}`
                    : "Sem lançamento neste mês"
                }
                actions={snap && <Chip tone={snap.source === "api" ? "ok" : "neutral"}>{snap.source}</Chip>}
                bodyClassName="p-5 pb-0"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Faturamento (R$)">
                    <input
                      name="revenue"
                      inputMode="decimal"
                      defaultValue={snap?.revenue ?? ""}
                      className="input"
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Lucro (R$)" hint="Em branco = calculado pelos custos abaixo.">
                    <input name="profit" inputMode="decimal" defaultValue={snap?.profit ?? ""} className="input" />
                  </Field>
                  <Field label="Impostos (R$)">
                    <input name="tax" inputMode="decimal" defaultValue={snap?.tax ?? ""} className="input" />
                  </Field>
                  <Field label="Taxas do marketplace (R$)">
                    <input name="fees" inputMode="decimal" defaultValue={snap?.fees ?? ""} className="input" />
                  </Field>
                  <Field label="Custo do produto (R$)">
                    <input name="cogs" inputMode="decimal" defaultValue={snap?.cogs ?? ""} className="input" />
                  </Field>
                  <Field label="Frete (R$)">
                    <input name="shipping" inputMode="decimal" defaultValue={snap?.shipping ?? ""} className="input" />
                  </Field>
                  <Field label="Investimento em Ads (R$)">
                    <input name="ads" inputMode="decimal" defaultValue={snap?.ads ?? ""} className="input" />
                  </Field>
                  <Field label="Pedidos">
                    <input name="orders" inputMode="numeric" defaultValue={snap?.orders ?? ""} className="input" />
                  </Field>
                  <Field label="Unidades vendidas" className="sm:col-span-2">
                    <input name="units" inputMode="numeric" defaultValue={snap?.units ?? ""} className="input" />
                  </Field>
                </div>

                <SaveBar
                  label={`Salvar ${marketplaceLabel(mk)}`}
                  hint={
                    snap
                      ? `Margem atual: ${snap.revenue ? pct(snap.profit / snap.revenue) : "—"}`
                      : "Nada é gravado até você salvar."
                  }
                />
              </Card>
            </form>
          );
        })}
      </div>

      <Card title="Histórico de fechamentos" subtitle="Últimos 12 meses" bodyClassName="p-0">
        {byMonth.size ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Canal</th>
                  <th className="num">Faturamento</th>
                  <th className="num">Taxas</th>
                  <th className="num">Impostos</th>
                  <th className="num">Ads</th>
                  <th className="num">Lucro</th>
                  <th className="num">Margem</th>
                  <th className="num">Pedidos</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {[...byMonth.entries()].map(([month, list]) => {
                  const total = list.reduce(
                    (a, s) => ({
                      revenue: a.revenue + s.revenue,
                      fees: a.fees + s.fees,
                      tax: a.tax + s.tax,
                      ads: a.ads + s.ads,
                      profit: a.profit + s.profit,
                      orders: a.orders + s.orders,
                    }),
                    { revenue: 0, fees: 0, tax: 0, ads: 0, profit: 0, orders: 0 },
                  );
                  return [
                    ...list.map((s) => (
                      <tr key={s.id}>
                        <td className="text-xs text-dim">{monthLabel(s.ref_month)}</td>
                        <td>
                          <MarketplaceChip value={s.marketplace} />
                        </td>
                        <td className="num">{brl(s.revenue)}</td>
                        <td className="num text-muted">{brl(s.fees)}</td>
                        <td className="num text-muted">{brl(s.tax)}</td>
                        <td className="num text-muted">{brl(s.ads)}</td>
                        <td className="num font-semibold text-ink">{brl(s.profit)}</td>
                        <td className="num">{s.revenue ? pct(s.profit / s.revenue) : "—"}</td>
                        <td className="num text-muted">{num(s.orders)}</td>
                        <td>
                          <Chip tone={s.source === "api" ? "ok" : "neutral"}>{s.source}</Chip>
                        </td>
                      </tr>
                    )),
                    list.length > 1 && (
                      <tr key={`${month}-total`} className="bg-surface-2">
                        <td className="text-xs font-semibold text-ink">{monthLabel(month)}</td>
                        <td className="text-xs font-semibold text-dim">total</td>
                        <td className="num font-semibold">{brl(total.revenue)}</td>
                        <td className="num">{brl(total.fees)}</td>
                        <td className="num">{brl(total.tax)}</td>
                        <td className="num">{brl(total.ads)}</td>
                        <td className="num font-semibold text-ink">{brl(total.profit)}</td>
                        <td className="num">{total.revenue ? pct(total.profit / total.revenue) : "—"}</td>
                        <td className="num">{num(total.orders)}</td>
                        <td />
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nenhum fechamento registrado" hint="Preencha o mês acima para começar o histórico." />
          </div>
        )}
      </Card>
    </div>
  );
}
