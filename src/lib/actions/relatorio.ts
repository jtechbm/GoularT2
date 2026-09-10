"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, run } from "@/lib/db";
import { assertClientAccess, requireUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { monthLabel } from "@/lib/format";

/**
 * Registra que o relatório do mês foi emitido.
 *
 * Vira anotação no histórico do cliente, e não uma tabela nova. O que
 * importa é saber que o cliente recebeu o resultado daquele mês e quando,
 * e o histórico já é o lugar onde a equipe procura esse tipo de coisa.
 */
export async function registrarRelatorioAction(formData: FormData) {
  const user = await requireUser();
  const clientId = str(formData.get("client_id"));
  const refMonth = str(formData.get("ref_month"));
  await assertClientAccess(user, clientId);

  await run(
    "INSERT INTO client_notes (id, client_id, user_id, kind, body, pinned, created_at) VALUES (?,?,?,?,?,0,?)",
    id(),
    clientId,
    user.id,
    "financeiro",
    `Relatório de ${monthLabel(refMonth)} gerado.`,
    now(),
  );

  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}/relatorio?mes=${refMonth}`);
}
