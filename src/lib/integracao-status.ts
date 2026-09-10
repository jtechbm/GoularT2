/**
 * Como falar sobre o estado de uma conta conectada.
 *
 * A tela mostrava a mensagem crua da API, que dizia coisas como
 * "invalid_grant" e "Type mismatch". Quem lê isso é o Kadu, e a reação
 * certa a cada erro é diferente: token expirado se resolve pedindo nova
 * autorização, limite de chamadas se resolve esperando, e falha de rede
 * se resolve tentando de novo. Um texto genérico faria todos parecerem o
 * mesmo problema.
 */
export interface Diagnostico {
  titulo: string;
  /** o que a pessoa deve fazer, em uma frase */
  acao: string;
  /** vale a pena tentar de novo agora */
  tentarDeNovo: boolean;
  /** precisa que o lojista autorize outra vez */
  precisaReautorizar: boolean;
}

export function diagnosticar(erro: string | null | undefined): Diagnostico | null {
  if (!erro) return null;
  const e = erro.toLowerCase();

  if (e.includes("refresh_token") || e.includes("invalid_grant") || e.includes("autorizada") || e.includes("401")) {
    return {
      titulo: "O acesso à loja expirou",
      acao: "Peça uma nova autorização ao lojista pelo botão abaixo.",
      tentarDeNovo: false,
      precisaReautorizar: true,
    };
  }
  if (e.includes("403") || e.includes("permiss")) {
    return {
      titulo: "Faltou permissão no aplicativo",
      acao: "A loja autorizou, mas sem a permissão necessária. Peça uma nova autorização.",
      tentarDeNovo: false,
      precisaReautorizar: true,
    };
  }
  if (e.includes("429") || e.includes("rate") || e.includes("limit")) {
    return {
      titulo: "O marketplace pediu para esperar",
      acao: "Muitas consultas em pouco tempo. A rodada automática de amanhã resolve sozinha.",
      tentarDeNovo: false,
      precisaReautorizar: false,
    };
  }
  if (e.includes("tempo limite") || e.includes("timeout") || e.includes("grande demais")) {
    return {
      titulo: "O mês é grande demais para uma rodada só",
      acao: "Sincronize de novo: cada rodada avança um pouco mais.",
      tentarDeNovo: true,
      precisaReautorizar: false,
    };
  }
  if (e.includes("variáveis de ambiente") || e.includes("chaves")) {
    return {
      titulo: "Conexão com esta loja ainda não liberada",
      acao: "Avise o administrador do Elleva.",
      tentarDeNovo: false,
      precisaReautorizar: false,
    };
  }
  if (e.includes("fetch") || e.includes("network") || e.includes("econn") || e.includes("50")) {
    return {
      titulo: "O marketplace não respondeu",
      acao: "Costuma ser passageiro. Tente de novo em alguns minutos.",
      tentarDeNovo: true,
      precisaReautorizar: false,
    };
  }

  return {
    titulo: "A sincronização falhou",
    acao: "Tente de novo. Se insistir, peça uma nova autorização ao lojista.",
    tentarDeNovo: true,
    precisaReautorizar: true,
  };
}

/**
 * Quando roda a próxima sincronização automática.
 *
 * O agendamento da Vercel é diário às 6h UTC, o que dá 3h da manhã em
 * Brasília. Mostrar isso evita a pergunta "já atualizou?" e evita que
 * alguém fique clicando em sincronizar à toa.
 */
export function proximaSincronizacao(agora = new Date()): Date {
  const proxima = new Date(agora);
  proxima.setUTCHours(6, 0, 0, 0);
  if (proxima <= agora) proxima.setUTCDate(proxima.getUTCDate() + 1);
  return proxima;
}

/** Há quantos dias a conta não atualiza com sucesso. */
export function diasSemAtualizar(lastSuccess: string | null | undefined): number | null {
  if (!lastSuccess) return null;
  return Math.floor((Date.now() - new Date(lastSuccess).getTime()) / 864e5);
}
