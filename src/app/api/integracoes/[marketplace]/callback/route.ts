import { NextResponse, type NextRequest } from "next/server";
import { now, one, run } from "@/lib/db";
import { adapterFor, writeCredentials } from "@/lib/integrations";

const SLUGS: Record<string, string> = {
  "mercado-livre": "mercado_livre",
  shopee: "shopee",
};

/**
 * Retorno do consentimento do marketplace.
 *
 * Quem chega aqui é o lojista, que não tem conta no Elleva — por isso não há
 * verificação de sessão. O que autoriza a gravação é o `state`: um token
 * longo, de uso único, com prazo, criado pela equipe e amarrado a uma conta
 * específica. Sem token válido, nada é gravado.
 */

function pagina(titulo: string, texto: string, status: number, ok = false) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
 font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;color:#1f2937">
<div style="max-width:26rem;padding:2rem;text-align:center">
<div style="font-size:2rem;line-height:1;margin-bottom:.75rem">${ok ? "✓" : "!"}</div>
<h1 style="font-size:1.1rem;margin:0 0 .5rem">${titulo}</h1>
<p style="margin:0;color:#6b7280;line-height:1.6">${texto}</p>
</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ marketplace: string }> }) {
  const { marketplace: slug } = await ctx.params;
  const marketplace = SLUGS[slug];
  if (!marketplace) return pagina("Link inválido", "Marketplace desconhecido.", 404);

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const token = params.get("state");
  if (!code || !token) {
    return pagina("Autorização incompleta", "O marketplace não devolveu os dados esperados. Tente o link de novo.", 400);
  }

  const conta = await one<{
    id: string;
    marketplace: string;
    auth_expires_at: string | null;
    auth_used_at: string | null;
  }>(
    "SELECT id, marketplace, auth_expires_at, auth_used_at FROM client_marketplaces WHERE auth_token = ?",
    token,
  );

  if (!conta || conta.marketplace !== marketplace) {
    return pagina("Link inválido", "Este link de autorização não é mais válido.", 404);
  }
  if (conta.auth_used_at) {
    return pagina("Já autorizado", "Esta loja já havia sido autorizada. Não é preciso fazer nada.", 200, true);
  }
  if (conta.auth_expires_at && new Date(conta.auth_expires_at) < new Date()) {
    return pagina("Link expirado", "Este link venceu. Peça um novo para quem enviou.", 410);
  }

  try {
    // a Shopee devolve shop_id na query do retorno; o ML devolve o user_id no token
    const extra: Record<string, string> = {};
    for (const chave of ["shop_id", "main_account_id"]) {
      const valor = params.get(chave);
      if (valor) extra[chave] = valor;
    }

    const creds = await adapterFor(marketplace).exchangeCode(code, extra);
    await writeCredentials(conta.id, creds);

    const externo = creds.user_id ?? creds.shop_id ?? null;
    await run(
      `UPDATE client_marketplaces
          SET external_id = COALESCE(?, external_id),
              authorized_at = ?, auth_used_at = ?, authorized_ip = ?, auth_token = NULL
        WHERE id = ?`,
      externo,
      now(),
      now(),
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      conta.id,
    );

    return pagina(
      "Autorização concluída",
      "Pronto! O acesso aos números da sua loja foi liberado. Pode fechar esta página.",
      200,
      true,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha na autorização.";
    // o link continua válido para nova tentativa; só registramos o erro
    await run("UPDATE client_marketplaces SET status = 'erro', last_error = ? WHERE id = ?", msg, conta.id);
    return pagina("Não foi possível concluir", "Houve um erro ao autorizar. Avise quem enviou o link.", 502);
  }
}
