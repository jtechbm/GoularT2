import OpenAI from "openai";
import { evidenciaConfere, numerosDoDossie, paraTexto, type Dossie } from "./dossie.ts";

/**
 * A análise do cliente escrita por modelo de linguagem.
 *
 * Não há busca na web aqui: o modelo recebe o dossiê que a casa montou e só
 * isso. É a diferença entre "o que fazer com esta loja" e "o que existe no
 * mercado" — a segunda pergunta é do comparador de preços, e custa os 30
 * segundos inteiros só nela.
 *
 * Duas travas, as mesmas do comparador: teto de tempo curto e conferência do
 * que voltou. Aqui a conferência é numérica — cada afirmação precisa citar um
 * número que o dossiê afirma.
 */

const MODELO = "gpt-5.6-terra";

/**
 * Esforço baixo. O teto combinado é de 30 segundos para a ação inteira, e o
 * dossiê já chega pronto: o modelo interpreta número, não precisa procurar
 * nada. Esforço médio dobraria o tempo sem mudar o diagnóstico.
 */
const ESFORCO = "low" as const;

/** 25s para o modelo, deixando 5 para coletar, gravar e desenhar a tela. */
export const ORCAMENTO_MS = 25_000;

const ESQUEMA = {
  type: "object",
  properties: {
    diagnostico: { type: "string" },
    pontos_fortes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          evidencia: { type: "string" },
          onde: { type: "string" },
        },
        required: ["titulo", "evidencia", "onde"],
        additionalProperties: false,
      },
    },
    problemas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          evidencia: { type: "string" },
          gravidade: { type: "string", enum: ["alta", "media", "baixa"] },
          onde: { type: "string" },
        },
        required: ["titulo", "evidencia", "gravidade", "onde"],
        additionalProperties: false,
      },
    },
    acoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          por_que: { type: "string" },
          impacto: { type: "string", enum: ["alto", "medio", "baixo"] },
          esforco: { type: "string", enum: ["alto", "medio", "baixo"] },
          prazo: { type: "string" },
          onde: { type: "string" },
        },
        required: ["titulo", "por_que", "impacto", "esforco", "prazo", "onde"],
        additionalProperties: false,
      },
    },
    sem_resposta: { type: "array", items: { type: "string" } },
  },
  required: ["diagnostico", "pontos_fortes", "problemas", "acoes", "sem_resposta"],
  additionalProperties: false,
};

interface RespostaCrua {
  diagnostico: string;
  pontos_fortes: { titulo: string; evidencia: string; onde: string }[];
  problemas: { titulo: string; evidencia: string; gravidade: string; onde: string }[];
  acoes: { titulo: string; por_que: string; impacto: string; esforco: string; prazo: string; onde: string }[];
  sem_resposta: string[];
}

export interface ItemComEvidencia {
  titulo: string;
  evidencia: string;
  gravidade?: string;
  /** a que canal isso se refere: o nome do canal, ou ambos */
  onde: string;
  /** a evidência cita um número que o dossiê afirma */
  conferido: boolean;
}

export interface AcaoSugerida {
  titulo: string;
  porQue: string;
  impacto: string;
  esforco: string;
  prazo: string;
  onde: string;
}

export interface ResultadoAnalise {
  status: "ok" | "parcial";
  diagnostico: string;
  pontosFortes: ItemComEvidencia[];
  problemas: ItemComEvidencia[];
  acoes: AcaoSugerida[];
  semResposta: string[];
  /** quantas afirmações citaram número que não está no dossiê */
  naoConferidos: number;
  modelo: string;
  aviso: string | null;
}

function instrucoes(): string {
  return [
    "Você analisa a operação de um cliente de uma agência brasileira de",
    "marketplaces. O cliente pode vender em mais de um canal ao mesmo tempo",
    "(Mercado Livre e Shopee), e o dossiê traz uma seção por canal além do",
    "total. Escreva em português do Brasil, direto, sem enrolação e sem",
    "elogio vazio.",
    "",
    "Você recebe um dossiê com os números reais do cliente. Regras:",
    "",
    "1. Todo número que você citar tem de estar no dossiê. Não estime, não",
    "   complete com média de mercado e não invente nada que não esteja ali.",
    "2. Cada ponto forte e cada problema precisa de uma evidência que cite um",
    "   número do dossiê. A evidência é conferida depois pelo código.",
    "3. As ações têm de ser específicas deste cliente e do canal certo:",
    "   nomes de produto, nome de campanha, faixa de preço. 'Melhorar os",
    "   anúncios' não serve.",
    "4. Ordene as ações da mais importante para a menos importante, no máximo",
    "   seis. Prefira poucas ações boas a uma lista comprida.",
    "5. Se faltar dado para concluir algo, diga em sem_resposta em vez de",
    "   chutar. Ex.: sem comparação de preço, sem meta cadastrada.",
    "6. Em onde, diga a que canal cada item se refere: o nome do canal, ou",
    "   ambos quando vale para os dois. Quando um canal vai bem e o outro vai",
    "   mal, essa é a informação mais útil da análise — não misture os dois",
    "   num diagnóstico médio.",
    "7. Cuidado com dois números que enganam: ACOS indefinido significa que",
    "   gastou em anúncio e não vendeu, o que é pior que ACOS alto; e preço",
    "   'abaixo da mediana' pode ser margem jogada fora, não vantagem.",
    "8. Indicador fora do alvo, penalidade aberta, anúncio barrado ou",
    "   rebaixado e atraso no envio vêm antes de qualquer ideia de",
    "   crescimento: é a plataforma punindo a loja agora, e cresce menos quem",
    "   está punido. O alvo de cada indicador é o do próprio marketplace e",
    "   está no dossiê.",
    "9. Onde o dossiê disser NÃO MEDIDO, não conclua nada: aquilo não foi",
    "   lido por falta de permissão. Registre em sem_resposta.",
    "",
    "O diagnóstico é um parágrafo: como o cliente está, qual canal puxa o",
    "resultado e o que mais pesa agora.",
  ].join("\n");
}

function extrairJSON(texto: string): RespostaCrua | null {
  const tentativas = [texto, texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)];
  for (const t of tentativas) {
    if (!t.trim()) continue;
    try {
      return JSON.parse(t) as RespostaCrua;
    } catch {
      continue;
    }
  }
  return null;
}

function vazio(status: "ok" | "parcial", aviso: string): ResultadoAnalise {
  return {
    status,
    diagnostico: "",
    pontosFortes: [],
    problemas: [],
    acoes: [],
    semResposta: [],
    naoConferidos: 0,
    modelo: MODELO,
    aviso,
  };
}

/**
 * Manda o dossiê e devolve a análise conferida.
 *
 * Estourar o tempo não é erro: devolve status "parcial", e quem chama grava a
 * análise mesmo assim. Os números do dossiê são nossos e continuam valendo —
 * a tela mostra eles, e o Kadu vê que a parte escrita ficou faltando em vez de
 * receber uma tela de erro.
 */
export async function analisarCliente(dossie: Dossie, orcamentoMs = ORCAMENTO_MS): Promise<ResultadoAnalise> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY para a IA analisar o cliente.");
  }

  const client = new OpenAI({ timeout: orcamentoMs, maxRetries: 0 });

  let texto: string;
  try {
    const resposta = await client.responses.create({
      model: MODELO,
      instructions: instrucoes(),
      input: paraTexto(dossie),
      reasoning: { effort: ESFORCO },
      text: { format: { type: "json_schema", name: "analise_cliente", schema: ESQUEMA, strict: true } },
    });
    texto = resposta.output_text ?? "";
  } catch (e) {
    const tempo = e instanceof OpenAI.APIConnectionTimeoutError || (e as Error)?.name === "APIConnectionTimeoutError";
    if (!tempo) throw e;
    return vazio("parcial", `O modelo passou dos ${Math.round(orcamentoMs / 1000)}s e a análise escrita não ficou pronta. Os números abaixo são da casa e continuam valendo.`);
  }

  const lido = extrairJSON(texto);
  if (!lido) return vazio("parcial", "O modelo não devolveu um resultado legível.");

  const numeros = numerosDoDossie(dossie);
  let naoConferidos = 0;
  const conferir = (item: {
    titulo: string;
    evidencia: string;
    gravidade?: string;
    onde?: string;
  }): ItemComEvidencia => {
    const conferido = evidenciaConfere(item.evidencia, numeros);
    if (!conferido) naoConferidos += 1;
    return {
      titulo: item.titulo,
      evidencia: item.evidencia,
      gravidade: item.gravidade,
      onde: item.onde ?? "",
      conferido,
    };
  };

  return {
    status: "ok",
    diagnostico: lido.diagnostico ?? "",
    pontosFortes: (lido.pontos_fortes ?? []).map(conferir),
    problemas: (lido.problemas ?? []).map(conferir),
    acoes: (lido.acoes ?? []).slice(0, 6).map((a) => ({
      titulo: a.titulo,
      porQue: a.por_que,
      impacto: a.impacto,
      esforco: a.esforco,
      prazo: a.prazo,
      onde: a.onde ?? "",
    })),
    semResposta: lido.sem_resposta ?? [],
    naoConferidos,
    modelo: MODELO,
    aviso: null,
  };
}
