import { all, id, now, run } from "../db.ts";
import { decryptJSON, encryptJSON } from "../crypto.ts";
import { refreshIfNeeded as tokenML } from "../integrations/mercadolivre.ts";
import { call as chamarShopee, refreshIfNeeded as tokenShopee } from "../integrations/shopee.ts";
import { IntegrationError, type StoredCredentials } from "../integrations/types.ts";
import { precoDaShopee } from "./analise.ts";

/**
 * Os anúncios da própria loja, importados do marketplace.
 *
 * O comparador começa num produto do cliente, e esse produto precisa ter
 * dono: é o que permite filtrar pelo cliente do usuário dentro da consulta,
 * em vez de buscar por id e conferir o dono depois.
 */

interface Conta {
  id: string;
  client_id: string;
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

/** Anúncios ativos da conta do Mercado Livre, com título e preço atuais. */
async function anunciosML(conta: Conta): Promise<AnuncioImportado[]> {
  const acesso = await tokenML(await contexto(conta));
  const vendedor = conta.external_id;
  if (!vendedor) throw new IntegrationError("Conta do Mercado Livre sem id de vendedor.", "config");

  const busca = await fetch(
    `https://api.mercadolibre.com/users/${vendedor}/items/search?status=active&limit=100`,
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
  const { results = [] } = (await busca.json()) as { results?: string[] };
  if (!results.length) return [];

  // o multiget aceita 20 ids por vez
  const anuncios: AnuncioImportado[] = [];
  for (let i = 0; i < results.length; i += 20) {
    const lote = results.slice(i, i + 20);
    const res = await fetch(
      `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,price,permalink,status`,
      { headers: { authorization: `Bearer ${acesso}` }, cache: "no-store" },
    );
    if (!res.ok) continue;
    const corpo = (await res.json()) as {
      body?: { id: string; title?: string; price?: number; permalink?: string; status?: string };
    }[];
    for (const { body } of corpo) {
      if (!body?.id) continue;
      anuncios.push({
        external_id: body.id,
        title: body.title ?? body.id,
        price: body.price ?? 0,
        url: body.permalink ?? null,
        status: body.status ?? null,
      });
    }
  }
  return anuncios;
}

/** Anúncios da loja Shopee. O preço bruto vem multiplicado — ver precoDaShopee. */
async function anunciosShopee(conta: Conta): Promise<AnuncioImportado[]> {
  const creds = await tokenShopee(await contexto(conta));
  const lista = await chamarShopee<{ response?: { item?: { item_id: number; item_status?: string }[] } }>(
    "/api/v2/product/get_item_list",
    { offset: 0, page_size: 100, item_status: "NORMAL" },
    creds,
  );
  const ids = (lista.response?.item ?? []).map((i) => i.item_id);
  if (!ids.length) return [];

  const anuncios: AnuncioImportado[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const detalhe = await chamarShopee<{
      response?: {
        item_list?: {
          item_id: number;
          item_name?: string;
          item_status?: string;
          price_info?: { current_price?: number; original_price?: number }[];
        }[];
      };
    }>("/api/v2/product/get_item_base_info", { item_id_list: lote.join(",") }, creds);

    for (const item of detalhe.response?.item_list ?? []) {
      const bruto = item.price_info?.[0]?.current_price ?? item.price_info?.[0]?.original_price ?? 0;
      anuncios.push({
        external_id: String(item.item_id),
        title: item.item_name ?? String(item.item_id),
        price: precoDaShopee(bruto),
        url: `https://shopee.com.br/product/${creds.shop_id}/${item.item_id}`,
        status: item.item_status ?? null,
      });
    }
  }
  return anuncios;
}

/**
 * Importa os anúncios da conta e devolve quantos ficaram guardados.
 *
 * Atualiza o que já existe em vez de duplicar: o id do anúncio no
 * marketplace é a chave, e o preço do cliente muda com frequência.
 */
export async function importarAnuncios(conta: Conta): Promise<number> {
  const anuncios =
    conta.marketplace === "mercado_livre" ? await anunciosML(conta) : await anunciosShopee(conta);

  for (const a of anuncios) {
    await run(
      `INSERT INTO client_products (id, client_id, client_marketplace_id, marketplace, external_id, title, price,
                                    url, status, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (client_marketplace_id, external_id) DO UPDATE SET
         title = EXCLUDED.title, price = EXCLUDED.price, url = EXCLUDED.url,
         status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      id(),
      conta.client_id,
      conta.id,
      conta.marketplace,
      a.external_id,
      a.title,
      a.price,
      a.url,
      a.status,
      now(),
    );
  }
  return anuncios.length;
}

export async function contaConectada(accountId: string): Promise<Conta | null> {
  const [conta] = await all<Conta>(
    `SELECT id, client_id, marketplace, external_id, credentials
       FROM client_marketplaces WHERE id = ? AND credentials IS NOT NULL`,
    accountId,
  );
  return conta ?? null;
}
