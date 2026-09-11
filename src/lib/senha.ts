/**
 * Regra de senha.
 *
 * O mínimo anterior era seis caracteres, o que aceita "123456" e o nome do
 * cachorro. Este sistema guarda faturamento de terceiros e tokens de acesso
 * às lojas dos clientes; uma conta invadida aqui expõe a operação inteira
 * deles, não só a do Kadu.
 *
 * Doze caracteres sem exigência de símbolo é melhor do que oito com
 * exigência: comprimento resiste a força bruta, e regra de caractere
 * especial só produz "Senha@123" em todo lugar. O que barramos além do
 * comprimento são as senhas que um atacante tenta primeiro.
 */
const MINIMO = 12;

/** As que aparecem em qualquer lista de senhas vazadas em português. */
const OBVIAS = [
  "123456", "12345678", "123456789", "1234567890", "senha", "password",
  "qwerty", "abc123", "111111", "000000", "brasil", "flamengo", "corinthians",
  "senha123", "admin123", "mudar123", "elleva", "elleva123",
];

export interface ResultadoSenha {
  ok: boolean;
  erro?: string;
}

export function validarSenha(senha: string, contexto: { nome?: string; email?: string } = {}): ResultadoSenha {
  const s = senha.trim();

  if (s.length < MINIMO) {
    return { ok: false, erro: `A senha precisa de pelo menos ${MINIMO} caracteres. Uma frase curta funciona bem.` };
  }
  if (s.length > 200) {
    return { ok: false, erro: "Senha longa demais." };
  }

  const baixa = s.toLowerCase();

  if (OBVIAS.some((o) => baixa === o || baixa.startsWith(o))) {
    return { ok: false, erro: "Essa senha está nas listas que os invasores testam primeiro. Escolha outra." };
  }

  // um único caractere repetido, ou sequência do teclado
  if (/^(.)\1+$/.test(s)) {
    return { ok: false, erro: "Não use o mesmo caractere repetido." };
  }
  if (baixa.includes("qwerty") || baixa.includes("asdfgh") || /0123456|1234567|abcdefg/.test(baixa)) {
    return { ok: false, erro: "Não use sequências de teclado ou de números." };
  }

  const local = (contexto.email ?? "").split("@")[0].toLowerCase();
  if (local.length >= 4 && baixa.includes(local)) {
    return { ok: false, erro: "A senha não pode conter o seu e-mail." };
  }

  const primeiroNome = (contexto.nome ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (primeiroNome.length >= 4 && baixa.includes(primeiroNome)) {
    return { ok: false, erro: "A senha não pode conter o seu nome." };
  }

  return { ok: true };
}

export const REGRA_SENHA = `Pelo menos ${MINIMO} caracteres. Uma frase que só você saiba funciona melhor do que uma palavra com símbolos.`;
