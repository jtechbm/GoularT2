"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, id, now, one, run } from "@/lib/db";
import { assertCan, assertClientAccess, requireUser, visibleClientIds } from "@/lib/auth";
import { str, strOrNull } from "@/lib/format";
import { verificarPenalidadesML } from "@/lib/penalidades/mercadolivre";

function refresh(clientId?: string | null) {
  revalidatePath("/penalidades");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

/**
 * Marca a penalidade como resolvida, com o que foi feito.
 *
 * O motivo é obrigatório. "Resolvida" sem explicação vira um botão para
 * limpar a tela, e daqui a um mês ninguém sabe se o problema foi corrigido
 * ou só escondido.
 */
export async function resolverPenalidadeAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "penalidades.resolver", "Somente gestores e admins resolvem penalidades.");

  const penaltyId = str(formData.get("penalty_id"));
  const nota = str(formData.get("nota")).trim();
  if (!nota) throw new Error("Diga o que foi feito para resolver.");

  const p = await one<{ client_id: string }>("SELECT client_id FROM penalties WHERE id = ?", penaltyId);
  if (!p) throw new Error("Penalidade não encontrada.");
  await assertClientAccess(user, p.client_id);

  await run(
    `UPDATE penalties SET status = 'resolvida', resolved_at = ?, resolved_by = ?, resolution_note = ?
      WHERE id = ? AND status = 'aberta'`,
    now(),
    user.id,
    nota,
    penaltyId,
  );
  await run(
    "INSERT INTO client_notes (id, client_id, user_id, kind, body, pinned, created_at) VALUES (?,?,?,?,?,0,?)",
    id(),
    p.client_id,
    user.id,
    "alerta",
    `Penalidade resolvida: ${nota}`,
    now(),
  );

  refresh(p.client_id);
  redirect(str(formData.get("redirect_to")) || "/penalidades");
}

export async function reabrirPenalidadeAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "penalidades.resolver", "Somente gestores e admins reabrem penalidades.");
  const penaltyId = str(formData.get("penalty_id"));

  const p = await one<{ client_id: string }>("SELECT client_id FROM penalties WHERE id = ?", penaltyId);
  if (!p) throw new Error("Penalidade não encontrada.");
  await assertClientAccess(user, p.client_id);

  await run(
    `UPDATE penalties SET status = 'aberta', resolved_at = NULL, resolved_by = NULL, resolution_note = NULL,
            auto_resolved = 0 WHERE id = ?`,
    penaltyId,
  );
  refresh(p.client_id);
  redirect(str(formData.get("redirect_to")) || "/penalidades");
}

/** Vira tarefa para alguém da equipe corrigir. */
export async function tarefaDaPenalidadeAction(formData: FormData) {
  const user = await requireUser();
  const penaltyId = str(formData.get("penalty_id"));

  const p = await one<{ client_id: string; title: string; detail: string | null; severity: string }>(
    "SELECT client_id, title, detail, severity FROM penalties WHERE id = ?",
    penaltyId,
  );
  if (!p) throw new Error("Penalidade não encontrada.");
  await assertClientAccess(user, p.client_id);

  const taskId = id();
  const prioridade = p.severity === "critico" ? "urgente" : "alta";
  await run(
    `INSERT INTO tasks (id, title, description, client_id, priority, status, points, created_by,
                        created_at, updated_at)
     VALUES (?,?,?,?,?,'disponivel',?,?,?,?)`,
    taskId,
    `Corrigir penalidade: ${p.title}`,
    `${p.detail ?? ""}\n\nCriada a partir da penalidade ${penaltyId}.`,
    p.client_id,
    prioridade,
    prioridade === "urgente" ? 35 : 20,
    user.id,
    now(),
    now(),
  );

  refresh(p.client_id);
  redirect(`/tarefas/${taskId}`);
}

/**
 * Verifica agora, sem esperar a rodada diária.
 *
 * Só as contas que a pessoa enxerga. Um membro clicando aqui não dispara
 * leitura de cliente que não é dele.
 */
export async function verificarPenalidadesAgoraAction(formData: FormData) {
  const user = await requireUser();
  const clientId = strOrNull(formData.get("client_id"));
  if (clientId) await assertClientAccess(user, clientId);

  const escopo = await visibleClientIds(user);
  const contas = await all<{ id: string; client_id: string }>(
    `SELECT id, client_id FROM client_marketplaces
      WHERE marketplace = 'mercado_livre' AND status = 'conectado' AND credentials IS NOT NULL
        ${clientId ? "AND client_id = ?" : ""}`,
    ...(clientId ? [clientId] : []),
  );

  let novas = 0;
  let erros = 0;
  for (const c of contas) {
    if (escopo && !escopo.includes(c.client_id)) continue;
    const r = await verificarPenalidadesML(c.id);
    novas += r.novas;
    if (!r.ok) erros += 1;
  }

  refresh(clientId);
  const destino = str(formData.get("redirect_to")) || "/penalidades";
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}verificado=${novas}&erros=${erros}`);
}
