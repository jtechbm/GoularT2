import type { Role } from "./types";

/**
 * O que cada papel faz, em um lugar só.
 *
 * A tela de Equipe já descrevia os três papéis em português; este arquivo é a
 * mesma frase escrita em código, para a descrição e o comportamento não
 * andarem separados:
 *
 *   Admin   acesso total, gerencia equipe e integrações
 *   Gestor  gerencia carteira, tarefas e financeiro
 *   Membro  opera os clientes atribuídos a ele e pega tarefas
 */
export type Permission =
  // --- telas: sem a permissão, some do menu e o endereço direto é barrado.
  // Tarefas, Chat e Notificações são de todo mundo e não entram aqui.
  /** o painel da carteira (tela inicial); sem ela, a tela inicial é a de pontos e tarefas */
  | "painel.ver"
  | "clientes.ver"
  | "alertas.ver"
  | "penalidades.ver"
  | "ads.ver"
  | "precos.ver"
  | "analise.ver"
  | "equipe.ver"
  // --- ações
  /** criar pessoa, trocar papel, desativar acesso */
  | "equipe.gerenciar"
  /** conectar loja, pedir acesso ao lojista, desconectar, ver a tela de chaves */
  | "integracoes.gerenciar"
  /** puxar os números de um cliente que já está conectado */
  | "integracoes.sincronizar"
  /** cadastrar, editar e excluir cliente, suas contas e sua equipe */
  | "clientes.gerenciar"
  /** criar um cliente novo; depois a visibilidade continua limitada ao escopo */
  | "clientes.cadastrar"
  /** as lojas do próprio Kadu, que não fazem parte da carteira */
  | "lojas.proprias"
  /** criar tarefa para outra pessoa, editar e excluir */
  | "tarefas.gerenciar"
  /** cobranças, despesas e resultado da agência */
  | "financeiro"
  /** criar e remover canais do chat */
  | "chat.gerenciar"
  /** marcar penalidade como resolvida; ver continua limitado à carteira da pessoa */
  | "penalidades.resolver"
  /** disparar a busca de preços de concorrentes, que custa dinheiro por execução */
  | "precos.pesquisar"
  /** mandar a IA analisar uma loja inteira; cada execução custa dinheiro */
  | "analise.rodar";

const TELAS: Permission[] = [
  "painel.ver",
  "clientes.ver",
  "alertas.ver",
  "penalidades.ver",
  "ads.ver",
  "precos.ver",
  "analise.ver",
  "equipe.ver",
];

const TODAS: Permission[] = [
  ...TELAS,
  "equipe.gerenciar",
  "integracoes.gerenciar",
  "integracoes.sincronizar",
  "clientes.gerenciar",
  "clientes.cadastrar",
  "lojas.proprias",
  "tarefas.gerenciar",
  "financeiro",
  "chat.gerenciar",
  "penalidades.resolver",
  "precos.pesquisar",
  "analise.rodar",
];

/**
 * Faz parte do trabalho de qualquer pessoa da operação. Estas duas não
 * podem ser retiradas na tabela de papéis: a privacidade vem do escopo dos
 * clientes, não de esconder a tela inteira.
 */
export const PERMISSOES_OBRIGATORIAS: readonly Permission[] = ["clientes.ver", "clientes.cadastrar"];

const POR_PAPEL: Record<Role, Permission[]> = {
  admin: TODAS,

  // carteira, tarefas e financeiro. Integrações e equipe ficam com o admin:
  // é justamente isso que separa os dois papéis. O gestor ainda pode mandar
  // sincronizar uma conta já conectada, porque isso é ler número de cliente,
  // não administrar a conexão.
  gestor: [
    ...TELAS,
    "integracoes.sincronizar",
    "clientes.gerenciar",
    "clientes.cadastrar",
    // o dinheiro da agência e as lojas do próprio Kadu não são da equipe:
    // funcionário vê o financeiro das lojas dos clientes, que é o trabalho
    // dele, não o que a agência cobra, gasta e ganha
    "tarefas.gerenciar",
    "chat.gerenciar",
    "penalidades.resolver",
    "precos.pesquisar",
  ],

  // o membro trabalha nas tarefas e nos clientes que cadastrou ou recebeu.
  // O resto da operação o admin libera tela por tela na Equipe.
  membro: ["clientes.ver", "clientes.cadastrar", "integracoes.sincronizar"],
};

/**
 * Pode? Usa as permissões gravadas para o papel (tela de Equipe) quando a
 * sessão as carregou; sem elas, o padrão do código. O admin tem tudo sempre.
 */
export function can(user: { role: Role; permissions?: readonly string[] | null }, permission: Permission): boolean {
  if (user.role === "admin") return true;
  if (PERMISSOES_OBRIGATORIAS.includes(permission)) return true;
  if (user.permissions) return user.permissions.includes(permission);
  return POR_PAPEL[user.role]?.includes(permission) ?? false;
}

/** Papéis cujas permissões podem ser mudadas na tela. */
export const PAPEIS_EDITAVEIS: Role[] = ["gestor", "membro"];

/**
 * Lê o que está gravado para um papel.
 *
 * O gravado guarda também quais permissões existiam na hora de salvar.
 * Permissão criada depois não estava na tela de quem salvou, então vale o
 * padrão do papel para ela: sem isso, criar as permissões de tela tirou do
 * gestor todas as telas, porque a lista salva antes não as tinha.
 *
 * Formato antigo (só a lista) é de antes das permissões de tela. Texto
 * estragado ou permissão que não existe mais é ignorado; sem nada gravado,
 * vale o padrão.
 */
export function permissoesGravadas(role: Role, gravado: string | null | undefined): Permission[] {
  if (role === "admin") return TODAS;
  const padrao = POR_PAPEL[role] ?? [];
  if (!gravado) return padrao;
  try {
    const lido = JSON.parse(gravado) as unknown;
    let tem: unknown[];
    let conhecidas: unknown[];
    if (Array.isArray(lido)) {
      tem = lido;
      conhecidas = TODAS.filter((p) => !TELAS.includes(p));
    } else if (lido && typeof lido === "object" && Array.isArray((lido as { tem?: unknown }).tem)) {
      tem = (lido as { tem: unknown[] }).tem;
      conhecidas = Array.isArray((lido as { conhecidas?: unknown }).conhecidas)
        ? (lido as { conhecidas: unknown[] }).conhecidas
        : TODAS;
    } else {
      return padrao;
    }
    return TODAS.filter(
      (p) => PERMISSOES_OBRIGATORIAS.includes(p) || (conhecidas.includes(p) ? tem.includes(p) : padrao.includes(p)),
    );
  } catch {
    return padrao;
  }
}

/** Como gravar: o que o papel tem e o que existia na hora. */
export function gravarPermissoes(tem: Permission[]): string {
  return JSON.stringify({ tem, conhecidas: TODAS });
}

/** O padrão do código para o papel, para o botão "voltar ao padrão". */
export function permissoesPadrao(role: Role): Permission[] {
  return POR_PAPEL[role] ?? [];
}

/**
 * Como cada permissão aparece na tela de Equipe.
 *
 * A tabela de papéis é montada a partir de POR_PAPEL, e não de um texto
 * escrito à mão: assim a descrição não pode discordar do que o código faz.
 */
export const PERMISSION_LABEL: Record<Permission, string> = {
  "painel.ver": "Ver o painel da carteira",
  "clientes.ver": "Abrir a tela de Clientes",
  "alertas.ver": "Ver Atenção",
  "penalidades.ver": "Ver Penalidades",
  "ads.ver": "Ver Ads",
  "precos.ver": "Ver Preços",
  "analise.ver": "Ver Análise",
  "equipe.ver": "Ver Equipe",
  "equipe.gerenciar": "Cadastrar pessoas e trocar papéis",
  "integracoes.gerenciar": "Conectar e desconectar marketplaces",
  "integracoes.sincronizar": "Buscar os números do mês",
  "clientes.gerenciar": "Editar dados, contas e equipe dos clientes",
  "clientes.cadastrar": "Cadastrar novos clientes",
  "lojas.proprias": "Ver as lojas do próprio Kadu",
  "tarefas.gerenciar": "Criar e distribuir tarefas",
  financeiro: "Financeiro da agência (cobranças, despesas e resultado)",
  "chat.gerenciar": "Criar e remover canais",
  "penalidades.resolver": "Resolver penalidades",
  "precos.pesquisar": "Pesquisar preços de concorrentes",
  "analise.rodar": "Rodar a análise da loja pela IA",
};

/** Ordem em que as permissões aparecem na tabela. */
export const PERMISSION_ORDER: Permission[] = TODAS;

/** As que são "ver uma tela", para a tabela separar das ações. */
export const PERMISSOES_DE_TELA: readonly Permission[] = TELAS;

export function permissionsOf(role: Role): Permission[] {
  return POR_PAPEL[role] ?? [];
}
