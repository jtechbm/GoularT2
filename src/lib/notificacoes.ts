import { all, id, now, run } from "./db.ts";

/**
 * Notificações.
 *
 * Três decisões que evitam que isto vire ruído:
 *
 * 1. Ninguém é notificado da própria ação. Quem comenta não recebe aviso
 *    do comentário que acabou de escrever.
 * 2. Uma linha por pessoa avisada, não uma por evento. Assim cada um marca
 *    como lida no seu tempo sem apagar o aviso dos outros.
 * 3. Menção só vale para quem existe e está ativo. Escrever @qualquercoisa
 *    não cria notificação fantasma.
 */
export type TipoNotificacao =
  | "atribuicao"
  | "mencao"
  | "comentario"
  | "revisao"
  | "aprovada"
  | "reprovada"
  | "prazo";

export interface NovaNotificacao {
  userId: string;
  actorId: string | null;
  type: TipoNotificacao;
  title: string;
  body?: string | null;
  href: string;
  taskId?: string | null;
  clientId?: string | null;
}

export async function notificar(n: NovaNotificacao): Promise<void> {
  // a própria ação não vira aviso para quem a fez
  if (n.actorId && n.actorId === n.userId) return;

  await run(
    `INSERT INTO notifications (id, user_id, actor_id, type, title, body, href, task_id, client_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id(),
    n.userId,
    n.actorId,
    n.type,
    n.title,
    n.body ?? null,
    n.href,
    n.taskId ?? null,
    n.clientId ?? null,
    now(),
  );
}

export async function notificarVarios(usuarios: string[], base: Omit<NovaNotificacao, "userId">): Promise<number> {
  const unicos = [...new Set(usuarios)].filter((u) => u && u !== base.actorId);
  for (const userId of unicos) await notificar({ ...base, userId });
  return unicos.length;
}

/** Nomes citados com @ no texto, na ordem em que aparecem. */
export function extrairMencoes(texto: string): string[] {
  // o @ precisa começar a palavra, senão marco@jtech.com.br viraria uma
  // menção a "jtech". Aceita "@joana" e "@joana Silva": o segundo nome só
  // entra se começar com maiúscula, senão "@joana e o resto" viraria nome.
  const achados = texto.match(/(?<=^|[\s(])@([\p{L}]+(?:\s+[\p{Lu}][\p{L}]*)?)/gu) ?? [];
  return achados.map((m) => m.replace(/^[\s(]*@/, "").trim());
}

/**
 * Traduz os @ do texto em ids de usuário.
 *
 * Casa por primeiro nome em minúsculas. Quando dois colegas têm o mesmo
 * primeiro nome, os dois recebem: avisar demais é melhor do que avisar a
 * pessoa errada e ninguém perceber.
 */
export async function resolverMencoes(texto: string): Promise<{ ids: string[]; nomes: string[] }> {
  const citados = extrairMencoes(texto);
  if (!citados.length) return { ids: [], nomes: [] };

  const pessoas = await all<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE active = 1",
  );

  const ids: string[] = [];
  const nomes: string[] = [];

  for (const citado of citados) {
    const alvo = citado.toLowerCase();
    for (const p of pessoas) {
      const nomeCompleto = p.name.toLowerCase();
      const primeiro = nomeCompleto.split(/\s+/)[0];
      if (primeiro === alvo || nomeCompleto === alvo || nomeCompleto.startsWith(`${alvo} `)) {
        if (!ids.includes(p.id)) {
          ids.push(p.id);
          nomes.push(p.name);
        }
      }
    }
  }

  return { ids, nomes };
}

/** Corta o texto para caber na notificação sem virar parágrafo. */
export function resumir(texto: string, limite = 120): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}
