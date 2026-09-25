import { Card, Chip, Empty, Field, Stat, StoreChip } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { createAdsAction, deleteAdsAction } from "@/lib/actions/ads";
import { brl, lastMonths, MESES_DE_HISTORICO, monthLabel, num, pct } from "@/lib/format";
import { analisarCampanha, avisoRecarga, dicaRoas, resumirAds, roasDaTela, xRoas } from "@/lib/ads-analise";
import { MARKETPLACES, marketplaceLabel, type AdsEntry, type Client, type ClientMarketplace, type FinanceSnapshot } from "@/lib/types";

/** A linha de Ads vale para o mês se o período dela cobre o mês. */
function doMes(e: AdsEntry, mes: string): boolean {
  return e.period_start.slice(0, 7) <= mes && e.period_end.slice(0, 7) >= mes;
}

/**
 * Ads do cliente: o mês escolhido, o histórico mês a mês e as campanhas.
 *
 * A versão anterior somava o histórico inteiro no topo ("R$ 138 mil
 * investidos") e dividia a pouca venda atribuída do Mercado Livre por todo
 * esse investido, dando "ROAS 0,03x · ACOS 3.998%". Agora o topo é do mês,
 * a medida é o % do faturamento (a Shopee não informa a venda por anúncio),
 * e o ROAS só aparece onde é real.
 */
export function TabAds({
  client,
  entries,
  accounts,
  snapshots,
  refMonth,
}: {
  client: Client;
  entries: (AdsEntry & { author: string | null })[];
  accounts: ClientMarketplace[];
  snapshots: FinanceSnapshot[];
  refMonth: string;
}) {
  const stores = accounts.map((account) => ({
    id: account.id,
    marketplace: account.marketplace,
    name:
      account.nickname ||
      account.external_id ||
      MARKETPLACES.find((m) => m.value === account.marketplace)?.label ||
      account.marketplace,
  }));
  const back = `/clientes/${client.id}?tab=ads&mes=${refMonth}`;

  const faturamentoDo = (mes: string) =>
    snapshots.filter((s) => s.ref_month === mes).reduce((t, s) => t + s.revenue, 0);

  // o mês escolhido
  const campanhas = entries
    .filter((e) => doMes(e, refMonth))
    .map(analisarCampanha)
    .filter((c) => c.invested > 0 || c.revenue > 0)
    .sort((a, b) => b.invested - a.invested);
  const resumo = resumirAds(campanhas);
  const faturamento = faturamentoDo(refMonth);
  const roasMes = roasDaTela(resumo.invested, resumo.invested - resumo.semRetorno, resumo.revenue, faturamento);

  // mês a mês, os últimos 12 até o escolhido
  const meses = lastMonths(MESES_DE_HISTORICO, refMonth).reverse();
  const historico = meses.map((mes) => {
    const doMesAtual = entries.filter((e) => doMes(e, mes)).map(analisarCampanha);
    const r = resumirAds(doMesAtual);
    const fat = faturamentoDo(mes);
    return {
      mes,
      investido: r.invested,
      receita: r.revenue,
      roas: roasDaTela(r.invested, r.invested - r.semRetorno, r.revenue, fat),
      faturamento: fat,
    };
  });
  const tresMeses = historico.slice(0, 3);
  const media3m = (() => {
    const ads = tresMeses.reduce((t, h) => t + h.investido, 0);
    const fat = tresMeses.reduce((t, h) => t + h.faturamento, 0);
    return ads && fat ? ads / fat : null;
  })();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`${resumo.recargas >= resumo.invested - 0.01 && resumo.invested > 0 ? "Recarregado" : "Investido"} · ${monthLabel(refMonth)}`}
          value={brl(resumo.invested)}
          hint={
            avisoRecarga(resumo.recargas, resumo.invested) ??
            (resumo.invested
              ? `${campanhas.length} ${campanhas.length === 1 ? "campanha" : "campanhas"}`
              : "nenhum investimento no mês")
          }
          tone="brand"
        />
        <Stat
          label="Ads ÷ faturamento"
          value={resumo.invested && faturamento ? pct(resumo.invested / faturamento) : "—"}
          hint={media3m !== null ? `média dos últimos 3 meses: ${pct(media3m)}` : "quanto do faturamento foi para anúncio"}
          tone="accent"
        />
        <Stat label="ROAS" value={roasMes ? xRoas(roasMes) : "—"} hint={dicaRoas(roasMes)} tone="ok" />
        <Stat
          label="Voltou em vendas"
          value={resumo.revenue ? brl(resumo.revenue) : "—"}
          hint={
            resumo.semRetorno
              ? `sem o retorno de ${brl(resumo.semRetorno)} (recargas da Shopee)`
              : resumo.orders
                ? `${num(resumo.orders)} vendas · ${num(resumo.clicks)} cliques`
                : "vendas atribuídas ao anúncio"
          }
          tone="info"
        />
      </div>

      <Card title="Mês a mês" subtitle="Quanto investiu e quanto isso pesou no faturamento" bodyClassName="p-0">
        <div className="table-wrap">
          <table className="data responsiva">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Investido</th>
                <th className="num">Faturamento</th>
                <th className="num">Ads ÷ faturamento</th>
                <th className="num">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.mes} className={h.mes === refMonth ? "bg-surface-2" : undefined}>
                  <td data-label="Mês" className="font-medium text-ink">
                    {monthLabel(h.mes)}
                  </td>
                  <td className="num" data-label="Investido">{h.investido ? brl(h.investido) : "—"}</td>
                  <td className="num text-muted" data-label="Faturamento">{h.faturamento ? brl(h.faturamento) : "—"}</td>
                  <td className="num font-semibold text-ink" data-label="Ads ÷ faturamento">
                    {h.investido && h.faturamento ? pct(h.investido / h.faturamento) : "—"}
                  </td>
                  <td className="num font-semibold text-ink" data-label="ROAS">
                    {h.roas ? <span title={dicaRoas(h.roas)}>{xRoas(h.roas)}</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Campanhas · ${monthLabel(refMonth)}`} bodyClassName="p-0">
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const roas = c.revenue ? c.roas : null;
                  return (
                    <tr key={c.id}>
                      <td data-label="Campanha">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StoreChip marketplace={c.marketplace} name={c.storeName || marketplaceLabel(c.marketplace)} />
                          <span className="text-sm text-ink">{c.nome}</span>
                          {c.recarga && <Chip tone="info">recarga de crédito</Chip>}
                          {!c.automatica && <Chip tone="neutral">lançado à mão</Chip>}
                        </span>
                      </td>
                      <td className="num font-semibold text-ink" data-label="Investido">{brl(c.invested)}</td>
                      <td className="num text-muted" data-label="Voltou em vendas">
                        {c.revenue ? brl(c.revenue) : c.receitaInformada ? "—" : "não informado"}
                      </td>
                      <td className="num text-muted" data-label="ROAS">{roas !== null ? `${roas.toFixed(2)}x` : "—"}</td>
                      <td className="num text-muted" data-label="Vendas">{c.orders ? num(c.orders) : "—"}</td>
                      <td className="num">
                        {/* apagar linha automática não adianta: a próxima
                            sincronização traz a campanha de volta */}
                        {!c.automatica && (
                          <form action={deleteAdsAction}>
                            <input type="hidden" name="entry_id" value={c.id} />
                            <input type="hidden" name="client_id" value={client.id} />
                            <input type="hidden" name="redirect_to" value={back} />
                            <SubmitButton variant="ghost" size="sm" confirm="Excluir este lançamento?">
                              Excluir
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty title="Nenhuma campanha no mês" hint="Com a loja conectada, o Ads entra sozinho na sincronização diária." />
          </div>
        )}
      </Card>

      <details className="rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink">
          Lançar investimento à mão
          <span className="ml-2 text-xs font-normal text-dim">para loja que não informa o Ads sozinha</span>
        </summary>
        <form action={createAdsAction} className="border-t border-line px-5 pt-4">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="redirect_to" value={back} />
          <input type="hidden" name="period_start" value={`${refMonth}-01`} />
          <input
            type="hidden"
            name="period_end"
            value={new Date(Date.UTC(Number(refMonth.slice(0, 4)), Number(refMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Loja">
              {stores.length ? (
                <select name="client_marketplace_id" className="select">
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select name="marketplace" className="select">
                  {MARKETPLACES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Campanha">
              <input name="campaign" className="input" placeholder="opcional" />
            </Field>
            <Field label="Investido (R$) *">
              <input name="invested" inputMode="decimal" required className="input" placeholder="0,00" />
            </Field>
            <Field label="Voltou em vendas (R$)">
              <input name="revenue" inputMode="decimal" className="input" placeholder="0,00" />
            </Field>
          </div>
          <SaveBar label="Lançar investimento" hint={`Vale para ${monthLabel(refMonth)} inteiro.`} />
        </form>
      </details>
    </div>
  );
}
