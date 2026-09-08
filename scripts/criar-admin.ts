/**
 * Cria o primeiro acesso administrador do GoularT. Não cria nenhum dado de exemplo:
 * clientes, tarefas, canais e fechamentos são cadastrados pela equipe no sistema.
 *
 * Uso:
 *   npm run criar-admin -- kadu@suaempresa.com.br
 *   npm run criar-admin -- kadu@suaempresa.com.br "Kadu Goulart"
 *   npm run criar-admin -- kadu@suaempresa.com.br "Kadu Goulart" minhasenha
 *
 * Sem a senha, uma senha forte é sorteada e mostrada uma única vez.
 */
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { one, run } from "../src/lib/db.ts";

const [email, name = "Administrador", senhaArg] = process.argv.slice(2);

if (!email || !email.includes("@")) {
  console.error("Informe o e-mail do administrador.");
  console.error('Exemplo: npm run criar-admin -- kadu@suaempresa.com.br "Kadu Goulart"');
  process.exit(1);
}

if (one("SELECT id FROM users WHERE lower(email) = lower(?)", email)) {
  console.error(`Já existe um usuário com o e-mail ${email}.`);
  process.exit(1);
}

/** Senha legível de 16 caracteres, sem os que se confundem (0/O, 1/l/I). */
function sortearSenha(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const senha = senhaArg ?? sortearSenha();
if (senha.length < 6) {
  console.error("A senha precisa ter ao menos 6 caracteres.");
  process.exit(1);
}

run(
  `INSERT INTO users (id, name, email, password_hash, role, job_title, color, active, created_at)
   VALUES (?,?,?,?,'admin',?,?,1,?)`,
  randomUUID(),
  name,
  email.toLowerCase(),
  hash(senha),
  "Head da operação",
  "#a855f7",
  new Date().toISOString(),
);

console.log("Administrador criado.\n");
console.log(`  e-mail: ${email.toLowerCase()}`);
console.log(`  senha:  ${senha}`);
if (!senhaArg) console.log("\nAnote a senha: ela não será mostrada de novo. Troque-a em Equipe depois de entrar.");
