/**
 * Valida a configuração da Shopee antes de conectar qualquer loja.
 *
 *   npm run testar-shopee
 *
 * Confere a assinatura HMAC com o partner_key (sem nunca imprimi-lo), lista as
 * lojas que já autorizaram este partner app e mostra o link de autorização
 * que o sistema vai gerar.
 */
import { createHmac } from "node:crypto";

const partnerId = process.env.SHOPEE_PARTNER_ID ?? "";
const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
const redirectUri = process.env.SHOPEE_REDIRECT_URI ?? "";
const host = process.env.SHOPEE_HOST ?? "https://partner.shopeemobile.com";

function sair(msg: string): never {
  console.error(`\n${msg}`);
  process.exit(1);
}

console.log("Configuração");
console.log(`  host          ${host}${host.includes("test-stable") ? "  (sandbox)" : "  (produção)"}`);
console.log(`  partner_id    ${partnerId || "VAZIO"}`);
console.log(`  partner_key   ${partnerKey ? `preenchida (${partnerKey.length} caracteres)` : "VAZIA"}`);
console.log(`  redirect      ${redirectUri || "VAZIO"}`);

if (!partnerId || !partnerKey) {
  sair("Preencha SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no .env antes de testar.");
}
if (!redirectUri) {
  console.warn("\nAviso: SHOPEE_REDIRECT_URI vazio — o OAuth vai falhar sem ele.");
}

/** Endpoints públicos assinam partner_id + path + timestamp. */
function assinar(path: string, timestamp: number): string {
  return createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}`).digest("hex");
}

const path = "/api/v2/public/get_shops_by_partner";
const timestamp = Math.floor(Date.now() / 1000);
const qs = new URLSearchParams({
  partner_id: partnerId,
  timestamp: String(timestamp),
  sign: assinar(path, timestamp),
  page_size: "100",
  page_no: "1",
});

console.log("\nChamando a Shopee para validar a assinatura…");

let res: Response;
try {
  res = await fetch(`${host}${path}?${qs}`, { headers: { accept: "application/json" } });
} catch (e) {
  sair(`Não consegui falar com ${host}: ${e instanceof Error ? e.message : String(e)}`);
}

const json = (await res.json()) as {
  error?: string;
  message?: string;
  authed_shop_list?: { shop_id: number; region?: string; auth_time?: number; expire_time?: number }[];
  more?: boolean;
};

if (json.error) {
  const explicacao: Record<string, string> = {
    error_sign: "assinatura inválida — o partner_key não confere com o partner_id",
    error_param: "parâmetro inválido — confira o partner_id",
    error_not_found: "partner_id não encontrado neste ambiente (produção x sandbox)",
    error_auth: "este partner app não tem permissão para esta chamada",
  };
  console.error(`\nA Shopee recusou: ${json.error}`);
  if (explicacao[json.error]) console.error(`  ${explicacao[json.error]}`);
  if (json.message) console.error(`  ${json.message}`);
  console.error("\nSe o app for de sandbox, defina SHOPEE_HOST=https://partner.test-stable.shopeemobile.com");
  process.exit(1);
}

console.log("Assinatura aceita — partner_id e partner_key estão corretos.\n");

const lojas = json.authed_shop_list ?? [];
if (lojas.length) {
  console.log(`Lojas que já autorizaram este partner app: ${lojas.length}${json.more ? "+" : ""}`);
  for (const l of lojas.slice(0, 20)) {
    const expira = l.expire_time ? new Date(l.expire_time * 1000).toLocaleDateString("pt-BR") : "—";
    console.log(`  shop_id ${l.shop_id}  região ${l.region ?? "—"}  autorização expira em ${expira}`);
  }
  console.log("\nAtenção: se alguma dessas lojas também for atendida pelo outro projeto,");
  console.log("os dois sistemas vão disputar o mesmo token de renovação.");
} else {
  console.log("Nenhuma loja autorizou este partner app ainda.");
}

if (redirectUri) {
  const authPath = "/api/v2/shop/auth_partner";
  const ts = Math.floor(Date.now() / 1000);
  const link = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(ts),
    sign: assinar(authPath, ts),
    redirect: `${redirectUri}?state=EXEMPLO`,
  });
  console.log("\nLink de autorização que o sistema gera (válido por 5 minutos):");
  console.log(`  ${host}${authPath}?${link}`);
  console.log("\nO redirect acima precisa estar cadastrado no console da Shopee, igualzinho.");
}
