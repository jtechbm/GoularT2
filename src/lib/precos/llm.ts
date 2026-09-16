import OpenAI from "openai";
import { dedupe, precoConfere, TETO_ANUNCIOS, type ProdutoConcorrente } from "./analise.ts";

/**
 * Fonte B: preço ESTIMADO, lido da web por um modelo de linguagem.
 *
 * Shopee e TikTok Shop não têm busca pública de anúncios. O que existe é o
 * conteúdo indexado na web, e ler isso é leitura de contexto, não casamento
 * de padrão — por isso um modelo, e não um parser.
 *
 * O exemplo que justifica a escolha: "Frete grátis R$ 8,39" e "R$ 56,99" têm
 * exatamente o mesmo formato. Qualquer regex lê o frete como se fosse o preço
 * do produto. Só quem entende a frase sabe qual dos dois é a venda.
 *
 * Nada do que o modelo devolve entra no banco sem conferência: ele é obrigado
 * a colar o trecho de onde leu o preço, e o código confere o número ali.
 */

/** Equilibra capacidade e preço, e atende busca na web. */
const MODELO = "gpt-5.6-terra";

/**
 * Esforço de raciocínio baixo, de propósito. Medido nesta tarefa: 26s no
 * baixo contra 89s no médio, com a mesma taxa de acerto — todos os preços
 * conferiram com a fonte nos dois casos. O médio estoura o teto de 60s da
 * função.
 */
const ESFORCO = "low" as const;

const PLATAFORMAS: Record<string, { nome: string; dominio: string }> = {
  shopee: { nome: "Shopee", dominio: "shopee.com.br" },
  tiktok: { nome: "TikTok Shop", dominio: "tiktok.com" },
  mercado_livre: { nome: "Mercado Livre", dominio: "mercadolivre.com.br" },
};

const ESQUEMA = {
  type: "object",
  properties: {
    anuncios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          vendedor: { type: "string" },
          preco: { type: "number" },
          url: { type: "string" },
          trecho_origem: { type: "string" },
        },
        required: ["titulo", "vendedor", "preco", "url", "trecho_origem"],
        additionalProperties: false,
      },
    },
    observacao: { type: "string" },
  },
  required: ["anuncios", "observacao"],
  additionalProperties: false,
};

interface Resposta {
  anuncios: { titulo: string; vendedor: string; preco: number; url: string; trecho_origem: string }[];
  observacao: string;
}

export interface ResultadoLLM {
  produtos: ProdutoConcorrente[];
  observacao: string;
  /** quantos anúncios o modelo devolveu e foram recusados na conferência */
  descartados: number;
}

function instrucoes(plataforma: string, titulo: string): string {
  const p = PLATAFORMAS[plataforma] ?? { nome: plataforma, dominio: "" };
  return [
    `Busque na ${p.nome} (${p.dominio}) anúncios do produto "${titulo}".`,
    "Extraia os preços de VENDA dos concorrentes.",
    "",
    "A regra que mais importa: FRETE NÃO É PREÇO. Ignore 'Frete grátis R$ X',",
    "'Frete R$ X' e 'R$ 0,00' de entrega. O valor do frete aparece no mesmo",
    "formato do preço do produto e é o erro mais comum nesta tarefa.",
    "",
    "Descarte também:",
    "- páginas de categoria ou de busca, em que várias ofertas aparecem numa",
    "  listagem só e não dá para atribuir o preço a um anúncio específico;",
    "- anúncios que claramente não são o mesmo produto;",
    "- qualquer preço que você não consiga localizar literalmente no texto.",
    "",
    "Se houver variantes com preços diferentes (1m, 2m, 3m) e não der para",
    "saber qual corresponde ao produto procurado, registre isso na observação",
    "em vez de escolher no chute.",
    "",
    "Em trecho_origem, cole o texto literal de onde você leu o preço. O trecho",
    "é conferido depois: anúncio cujo preço não aparecer no próprio trecho é",
    "descartado.",
    "",
    `Prefira poucos resultados confiáveis a muitos duvidosos, no máximo ${TETO_ANUNCIOS}.`,
    "Se nada for confiável, devolva a lista vazia.",
    "Preços em reais, como número (49.4 para R$ 49,40).",
  ].join("\n");
}

/** O modelo pode cercar o JSON de texto; aproveita o que estiver lá dentro. */
function extrairJSON(texto: string): Resposta | null {
  const tentativas = [texto, texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)];
  for (const t of tentativas) {
    if (!t.trim()) continue;
    try {
      return JSON.parse(t) as Resposta;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Pergunta ao modelo e devolve só o que sobreviveu à conferência.
 *
 * O teto de 45s deixa margem para gravar o resultado dentro dos 60s da
 * função.
 */
export async function concorrentesPorBusca(plataforma: string, titulo: string): Promise<ResultadoLLM> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY para buscar preços nesta plataforma.");
  }

  const client = new OpenAI({ timeout: 45_000, maxRetries: 1 });
  const resposta = await client.responses.create({
    model: MODELO,
    input: instrucoes(plataforma, titulo),
    tools: [{ type: "web_search" }],
    reasoning: { effort: ESFORCO },
    text: {
      format: { type: "json_schema", name: "concorrentes", schema: ESQUEMA, strict: true },
    },
  });

  const lido = extrairJSON(resposta.output_text ?? "");
  if (!lido) {
    return { produtos: [], observacao: "O modelo não devolveu um resultado legível.", descartados: 0 };
  }

  const conferidos: ProdutoConcorrente[] = [];
  let descartados = 0;
  for (const a of lido.anuncios ?? []) {
    const preco = Number(a.preco);
    if (!Number.isFinite(preco) || preco <= 0 || !precoConfere(preco, a.trecho_origem)) {
      descartados += 1;
      continue;
    }
    conferidos.push({
      idExterno: a.url || `${a.titulo}-${preco}`,
      vendedor: a.vendedor || null,
      titulo: a.titulo,
      preco,
      url: a.url || null,
      trechoOrigem: a.trecho_origem,
    });
  }

  return { produtos: dedupe(conferidos), observacao: lido.observacao ?? "", descartados };
}
