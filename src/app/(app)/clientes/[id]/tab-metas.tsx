import { Card, Chip, Empty, Field, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { saveGoalsAction, copyGoalsAction } from "@/lib/actions/metas";
import { addMonths, brl, monthLabel, num, pct } from "@/lib/format";
import { compararMetas, aproveitamento, type GoalProgress, type Realizado } from "@/lib/metas";
import { GOAL_FIELDS, marketplaceLabel, type Client, type ClientGoal, type ClientMarketplace } from "@/lib/types";

function valorFormatado(v: number, formato: GoalProgress["format"]): string {
  if (formato === "brl") return brl(v);
  if (formato === "int") return num(Math.round(v));
  if (formato === "pct") return pct(v);
  return `${v.toFixed(2)}x`;
}

/** O que já vai preenchido no formulário quando existe meta salva. */
function campoInicial(goal: ClientGoal | undefined, key: GoalProgress["key"], formato: string): string {
  const v = goal?.[key];
  if (v === null || v === undefined) return "";
  // percentuais são guardados como fração e editados como número inteiro
  return formato === "pct" ? String(Number((v * 100).toFixed(2))) : String(v);
}

export function TabMetas({
  client,
  goal,
  porLoja,
  accounts,
  realizado,
  refMonth,
  historico,
  manager,
}: {
  client: Client;
  goal: ClientGoal | undefined;
  /** metas detalhadas por loja, quando o time quis abrir */
  porLoja: ClientGoal[];
  accounts: ClientMarketplace[];
  realizado: Realizado;
  refMonth: string;
  historico: ClientGoal[];
  manager: boolean;
}) {
  const progresso = compararMetas(goal, realizado);
  const alcance = aproveitamento(progresso);
  const mesAnterior = addMonths(refMonth, -1);
  const temAnterior = historico.some((h) => h.ref_month === mesAnterior);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Card
          title={`Metas de ${monthLabel(refMonth)}`}
          subtitle={
            progresso.length
              ? `${progresso.filter((p) => p.bom).length} de ${progresso.length} sendo cumpridas`
              : "Nenhuma meta definida para este mês"
          }
          actions={
            progresso.length ? (
              <Chip tone={alcance >= 0.8 ? "ok" : alcance >= 0.5 ? "warn" : "bad"}>{pct(alcance)} das metas</Chip>
            ) : null
          }
          bodyClassName={progresso.length ? "p-0" : "p-5"}
        >
          {progresso.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Meta</th>
                    <th className="num">Combinado</th>
                    <th className="num">Realizado</th>
                    <th className="num">Alcançado</th>
                    <th className="num">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {progresso.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <span className="text-sm text-ink">{p.label}</span>
                        {p.hint && <span className="block text-[0.7rem] text-dim">{p.hint}</span>}
                      </td>
                      <td className="num text-muted">{valorFormatado(p.goal, p.format)}</td>
                      <td className="num font-semibold text-ink">{valorFormatado(p.realized, p.format)}</td>
                      <td className={`num font-semibold ${p.bom ? "text-ok" : "text-bad"}`}>
                        {Number.isFinite(p.pct) ? pct(p.pct) : "—"}
                      </td>
                      <td className="num">
                        <Chip tone={p.bom ? "ok" : "bad"}>
                          {p.position === "dentro" ? "na meta" : p.position === "acima" ? "acima" : "abaixo"}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Sem metas neste mês"
              hint="Defina ao lado o que se espera do cliente. Só os campos preenchidos são cobrados."
            />
          )}
        </Card>

        {porLoja.length > 0 && (
          <Card title="Metas por loja" subtitle="Detalhamento além da meta geral" bodyClassName="p-0">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Teto de Ads</th>
                    <th className="num">ROAS mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {porLoja.map((g) => (
                    <tr key={g.id}>
                      <td className="text-sm text-ink">{marketplaceLabel(g.marketplace ?? "")}</td>
                      <td className="num text-muted">{g.revenue === null ? "—" : brl(g.revenue)}</td>
                      <td className="num text-muted">{g.orders === null ? "—" : num(g.orders)}</td>
                      <td className="num text-muted">{g.ads_budget === null ? "—" : brl(g.ads_budget)}</td>
                      <td className="num text-muted">{g.min_roas === null ? "—" : `${g.min_roas.toFixed(2)}x`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {historico.length > 1 && (
          <Card title="Histórico das metas" subtitle="Faturamento combinado mês a mês" bodyClassName="p-0">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Margem mínima</th>
                    <th className="num">Teto de Ads</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td className="text-xs text-muted">{monthLabel(h.ref_month)}</td>
                      <td className="num text-muted">{h.revenue === null ? "—" : brl(h.revenue)}</td>
                      <td className="num text-muted">{h.orders === null ? "—" : num(h.orders)}</td>
                      <td className="num text-muted">{h.min_margin === null ? "—" : pct(h.min_margin)}</td>
                      <td className="num text-muted">{h.ads_budget === null ? "—" : brl(h.ads_budget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        {manager ? (
          <>
            <form action={saveGoalsAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="ref_month" value={refMonth} />
              <Card
                title="Definir metas"
                subtitle="Deixe em branco o que não for cobrado neste mês"
                bodyClassName="p-5 pb-0"
              >
                <div className="space-y-3">
                  {accounts.length > 0 && (
                    <Field label="Aplicar a" hint="A meta geral vale para o cliente inteiro.">
                      <select name="marketplace" className="select" defaultValue="">
                        <option value="">Cliente inteiro</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.marketplace}>
                            Só {marketplaceLabel(a.marketplace)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {GOAL_FIELDS.map((f) => (
                    <Field
                      key={f.key}
                      label={f.format === "pct" ? `${f.label} (%)` : f.label}
                      hint={f.hint}
                    >
                      <input
                        name={f.key}
                        inputMode="decimal"
                        defaultValue={campoInicial(goal, f.key, f.format)}
                        className="input"
                        placeholder="sem meta"
                      />
                    </Field>
                  ))}
                  <Field label="Observações">
                    <textarea name="notes" rows={2} defaultValue={goal?.notes ?? ""} className="textarea" />
                  </Field>
                </div>
                <SaveBar label="Salvar metas" hint="Apagar tudo remove a meta do mês." />
              </Card>
            </form>

            {!goal && temAnterior && (
              <form action={copyGoalsAction}>
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="ref_month" value={refMonth} />
                <input type="hidden" name="from_month" value={mesAnterior} />
                <Card>
                  <p className="mb-3 text-xs text-muted">
                    Este cliente tinha metas em {monthLabel(mesAnterior)}. Dá para repetir e ajustar depois.
                  </p>
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Copiando…">
                    Copiar metas de {monthLabel(mesAnterior)}
                  </SubmitButton>
                </Card>
              </form>
            )}
          </>
        ) : (
          <Card>
            <Empty title="Somente leitura" hint="Metas são definidas por gestores e admins." />
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Stat label="Faturamento realizado" value={brl(realizado.revenue)} tone="brand" />
          <Stat
            label="Margem realizada"
            value={pct(realizado.revenue ? realizado.profit / realizado.revenue : 0)}
            tone="accent"
          />
        </div>
      </div>
    </div>
  );
}
