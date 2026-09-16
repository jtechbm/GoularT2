import { all, id, now, one, transaction } from "../db.ts";
import { analisarPrecos, type AnalisePrecos, type ProdutoConcorrente } from "./analise.ts";
import { concorrentesML } from "./mercadolivre.ts";
import { concorrentesPorBusca } from "./llm.ts";

/**
 * Junta as duas fontes com a conta, mantendo a diferença entre elas visível.
 *
 * Preço exato (API oficial) e preço estimado (busca na web) são coisas
 * diferentes e continuam separados até a tela. Misturar os dois sem rótulo é
 * o pior resultado possível: parece precisão e não é.
 */

export interface ProdutoDoCliente {
  id: string;
  client_id: string;
  client_name: string;
  marketplace: string;
  external_id: string;
  title: string;
  price: number;
  url: string | null;
  updated_at: string;
  /** nome da loja no marketplace, para a busca não trazer os anúncios dela */
  vendedor_proprio: string | null;
  /** quando a última busca rodou, tenha ela achado algo ou não */
  last_search_at: string | null;
  last_search_note: string | null;
}

export type Fonte = "api" | "busca";

export interface Regua {
  fonte: Fonte;
  analise: AnalisePrecos;
  /** quando a fotografia foi tirada; na fonte A é agora */
  atualizadoEm: string | null;
  observacao: string | null;
  /** quantos produtos de catálogo casaram com o título (só fonte A) */
  casaram: number | null;
  /** o app do Elleva ainda não tem a permissão de anúncios no marketplace */
  semPermissao: boolean;
}

/**
 * O produto, já filtrado pelo que o usuário pode ver.
 *
 * O dono entra no WHERE. Buscar por id e conferir o cliente depois é IDOR
 * esperando acontecer: basta uma volta em que a conferência não aconteça.
 */
export async function produtoDoUsuario(
  produtoId: string,
  escopo: string[] | null,
): Promise<ProdutoDoCliente | null> {
  const limite = escopo ? ` AND p.client_id IN (${escopo.map(() => "?").join(",") || "NULL"})` : "";
  return one<ProdutoDoCliente>(
    `SELECT p.id, p.client_id, c.name AS client_name, p.marketplace, p.external_id, p.title, p.price, p.url,
            p.updated_at, p.last_search_at, p.last_search_note, cm.nickname AS vendedor_proprio
       FROM client_products p
       JOIN clients c ON c.id = p.client_id
       JOIN client_marketplaces cm ON cm.id = p.client_marketplace_id
      WHERE p.id = ?${limite}`,
    produtoId,
    ...(escopo ?? []),
  );
}

export async function produtosDoCliente(clientId: string, escopo: string[] | null): Promise<ProdutoDoCliente[]> {
  if (escopo && !escopo.includes(clientId)) return [];
  return all<ProdutoDoCliente>(
    `SELECT p.id, p.client_id, c.name AS client_name, p.marketplace, p.external_id, p.title, p.price, p.url,
            p.updated_at, p.last_search_at, p.last_search_note, cm.nickname AS vendedor_proprio
       FROM client_products p
       JOIN clients c ON c.id = p.client_id
       JOIN client_marketplaces cm ON cm.id = p.client_marketplace_id
      WHERE p.client_id = ?
      ORDER BY p.title`,
    clientId,
  );
}

/** A fonte A é rápida e de graça; a B custa dinheiro e só roda a pedido. */
export function fonteDe(marketplace: string): Fonte {
  return marketplace === "mercado_livre" ? "api" : "busca";
}

/** A última fotografia gravada, sem disparar busca nova. */
async function comparacaoGravada(produto: ProdutoDoCliente): Promise<Regua> {
  const linhas = await all<{
    seller: string | null;
    title: string;
    price: number;
    url: string | null;
    source_snippet: string | null;
    note: string | null;
    created_at: string;
  }>(
    `SELECT seller, title, price, url, source_snippet, note, created_at
       FROM market_comparisons WHERE product_id = ? ORDER BY price`,
    produto.id,
  );

  const produtos: ProdutoConcorrente[] = linhas.map((l) => ({
    idExterno: l.url ?? l.title,
    vendedor: l.seller,
    titulo: l.title,
    preco: l.price,
    url: l.url,
    trechoOrigem: l.source_snippet,
  }));

  return {
    fonte: "busca",
    analise: analisarPrecos(produtos),
    // a data vem do produto, e não das linhas: busca que não achou nada
    // também aconteceu, e precisa aparecer como tal
    atualizadoEm: produto.last_search_at ?? linhas[0]?.created_at ?? null,
    observacao: produto.last_search_note ?? linhas.find((l) => l.note)?.note ?? null,
    casaram: null,
    semPermissao: false,
  };
}

/**
 * A régua para mostrar ao abrir a tela.
 *
 * Na fonte A a consulta é feita na hora: é uma chamada barata, com resposta
 * guardada por uma hora. Na fonte B nada é disparado — a tela mostra a última
 * busca gravada, com a data, e quem quiser um retrato novo aperta o botão.
 */
export async function reguaDoProduto(produto: ProdutoDoCliente): Promise<Regua> {
  if (fonteDe(produto.marketplace) === "busca") return comparacaoGravada(produto);

  const { produtos, casaram, semPermissao } = await concorrentesML(produto.title, produto.external_id);
  return {
    fonte: "api",
    analise: analisarPrecos(produtos),
    atualizadoEm: now(),
    observacao: null,
    casaram,
    semPermissao,
  };
}

export interface ResultadoBusca {
  gravados: number;
  descartados: number;
  observacao: string;
  /** anúncios da própria loja que a busca trouxe e foram ignorados */
  proprios: number;
}

/**
 * Busca na web e SUBSTITUI a comparação anterior, numa transação.
 *
 * É uma fotografia do mercado agora. Somar buscas de datas diferentes
 * distorceria a mediana, e um erro no meio do caminho não pode deixar o
 * produto com meia comparação gravada.
 */
export async function buscarConcorrentes(
  produto: ProdutoDoCliente,
  userId: string | null,
): Promise<ResultadoBusca> {
  const { produtos, observacao, descartados, proprios } = await concorrentesPorBusca(
    produto.marketplace,
    produto.title,
    produto.vendedor_proprio,
  );

  await transaction(async (q) => {
    await q("DELETE FROM market_comparisons WHERE product_id = ?", produto.id);
    await q(
      "UPDATE client_products SET last_search_at = ?, last_search_note = ? WHERE id = ?",
      now(),
      observacao || null,
      produto.id,
    );
    for (const c of produtos) {
      await q(
        `INSERT INTO market_comparisons (id, product_id, marketplace, seller, title, price, url, source_snippet,
                                         note, author, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        id(),
        produto.id,
        // a plataforma é copiada do produto: a comparação fica travada na
        // mesma plataforma do anúncio
        produto.marketplace,
        c.vendedor,
        c.titulo,
        c.preco,
        c.url,
        c.trechoOrigem,
        observacao || null,
        userId,
        now(),
      );
    }
  });

  return { gravados: produtos.length, descartados, proprios, observacao };
}

/** Contas conectadas do cliente, para o botão de importar anúncios. */
export async function contasDoCliente(clientId: string) {
  return all<{ id: string; marketplace: string; status: string; produtos: number }>(
    `SELECT cm.id, cm.marketplace, cm.status,
            (SELECT COUNT(*) FROM client_products p WHERE p.client_marketplace_id = cm.id) AS produtos
       FROM client_marketplaces cm
      WHERE cm.client_id = ? AND cm.credentials IS NOT NULL
      ORDER BY cm.marketplace`,
    clientId,
  );
}
