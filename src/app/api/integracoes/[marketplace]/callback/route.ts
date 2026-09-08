import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { adapterFor, writeCredentials } from "@/lib/integrations";

const SLUGS: Record<string, string> = {
  "mercado-livre": "mercado_livre",
  shopee: "shopee",
};

/** Callback do OAuth: `state` carrega o id da conta (client_marketplaces.id). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ marketplace: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { marketplace: slug } = await ctx.params;
  const marketplace = SLUGS[slug];
  if (!marketplace) return NextResponse.redirect(new URL("/integracoes?erro=marketplace", req.url));

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const accountId = params.get("state");
  if (!code || !accountId) return NextResponse.redirect(new URL("/integracoes?erro=callback", req.url));

  const account = await one<{ id: string; marketplace: string }>(
    "SELECT id, marketplace FROM client_marketplaces WHERE id = ?",
    accountId,
  );
  if (!account || account.marketplace !== marketplace) {
    return NextResponse.redirect(new URL("/integracoes?erro=conta", req.url));
  }

  try {
    const extra: Record<string, string> = {};
    // Shopee devolve shop_id na query do redirect
    for (const key of ["shop_id", "main_account_id"]) {
      const value = params.get(key);
      if (value) extra[key] = value;
    }

    const creds = await adapterFor(marketplace).exchangeCode(code, extra);
    writeCredentials(account.id, creds);
    if (creds.user_id || creds.shop_id) {
      run("UPDATE client_marketplaces SET external_id = ? WHERE id = ?", creds.user_id ?? creds.shop_id, account.id);
    }
    return NextResponse.redirect(new URL("/integracoes?ok=conectado", req.url));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha na autorização.";
    run("UPDATE client_marketplaces SET status = 'erro', last_error = ? WHERE id = ?", msg, account.id);
    return NextResponse.redirect(new URL(`/integracoes?erro=${encodeURIComponent(msg)}`, req.url));
  }
}
