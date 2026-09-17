import { all, id, now, one, run } from "../db.ts";
import { notificarVarios } from "../notificacoes.ts";
import type { Severidade } from "./regras.ts";

/**
 * Gravar penalidade e avisar gente, num lugar só.
 *
 * Nasceu no módulo do Mercado Livre e virou compartilhado quando a Shopee
 * entrou: duas cópias da mesma regra de notificação é como um marketplace
 * começa a avisar diferente do outro sem ninguém perceber.
 */

export interface ContaPenalizavel {
  id: string;
  client_id: string;
  client_name: string;
  owner_id: string | null;
}

/**
 * Quem recebe o aviso: admin e gestor, que enxergam a carteira inteira,
 * mais o responsável e a equipe do cliente. Membro de fora não é avisado
 * de cliente que ele nem consegue abrir.
 */
export async function destinatarios(conta: ContaPenalizavel): Promise<string[]> {
  const gestao = await all<{ id: string }>(
    "SELECT id FROM users WHERE active = 1 AND role IN ('admin','gestor')",
  );
  const equipe = await all<{ user_id: string }>(
    `SELECT ct.user_id FROM client_team ct JOIN users u ON u.id = ct.user_id
      WHERE ct.client_id = ? AND u.active = 1`,
    conta.client_id,
  );
  return [
    ...gestao.map((g) => g.id),
    ...equipe.map((e) => e.user_id),
    ...(conta.owner_id ? [conta.owner_id] : []),
  ];
}

export interface PenalidadeNova {
  kind: string;
  severity: Severidade;
  externalKey: string;
  title: string;
  detail: string;
  data: unknown;
}

/**
 * Grava a penalidade se ela é nova e avisa as pessoas certas.
 *
 * O índice único (conta, tipo, chave externa) é o que garante que a mesma
 * penalidade não seja avisada de novo amanhã. Se já existe, não faz nada,
 * nem notifica.
 */
export async function registrarPenalidade(
  conta: ContaPenalizavel,
  marketplace: string,
  p: PenalidadeNova,
): Promise<boolean> {
  const existente = await one<{ id: string }>(
    "SELECT id FROM penalties WHERE client_marketplace_id = ? AND kind = ? AND external_key = ?",
    conta.id,
    p.kind,
    p.externalKey,
  );
  if (existente) return false;

  const penaltyId = id();
  await run(
    `INSERT INTO penalties (id, client_id, client_marketplace_id, marketplace, kind, severity, external_key,
                            title, detail, data, status, detected_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'aberta',?)`,
    penaltyId,
    conta.client_id,
    conta.id,
    marketplace,
    p.kind,
    p.severity,
    p.externalKey,
    p.title,
    p.detail,
    JSON.stringify(p.data),
    now(),
  );

  // aviso informativo fica registrado mas não interrompe ninguém
  if (p.severity !== "informativo") {
    const criadas = await notificarVarios(await destinatarios(conta), {
      actorId: null,
      type: "penalidade",
      title: `${conta.client_name}: ${p.title}`,
      body: p.detail.slice(0, 200),
      href: `/penalidades?cliente=${conta.client_id}`,
      clientId: conta.client_id,
    });

    // a entrega por canal fica anotada: o canal 'app' já está entregue pelo
    // simples fato de a notificação existir; o WhatsApp vai entrar como outro
    // canal lendo as pendentes daqui
    for (const notifId of criadas) {
      await run(
        `INSERT INTO notification_deliveries (id, notification_id, channel, status, attempts, created_at, sent_at)
         VALUES (?,?,'app','entregue',1,?,?)
         ON CONFLICT (notification_id, channel) DO NOTHING`,
        id(),
        notifId,
        now(),
        now(),
      );
    }
  }

  return true;
}

/**
 * Fecha sozinha a penalidade que deixou de existir na origem.
 *
 * O indicador voltou para dentro do alvo, o pedido atrasado foi enviado, o
 * anúncio voltou do bloqueio: nesses casos quem resolveu foi a operação, não
 * alguém clicando na tela. Fica marcada como auto_resolved para ninguém
 * confundir com resolução feita à mão.
 */
export async function resolverAutomatico(
  contaId: string,
  kind: string,
  chavesAbertas: string[],
  nota: string,
): Promise<number> {
  const abertas = await all<{ id: string; external_key: string }>(
    "SELECT id, external_key FROM penalties WHERE client_marketplace_id = ? AND kind = ? AND status = 'aberta'",
    contaId,
    kind,
  );
  const vivas = new Set(chavesAbertas);
  let fechadas = 0;
  for (const p of abertas) {
    if (vivas.has(p.external_key)) continue;
    await run(
      `UPDATE penalties SET status = 'resolvida', resolved_at = ?, auto_resolved = 1, resolution_note = ?
        WHERE id = ?`,
      now(),
      nota,
      p.id,
    );
    fechadas += 1;
  }
  return fechadas;
}
