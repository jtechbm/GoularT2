import { IntegrationError } from "../integrations/types.ts";
import { umPorVendedorEPreco, type ProdutoConcorrente } from "./analise.ts";

/**
 * Fonte A: preço exato, direto da API do Mercado Livre.
 *
 * O caminho é o CATÁLOGO, não a busca de anúncios. Buscar por palavra devolve
 * o que o texto parece, e a comparação vira aproximação. O catálogo é o mesmo
 * produto: /products/{id}/items lista todos os vendedores daquele item exato,
 * com o preço de cada um. É por isso que a comparação daqui pode ser
 * apresentada como preço, e não como estimativa.
 *
 * Não depende de loja conectada: catálogo é público e a autenticação é de
 * aplicação (client_credentials).
 */

const API = "https://api.mercadolibre.com";
/** Cada produto de catálogo custa uma chamada; oito já dão uma régua. */
const MAX_PRODUTOS = 8;
/** Preço de concorrente não muda de minuto em minuto. */
const CACHE_SEGUNDOS = 3600;

let token: { valor: string; expiraEm: number } | null = null;

/**
 * Token de aplicação, válido por ~6h e guardado em memória.
 *
 * É diferente do token do lojista: não representa ninguém, só o app, e por
 * isso serve para ler catálogo sem nenhuma loja autorizada.
 */
async function tokenDeAplicacao(): Promise<string> {
  if (token && token.expiraEm > Date.now() + 60_000) return token.valor;

  const clientId = process.env.ML_CLIENT_ID ?? "";
  const clientSecret = process.env.ML_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    throw new IntegrationError("Faltam ML_CLIENT_ID e ML_CLIENT_SECRET para consultar o catálogo.", "config");
  }

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  if (!res.ok) throw new IntegrationError(`Mercado Livre recusou o token de aplicação (${res.status}).`, "auth");

  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { valor: json.access_token, expiraEm: Date.now() + (json.expires_in ?? 21600) * 1000 };
  return token.valor;
}

/**
 * Devolve o corpo e o status, porque 403 e "não achei" são coisas diferentes.
 *
 * O catálogo exige a permissão de anúncios no app; sem ela a resposta é 403
 * do PolicyAgent. Se isso virasse "null" como qualquer outra falha, a tela
 * diria que nenhum produto casou com o título e mandaria a pessoa encurtar o
 * nome do anúncio para sempre.
 */
async function buscar<T>(caminho: string, acesso: string): Promise<{ dados: T | null; status: number }> {
  const res = await fetch(`${API}${caminho}`, {
    headers: { authorization: `Bearer ${acesso}`, accept: "application/json" },
    // reabrir a tela não pode gastar chamada nova
    next: { revalidate: CACHE_SEGUNDOS },
  });
  if (!res.ok) return { dados: null, status: res.status };
  return { dados: (await res.json()) as T, status: res.status };
}

interface ProdutoCatalogo {
  id: string;
  name?: string;
}

interface ItemDoCatalogo {
  item_id: string;
  seller_id?: number;
  price?: number;
  sold_quantity?: number;
}

/**
 * Apelido dos vendedores; sem ele a tabela mostra "Vendedor 1484868055".
 *
 * O multiget /users?ids= responde 403 mesmo com a permissão de anúncios
 * liberada, mas /users/{id} responde. São chamadas independentes, então vão
 * todas juntas — e a resposta fica guardada pela mesma hora das outras.
 */
async function apelidos(ids: number[], acesso: string): Promise<Map<number, string>> {
  const unicos = [...new Set(ids)].slice(0, 30);
  const achados = await Promise.all(
    unicos.map(async (id) => ({ id, dados: (await buscar<{ nickname?: string }>(`/users/${id}`, acesso)).dados })),
  );
  return new Map(achados.filter((a) => a.dados?.nickname).map((a) => [a.id, a.dados!.nickname!]));
}

export interface ResultadoFonte {
  produtos: ProdutoConcorrente[];
  /** quantos produtos de catálogo casaram com o título */
  casaram: number;
  /** o app ainda não tem a permissão de anúncios e a API recusou a consulta */
  semPermissao: boolean;
}

/**
 * Concorrentes do mesmo produto no Mercado Livre.
 *
 * Devolve também quantos produtos de catálogo casaram com o título, porque
 * "nada casou" e "casou mas ninguém mais vende" são dois vazios diferentes,
 * e a tela precisa saber qual dos dois explicar.
 */
export async function concorrentesML(titulo: string, ignorarItemId?: string | null): Promise<ResultadoFonte> {
  const acesso = await tokenDeAplicacao();

  const busca = await buscar<{ results?: ProdutoCatalogo[] }>(
    `/products/search?site_id=MLB&status=active&q=${encodeURIComponent(titulo)}`,
    acesso,
  );
  if (busca.status === 403) return { produtos: [], casaram: 0, semPermissao: true };

  const catalogo = (busca.dados?.results ?? []).slice(0, MAX_PRODUTOS);
  if (!catalogo.length) return { produtos: [], casaram: 0, semPermissao: false };

  // as chamadas do passo 2 são independentes: vão todas juntas
  const paginas = await Promise.all(
    catalogo.map(async (produto) => ({
      produto,
      itens: (await buscar<{ results?: ItemDoCatalogo[] }>(`/products/${produto.id}/items`, acesso)).dados,
    })),
  );

  const brutos: { item: ItemDoCatalogo; produto: ProdutoCatalogo }[] = [];
  for (const { produto, itens } of paginas) {
    for (const item of itens?.results ?? []) {
      if (!item?.item_id || typeof item.price !== "number") continue;
      if (ignorarItemId && item.item_id === ignorarItemId) continue;
      brutos.push({ item, produto });
    }
  }

  const nomes = await apelidos(
    brutos.map((b) => b.item.seller_id).filter((n): n is number => typeof n === "number"),
    acesso,
  );

  return {
    casaram: catalogo.length,
    semPermissao: false,
    produtos: umPorVendedorEPreco(
      brutos.map(({ item, produto }) => ({
        idExterno: item.item_id,
        vendedor: item.seller_id ? (nomes.get(item.seller_id) ?? `Vendedor ${item.seller_id}`) : null,
        titulo: produto.name ?? item.item_id,
        preco: item.price!,
        url: `https://www.mercadolivre.com.br/p/${produto.id}`,
        trechoOrigem: null,
      })),
    ),
  };
}
