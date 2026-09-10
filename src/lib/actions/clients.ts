"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { assertCan, assertClientAccess, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { str, strOrNull, toNumber } from "@/lib/format";
import { avaliarOnboardingDoCliente } from "@/lib/queries";
import type { OnboardingItem } from "@/lib/onboarding";

async function touch(clientId: string) {
  await run("UPDATE clients SET updated_at = ? WHERE id = ?", now(), clientId);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/");
}

async function assertManager() {
  const user = await requireUser();
  assertCan(user, "clientes.gerenciar", "Apenas gestores e admins podem executar esta ação.");
  return user;
}

/** Cria um cliente novo e leva direto para a página dele. */
export async function createClientAction(formData: FormData) {
  await assertManager();
  const clientId = id();
  const name = str(formData.get("name"));
  if (!name) throw new Error("Nome do cliente é obrigatório.");

  await run(
    `INSERT INTO clients (id, kind, name, trade_name, doc, status, segment, tier, contact_name, contact_email,
                          contact_phone, fee_model, monthly_fee, commission_pct, started_at, owner_id, summary,
                          created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    clientId,
    formData.get("kind") === "propria" ? "propria" : "cliente",
    name,
    strOrNull(formData.get("trade_name")),
    strOrNull(formData.get("doc")),
    str(formData.get("status")) || "onboarding",
    strOrNull(formData.get("segment")),
    str(formData.get("tier")) || "standard",
    strOrNull(formData.get("contact_name")),
    strOrNull(formData.get("contact_email")),
    strOrNull(formData.get("contact_phone")),
    str(formData.get("fee_model")) || "fixo",
    toNumber(formData.get("monthly_fee")),
    toNumber(formData.get("commission_pct")),
    strOrNull(formData.get("started_at")),
    strOrNull(formData.get("owner_id")),
    strOrNull(formData.get("summary")),
    now(),
    now(),
  );

  // marketplaces marcados na criação já entram como contas pendentes
  for (const mk of formData.getAll("marketplaces").map(String)) {
    await run(
      `INSERT INTO client_marketplaces (id, client_id, marketplace, nickname, external_id, status, created_at)
       VALUES (?,?,?,?,?,'pendente',?)
       ON CONFLICT DO NOTHING`,
      id(),
      clientId,
      mk,
      null,
      null,
      now(),
    );
  }

  const owner = strOrNull(formData.get("owner_id"));
  if (owner) {
    await run("INSERT INTO client_team (client_id, user_id, role) VALUES (?,?,?) ON CONFLICT DO NOTHING", clientId, owner, "responsavel");
  }

  revalidatePath("/clientes");
  revalidatePath("/");
  redirect(`/clientes/${clientId}`);
}

export async function updateClientAction(formData: FormData) {
  await assertManager();
  const clientId = str(formData.get("client_id"));
  await run(
    `UPDATE clients SET kind=?, name=?, trade_name=?, doc=?, status=?, segment=?, tier=?, contact_name=?,
            contact_email=?, contact_phone=?, fee_model=?, monthly_fee=?, commission_pct=?, started_at=?,
            owner_id=?, summary=?, updated_at=?
      WHERE id=?`,
    formData.get("kind") === "propria" ? "propria" : "cliente",
    str(formData.get("name")),
    strOrNull(formData.get("trade_name")),
    strOrNull(formData.get("doc")),
    str(formData.get("status")),
    strOrNull(formData.get("segment")),
    str(formData.get("tier")),
    strOrNull(formData.get("contact_name")),
    strOrNull(formData.get("contact_email")),
    strOrNull(formData.get("contact_phone")),
    str(formData.get("fee_model")),
    toNumber(formData.get("monthly_fee")),
    toNumber(formData.get("commission_pct")),
    strOrNull(formData.get("started_at")),
    strOrNull(formData.get("owner_id")),
    strOrNull(formData.get("summary")),
    now(),
    clientId,
  );
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=dados&ok=1`);
}

/** Define responsável + equipe do cliente de uma vez. */
export async function saveTeamAction(formData: FormData) {
  await assertManager();
  const clientId = str(formData.get("client_id"));
  const ownerId = strOrNull(formData.get("owner_id"));
  const members = formData.getAll("members").map(String).filter(Boolean);

  await run("UPDATE clients SET owner_id = ?, updated_at = ? WHERE id = ?", ownerId, now(), clientId);
  await run("DELETE FROM client_team WHERE client_id = ?", clientId);

  const seen = new Set<string>();
  if (ownerId) {
    await run("INSERT INTO client_team (client_id, user_id, role) VALUES (?,?,?)", clientId, ownerId, "responsavel");
    seen.add(ownerId);
  }
  for (const memberId of members) {
    if (seen.has(memberId)) continue;
    const role = str(formData.get(`role_${memberId}`)) || "analista";
    await run("INSERT INTO client_team (client_id, user_id, role) VALUES (?,?,?)", clientId, memberId, role);
    seen.add(memberId);
  }

  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=equipe&ok=1`);
}

export async function addMarketplaceAction(formData: FormData) {
  await assertManager();
  const clientId = str(formData.get("client_id"));
  await run(
    `INSERT INTO client_marketplaces (id, client_id, marketplace, nickname, external_id, status, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id(),
    clientId,
    str(formData.get("marketplace")),
    strOrNull(formData.get("nickname")),
    strOrNull(formData.get("external_id")),
    "pendente",
    now(),
  );
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=marketplaces&ok=1`);
}

export async function updateMarketplaceAction(formData: FormData) {
  await assertManager();
  const clientId = str(formData.get("client_id"));
  const rowId = str(formData.get("marketplace_id"));
  await run(
    "UPDATE client_marketplaces SET nickname=?, external_id=?, status=? WHERE id=? AND client_id=?",
    strOrNull(formData.get("nickname")),
    strOrNull(formData.get("external_id")),
    str(formData.get("status")),
    rowId,
    clientId,
  );
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=marketplaces&ok=1`);
}

export async function removeMarketplaceAction(formData: FormData) {
  await assertManager();
  const clientId = str(formData.get("client_id"));
  await run("DELETE FROM client_marketplaces WHERE id=? AND client_id=?", str(formData.get("marketplace_id")), clientId);
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=marketplaces&ok=1`);
}

/**
 * Salva os números fechados do mês (faturamento, imposto, taxas, lucro…).
 * É a mesma tabela que a sincronização das APIs alimenta — aqui a origem fica 'manual'.
 */
export async function saveFinanceAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  const refMonth = str(formData.get("ref_month"));
  const marketplace = str(formData.get("marketplace"));
  if (!clientId || !refMonth || !marketplace) throw new Error("Cliente, mês e marketplace são obrigatórios.");
  await assertClientAccess(user, clientId);

  const revenue = toNumber(formData.get("revenue"));
  const cogs = toNumber(formData.get("cogs"));
  const fees = toNumber(formData.get("fees"));
  const shipping = toNumber(formData.get("shipping"));
  const tax = toNumber(formData.get("tax"));
  const ads = toNumber(formData.get("ads"));
  const profitField = str(formData.get("profit"));
  // lucro em branco = calculado a partir dos custos informados
  const profit = profitField === "" ? revenue - cogs - fees - shipping - tax - ads : toNumber(formData.get("profit"));

  const existing = await one<{ id: string }>(
    "SELECT id FROM finance_snapshots WHERE client_id=? AND marketplace=? AND ref_month=?",
    clientId,
    marketplace,
    refMonth,
  );

  if (existing) {
    await run(
      `UPDATE finance_snapshots SET revenue=?, orders=?, units=?, cogs=?, fees=?, shipping=?, tax=?, ads=?, profit=?,
              source='manual', updated_by=?, updated_at=? WHERE id=?`,
      revenue,
      toNumber(formData.get("orders")),
      toNumber(formData.get("units")),
      cogs,
      fees,
      shipping,
      tax,
      ads,
      profit,
      user.id,
      now(),
      existing.id,
    );
  } else {
    await run(
      `INSERT INTO finance_snapshots (id, client_id, marketplace, ref_month, revenue, orders, units, cogs, fees,
                                      shipping, tax, ads, profit, source, updated_by, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?,?)`,
      id(),
      clientId,
      marketplace,
      refMonth,
      revenue,
      toNumber(formData.get("orders")),
      toNumber(formData.get("units")),
      cogs,
      fees,
      shipping,
      tax,
      ads,
      profit,
      user.id,
      now(),
    );
  }

  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=financeiro&mes=${refMonth}&ok=1`);
}

export async function addNoteAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  await assertClientAccess(user, clientId);
  const body = str(formData.get("body"));
  if (!body) redirect(`/clientes/${clientId}?tab=historico`);

  await run(
    "INSERT INTO client_notes (id, client_id, user_id, kind, body, pinned, created_at) VALUES (?,?,?,?,?,?,?)",
    id(),
    clientId,
    user.id,
    str(formData.get("kind")) || "nota",
    body,
    formData.get("pinned") ? 1 : 0,
    now(),
  );
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=historico&ok=1`);
}

export async function toggleNotePinAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  await assertClientAccess(user, clientId);
  await run("UPDATE client_notes SET pinned = 1 - pinned WHERE id = ?", str(formData.get("note_id")));
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=historico`);
}

export async function deleteNoteAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  await assertClientAccess(user, clientId);
  const noteId = str(formData.get("note_id"));
  const note = await one<{ user_id: string | null }>("SELECT user_id FROM client_notes WHERE id = ?", noteId);
  if (note && (note.user_id === user.id || can(user, "clientes.gerenciar"))) {
    await run("DELETE FROM client_notes WHERE id = ?", noteId);
  }
  await touch(clientId);
  redirect(`/clientes/${clientId}?tab=historico`);
}

/**
 * Vira o cliente para Ativo, mas só quando o onboarding obrigatório acabou.
 *
 * A checagem é refeita aqui de propósito: o botão já vem desabilitado na
 * tela, e desabilitar botão não é segurança. Sem isto, um POST direto
 * ativaria um cliente sem conta conectada nem meta.
 */
export async function concluirOnboardingAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  await assertClientAccess(user, clientId);
  assertCan(user, "clientes.gerenciar", "Somente gestores e admins ativam clientes.");

  const resultado = await avaliarOnboardingDoCliente(clientId);
  if (!resultado.completo) {
    throw new Error(
      `Ainda falta: ${resultado.pendentesObrigatorios.map((i: OnboardingItem) => i.label).join(", ")}.`,
    );
  }

  await run("UPDATE clients SET status = 'ativo', updated_at = ? WHERE id = ?", now(), clientId);
  await run(
    "INSERT INTO client_notes (id, client_id, user_id, kind, body, pinned, created_at) VALUES (?,?,?,?,?,0,?)",
    id(),
    clientId,
    user.id,
    "mudanca",
    "Onboarding concluído: cliente ativado.",
    now(),
  );

  await touch(clientId);
  redirect(`/clientes/${clientId}?ok=1`);
}
