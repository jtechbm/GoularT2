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
  /** criar pessoa, trocar papel, desativar acesso */
  | "equipe.gerenciar"
  /** conectar loja, pedir acesso ao lojista, desconectar, ver a tela de chaves */
  | "integracoes.gerenciar"
  /** puxar os números de um cliente que já está conectado */
  | "integracoes.sincronizar"
  /** cadastrar, editar e excluir cliente, suas contas e sua equipe */
  | "clientes.gerenciar"
  /** enxergar a carteira inteira, e não só os clientes atribuídos */
  | "carteira.completa"
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

const TODAS: Permission[] = [
  "equipe.gerenciar",
  "integracoes.gerenciar",
  "integracoes.sincronizar",
  "clientes.gerenciar",
  "carteira.completa",
  "lojas.proprias",
  "tarefas.gerenciar",
  "financeiro",
  "chat.gerenciar",
  "penalidades.resolver",
  "precos.pesquisar",
  "analise.rodar",
];

const POR_PAPEL: Record<Role, Permission[]> = {
  admin: TODAS,

  // carteira, tarefas e financeiro. Integrações e equipe ficam com o admin:
  // é justamente isso que separa os dois papéis. O gestor ainda pode mandar
  // sincronizar uma conta já conectada, porque isso é ler número de cliente,
  // não administrar a conexão.
  gestor: [
    "integracoes.sincronizar",
    "clientes.gerenciar",
    "carteira.completa",
    "lojas.proprias",
    "tarefas.gerenciar",
    "financeiro",
    "chat.gerenciar",
    "penalidades.resolver",
    "precos.pesquisar",
  ],

  // opera o que é dele: lança número, escreve anotação, pega tarefa e manda
  // buscar os valores do mês. Cada uma dessas ações ainda passa por
  // assertClientAccess, então o alcance para no cliente atribuído a ele.
  membro: ["integracoes.sincronizar"],
};

/**
 * Pode? Usa as permissões gravadas para o papel (tela de Equipe) quando a
 * sessão as carregou; sem elas, o padrão do código. O admin tem tudo sempre.
 */
export function can(user: { role: Role; permissions?: readonly string[] | null }, permission: Permission): boolean {
  if (user.role === "admin") return true;
  if (user.permissions) return user.permissions.includes(permission);
  return POR_PAPEL[user.role]?.includes(permission) ?? false;
}

/** Papéis cujas permissões podem ser mudadas na tela. */
export const PAPEIS_EDITAVEIS: Role[] = ["gestor", "membro"];

/**
 * Lê o que está gravado para um papel. Texto estragado ou permissão que não
 * existe mais é ignorado; sem nada gravado, vale o padrão.
 */
export function permissoesGravadas(role: Role, gravado: string | null | undefined): Permission[] {
  if (role === "admin") return TODAS;
  if (!gravado) return POR_PAPEL[role] ?? [];
  try {
    const lista = JSON.parse(gravado) as unknown;
    if (!Array.isArray(lista)) return POR_PAPEL[role] ?? [];
    return TODAS.filter((p) => lista.includes(p));
  } catch {
    return POR_PAPEL[role] ?? [];
  }
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
  "equipe.gerenciar": "Cadastrar pessoas e trocar papéis",
  "integracoes.gerenciar": "Conectar e desconectar marketplaces",
  "integracoes.sincronizar": "Buscar os números do mês",
  "clientes.gerenciar": "Cadastrar e editar clientes",
  "carteira.completa": "Ver a carteira inteira",
  "lojas.proprias": "Ver as lojas próprias",
  "tarefas.gerenciar": "Criar e distribuir tarefas",
  financeiro: "Cobranças, despesas e resultado",
  "chat.gerenciar": "Criar e remover canais",
  "penalidades.resolver": "Resolver penalidades",
  "precos.pesquisar": "Pesquisar preços de concorrentes",
  "analise.rodar": "Rodar a análise da loja pela IA",
};

/** Ordem em que as permissões aparecem na tabela. */
export const PERMISSION_ORDER: Permission[] = TODAS;

export function permissionsOf(role: Role): Permission[] {
  return POR_PAPEL[role] ?? [];
}
