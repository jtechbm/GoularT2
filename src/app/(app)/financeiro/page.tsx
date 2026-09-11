import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import {
  agencySeries,
  agencyTotals,
  chargesForMonth,
  clientsWithoutCharge,
  expensesByCategory,
  expensesForMonth,
  ownStoreTotals,
  clientRows,
  procedenciaDoMes,
} from "@/lib/queries";
import { brl, brlShort, currentMonth, dateBR, lastMonths, monthLabel, pct } from "@/lib/format";
import { Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { Procedencia } from "@/components/procedencia";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { ChartLegend, Donut } from "@/components/charts";
import { IconBarChart, IconDollar, IconReceipt, IconSync, IconTrendUp } from "@/components/icons";
import {
  ajustarCobrancaAction,
  fecharCobrancaAction,
  reabrirCobrancaAction,
  createExpenseAction,
  deleteChargeAction,
  deleteExpenseAction,
  generateChargesAction,
  repeatRecurringAction,
  setChargeStatusAction,
  toggleExpensePaidAction,
  updateChargeAction,
} from "@/lib/actions/financeiro";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, marketplaceLabel } from "@/lib/types";

const ABAS = [
  { key: "receita", label: "Receita e cobrança" },
  { key: "despesas", label: "Despesas" },
];

const CAT_COLOR = [
  "var(--primary)",
  "var(--primary-light)",
  "#facc15",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "var(--text-dim)",
];

function isLate(due: string | null, status: string): boolean {
  return Boolean(due && status === "pendente" && new Date(`${due}T23:59:59`) < new Date());
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    aba?: string;
    ok?: string;
    geradas?: string;
    atualizadas?: string;
    repetidas?: string;
    fechadas?: string;
    status?: string;
    cliente?: string;
  }>;
}) {
  // dinheiro da agência não é para toda a equipe
  const user = await requirePermission("financeiro");
  const isAdmin = user.role === "admin";

  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();
  const aba = ABAS.some((a) => a.key === sp.aba) && isAdmin ? sp.aba! : "receita";

  const totals = await agencyTotals(ref);
  const charges = await chargesForMonth(ref);
  const faltando = await clientsWithoutCharge(ref);
  const expenses = isAdmin ? await expensesForMonth(ref) : [];
  const byCategory = isAdmin ? await expensesByCategory(ref) : [];
  const series = isAdmin ? await agencySeries(6) : [];
  const propria = await ownStoreTotals(ref);
  const lojasProprias = propria.stores > 0 ? await clientRows(ref, "propria") : [];
  const procedencia = await procedenciaDoMes(ref);

  // o dinheiro do Kadu vem de duas fontes: o que ele cobra dos clientes
  // e o que a loja dele mesmo dá de lucro
  const entradas = totals.billed + propria.profit;
  const profit = entradas - totals.expenses;
  const margin = entradas ? profit / entradas : 0;
  const late = charges.filter((c) => isLate(c.due_date, c.status));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Financeiro da agência"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              O que a operação fatura, recebe{isAdmin ? " e gasta" : ""} — {monthLabel(ref)}
            </span>
            <Procedencia
              origem={procedencia.origem}
              atualizadoEm={procedencia.atualizadoEm}
              contas={procedencia.contas}
              comDados={procedencia.comDados}
            />
          </span>
        }
        actions={
          <>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
            <form action={generateChargesAction}>
              <input type="hidden" name="ref_month" value={ref} />
              <SubmitButton pendingLabel="Gerando…">
                <IconSync size={16} />
                Gerar cobranças
              </SubmitButton>
            </form>
          </>
        }
      />

      {(sp.ok || sp.geradas || sp.repetidas) && (
        <div className="flash mb-4 rounded-[10px] bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          {sp.geradas
            ? `${sp.geradas} cobranças criadas e ${sp.atualizadas ?? 0} atualizadas.`
            : sp.repetidas
              ? `${sp.repetidas} despesas recorrentes repetidas neste mês.`
              : "Alterações salvas."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Faturado no mês"
          value={brl(totals.billed)}
          hint={`${charges.filter((c) => c.status !== "cancelado").length} cobranças`}
          tone="brand"
          icon={<IconDollar size={20} />}
        />
        <Stat
          label="Recebido"
          value={brl(totals.received)}
          hint={totals.billed ? `${pct(totals.received / totals.billed)} do faturado` : "—"}
          tone="ok"
          icon={<IconTrendUp size={20} />}
        />
        <Stat
          label="A receber"
          value={brl(totals.pending)}
          hint={late.length ? `${late.length} em atraso` : "nenhuma em atraso"}
          tone={late.length ? "bad" : "warn"}
          icon={<IconReceipt size={20} />}
        />
        {isAdmin ? (
          <Stat
            label="Lucro da agência"
            value={brl(profit)}
            hint={`agência ${brlShort(totals.billed)} + loja ${brlShort(propria.profit)} − despesas ${brlShort(totals.expenses)}`}
            tone={profit > 0 ? "ok" : "bad"}
            icon={<IconBarChart size={20} />}
          />
        ) : (
          <Stat label="Ticket médio" value={brl(charges.length ? totals.billed / charges.length : 0)} tone="info" />
        )}
      </div>

      {isAdmin && (
        <nav className="mt-5 flex flex-wrap gap-1 border-b border-line">
          {ABAS.map((a) => (
            <Link
              key={a.key}
              href={`/financeiro?mes=${ref}&aba=${a.key}`}
              className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors ${
                aba === a.key
                  ? "border-brand font-medium text-ink"
                  : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {a.label}
            </Link>
          ))}
        </nav>
      )}

      {aba === "receita" ? (
        <div className="mt-4 space-y-3">
          {propria.stores > 0 && (
            <Card
              title="Minhas lojas"
              subtitle="Resultado das lojas próprias — separado da carteira de clientes"
              bodyClassName="p-0"
            >
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Canais</th>
                      <th className="num">Faturamento</th>
                      <th className="num">Ads</th>
                      <th className="num">Impostos</th>
                      <th className="num">Lucro</th>
                      <th className="num">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lojasProprias.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <Link href={`/clientes/${l.id}`} className="font-medium text-ink hover:text-brand">
                            {l.name}
                          </Link>
                        </td>
                        <td className="text-xs text-muted">
                          {l.marketplaces ? l.marketplaces.split(",").map((m) => marketplaceLabel(m)).join(" · ") : "—"}
                        </td>
                        <td className="num font-semibold text-ink">{brl(l.revenue)}</td>
                        <td className="num text-muted">{brl(l.ads)}</td>
                        <td className="num text-muted">{brl(l.tax)}</td>
                        <td className="num font-semibold text-ink">{brl(l.profit)}</td>
                        <td className="num">{l.revenue ? pct(l.profit / l.revenue) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={2} className="text-xs font-medium text-muted">
                        Total das lojas próprias
                      </td>
                      <td className="num font-bold text-ink">{brl(propria.revenue)}</td>
                      <td className="num">{brl(propria.ads)}</td>
                      <td className="num">{brl(propria.tax)}</td>
                      <td className="num font-bold text-ink">{brl(propria.profit)}</td>
                      <td className="num">{propria.revenue ? pct(propria.profit / propria.revenue) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
          {sp.fechadas && Number(sp.fechadas) > 0 && (
            <div className="mb-3 rounded-[10px] border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm text-ok">
              {sp.fechadas} {Number(sp.fechadas) === 1 ? "cobrança fechada não foi" : "cobranças fechadas não foram"}{" "}
              recalculada{Number(sp.fechadas) === 1 ? "" : "s"}. Os valores enviados ao cliente continuam valendo.
            </div>
          )}
          <Card
            title="Cobranças do mês"
            subtitle="Fee do contrato + comissão sobre o faturamento do cliente"
            bodyClassName="p-0"
          >
            {charges.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Modelo</th>
                      <th className="num">Fee</th>
                      <th className="num">Comissão</th>
                      <th className="num">Avulso</th>
                      <th className="num">Total</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link
                            href={`/clientes/${c.client_id}?tab=financeiro&mes=${ref}`}
                            className="font-medium text-ink hover:text-brand"
                          >
                            {c.client_name}
                          </Link>
                        </td>
                        <td className="text-xs text-muted">{c.fee_model}</td>
                        <td className="num text-muted">{brl(c.fee)}</td>
                        <td className="num text-muted">
                          {brl(c.commission)}
                          {c.revenue_base > 0 && (
                            <span className="block text-xs text-dim">sobre {brlShort(c.revenue_base)}</span>
                          )}
                        </td>
                        <td className="num text-muted">
                          {c.extra ? brl(c.extra) : "—"}
                          {c.adjustments !== 0 && (
                            <span className={`block text-xs ${c.adjustments > 0 ? "text-warn" : "text-ok"}`}>
                              ajuste {c.adjustments > 0 ? "+" : ""}
                              {brlShort(c.adjustments)}
                            </span>
                          )}
                        </td>
                        <td className="num font-semibold text-ink">
                          {brl(c.total)}
                          {c.locked === 1 && (
                            <span className="block text-[0.65rem] text-ok" title={`Fechada em ${dateBR(c.closed_at)}`}>
                              fechada
                            </span>
                          )}
                        </td>
                        <td className={`text-xs ${isLate(c.due_date, c.status) ? "text-bad" : "text-muted"}`}>
                          {dateBR(c.due_date)}
                        </td>
                        <td>
                          {isLate(c.due_date, c.status) ? (
                            <Chip tone="bad">Atrasado</Chip>
                          ) : c.status === "pago" ? (
                            <Chip tone="ok">Recebido</Chip>
                          ) : c.status === "cancelado" ? (
                            <Chip tone="neutral">Cancelado</Chip>
                          ) : (
                            <Chip tone="warn">A receber</Chip>
                          )}
                          {c.paid_at && <div className="mt-0.5 text-xs text-dim">{dateBR(c.paid_at)}</div>}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <form action={setChargeStatusAction}>
                              <input type="hidden" name="charge_id" value={c.id} />
                              <input type="hidden" name="ref_month" value={ref} />
                              <input type="hidden" name="status" value={c.status === "pago" ? "pendente" : "pago"} />
                              <SubmitButton variant={c.status === "pago" ? "ghost" : "primary"} size="sm">
                                {c.status === "pago" ? "Reabrir" : "Dar baixa"}
                              </SubmitButton>
                            </form>
                            {c.locked === 1 ? (
                              <form action={reabrirCobrancaAction}>
                                <input type="hidden" name="charge_id" value={c.id} />
                                <input type="hidden" name="ref_month" value={ref} />
                                <input
                                  type="hidden"
                                  name="motivo"
                                  value="reaberta manualmente pelo financeiro"
                                />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  confirm="Reabrir permite que a sincronização recalcule esta cobrança. Continuar?"
                                >
                                  Reabrir
                                </SubmitButton>
                              </form>
                            ) : (
                              <form action={fecharCobrancaAction}>
                                <input type="hidden" name="charge_id" value={c.id} />
                                <input type="hidden" name="ref_month" value={ref} />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  confirm="Fechar congela os números desta cobrança. Continuar?"
                                >
                                  Fechar
                                </SubmitButton>
                              </form>
                            )}
                            {c.locked !== 1 && (
                              <form action={deleteChargeAction}>
                                <input type="hidden" name="charge_id" value={c.id} />
                                <input type="hidden" name="ref_month" value={ref} />
                                <SubmitButton variant="ghost" size="sm" confirm="Excluir esta cobrança?">
                                  ✕
                                </SubmitButton>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={5} className="text-xs font-medium text-muted">
                        Total do mês
                      </td>
                      <td className="num font-bold text-ink">{brl(totals.billed)}</td>
                      <td colSpan={3} className="text-xs text-muted">
                        {brl(totals.received)} recebido · {brl(totals.pending)} a receber
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <Empty
                  title="Nenhuma cobrança neste mês"
                  hint="Clique em “Gerar cobranças” para montar a fatura de cada cliente a partir do fee e da comissão do contrato."
                />
              </div>
            )}
          </Card>

          {faltando.length > 0 && (
            <Card title="Clientes sem cobrança no mês" subtitle="Contratos ativos que ainda não entraram na fatura">
              <ul className="flex flex-wrap gap-2">
                {faltando.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clientes/${c.id}?tab=dados`} className="chip bg-surface-3 text-muted hover:text-brand">
                      {c.name}
                      {c.monthly_fee > 0 ? (
                        <span className="text-warn"> · {brlShort(c.monthly_fee)} estimado</span>
                      ) : c.commission_pct > 0 ? (
                        <span className="text-warn"> · {pct(c.commission_pct / 100)} estimado</span>
                      ) : (
                        " · sem valor no contrato"
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Ajustar cobrança" subtitle="Valor avulso, vencimento e observação">
            {charges.length ? (
              <div className="space-y-3">
                {charges
                  .filter((c) => c.status !== "cancelado")
                  .map((c) => (
                    <form key={c.id} action={updateChargeAction} className="rounded-[10px] border border-line p-3">
                      <input type="hidden" name="charge_id" value={c.id} />
                      <input type="hidden" name="ref_month" value={ref} />
                      <div className="mb-2 text-sm font-medium text-ink">{c.client_name}</div>
                      <div className="grid gap-3 sm:grid-cols-5">
                        <Field label="Fee (R$)">
                          <input name="fee" inputMode="decimal" defaultValue={c.fee} className="input" />
                        </Field>
                        <Field label="Comissão (R$)">
                          <input name="commission" inputMode="decimal" defaultValue={c.commission} className="input" />
                        </Field>
                        <Field label="Avulso (R$)">
                          <input name="extra" inputMode="decimal" defaultValue={c.extra} className="input" />
                        </Field>
                        <Field label="Vencimento">
                          <input name="due_date" type="date" defaultValue={c.due_date ?? ""} className="input" />
                        </Field>
                        <Field label="Observação">
                          <input name="notes" defaultValue={c.notes ?? ""} className="input" />
                        </Field>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <SubmitButton size="sm">Salvar cobrança</SubmitButton>
                      </div>
                    </form>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Gere as cobranças do mês para poder ajustá-las.</p>
            )}
          </Card>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Card
              title="Despesas do mês"
              subtitle="Custos da agência — visível apenas para admins"
              actions={
                <form action={repeatRecurringAction}>
                  <input type="hidden" name="ref_month" value={ref} />
                  <SubmitButton variant="ghost" size="sm">
                    Repetir recorrentes
                  </SubmitButton>
                </form>
              }
              bodyClassName="p-0"
            >
              {expenses.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Vencimento</th>
                        <th className="num">Valor</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <span className="font-medium text-ink">{e.description}</span>
                            {e.recurring === 1 && (
                              <span className="ml-2">
                                <Chip tone="brand">recorrente</Chip>
                              </span>
                            )}
                          </td>
                          <td className="text-xs text-muted">{expenseCategoryLabel(e.category)}</td>
                          <td className="text-xs text-muted">{dateBR(e.due_date)}</td>
                          <td className="num font-semibold text-ink">{brl(e.amount)}</td>
                          <td>{e.paid === 1 ? <Chip tone="ok">Pago</Chip> : <Chip tone="warn">Em aberto</Chip>}</td>
                          <td>
                            <div className="flex justify-end gap-1.5">
                              <form action={toggleExpensePaidAction}>
                                <input type="hidden" name="expense_id" value={e.id} />
                                <input type="hidden" name="ref_month" value={ref} />
                                <SubmitButton variant={e.paid === 1 ? "ghost" : "primary"} size="sm">
                                  {e.paid === 1 ? "Reabrir" : "Pagar"}
                                </SubmitButton>
                              </form>
                              <form action={deleteExpenseAction}>
                                <input type="hidden" name="expense_id" value={e.id} />
                                <input type="hidden" name="ref_month" value={ref} />
                                <SubmitButton variant="ghost" size="sm" confirm="Excluir esta despesa?">
                                  ✕
                                </SubmitButton>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-2">
                        <td colSpan={3} className="text-xs font-medium text-muted">
                          Total de despesas
                        </td>
                        <td className="num font-bold text-ink">{brl(totals.expenses)}</td>
                        <td colSpan={2} className="text-xs text-muted">
                          {brl(totals.expenses_paid)} pago
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-5">
                  <Empty
                    title="Nenhuma despesa lançada"
                    hint="Lance os custos do mês ao lado para acompanhar o lucro real da agência."
                  />
                </div>
              )}
            </Card>

            <Card
              title="Receita e despesa — últimos 6 meses"
              actions={
                <ChartLegend
                  items={[
                    { label: "Faturado", color: "var(--primary)" },
                    { label: "Despesas", color: "var(--primary-light)" },
                  ]}
                />
              }
            >
              {series.some((s) => s.billed > 0 || s.expenses > 0) ? (
                <AgencyChart data={series} />
              ) : (
                <Empty title="Sem histórico ainda" hint="Os meses aparecem aqui conforme forem sendo fechados." />
              )}
            </Card>
          </div>

          <div className="space-y-3">
            <form action={createExpenseAction}>
              <input type="hidden" name="ref_month" value={ref} />
              <Card title="Nova despesa" bodyClassName="p-5 pb-0">
                <div className="space-y-3">
                  <Field label="Descrição *">
                    <input name="description" required className="input" placeholder="o que foi pago" />
                  </Field>
                  <Field label="Categoria">
                    <select name="category" className="select" defaultValue="ferramentas">
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor (R$)">
                      <input name="amount" inputMode="decimal" className="input" placeholder="0,00" />
                    </Field>
                    <Field label="Vencimento">
                      <input name="due_date" type="date" defaultValue={today} className="input" />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="recurring" className="accent-[var(--primary)]" />
                    Repete todo mês
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="paid" className="accent-[var(--primary)]" />
                    Já foi paga
                  </label>
                  <Field label="Observação">
                    <textarea name="notes" rows={2} className="textarea" />
                  </Field>
                </div>
                <div className="-mx-5 mt-5 flex items-center justify-between gap-3 rounded-b-[var(--radius-card)] border-t border-line px-5 py-3">
                  <span className="text-xs text-muted">Nada é gravado até salvar.</span>
                  <SubmitButton>Lançar despesa</SubmitButton>
                </div>
              </Card>
            </form>

            <Card title="Despesas por categoria" subtitle={monthLabel(ref)}>
              {byCategory.length ? (
                <Donut
                  parts={byCategory.map((c, i) => ({
                    label: expenseCategoryLabel(c.category),
                    value: c.amount,
                    color: CAT_COLOR[i % CAT_COLOR.length],
                  }))}
                  totalLabel="no mês"
                  formatValue={(v) => brlShort(v)}
                />
              ) : (
                <p className="text-sm text-muted">Nada lançado neste mês.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/** Barras de faturado x despesa por mês. */
function AgencyChart({ data }: { data: { ref_month: string; billed: number; expenses: number }[] }) {
  const W = 700;
  const H = 200;
  const padLeft = 52;
  const padBottom = 26;
  const padTop = 10;
  const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.expenses)));
  const innerW = W - padLeft - 12;
  const innerH = H - padTop - padBottom;
  const step = innerW / data.length;
  const barW = Math.min(16, step * 0.28);
  const y = (v: number) => padTop + innerH - (Math.max(0, v) / max) * innerH;
  const cx = (i: number) => padLeft + step * i + step / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Receita e despesa da agência">
      {[1, 0.75, 0.5, 0.25, 0].map((g) => {
        const gy = padTop + innerH * (1 - g);
        return (
          <g key={g}>
            <line x1={padLeft} x2={W - 12} y1={gy} y2={gy} stroke="var(--border)" />
            <text x={padLeft - 10} y={gy + 3.5} textAnchor="end" fontSize="10" fill="var(--text-dim)">
              {g === 0 ? "R$ 0" : brlShort(max * g)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => (
        <g key={d.ref_month}>
          <rect
            x={cx(i) - barW - 1.5}
            y={y(d.billed)}
            width={barW}
            height={Math.max(1, padTop + innerH - y(d.billed))}
            rx="3"
            fill="var(--primary)"
          >
            <title>{`${monthLabel(d.ref_month)} — faturado ${brlShort(d.billed)}`}</title>
          </rect>
          <rect
            x={cx(i) + 1.5}
            y={y(d.expenses)}
            width={barW}
            height={Math.max(1, padTop + innerH - y(d.expenses))}
            rx="3"
            fill="var(--primary-light)"
          >
            <title>{`${monthLabel(d.ref_month)} — despesas ${brlShort(d.expenses)}`}</title>
          </rect>
          <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">
            {monthLabel(d.ref_month).split("/")[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}
