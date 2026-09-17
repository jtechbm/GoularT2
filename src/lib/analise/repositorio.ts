import { all, id, now, one, run } from "@/lib/db";
import type { Scope } from "@/lib/queries";
import type { Dossie } from "./dossie";
import type { ResultadoAnalise } from "./llm";

/**
 * As análises gravadas.
 *
 * O dossiê é gravado junto do resultado: análise de três meses atrás sem os
 * números que a geraram é opinião solta, e ninguém consegue dizer depois se a
 * recomendação fazia sentido na época.
 */

export interface AnaliseGravada {
  id: string;
  client_id: string;
  client_marketplace_id: string;
  marketplace: string;
  ref_month: string;
  status: string;
  dossier: string;
  result: string | null;
  model: string | null;
  duration_ms: number | null;
  created_at: string;
  autor: string | null;
}

export interface AnaliseLida extends AnaliseGravada {
  dossie: Dossie;
  resultado: ResultadoAnalise | null;
}

const COLUNAS = `a.id, a.client_id, a.client_marketplace_id, a.marketplace, a.ref_month, a.status,
                 a.dossier, a.result, a.model, a.duration_ms, a.created_at, u.name AS autor`;

/** O escopo entra no WHERE, nunca numa conferência depois da consulta. */
function limite(escopo: Scope): string {
  if (!escopo) return "";
  return ` AND a.client_id IN (${escopo.map(() => "?").join(",") || "NULL"})`;
}

function ler(linha: AnaliseGravada | null): AnaliseLida | null {
  if (!linha) return null;
  return {
    ...linha,
    dossie: JSON.parse(linha.dossier) as Dossie,
    resultado: linha.result ? (JSON.parse(linha.result) as ResultadoAnalise) : null,
  };
}

export async function gravarAnalise(entrada: {
  clientId: string;
  lojaId: string;
  marketplace: string;
  refMonth: string;
  dossie: Dossie;
  resultado: ResultadoAnalise;
  duracaoMs: number;
  userId: string | null;
}): Promise<string> {
  const analiseId = id();
  await run(
    `INSERT INTO store_analyses (id, client_id, client_marketplace_id, marketplace, ref_month, status,
                                 dossier, result, model, duration_ms, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    analiseId,
    entrada.clientId,
    entrada.lojaId,
    entrada.marketplace,
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

/** A análise mais recente da loja, que é o que a tela abre sem gastar nada. */
export async function ultimaAnalise(lojaId: string, escopo: Scope): Promise<AnaliseLida | null> {
  return ler(
    await one<AnaliseGravada>(
      `SELECT ${COLUNAS} FROM store_analyses a
         LEFT JOIN users u ON u.id = a.created_by
        WHERE a.client_marketplace_id = ?${limite(escopo)}
        ORDER BY a.created_at DESC LIMIT 1`,
      lojaId,
      ...(escopo ?? []),
    ),
  );
}

export async function analisePorId(analiseId: string, escopo: Scope): Promise<AnaliseLida | null> {
  return ler(
    await one<AnaliseGravada>(
      `SELECT ${COLUNAS} FROM store_analyses a
         LEFT JOIN users u ON u.id = a.created_by
        WHERE a.id = ?${limite(escopo)}`,
      analiseId,
      ...(escopo ?? []),
    ),
  );
}

/** Só o cabeçalho das anteriores: o JSON inteiro de cada uma não vai para a tela. */
export async function historicoDaLoja(lojaId: string, escopo: Scope, limiteLinhas = 10) {
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
      WHERE a.client_marketplace_id = ?${limite(escopo)}
      ORDER BY a.created_at DESC
      LIMIT ${Number(limiteLinhas)}`,
    lojaId,
    ...(escopo ?? []),
  );
}
