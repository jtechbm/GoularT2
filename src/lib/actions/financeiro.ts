"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, id, now, one, run } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { str, strOrNull, toNumber } from "@/lib/format";

function refresh() {
  revalidatePath("/financeiro");
}

/** Só admin e gestor tocam no financeiro da agência. */
async function assertFinance() {
  return requireRole("admin", "gestor");
}

/**
 * Gera as cobranças do mês a partir do contrato de cada cliente.
 * - fee fixo: usa o valor do contrato
 * - percentual: comissão sobre o faturamento fechado do cliente no mês
 * - híbrido: os dois
 * Cobranças já recebidas ou canceladas não são tocadas — só as pendentes
 * são recalculadas, porque o faturamento do mês ainda pode mudar.
 */
export async function generateChargesAction(formData: FormData) {
  const user = await assertFinance();
  const refMonth = str(formData.get("ref_month"));
  if (!refMonth) throw new Error("Mês de referência é obrigatório.");

  const clients = await all<{
    id: string;
    fee_model: string;
    monthly_fee: number;
    commission_pct: number;
  }>(
    `SELECT id, fee_model, monthly_fee, commission_pct
       FROM clients WHERE status NOT IN ('encerrado', 'pausado')`,
  );

  // vencimento padrão: dia 10 do mês seguinte ao de referência
  const [y, m] = refMonth.split("-").map(Number);
  const due = new Date(Date.UTC(y, m, 10)).toISOString().slice(0, 10);

  let criadas = 0;
  let atualizadas = 0;

  for (const c of clients) {
    const revenue =
      (
        await one<{ revenue: number }>(
          "SELECT COALESCE(SUM(revenue),0) AS revenue FROM finance_snapshots WHERE client_id = ? AND ref_month = ?",
          c.id,
          refMonth,
        )
      )?.revenue ?? 0;

    const fee = c.fee_model === "percentual" ? 0 : c.monthly_fee;
    const commission = c.fee_model === "fixo" ? 0 : revenue * c.commission_pct;
    const total = fee + commission;

    const existing = await one<{ id: string; status: string; extra: number }>(
      "SELECT id, status, extra FROM agency_charges WHERE client_id = ? AND ref_month = ?",
      c.id,
      refMonth,
    );

    if (!existing) {
      // nada a cobrar e nada configurado: não cria linha vazia
      if (total <= 0) continue;
      await run(
        `INSERT INTO agency_charges (id, client_id, ref_month, fee, commission, extra, revenue_base, total,
                                     status, due_date, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,0,?,?,'pendente',?,?,?,?)`,
        id(),
        c.id,
        refMonth,
        fee,
        commission,
        revenue,
        total,
        due,
        user.id,
        now(),
        now(),
      );
      criadas += 1;
    } else if (existing.status === "pendente") {
      await run(
        `UPDATE agency_charges SET fee = ?, commission = ?, revenue_base = ?, total = ? + extra, updated_at = ?
          WHERE id = ?`,
        fee,
        commission,
        revenue,
        total,
        now(),
        existing.id,
      );
      atualizadas += 1;
    }
  }

  refresh();
  redirect(`/financeiro?mes=${refMonth}&geradas=${criadas}&atualizadas=${atualizadas}`);
}

/** Edita uma cobrança (valores avulsos, vencimento, observação). */
export async function updateChargeAction(formData: FormData) {
  await assertFinance();
  const chargeId = str(formData.get("charge_id"));
  const refMonth = str(formData.get("ref_month"));

  const fee = toNumber(formData.get("fee"));
  const commission = toNumber(formData.get("commission"));
  const extra = toNumber(formData.get("extra"));

  await run(
    `UPDATE agency_charges SET fee = ?, commission = ?, extra = ?, total = ?, due_date = ?, notes = ?, updated_at = ?
      WHERE id = ?`,
    fee,
    commission,
    extra,
    fee + commission + extra,
    strOrNull(formData.get("due_date")),
    strOrNull(formData.get("notes")),
    now(),
    chargeId,
  );

  refresh();
  redirect(`/financeiro?mes=${refMonth}&ok=1`);
}

/** Dá baixa ou volta a cobrança para "a receber". */
export async function setChargeStatusAction(formData: FormData) {
  await assertFinance();
  const chargeId = str(formData.get("charge_id"));
  const refMonth = str(formData.get("ref_month"));
  const status = str(formData.get("status"));

  await run(
    "UPDATE agency_charges SET status = ?, paid_at = ?, method = ?, updated_at = ? WHERE id = ?",
    status,
    status === "pago" ? now() : null,
    status === "pago" ? strOrNull(formData.get("method")) : null,
    now(),
    chargeId,
  );

  refresh();
  redirect(`/financeiro?mes=${refMonth}&ok=1`);
}

export async function deleteChargeAction(formData: FormData) {
  await assertFinance();
  const refMonth = str(formData.get("ref_month"));
  await run("DELETE FROM agency_charges WHERE id = ?", str(formData.get("charge_id")));
  refresh();
  redirect(`/financeiro?mes=${refMonth}`);
}

/** Despesas da agência — apenas admin, porque inclui folha e pró-labore. */
export async function createExpenseAction(formData: FormData) {
  const user = await requireRole("admin");
  const refMonth = str(formData.get("ref_month"));
  const description = str(formData.get("description"));
  if (!description) throw new Error("Descreva a despesa.");

  await run(
    `INSERT INTO agency_expenses (id, ref_month, category, description, amount, recurring, paid, due_date,
                                  paid_at, notes, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id(),
    refMonth,
    str(formData.get("category")) || "outros",
    description,
    toNumber(formData.get("amount")),
    formData.get("recurring") ? 1 : 0,
    formData.get("paid") ? 1 : 0,
    strOrNull(formData.get("due_date")),
    formData.get("paid") ? now() : null,
    strOrNull(formData.get("notes")),
    user.id,
    now(),
    now(),
  );

  refresh();
  redirect(`/financeiro?mes=${refMonth}&aba=despesas&ok=1`);
}

export async function toggleExpensePaidAction(formData: FormData) {
  await requireRole("admin");
  const refMonth = str(formData.get("ref_month"));
  const expenseId = str(formData.get("expense_id"));
  const current = await one<{ paid: number }>("SELECT paid FROM agency_expenses WHERE id = ?", expenseId);
  const next = current?.paid === 1 ? 0 : 1;

  await run(
    "UPDATE agency_expenses SET paid = ?, paid_at = ?, updated_at = ? WHERE id = ?",
    next,
    next === 1 ? now() : null,
    now(),
    expenseId,
  );

  refresh();
  redirect(`/financeiro?mes=${refMonth}&aba=despesas`);
}

export async function deleteExpenseAction(formData: FormData) {
  await requireRole("admin");
  const refMonth = str(formData.get("ref_month"));
  await run("DELETE FROM agency_expenses WHERE id = ?", str(formData.get("expense_id")));
  refresh();
  redirect(`/financeiro?mes=${refMonth}&aba=despesas`);
}

/** Repete no mês escolhido as despesas marcadas como recorrentes do mês anterior. */
export async function repeatRecurringAction(formData: FormData) {
  const user = await requireRole("admin");
  const refMonth = str(formData.get("ref_month"));
  const [y, m] = refMonth.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const prevMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;

  const anteriores = await all<{ category: string; description: string; amount: number; due_date: string | null }>(
    `SELECT category, description, amount, due_date FROM agency_expenses
      WHERE ref_month = ? AND recurring = 1
        AND NOT EXISTS (SELECT 1 FROM agency_expenses n
                         WHERE n.ref_month = ? AND n.description = agency_expenses.description)`,
    prevMonth,
    refMonth,
  );

  for (const e of anteriores) {
    await run(
      `INSERT INTO agency_expenses (id, ref_month, category, description, amount, recurring, paid, due_date,
                                    notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,1,0,?,NULL,?,?,?)`,
      id(),
      refMonth,
      e.category,
      e.description,
      e.amount,
      e.due_date ? `${refMonth}-${e.due_date.slice(-2)}` : null,
      user.id,
      now(),
      now(),
    );
  }

  refresh();
  redirect(`/financeiro?mes=${refMonth}&aba=despesas&repetidas=${anteriores.length}`);
}
