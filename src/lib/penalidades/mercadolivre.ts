import { all, id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { refreshIfNeeded } from "../integrations/mercadolivre.ts";
import type { StoredCredentials } from "../integrations/types.ts";
import { notificarVarios } from "../notificacoes.ts";
import {
  avisoEhAlerta,
  compararReputacao,
  NIVEL_LABEL,
  nivelEfetivo,
  posicaoNivel,
  severidadeDoNivel,
  textoPlano,
  type Severidade,
} from "./regras.ts";

const API = "https://api.mercadolibre.com";

/**
 * Verificação de penalidades de uma conta do Mercado Livre.
 *
 * Três fontes, todas oficiais:
 *   - reputação do vendedor (/users/{id})
 *   - avisos oficiais ao vendedor (/communications/notices)
 *   - moderações de anúncio (/moderations), que exige a permissão de
 *     anúncios no app; sem ela a API responde 403 e o sistema registra a
 *     pendência em vez de fingir que está tudo limpo
 *
 * O módulo usa caminhos relativos e não importa "server-only": roda igual
 * na tela, no agendamento diário e na linha de comando.
 */
export interface ResultadoVerificacao {
  ok: boolean;
  novas: number;
  resolvidas: number;
  nivel: string | null;
  permissaoAnuncios: "liberada" | "pendente" | "desconhecida";
  mensagem: string;
}

interface Conta {
  id: string;
  client_id: string;
  client_name: string;
  owner_id: string | null;
  credentials: string | null;
}

/**
 * Quem recebe o aviso: admin e gestor, que enxergam a carteira inteira,
 * mais o responsável e a equipe do cliente. Membro de fora não é avisado
 * de cliente que ele nem consegue abrir.
 */
async function destinatarios(conta: Conta): Promise<string[]> {
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

/**
 * Grava a penalidade se ela é nova e avisa as pessoas certas.
 *
 * O índice único (conta, tipo, chave externa) é o que garante que a mesma
 * penalidade não seja avisada de novo amanhã. Se já existe, não faz nada,
 * nem notifica.
 */
async function registrar(
  conta: Conta,
  p: {
    kind: string;
    severity: Severidade;
    externalKey: string;
    title: string;
    detail: string;
    data: unknown;
  },
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
     VALUES (?,?,?,'mercado_livre',?,?,?,?,?,?,'aberta',?)`,
    penaltyId,
    conta.client_id,
    conta.id,
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

async function verificarReputacao(conta: Conta, token: string, userId: string) {
  const res = await fetch(`${API}/users/${userId}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Reputação indisponível (${res.status}).`);

  const corpo = (await res.json()) as {
    seller_reputation?: {
      level_id?: string | null;
      real_level?: string | null;
      protection_end_date?: string | null;
      power_seller_status?: string | null;
      metrics?: {
        sales?: { completed?: number; period?: string };
        claims?: { rate?: number; value?: number };
        delayed_handling_time?: { rate?: number; value?: number };
        cancellations?: { rate?: number; value?: number };
      };
    };
  };

  const rep = corpo.seller_reputation ?? {};
  const m = rep.metrics ?? {};
  const atual = nivelEfetivo(rep);

  const anterior = await one<{ level_id: string | null; real_level: string | null }>(
    `SELECT level_id, real_level FROM reputation_snapshots
      WHERE client_marketplace_id = ? ORDER BY captured_at DESC LIMIT 1`,
    conta.id,
  );

  await run(
    `INSERT INTO reputation_snapshots (id, client_marketplace_id, level_id, real_level, protection_end_date,
       power_seller_status, claims_rate, claims_value, delayed_rate, delayed_value, cancellations_rate,
       cancellations_value, sales_completed, metrics_period, captured_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id(),
    conta.id,
    rep.level_id ?? null,
    rep.real_level ?? null,
    rep.protection_end_date ?? null,
    rep.power_seller_status ?? null,
    m.claims?.rate ?? null,
    m.claims?.value ?? null,
    m.delayed_handling_time?.rate ?? null,
    m.delayed_handling_time?.value ?? null,
    m.cancellations?.rate ?? null,
    m.cancellations?.value ?? null,
    m.sales?.completed ?? null,
    m.sales?.period ?? null,
    now(),
  );

  const mudanca = compararReputacao(anterior ? nivelEfetivo(anterior) : null, atual);
  const protegida = Boolean(rep.real_level && rep.real_level !== rep.level_id);
  const metricas =
    `Reclamações ${((m.claims?.rate ?? 0) * 100).toFixed(2)}%, ` +
    `atraso no envio ${((m.delayed_handling_time?.rate ?? 0) * 100).toFixed(2)}%, ` +
    `cancelamentos ${((m.cancellations?.rate ?? 0) * 100).toFixed(2)}%.`;

  let novas = 0;
  let resolvidas = 0;

  if (mudanca.tipo === "piorou" || mudanca.tipo === "primeira_leitura_ruim") {
    const titulo =
      mudanca.tipo === "piorou"
        ? `Reputação caiu de ${NIVEL_LABEL[mudanca.de!] ?? mudanca.de} para ${NIVEL_LABEL[atual!] ?? atual}`
        : `Reputação ${NIVEL_LABEL[atual!] ?? atual}`;
    const detalhe =
      `${metricas}` +
      (protegida
        ? ` A conta está protegida pelo Decola e mostra ${NIVEL_LABEL[rep.level_id!] ?? rep.level_id}, mas a cor real é ${NIVEL_LABEL[rep.real_level!] ?? rep.real_level}${rep.protection_end_date ? ` até ${rep.protection_end_date.slice(0, 10)}` : ""}.`
        : "");

    // A chave leva a cor e o dia da queda. Só a cor não basta: uma conta
    // que cai para amarela, se recupera e cai de novo bateria na mesma
    // chave, e a recaída, que é o caso mais grave, passaria sem aviso.
    // O dia segura a duplicidade de quem roda a verificação duas vezes.
    const sev = severidadeDoNivel(atual);
    if (
      await registrar(conta, {
        kind: "reputacao",
        // perder cor é sempre para avisar, mesmo de verde para verde-clara
        severity: mudanca.tipo === "piorou" && sev === "informativo" ? "atencao" : sev,
        externalKey: `nivel:${atual}:${new Date().toISOString().slice(0, 10)}`,
        title: titulo,
        detail: detalhe,
        data: rep,
      })
    ) {
      novas += 1;
    }
  }

  // Quando a cor melhora, fecha só as penalidades de cores PIORES que a
  // atual. Sair de vermelha para amarela resolve a vermelha, mas a conta
  // continua abaixo do verde e isso não pode sumir da tela.
  if (mudanca.tipo === "melhorou" || mudanca.tipo === "primeira_leitura_ok") {
    const posAtual = posicaoNivel(atual) ?? 5;
    const abertas = await all<{ id: string; external_key: string }>(
      `SELECT id, external_key FROM penalties
        WHERE client_marketplace_id = ? AND kind = 'reputacao' AND status = 'aberta'`,
      conta.id,
    );
    for (const a of abertas) {
      const nivelDaPenalidade = a.external_key.split(":")[1] ?? null;
      const pos = posicaoNivel(nivelDaPenalidade);
      if (pos !== null && pos >= posAtual) continue;
      await run(
        `UPDATE penalties SET status = 'resolvida', resolved_at = ?, auto_resolved = 1,
                resolution_note = ? WHERE id = ?`,
        now(),
        `Reputação voltou para ${NIVEL_LABEL[atual!] ?? atual}.`,
        a.id,
      );
      resolvidas += 1;
    }

    // melhorou mas ainda está amarela ou pior: fica registrado sem disparar
    // aviso, porque a notícia é boa e não pede ação imediata. Se já existe
    // penalidade aberta nessa mesma cor, ela continua valendo e não precisa
    // de outra ao lado dizendo a mesma coisa.
    const jaAbertaNaCor = abertas.some(
      (a) => a.external_key.split(":")[1] === atual,
    );
    if (mudanca.tipo === "melhorou" && posAtual <= 3 && !jaAbertaNaCor) {
      if (
        await registrar(conta, {
          kind: "reputacao",
          severity: "informativo",
          externalKey: `nivel:${atual}:${new Date().toISOString().slice(0, 10)}`,
          title: `Reputação melhorou para ${NIVEL_LABEL[atual!] ?? atual}, ainda abaixo do verde`,
          detail: metricas,
          data: rep,
        })
      ) {
        novas += 1;
      }
    }
  }

  return { novas, resolvidas, nivel: atual };
}

async function verificarAvisos(conta: Conta, token: string) {
  const res = await fetch(`${API}/communications/notices?limit=50`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) return { novas: 0 };

  const corpo = (await res.json()) as {
    results?: {
      id: string | number;
      category?: string;
      sub_category?: string;
      title?: string;
      label?: string;
      description?: string;
      highlighted?: boolean;
      from_date?: string;
    }[];
  };

  let novas = 0;
  for (const n of corpo.results ?? []) {
    const alerta = avisoEhAlerta(n);

    await run(
      `INSERT INTO marketplace_notices (id, client_marketplace_id, external_id, category, sub_category, title,
                                        description, highlighted, from_date, is_alert, first_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (client_marketplace_id, external_id) DO NOTHING`,
      id(),
      conta.id,
      String(n.id),
      n.category ?? null,
      n.sub_category ?? null,
      n.title ?? n.label ?? null,
      n.description ?? null,
      n.highlighted ? 1 : 0,
      n.from_date ?? null,
      alerta ? 1 : 0,
      now(),
    );

    if (
      alerta &&
      (await registrar(conta, {
        kind: "aviso",
        severity: n.highlighted ? "critico" : "atencao",
        externalKey: `aviso:${n.id}`,
        title: n.title ?? n.label ?? "Aviso do Mercado Livre",
        detail: textoPlano(n.description),
        data: n,
      }))
    ) {
      novas += 1;
    }
  }
  return { novas };
}

/**
 * Moderações de anúncio.
 *
 * Sem a permissão de anúncios no app, a API devolve 403 com
 * PA_UNAUTHORIZED_RESULT_FROM_POLICIES. Isso fica gravado na conta para a
 * tela avisar que esta parte está cega, em vez de mostrar "nenhuma
 * infração" quando na verdade o sistema não consegue olhar.
 *
 * O formato da resposta liberada ainda não foi visto numa conta real, então
 * esta função só detecta a permissão. A leitura das infrações entra quando
 * a permissão for liberada e der para conferir os campos.
 */
async function verificarPermissaoAnuncios(conta: Conta, token: string, userId: string) {
  const res = await fetch(`${API}/moderations/infractions/${userId}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const permissao = res.status === 403 ? "pendente" : res.ok ? "liberada" : "desconhecida";
  await run("UPDATE client_marketplaces SET items_permission = ? WHERE id = ?", permissao, conta.id);
  return permissao as ResultadoVerificacao["permissaoAnuncios"];
}

export async function verificarPenalidadesML(accountId: string): Promise<ResultadoVerificacao> {
  const conta = await one<Conta>(
    `SELECT cm.id, cm.client_id, c.name AS client_name, c.owner_id, cm.credentials
       FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
      WHERE cm.id = ? AND cm.marketplace = 'mercado_livre'`,
    accountId,
  );
  if (!conta) {
    return { ok: false, novas: 0, resolvidas: 0, nivel: null, permissaoAnuncios: "desconhecida", mensagem: "Conta não encontrada." };
  }

  const creds = decryptJSON<StoredCredentials>(conta.credentials);
  if (!creds?.access_token || !creds.user_id) {
    return {
      ok: false, novas: 0, resolvidas: 0, nivel: null, permissaoAnuncios: "desconhecida",
      mensagem: "Conta sem autorização válida.",
    };
  }

  try {
    const token = await refreshIfNeeded({
      externalId: null,
      credentials: creds,
      saveCredentials: async (next) => {
        await run("UPDATE client_marketplaces SET credentials = ? WHERE id = ?", encryptJSON(next), conta.id);
      },
    });

    const rep = await verificarReputacao(conta, token, creds.user_id);
    const avisos = await verificarAvisos(conta, token);
    const permissao = await verificarPermissaoAnuncios(conta, token, creds.user_id);

    await run("UPDATE client_marketplaces SET penalties_checked_at = ? WHERE id = ?", now(), conta.id);

    const novas = rep.novas + avisos.novas;
    return {
      ok: true,
      novas,
      resolvidas: rep.resolvidas,
      nivel: rep.nivel,
      permissaoAnuncios: permissao,
      mensagem: `${novas} ${novas === 1 ? "penalidade nova" : "penalidades novas"}, reputação ${NIVEL_LABEL[rep.nivel ?? ""] ?? "sem cor"}`,
    };
  } catch (e) {
    return {
      ok: false, novas: 0, resolvidas: 0, nivel: null, permissaoAnuncios: "desconhecida",
      mensagem: e instanceof Error ? e.message : String(e),
    };
  }
}
