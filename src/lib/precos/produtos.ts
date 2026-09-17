import { all, id, now, one, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { refreshIfNeeded as tokenML } from "../integrations/mercadolivre.ts";
import { call as chamarShopee, refreshIfNeeded as tokenShopee } from "../integrations/shopee.ts";
import { IntegrationError, mapLimit, type StoredCredentials } from "../integrations/types.ts";
import { avaliarPreco } from "../penalidades/regras.ts";
import { registrarPenalidade, type ContaPenalizavel } from "../penalidades/registro.ts";
import { precoDoAnuncio } from "./analise.ts";

/**
 * Os anúncios da própria loja, importados do marketplace.
 *
 * A importação faz três coisas de uma vez, porque as três saem da mesma
 * chamada e separá-las seria pagar a API duas vezes:
 *
 *   1. guarda título e preço, que é o que o comparador de preços precisa;
 *   2. guarda o histórico de preço e avisa quando o preço mudou de verdade;
 *   3. guarda o sinal do marketplace sobre o anúncio — bloqueado, em revisão,
 *      rebaixado na busca — que é o que a tela de Penalidades lê depois.
 */

interface Conta extends ContaPenalizavel {
  marketplace: string;
  external_id: string | null;
  credentials: string | null;
}

interface AnuncioImportado {
  external_id: string;
  title: string;
  price: number;
  url: string | null;
  status: string | null;
  /** o que o marketplace diz além do status: forbidden, out_of_stock, deboost… */
  subStatus: string | null;
  /** a Shopee rebaixou o anúncio na busca */
  deboost: boolean;
}

async function contexto(conta: Conta) {
  return {
    externalId: conta.external_id,
    credentials: decryptJSON<StoredCredentials>(conta.credentials),
    accountId: conta.id,
    saveCredentials: async (next: StoredCredentials) => {
      await run("UPDATE client_marketplaces SET credentials = ? WHERE id = ?", encryptJSON(next), conta.id);
    },
  };
}

/**
 * Anúncios da conta do Mercado Livre, de TODOS os status.
 *
 * Buscar só os ativos esconderia exatamente o que interessa para o aviso: o
 * anúncio que o Mercado Livre bloqueou aparece com status under_review e
 * sub_status forbidden, e nunca estaria numa lista de ativos.
 */
async function anunciosML(conta: Conta): Promise<AnuncioImportado[]> {
  const acesso = await tokenML(await contexto(conta));
  const vendedor = conta.external_id;
  if (!vendedor) throw new IntegrationError("Conta do Mercado Livre sem id de vendedor.", "config");

  const ids: string[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const busca = await fetch(
      `https://api.mercadolibre.com/users/${vendedor}/items/search?limit=100&offset=${offset}`,
      { headers: { authorization: `Bearer ${acesso}` }, cache: "no-store" },
    );
    if (busca.status === 403) {
      // mesma causa da tela de penalidades: o token foi emitido antes de a
      // permissão de anúncios existir, e o escopo fica congelado na autorização
      throw new IntegrationError(
        "O Mercado Livre recusou a leitura dos anúncios: o app ainda não tem a permissão de anúncios nesta conta. " +
          "O lojista precisa autorizar de novo, em Lojas → Pedir nova autorização.",
        "auth",
      );
    }
    if (!busca.ok) throw new IntegrationError(`Mercado Livre respondeu ${busca.status} ao listar anúncios.`);

    const { results = [], paging } = (await busca.json()) as { results?: string[]; paging?: { total?: number } };
    ids.push(...results);
    if (ids.length >= (paging?.total ?? 0) || results.length < 100) break;
  }
  if (!ids.length) return [];

  const anuncios: AnuncioImportado[] = [];
  // o multiget aceita 20 ids por vez
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const res = await fetch(
      `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,price,permalink,status,sub_status`,
      { headers: { authorization: `Bearer ${acesso}` }, cache: "no-store" },
    );
    if (!res.ok) continue;
    const corpo = (await res.json()) as {
      body?: {
        id: string;
        title?: string;
        price?: number;
        permalink?: string;
        status?: string;
        sub_status?: string[];
      };
    }[];
    for (const { body } of corpo) {
      if (!body?.id) continue;
      anuncios.push({
        external_id: body.id,
        title: body.title ?? body.id,
        price: body.price ?? 0,
        url: body.permalink ?? null,
        status: body.status ?? null,
        subStatus: body.sub_status?.length ? body.sub_status.join(",") : null,
        deboost: false,
      });
    }
  }
  return anuncios;
}

/**
 * Anúncios da loja Shopee.
 *
 * O preço não está onde parece: anúncio com variação (has_model) não traz
 * price_info nenhum, e o valor real mora em get_model_list, uma chamada por
 * anúncio. Guardamos o menor preço entre as variações, que é o que a Shopee
 * mostra na vitrine e o que o concorrente vê.
 */
async function anunciosShopee(conta: Conta): Promise<AnuncioImportado[]> {
  const creds = await tokenShopee(await contexto(conta));

  // o nome da loja é guardado na importação porque a busca de preços precisa
  // dele para não comparar a loja com ela mesma
  const info = await chamarShopee<{ shop_name?: string; response?: { shop_name?: string } }>(
    "/api/v2/shop/get_shop_info",
    {},
    creds,
  );
  const nome = info.shop_name ?? info.response?.shop_name ?? null;
  if (nome) await run("UPDATE client_marketplaces SET nickname = ? WHERE id = ?", nome, conta.id);

  const lista = await chamarShopee<{ response?: { item?: { item_id: number }[] } }>(
    "/api/v2/product/get_item_list",
    { offset: 0, page_size: 100, item_status: "NORMAL" },
    creds,
  );
  const ids = (lista.response?.item ?? []).map((i) => i.item_id);
  if (!ids.length) return [];

  const base: {
    item_id: number;
    item_name?: string;
    item_status?: string;
    has_model?: boolean;
    deboost?: string | boolean;
    preco: number;
  }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const detalhe = await chamarShopee<{
      response?: {
        item_list?: {
          item_id: number;
          item_name?: string;
          item_status?: string;
          has_model?: boolean;
          deboost?: string | boolean;
          price_info?: { current_price?: number; original_price?: number }[];
        }[];
      };
    }>("/api/v2/product/get_item_base_info", { item_id_list: ids.slice(i, i + 50).join(",") }, creds);

    for (const item of detalhe.response?.item_list ?? []) {
      const bruto = item.price_info?.[0]?.current_price ?? item.price_info?.[0]?.original_price ?? 0;
      base.push({ ...item, preco: precoDoAnuncio(bruto, false) });
    }
  }

  // uma chamada por anúncio com variação, em paralelo e com prazo: numa loja
  // de cem anúncios, em fila, isso sozinho estouraria o tempo da função
  const comVariacao = base.filter((b) => b.has_model);
  const precos = new Map<number, number>();
  const { results } = await mapLimit(comVariacao, 6, Date.now() + 35_000, async (item) => {
    const modelos = await chamarShopee<{
      response?: { model?: { price_info?: { current_price?: number }[] }[] };
    }>("/api/v2/product/get_model_list", { item_id: item.item_id }, creds);

    const valores = (modelos.response?.model ?? [])
      .map((m) => precoDoAnuncio(m.price_info?.[0]?.current_price ?? 0, false))
      .filter((v) => v > 0);
    return { item_id: item.item_id, preco: valores.length ? Math.min(...valores) : 0 };
  });
  for (const r of results) precos.set(r.item_id, r.preco);

  return base.map((item) => ({
    external_id: String(item.item_id),
    title: item.item_name ?? String(item.item_id),
    price: precos.get(item.item_id) ?? item.preco,
    url: `https://shopee.com.br/product/${creds.shop_id}/${item.item_id}`,
    status: item.item_status ?? null,
    subStatus: null,
    deboost: item.deboost === true || String(item.deboost).toUpperCase() === "TRUE",
  }));
}

/** Preço mudou o suficiente para virar aviso? Então vira. */
async function registrarMudancaDePreco(
  conta: Conta,
  anuncio: AnuncioImportado,
  anterior: number,
): Promise<boolean> {
  const mudanca = avaliarPreco(anterior, anuncio.price);
  if (!mudanca.mudou) return false;

  // a chave leva o preço novo: cada mudança de preço é um aviso, e voltar ao
  // preço antigo amanhã é outro aviso, não o mesmo
  return registrarPenalidade(conta, conta.marketplace, {
    kind: "preco",
    severity: mudanca.subiu ? "atencao" : "informativo",
    externalKey: `preco:${anuncio.external_id}:${anuncio.price.toFixed(2)}`,
    title: `${mudanca.subiu ? "Preço subiu" : "Preço caiu"}: ${anuncio.title}`,
    detail:
      `${mudanca.texto} ` +
      (mudanca.subiu
        ? "Subir preço mexe na posição do anúncio na busca; se não foi combinado, vale conferir com o lojista."
        : "Queda de preço sem combinar aperta a margem."),
    data: { anterior, atual: anuncio.price, variacao: mudanca.variacao, anuncio: anuncio.external_id },
  });
}

/**
 * Importa os anúncios da conta e devolve quantos ficaram guardados.
 *
 * Atualiza o que já existe em vez de duplicar: o id do anúncio no
 * marketplace é a chave, e o preço do cliente muda com frequência.
 */
export async function importarAnuncios(conta: Conta): Promise<{ total: number; mudancasDePreco: number }> {
  const anuncios =
    conta.marketplace === "mercado_livre" ? await anunciosML(conta) : await anunciosShopee(conta);

  const guardados = await all<{ external_id: string; id: string; price: number }>(
    "SELECT external_id, id, price FROM client_products WHERE client_marketplace_id = ?",
    conta.id,
  );
  const antes = new Map(guardados.map((g) => [g.external_id, g]));
  const hoje = now().slice(0, 10);
  let mudancasDePreco = 0;

  for (const a of anuncios) {
    const anterior = antes.get(a.external_id);
    const mudouPreco = Boolean(anterior && Math.abs(anterior.price - a.price) >= 0.01);

    await run(
      `INSERT INTO client_products (id, client_id, client_marketplace_id, marketplace, external_id, title, price,
                                    url, status, sub_status, deboost, updated_at, previous_price, price_changed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (client_marketplace_id, external_id) DO UPDATE SET
         title = EXCLUDED.title, price = EXCLUDED.price, url = EXCLUDED.url,
         status = EXCLUDED.status, sub_status = EXCLUDED.sub_status, deboost = EXCLUDED.deboost,
         updated_at = EXCLUDED.updated_at,
         previous_price = CASE WHEN EXCLUDED.price <> client_products.price
                               THEN client_products.price ELSE client_products.previous_price END,
         price_changed_at = CASE WHEN EXCLUDED.price <> client_products.price
                                 THEN EXCLUDED.updated_at ELSE client_products.price_changed_at END`,
      id(),
      conta.client_id,
      conta.id,
      conta.marketplace,
      a.external_id,
      a.title,
      a.price,
      a.url,
      a.status,
      a.subStatus,
      a.deboost ? 1 : 0,
      now(),
      null,
      mudouPreco ? now() : null,
    );

    const linha = await one<{ id: string }>(
      "SELECT id FROM client_products WHERE client_marketplace_id = ? AND external_id = ?",
      conta.id,
      a.external_id,
    );
    if (linha) {
      // um registro por anúncio e por dia: preço mexido duas vezes no mesmo
      // dia guarda o último, que é o que vale para comparar com amanhã
      await run(
        `INSERT INTO client_product_prices (product_id, day, price) VALUES (?,?,?)
         ON CONFLICT (product_id, day) DO UPDATE SET price = EXCLUDED.price`,
        linha.id,
        hoje,
        a.price,
      );
    }

    if (anterior && (await registrarMudancaDePreco(conta, a, anterior.price))) mudancasDePreco += 1;
  }

  return { total: anuncios.length, mudancasDePreco };
}

export async function contaConectada(accountId: string): Promise<Conta | null> {
  const [conta] = await all<Conta>(
    `SELECT cm.id, cm.client_id, c.name AS client_name, c.owner_id, cm.marketplace, cm.external_id, cm.credentials
       FROM client_marketplaces cm JOIN clients c ON c.id = cm.client_id
      WHERE cm.id = ? AND cm.credentials IS NOT NULL`,
    accountId,
  );
  return conta ?? null;
}
