/**
 * Regras puras de penalidade, sem banco nem rede, para dar para testar.
 */

/** Níveis de reputação do Mercado Livre, do pior para o melhor. */
export const NIVEIS_ML = ["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"] as const;

export const NIVEL_LABEL: Record<string, string> = {
  "1_red": "vermelha",
  "2_orange": "laranja",
  "3_yellow": "amarela",
  "4_light_green": "verde-clara",
  "5_green": "verde",
};

/** Posição do nível: 1 é vermelho, 5 é verde. null quando a conta não tem cor. */
export function posicaoNivel(level: string | null | undefined): number | null {
  if (!level) return null;
  const n = Number(level.split("_")[0]);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * O nível que vale para julgar a conta.
 *
 * Durante a proteção do programa Decola, o Mercado Livre mostra uma cor e
 * guarda a verdadeira em real_level. Olhar só a cor exibida esconderia
 * exatamente o vendedor que está afundando: ele aparece verde e está
 * vermelho por baixo, e a proteção acaba numa data.
 */
export function nivelEfetivo(r: { level_id?: string | null; real_level?: string | null }): string | null {
  return r.real_level ?? r.level_id ?? null;
}

export type Severidade = "critico" | "atencao" | "informativo";

export function severidadeDoNivel(level: string | null): Severidade {
  const p = posicaoNivel(level);
  if (p === null) return "informativo";
  if (p <= 2) return "critico";
  if (p === 3) return "atencao";
  return "informativo";
}

export interface MudancaReputacao {
  tipo: "piorou" | "melhorou" | "igual" | "primeira_leitura_ruim" | "primeira_leitura_ok" | "sem_cor";
  de: string | null;
  para: string | null;
}

/**
 * Compara a leitura atual com a anterior.
 *
 * Na primeira leitura não existe "antes", mas uma conta que já chega
 * amarela ou pior é penalidade em curso e precisa aparecer: esperar ela
 * piorar mais para avisar seria avisar tarde.
 */
export function compararReputacao(anterior: string | null, atual: string | null): MudancaReputacao {
  const pa = posicaoNivel(anterior);
  const pb = posicaoNivel(atual);

  if (pb === null) return { tipo: "sem_cor", de: anterior, para: atual };
  if (pa === null) {
    return { tipo: pb <= 3 ? "primeira_leitura_ruim" : "primeira_leitura_ok", de: null, para: atual };
  }
  if (pb < pa) return { tipo: "piorou", de: anterior, para: atual };
  if (pb > pa) return { tipo: "melhorou", de: anterior, para: atual };
  return { tipo: "igual", de: anterior, para: atual };
}

/**
 * Aviso oficial que conta como alerta de penalidade.
 *
 * A documentação separa os avisos em novidades, alertas, lançamentos,
 * treinamentos e publicidade, mas a conta real só mostrou a categoria
 * "NEW" até agora. Sem um exemplo de alerta verdadeiro, a regra olha dois
 * sinais: a categoria conter "ALERT", ou a subcategoria ou o título falar
 * de bloqueio, restrição, suspensão, infração ou regularização.
 *
 * Todos os avisos ficam gravados com a categoria bruta, então quando o
 * primeiro alerta real aparecer dá para conferir e ajustar esta regra.
 */
const PALAVRAS_ALERTA =
  /bloque|restri|suspen|infra[çc]|regulariz|penal|inabilit|moder|pausad|reputa[çc][ãa]o (caiu|baix|pior)/i;

export function avisoEhAlerta(n: { category?: string | null; sub_category?: string | null; title?: string | null }): boolean {
  if ((n.category ?? "").toUpperCase().includes("ALERT")) return true;
  const texto = `${n.sub_category ?? ""} ${n.title ?? ""}`;
  // o aviso de greve dos Correios diz que atrasos NÃO vão afetar a
  // reputação: negação explícita não é alerta
  if (/n[ãa]o (v[ãa]o |vai )?afetar/i.test(texto)) return false;
  return PALAVRAS_ALERTA.test(texto);
}

/** Tira HTML do corpo do aviso para caber numa notificação. */
export function textoPlano(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Indicadores de saúde da loja (Shopee)                              *
 * ------------------------------------------------------------------ */

/**
 * O que cada indicador da Shopee quer dizer, em português.
 *
 * A Shopee devolve o nome técnico e o alvo dela. O nome vira texto aqui, num
 * lugar só, para a tela e a notificação falarem igual.
 */
export const INDICADOR_LABEL: Record<string, string> = {
  late_shipment_rate: "Atraso no envio",
  non_fulfillment_rate: "Pedidos não atendidos",
  cancellation_rate: "Cancelamento pela loja",
  return_refund_rate: "Devolução e reembolso",
  response_rate: "Taxa de respostas",
  // a nota que os compradores dão, diferente da nota de desempenho da loja
  shop_rating: "Avaliação dos compradores",
  severe_listing_violations: "Violação grave em anúncio",
  other_listing_violations: "Outras violações em anúncio",
  prohibited_listings: "Anúncio proibido",
  counterfeit_ip_infringement: "Uso indevido de marca ou imagem",
  spam_listings: "Anúncio duplicado ou spam",
  pre_order_listing_rate: "Anúncios sob encomenda",
  the_amount_of_pre_order_listing: "Quantidade de anúncios sob encomenda",
  pqr_products: "Produtos com qualidade reclamada",
  saturday_shipment_rate: "Envio no sábado",
  avg_preparation_time_ps: "Tempo médio de preparo",
  otdr_dd_rate: "Entrega no prazo prometido",
};

/**
 * Indicadores em que qualquer valor acima de zero é infração de conteúdo, não
 * número de operação. Estes entram como crítico assim que aparecem.
 */
const VIOLACOES = new Set([
  "severe_listing_violations",
  "prohibited_listings",
  "counterfeit_ip_infringement",
  "spam_listings",
  "other_listing_violations",
]);

export interface Indicador {
  nome: string;
  atual: number | null;
  anterior: number | null;
  alvo: number | null;
  /** como a Shopee compara com o alvo: <, <=, >, >= */
  comparador: string | null;
  unidade?: number | null;
}

export interface AvaliacaoIndicador {
  fora: boolean;
  severidade: Severidade;
  texto: string;
}

function porcentagem(unidade: number | null | undefined): boolean {
  // a Shopee marca 2 para porcentagem; nota e contagem não levam %
  return unidade === 2;
}

function numero(v: number, unidade: number | null | undefined): string {
  const formatado = v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return porcentagem(unidade) ? `${formatado}%` : formatado;
}

/**
 * O indicador está fora do alvo da própria Shopee?
 *
 * O alvo vem da API, com o comparador, então a regra não precisa de tabela
 * própria — e não fica desatualizada quando a Shopee muda a exigência.
 *
 * Indicador sem valor (null) não é zero: é indicador que a Shopee não apurou
 * no período, e não pode virar alerta.
 */
export function avaliarIndicador(i: Indicador): AvaliacaoIndicador {
  const label = INDICADOR_LABEL[i.nome] ?? i.nome;

  if (i.atual === null || i.alvo === null || !i.comparador) {
    return { fora: false, severidade: "informativo", texto: `${label}: sem apuração no período.` };
  }

  const dentro =
    i.comparador === "<"
      ? i.atual < i.alvo
      : i.comparador === "<="
        ? i.atual <= i.alvo
        : i.comparador === ">"
          ? i.atual > i.alvo
          : i.atual >= i.alvo;

  const alvoTexto = `${i.comparador} ${numero(i.alvo, i.unidade)}`;
  const base = `${label}: ${numero(i.atual, i.unidade)} (alvo ${alvoTexto})`;
  const evolucao =
    i.anterior === null ? "" : ` · período anterior ${numero(i.anterior, i.unidade)}`;

  if (dentro) return { fora: false, severidade: "informativo", texto: `${base}${evolucao}` };

  // violação de conteúdo é crítica na primeira ocorrência; indicador de
  // operação vira crítico quando passa do dobro do que a Shopee tolera
  const dobro = i.comparador.startsWith("<") ? i.atual > i.alvo * 2 : i.atual < i.alvo / 2;
  const severidade: Severidade = VIOLACOES.has(i.nome) || dobro ? "critico" : "atencao";

  return { fora: true, severidade, texto: `${base}${evolucao}` };
}

/* ------------------------------------------------------------------ *
 * Preço do anúncio                                                   *
 * ------------------------------------------------------------------ */

/** Abaixo disso é ajuste de centavo, não mudança de preço. */
export const MUDANCA_MINIMA_PRECO = 0.05;

export interface MudancaPreco {
  mudou: boolean;
  subiu: boolean;
  variacao: number;
  texto: string;
}

/**
 * O preço do anúncio mudou o suficiente para avisar?
 *
 * O pedido do cliente foi "anúncio subiu o preço e perdeu relevância": subir
 * preço sem avisar a agência é o que faz o anúncio cair na busca e ninguém
 * entender por quê. Queda também é registrada, com severidade menor, porque
 * margem jogada fora dói depois.
 */
export function avaliarPreco(anterior: number, atual: number): MudancaPreco {
  if (!anterior || anterior <= 0) {
    return { mudou: false, subiu: false, variacao: 0, texto: "Sem preço anterior para comparar." };
  }
  const variacao = (atual - anterior) / anterior;
  const mudou = Math.abs(variacao) >= MUDANCA_MINIMA_PRECO;
  const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = `${(Math.abs(variacao) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return {
    mudou,
    subiu: variacao > 0,
    variacao,
    texto: `De ${brl(anterior)} para ${brl(atual)} (${variacao > 0 ? "alta" : "queda"} de ${pct}).`,
  };
}

/* ------------------------------------------------------------------ *
 * Tipos de penalidade que a tela conhece                             *
 * ------------------------------------------------------------------ */

export const KIND_LABEL: Record<string, string> = {
  reputacao: "Reputação",
  aviso: "Aviso oficial",
  infracao: "Infração em anúncio",
  punicao: "Punição",
  desempenho: "Indicador fora do alvo",
  atraso: "Atraso no envio",
  anuncio: "Anúncio bloqueado ou rebaixado",
  preco: "Mudança de preço",
  promocao: "Anúncio sem promoção",
};
