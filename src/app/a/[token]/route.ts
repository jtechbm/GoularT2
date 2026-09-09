import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { adapterFor } from "@/lib/integrations";

/**
 * Link de autorização que o Kadu manda para o lojista.
 *
 * É público de propósito: quem abre é o dono da loja, que não tem — e nunca
 * vai ter — acesso ao Elleva. Não há tela nenhuma aqui: valida o token e
 * manda direto para o consentimento do marketplace. A única coisa que o
 * lojista vê do nosso lado é a mensagem de erro quando o link não presta.
 */

function aviso(titulo: string, texto: string, status: number) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
 font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;color:#1f2937">
<div style="max-width:26rem;padding:2rem;text-align:center">
<h1 style="font-size:1.1rem;margin:0 0 .5rem">${titulo}</h1>
<p style="margin:0;color:#6b7280;line-height:1.6">${texto}</p>
</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const conta = await one<{
    id: string;
    marketplace: string;
    auth_expires_at: string | null;
    auth_used_at: string | null;
  }>(
    "SELECT id, marketplace, auth_expires_at, auth_used_at FROM client_marketplaces WHERE auth_token = ?",
    token,
  );

  if (!conta) {
    return aviso("Link inválido", "Este link de autorização não existe mais. Peça um novo para quem enviou.", 404);
  }
  if (conta.auth_used_at) {
    return aviso("Link já utilizado", "Esta loja já foi autorizada. Não é preciso fazer nada.", 410);
  }
  if (conta.auth_expires_at && new Date(conta.auth_expires_at) < new Date()) {
    return aviso("Link expirado", "Este link de autorização venceu. Peça um novo para quem enviou.", 410);
  }

  try {
    const adapter = adapterFor(conta.marketplace);
    if (!adapter.isConfigured()) {
      return aviso("Indisponível no momento", "A integração ainda não está configurada. Avise quem enviou o link.", 503);
    }
    // o token viaja como state e volta no callback
    return NextResponse.redirect(adapter.authorizeUrl(token));
  } catch {
    return aviso("Não foi possível continuar", "Houve um erro ao iniciar a autorização. Avise quem enviou o link.", 500);
  }
}
