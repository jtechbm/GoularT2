import { all, id, now, one, run } from "@/lib/db";
import type { Scope } from "@/lib/queries";
import type { Dossie } from "./dossie";
import type { ResultadoAnalise } from "./llm";

/**
 * As análises gravadas, uma por cliente e por rodada.
 *
 * O dossiê é gravado junto do resultado: análise de três meses atrás sem os
 * números que a geraram é opinião solta, e ninguém consegue dizer depois se a
 * recomendação fazia sentido na época.
 */

interface LinhaAnalise {
  id: string;
  client_id: string;
  ref_month: string;
  status: string;
  dossier: string;
  result: string | null;
  model: string | null;
  duration_ms: number | null;
  created_at: string;
  autor: string | null;
}

export interface AnaliseLida {
  id: string;
  client_id: string;
  ref_month: string;
  status: string;
  model: string | null;
  duration_ms: number | null;
  created_at: string;
  autor: string | null;
  dossie: Dossie;
  resultado: ResultadoAnalise | null;
}

const COLUNAS = `a.id, a.client_id, a.ref_month, a.status, a.dossier, a.result, a.model,
                 a.duration_ms, a.created_at, u.name AS autor`;

/** O escopo entra no WHERE, nunca numa conferência depois da consulta. */
function limite(escopo: Scope): string {
  if (!escopo) return "";
  return ` AND a.client_id IN (${escopo.map(() => "?").join(",") || "NULL"})`;
}

/**
 * Lê a linha, descartando análise de formato antigo.
 *
 * O dossiê é JSON gravado: quando o formato muda, linha velha não pode
 * derrubar a tela. Sem `porLoja` é análise de antes de a unidade virar o
 * cliente, e ela é ignorada em vez de renderizada pela metade.
 */
function ler(linha: LinhaAnalise | null): AnaliseLida | null {
  if (!linha) return null;
  const dossie = JSON.parse(linha.dossier) as Dossie;
  if (!Array.isArray(dossie?.porLoja)) return null;
  return {
    id: linha.id,
    client_id: linha.client_id,
    ref_month: linha.ref_month,
    status: linha.status,
    model: linha.model,
    duration_ms: linha.duration_ms,
    created_at: linha.created_at,
    autor: linha.autor,
    dossie,
    resultado: linha.result ? (JSON.parse(linha.result) as ResultadoAnalise) : null,
  };
}

export async function gravarAnalise(entrada: {
  clientId: string;
  refMonth: string;
  dossie: Dossie;
  resultado: ResultadoAnalise;
  duracaoMs: number;
  userId: string | null;
}): Promise<string> {
  const analiseId = id();
  await run(
    `INSERT INTO store_analyses (id, client_id, ref_month, status, dossier, result, model,
                                 duration_ms, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    analiseId,
    entrada.clientId,
    entrada.refMonth,
    entrada.resultado.status,
    JSON.stringify(entrada.dossie),
    JSON.stringify(entrada.resultado),
    entrada.resultado.modelo,
    entrada.duracaoMs,
    entrada.userId,
    now(),
  );
  return analiseId;
}

/** A análise mais recente do cliente, que é o que a tela abre sem gastar nada. */
export async function ultimaAnalise(clientId: string, escopo: Scope): Promise<AnaliseLida | null> {
  const linhas = await all<LinhaAnalise>(
    `SELECT ${COLUNAS} FROM store_analyses a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.client_id = ?${limite(escopo)}
      ORDER BY a.created_at DESC LIMIT 5`,
    clientId,
    ...(escopo ?? []),
  );
  // a primeira que estiver no formato atual; as antigas ficam só no histórico
  for (const linha of linhas) {
    const lida = ler(linha);
    if (lida) return lida;
  }
  return null;
}

export async function analisePorId(analiseId: string, escopo: Scope): Promise<AnaliseLida | null> {
  return ler(
    await one<LinhaAnalise>(
      `SELECT ${COLUNAS} FROM store_analyses a
         LEFT JOIN users u ON u.id = a.created_by
        WHERE a.id = ?${limite(escopo)}`,
      analiseId,
      ...(escopo ?? []),
    ),
  );
}

/** Só o cabeçalho das anteriores: o JSON inteiro de cada uma não vai para a tela. */
export async function historicoDoCliente(clientId: string, escopo: Scope, limiteLinhas = 10) {
  return all<{
    id: string;
    ref_month: string;
    status: string;
    duration_ms: number | null;
    created_at: string;
    autor: string | null;
  }>(
    `SELECT a.id, a.ref_month, a.status, a.duration_ms, a.created_at, u.name AS autor
       FROM store_analyses a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.client_id = ?${limite(escopo)}
      ORDER BY a.created_at DESC
      LIMIT ${Number(limiteLinhas)}`,
    clientId,
    ...(escopo ?? []),
  );
}
