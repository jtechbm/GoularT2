/**
 * Valida a configuração do Mercado Livre antes de conectar qualquer conta.
 *
 *   npm run testar-ml
 *
 * Confere client_id e client_secret contra a API (sem imprimir o secret) e
 * mostra o link de autorização que o sistema vai gerar, para comparar com o
 * redirect cadastrado na aplicação.
 */
const clientId = process.env.ML_CLIENT_ID ?? "";
const clientSecret = process.env.ML_CLIENT_SECRET ?? "";
const redirectUri = process.env.ML_REDIRECT_URI ?? "";
const API = "https://api.mercadolibre.com";

function sair(msg: string): never {
  console.error(`\n${msg}`);
  process.exit(1);
}

console.log("Configuração");
console.log(`  client_id      ${clientId || "VAZIO"}`);
console.log(`  client_secret  ${clientSecret ? `preenchido (${clientSecret.length} caracteres)` : "VAZIO"}`);
console.log(`  redirect       ${redirectUri || "VAZIO"}`);

if (!clientId || !clientSecret) {
  sair("Preencha ML_CLIENT_ID e ML_CLIENT_SECRET no .env antes de testar.");
}
if (redirectUri && !redirectUri.startsWith("https://")) {
  console.warn("\nAviso: o Mercado Livre exige HTTPS no redirect. O atual não é HTTPS.");
}

console.log("\nChamando o Mercado Livre para validar as credenciais…");

let res: Response;
try {
  res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
} catch (e) {
  sair(`Não consegui falar com o Mercado Livre: ${e instanceof Error ? e.message : String(e)}`);
}

const json = (await res.json()) as {
  access_token?: string;
  error?: string;
  message?: string;
  status?: number;
};

if (!res.ok || json.error) {
  const explicacao: Record<string, string> = {
    invalid_client: "client_id ou client_secret não conferem",
    invalid_grant: "credenciais recusadas",
    unauthorized_client: "esta aplicação não tem permissão para este fluxo",
    forbidden: "aplicação sem permissão — confira os scopes marcados",
  };
  console.error(`\nO Mercado Livre recusou (${res.status}): ${json.error ?? "erro"}`);
  if (json.error && explicacao[json.error]) console.error(`  ${explicacao[json.error]}`);
  if (json.message) console.error(`  ${json.message}`);
  process.exit(1);
}

console.log("Credenciais aceitas — client_id e client_secret estão corretos.");

if (redirectUri) {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: "EXEMPLO",
  });
  console.log("\nLink de autorização que o sistema gera:");
  console.log(`  https://auth.mercadolivre.com.br/authorization?${qs}`);
  console.log("\nO redirect_uri acima precisa estar cadastrado na aplicação, caractere por caractere.");
}

console.log("\nConfira na aplicação, no Developer Center:");
console.log("  • scope offline_access marcado — sem ele não vem refresh_token e a conexão");
console.log("    morre em 6 horas, exigindo reautorizar o lojista toda vez");
console.log("  • PKCE desligado — o sistema usa o fluxo com client_secret, sem PKCE");
