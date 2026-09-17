import { all, id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { refreshIfNeeded } from "../integrations/mercadolivre.ts";
import type { StoredCredentials } from "../integrations/types.ts";
import { registrarPenalidade, resolverAutomatico } from "./registro.ts";
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

/** O registro e a notificação moram em registro.ts, compartilhados com a Shopee. */
async function registrar(
  conta: Conta,
  p: { kind: string; severity: Severidade; externalKey: string; title: string; detail: string; data: unknown },
): Promise<boolean> {
  return registrarPenalidade(conta, "mercado_livre", p);
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

/**
 * Anúncio que o Mercado Livre bloqueou, e não que o lojista pausou.
 *
 * A diferença está no sub_status, não no status: "paused" é escolha do
 * vendedor, enquanto "under_review" com sub_status forbidden é o marketplace
 * derrubando o anúncio. Na conta do Kadu havia dois proibidos e um aguardando
 * correção — nenhum deles apareceria numa busca por anúncios ativos.
 *
 * Lê da tabela de anúncios, que a importação já preencheu: o dado veio de uma
 * chamada que o comparador de preços paga, então aqui não custa nada.
 */
const SUB_STATUS: Record<string, { titulo: string; severidade: Severidade; texto: string }> = {
  forbidden: {
    titulo: "Anúncio proibido pelo Mercado Livre",
    severidade: "critico",
    texto:
      "O Mercado Livre classificou o anúncio como proibido. Ele está fora do ar e não volta sozinho: " +
      "costuma ser imagem de terceiro, marca protegida, produto restrito ou anúncio duplicado.",
  },
  waiting_for_patch: {
    titulo: "Anúncio aguardando correção",
    severidade: "atencao",
    texto:
      "O Mercado Livre pediu uma correção no anúncio e o deixou em revisão. Enquanto não for corrigido " +
      "ele não aparece na busca.",
  },
  suspended: {
    titulo: "Anúncio suspenso",
    severidade: "critico",
    texto: "O Mercado Livre suspendeu o anúncio. Enquanto durar a suspensão ele não vende.",
  },
  deleted: {
    titulo: "Anúncio excluído pelo Mercado Livre",
    severidade: "critico",
    texto: "O anúncio foi excluído pelo marketplace, não pelo lojista.",
  },
  freeze: {
    titulo: "Anúncio congelado",
    severidade: "atencao",
    texto: "O anúncio está congelado pelo Mercado Livre e não recebe visitas.",
  },
};

async function verificarAnunciosBloqueados(conta: Conta) {
  const anuncios = await all<{ external_id: string; title: string; status: string | null; sub_status: string | null }>(
    `SELECT external_id, title, status, sub_status FROM client_products
      WHERE client_marketplace_id = ? AND sub_status IS NOT NULL`,
    conta.id,
  );

  let novas = 0;
  const abertas: string[] = [];

  for (const a of anuncios) {
    for (const marca of (a.sub_status ?? "").split(",")) {
      const regra = SUB_STATUS[marca.trim()];
      if (!regra) continue;
      const chave = `anuncio:${a.external_id}:${marca.trim()}`;
      abertas.push(chave);
      const criou = await registrar(conta, {
        kind: "anuncio",
        severity: regra.severidade,
        externalKey: chave,
        title: `${regra.titulo}: ${a.title}`,
        detail: `${regra.texto} Anúncio ${a.external_id}, status ${a.status ?? "—"}.`,
        data: a,
      });
      if (criou) novas += 1;
    }
  }

  const resolvidas = await resolverAutomatico(
    conta.id,
    "anuncio",
    abertas,
    "O anúncio saiu da revisão ou do bloqueio.",
  );
  return { novas, resolvidas, bloqueados: abertas.length };
}

/**
 * Pedidos com envio atrasado, que é o que derruba a reputação mais rápido.
 *
 * A janela de 21 dias não é enfeite: o filtro shipping.status=delayed do
 * Mercado Livre devolve o histórico inteiro, e sem recorte a primeira
 * verificação abriu 50 penalidades de pedidos de setembro do ano passado e
 * disparou 108 notificações. Atraso velho é história, não tarefa.
 */
const JANELA_ATRASO_DIAS = 21;

async function verificarEnviosAtrasados(conta: Conta, token: string, userId: string) {
  const desde = new Date(Date.now() - JANELA_ATRASO_DIAS * 864e5).toISOString().slice(0, 19) + ".000-00:00";
  const res = await fetch(
    `${API}/orders/search?seller=${userId}&shipping.status=delayed&order.date_created.from=${desde}` +
      "&sort=date_desc&limit=30",
    { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
  );
  if (!res.ok) return { novas: 0, resolvidas: 0, atrasados: 0 };

  const corpo = (await res.json()) as {
    results?: { id: number; date_created?: string; order_items?: { item?: { title?: string } }[] }[];
  };
  const pedidos = corpo.results ?? [];
  if (!pedidos.length) {
    const resolvidas = await resolverAutomatico(conta.id, "atraso", [], "Não há mais envio atrasado na janela.");
    return { novas: 0, resolvidas, atrasados: 0 };
  }

  // Um aviso por pedido viraria trinta notificações de uma vez, e trinta
  // avisos ninguém lê. O aviso é um por dia, com a lista dentro: a pessoa vê
  // "30 envios atrasados" e abre para saber quais.
  const idade = (o: { date_created?: string }) =>
    o.date_created ? Math.floor((Date.now() - new Date(o.date_created).getTime()) / 864e5) : 0;
  const maisVelho = Math.max(...pedidos.map(idade));
  const chave = `atrasos:${new Date().toISOString().slice(0, 10)}`;

  const lista = pedidos
    .slice(0, 10)
    .map((o) => `${o.id} (${idade(o)}d · ${o.order_items?.[0]?.item?.title ?? "pedido"})`)
    .join("; ");

  const criou = await registrar(conta, {
    kind: "atraso",
    severity: maisVelho >= 7 || pedidos.length >= 10 ? "critico" : "atencao",
    externalKey: chave,
    title: `${pedidos.length} ${pedidos.length === 1 ? "envio atrasado" : "envios atrasados"} no Mercado Livre`,
    detail:
      `Pedidos dos últimos ${JANELA_ATRASO_DIAS} dias com envio marcado como atrasado; o mais antigo tem ` +
      `${maisVelho} ${maisVelho === 1 ? "dia" : "dias"}. Atraso entra na taxa de atraso da reputação, que é ` +
      `medida em 365 dias e demora a limpar. ${lista}` +
      (pedidos.length > 10 ? ` (e mais ${pedidos.length - 10})` : ""),
    data: { total: pedidos.length, maisVelho, pedidos: pedidos.map((o) => ({ id: o.id, date_created: o.date_created })) },
  });

  const resolvidas = await resolverAutomatico(
    conta.id,
    "atraso",
    [chave],
    "Os envios atrasados de antes saíram da janela.",
  );
  return { novas: criou ? 1 : 0, resolvidas, atrasados: pedidos.length };
}

/**
 * Taxa de resposta: perguntas sem responder.
 *
 * Depende da permissão "Comunicações antes e pós-venda" no app. Sem ela a API
 * responde 403, e o sistema registra a pendência em vez de dizer que está
 * tudo respondido.
 */
async function verificarPerguntas(conta: Conta, token: string, userId: string) {
  const res = await fetch(`${API}/questions/search?seller_id=${userId}&status=UNANSWERED&limit=50`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (res.status === 403 || res.status === 401) return { permissao: "pendente" as const, novas: 0, pendentes: 0 };
  if (!res.ok) return { permissao: "desconhecida" as const, novas: 0, pendentes: 0 };

  const corpo = (await res.json()) as { total?: number; questions?: { id: number; text?: string }[] };
  const pendentes = corpo.total ?? corpo.questions?.length ?? 0;

  // uma pergunta sem resposta é rotina; o aviso é sobre acumular
  let novas = 0;
  if (pendentes >= 5) {
    const criou = await registrar(conta, {
      kind: "desempenho",
      severity: pendentes >= 20 ? "critico" : "atencao",
      externalKey: `perguntas:${new Date().toISOString().slice(0, 10)}`,
      title: `${pendentes} perguntas sem resposta no Mercado Livre`,
      detail:
        "Pergunta sem resposta derruba a taxa de resposta da loja e faz o comprador desistir. " +
        "O Mercado Livre cobra resposta em até 24 horas.",
      data: { pendentes },
    });
    if (criou) novas += 1;
  }
  return { permissao: "liberada" as const, novas, pendentes };
}

/** Reclamações e devoluções abertas (pós-venda). Também depende de permissão. */
async function verificarReclamacoes(conta: Conta, token: string) {
  const res = await fetch(`${API}/post-purchase/v1/claims/search?status=opened&limit=50`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (res.status === 403 || res.status === 401) return { permissao: "pendente" as const, novas: 0, abertas: 0 };
  if (!res.ok) return { permissao: "desconhecida" as const, novas: 0, abertas: 0 };

  const corpo = (await res.json()) as { data?: { id: number; type?: string; reason_id?: string }[] };
  const reclamacoes = corpo.data ?? [];

  let novas = 0;
  const abertas: string[] = [];
  for (const c of reclamacoes) {
    const chave = `reclamacao:${c.id}`;
    abertas.push(chave);
    const criou = await registrar(conta, {
      kind: "atraso",
      severity: "atencao",
      externalKey: chave,
      title: `Reclamação aberta no pedido ${c.id}`,
      detail:
        `Tipo ${c.type ?? "—"}, motivo ${c.reason_id ?? "—"}. ` +
        "Reclamação sem resposta vira mediação, e mediação conta na reputação.",
      data: c,
    });
    if (criou) novas += 1;
  }
  await resolverAutomatico(conta.id, "atraso", abertas, "A reclamação foi encerrada.");
  return { permissao: "liberada" as const, novas, abertas: reclamacoes.length };
}

/** Anúncios sem promoção, quando o app tem a permissão de promoções. */
async function verificarPromocoesML(conta: Conta, token: string, userId: string) {
  const res = await fetch(`${API}/seller-promotions/users/${userId}?app_version=v2`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (res.status === 403 || res.status === 401) return { permissao: "pendente" as const, novas: 0 };
  if (!res.ok) return { permissao: "desconhecida" as const, novas: 0 };

  const corpo = (await res.json()) as { results?: { id?: string; type?: string; status?: string }[] };
  const promocoes = (corpo.results ?? []).filter((p) => (p.status ?? "").toLowerCase() !== "finished");
  if (promocoes.length) return { permissao: "liberada" as const, novas: 0 };

  const criou = await registrar(conta, {
    kind: "promocao",
    severity: "informativo",
    externalKey: `sem_promocao:${new Date().toISOString().slice(0, 7)}`,
    title: "Nenhuma promoção ativa no Mercado Livre",
    detail:
      "A loja não está em nenhuma campanha ou desconto do Mercado Livre neste mês. " +
      "Anúncio sem promoção perde as vitrines de oferta da plataforma.",
    data: corpo,
  });
  return { permissao: "liberada" as const, novas: criou ? 1 : 0 };
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
    const bloqueados = await verificarAnunciosBloqueados(conta);
    const atrasos = await verificarEnviosAtrasados(conta, token, creds.user_id);
    const perguntas = await verificarPerguntas(conta, token, creds.user_id);
    const reclamacoes = await verificarReclamacoes(conta, token);
    const promocoes = await verificarPromocoesML(conta, token, creds.user_id);

    await run(
      `UPDATE client_marketplaces SET penalties_checked_at = ?, comms_permission = ?, promos_permission = ?
        WHERE id = ?`,
      now(),
      perguntas.permissao === "liberada" && reclamacoes.permissao === "liberada" ? "liberada" : "pendente",
      promocoes.permissao,
      conta.id,
    );

    const novas =
      rep.novas + avisos.novas + bloqueados.novas + atrasos.novas + perguntas.novas + reclamacoes.novas +
      promocoes.novas;
    return {
      ok: true,
      novas,
      resolvidas: rep.resolvidas + bloqueados.resolvidas + atrasos.resolvidas,
      nivel: rep.nivel,
      permissaoAnuncios: permissao,
      mensagem:
        `${novas} ${novas === 1 ? "penalidade nova" : "penalidades novas"}, ` +
        `reputação ${NIVEL_LABEL[rep.nivel ?? ""] ?? "sem cor"}, ` +
        `${bloqueados.bloqueados} ${bloqueados.bloqueados === 1 ? "anúncio barrado" : "anúncios barrados"}, ` +
        `${atrasos.atrasados} ${atrasos.atrasados === 1 ? "envio atrasado" : "envios atrasados"}`,
    };
  } catch (e) {
    return {
      ok: false, novas: 0, resolvidas: 0, nivel: null, permissaoAnuncios: "desconhecida",
      mensagem: e instanceof Error ? e.message : String(e),
    };
  }
}
