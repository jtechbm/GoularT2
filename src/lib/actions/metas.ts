"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertCan, assertClientAccess, requireUser } from "@/lib/auth";
import { str, strOrNull } from "@/lib/format";

/**
 * Campo de meta vindo do formulário.
 *
 * Em branco tem que virar null, não zero: null é "não defini meta para
 * isso" e some da avaliação, zero é uma meta de verdade e é cobrada. Se
 * campo vazio virasse zero, todo cliente nasceria com meta de faturamento
 * zero e apareceria como se estivesse batendo tudo.
 */
function metaOuNulo(valor: FormDataEntryValue | null): number | null {
  const texto = str(valor).trim();
  if (!texto) return null;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/** Percentuais entram como 12,5 e são guardados como 0,125. */
function pctOuNulo(valor: FormDataEntryValue | null): number | null {
  const n = metaOuNulo(valor);
  return n === null ? null : n / 100;
}

export async function saveGoalsAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  const refMonth = str(formData.get("ref_month"));
  if (!clientId || !refMonth) throw new Error("Cliente e mês são obrigatórios.");

  await assertClientAccess(user, clientId);
  assertCan(user, "clientes.gerenciar", "Somente gestores e admins definem metas.");

  // vazio = meta geral do cliente
  const marketplace = strOrNull(formData.get("marketplace"));

  const valores = {
    revenue: metaOuNulo(formData.get("revenue")),
    orders: metaOuNulo(formData.get("orders")),
    avg_ticket: metaOuNulo(formData.get("avg_ticket")),
    min_margin: pctOuNulo(formData.get("min_margin")),
    ads_budget: metaOuNulo(formData.get("ads_budget")),
    min_roas: metaOuNulo(formData.get("min_roas")),
    max_acos: pctOuNulo(formData.get("max_acos")),
  };

  const existente = await one<{ id: string }>(
    marketplace
      ? "SELECT id FROM client_goals WHERE client_id=? AND ref_month=? AND marketplace=?"
      : "SELECT id FROM client_goals WHERE client_id=? AND ref_month=? AND marketplace IS NULL",
    ...(marketplace ? [clientId, refMonth, marketplace] : [clientId, refMonth]),
  );

  const vazia = Object.values(valores).every((v) => v === null);

  if (existente && vazia) {
    // apagar tudo é a forma de dizer "este mês não tem meta"
    await run("DELETE FROM client_goals WHERE id = ?", existente.id);
  } else if (existente) {
    await run(
      `UPDATE client_goals SET revenue=?, orders=?, avg_ticket=?, min_margin=?, ads_budget=?, min_roas=?,
              max_acos=?, notes=?, updated_at=? WHERE id=?`,
      valores.revenue, valores.orders, valores.avg_ticket, valores.min_margin, valores.ads_budget,
      valores.min_roas, valores.max_acos, strOrNull(formData.get("notes")), now(), existente.id,
    );
  } else if (!vazia) {
    await run(
      `INSERT INTO client_goals (id, client_id, ref_month, marketplace, revenue, orders, avg_ticket, min_margin,
                                 ads_budget, min_roas, max_acos, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id(), clientId, refMonth, marketplace, valores.revenue, valores.orders, valores.avg_ticket,
      valores.min_margin, valores.ads_budget, valores.min_roas, valores.max_acos,
      strOrNull(formData.get("notes")), user.id, now(), now(),
    );
  }

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
  redirect(`/clientes/${clientId}?tab=metas&mes=${refMonth}&ok=1`);
}

/** Copia as metas do mês anterior, para não redigitar tudo todo mês. */
export async function copyGoalsAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  const refMonth = str(formData.get("ref_month"));
  const from = str(formData.get("from_month"));

  await assertClientAccess(user, clientId);
  assertCan(user, "clientes.gerenciar", "Somente gestores e admins definem metas.");

  // o índice único não deixa duas metas gerais no mesmo mês, então a cópia
  // substitui o que estiver lá em vez de tentar inserir por cima
  await run(
    "DELETE FROM client_goals WHERE client_id = ? AND ref_month = ? AND marketplace IS NULL",
    clientId,
    refMonth,
  );
  await run(
    `INSERT INTO client_goals (id, client_id, ref_month, marketplace, revenue, orders, avg_ticket, min_margin,
                               ads_budget, min_roas, max_acos, notes, created_by, created_at, updated_at)
     SELECT ?, client_id, ?, NULL, revenue, orders, avg_ticket, min_margin, ads_budget, min_roas,
            max_acos, notes, ?, ?, ?
       FROM client_goals
      WHERE client_id = ? AND ref_month = ? AND marketplace IS NULL`,
    id(), refMonth, user.id, now(), now(), clientId, from,
  );

  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?tab=metas&mes=${refMonth}&ok=1`);
}
