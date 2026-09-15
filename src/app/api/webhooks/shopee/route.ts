import { NextResponse, after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { all, id, now, run } from "@/lib/db";
import { decryptJSON, encryptJSON } from "@/lib/crypto";
import {
  processarPedidoShopee,
  refreshIfNeeded,
  resultadoDoMesShopee,
} from "@/lib/integrations/shopee";
import { gravarResultado } from "@/lib/integrations/sincronizar-conta";
import type { StoredCredentials } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Avisos em tempo real da Shopee.
 *
 * A Shopee chama este endereço a cada mudança de pedido. A resposta sai na
 * hora, porque a Shopee reenvia quando demora, e o pedido é processado logo
 * depois com after(), na mesma função.
 *
 * Todo aviso é registrado em webhook_events, válido ou não. O formato exato
 * só se confirma com o primeiro aviso real, e sem esse registro uma
 * assinatura recusada seria um problema silencioso.
 */

/**
 * A assinatura é HMAC-SHA256 de "url|corpo" com a chave do app.
 *
 * A URL precisa bater caractere por caractere com a cadastrada no console.
 * Atrás do proxy da Vercel a URL que a função enxerga pode diferir, então a
 * conferência tenta a URL configurada em SHOPEE_PUSH_URL e a reconstruída
 * pelos cabeçalhos, com e sem barra no final.
 */
function assinaturaValida(req: NextRequest, corpo: string, assinatura: string): boolean {
  const chave = process.env.SHOPEE_PARTNER_KEY ?? "";
  if (!chave || !assinatura) return false;

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const reconstruida = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const candidatas = [process.env.SHOPEE_PUSH_URL, reconstruida, req.nextUrl.toString()]
    .filter((u): u is string => Boolean(u))
    .flatMap((u) => [u, u.endsWith("/") ? u.slice(0, -1) : `${u}/`]);

  const recebida = Buffer.from(assinatura.trim().toLowerCase());
  return candidatas.some((url) => {
    const esperada = Buffer.from(createHmac("sha256", chave).update(`${url}|${corpo}`).digest("hex"));
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  });
}

async function registrar(e: {
  valid: boolean;
  code?: number | null;
  shopId?: string | null;
  orderSn?: string | null;
  status?: string | null;
  corpo: string;
  resultado?: string;
  erro?: string;
}): Promise<string> {
  const eventoId = id();
  await run(
    `INSERT INTO webhook_events (id, marketplace, received_at, valid, code, shop_id, order_sn, order_status, body, result, error)
     VALUES (?, 'shopee', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eventoId,
    now(),
    e.valid ? 1 : 0,
    e.code ?? null,
    e.shopId ?? null,
    e.orderSn ?? null,
    e.status ?? null,
    e.corpo.slice(0, 4000),
    e.resultado ?? null,
    e.erro ?? null,
  );
  return eventoId;
}

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  const assinatura = req.headers.get("authorization") ?? "";

  // teste de conectividade do console: corpo vazio só precisa de resposta
  if (!corpo.trim()) return NextResponse.json({ code: 0, message: "ok" });

  let aviso: {
    code?: number;
    shop_id?: number | string;
    timestamp?: number;
    data?: { ordersn?: string; status?: string; verify_info?: string; shop_id?: number | string };
  };
  try {
    aviso = JSON.parse(corpo);
  } catch {
    await registrar({ valid: false, corpo, erro: "corpo não é JSON" });
    return NextResponse.json({ code: 0, message: "ok" });
  }

  const valido = assinaturaValida(req, corpo, assinatura);
  const code = Number(aviso.code);
  const shopId = String(aviso.shop_id ?? aviso.data?.shop_id ?? "");
  const orderSn = aviso.data?.ordersn ?? null;
  const status = aviso.data?.status ?? null;

  if (!valido) {
    await registrar({ valid: false, code, shopId, orderSn, status, corpo, erro: "assinatura não confere" });
    return NextResponse.json({ code: 1, message: "assinatura inválida" }, { status: 401 });
  }

  // verificação do endereço no console: a Shopee exige receber de volta o
  // mesmo verify_info que mandou
  if (aviso.data?.verify_info) {
    await registrar({ valid: true, code, shopId, corpo, resultado: "verificação do endereço" });
    return NextResponse.json({ verify_info: aviso.data.verify_info });
  }

  const eventoId = await registrar({ valid: true, code, shopId, orderSn, status, corpo, resultado: "recebido" });

  // código 3 é mudança de status de pedido; os outros ficam só registrados
  if (code === 3 && orderSn && shopId) {
    after(async () => {
      try {
        const contas = await all<{ id: string; client_id: string; marketplace: string; external_id: string | null; credentials: string | null }>(
          "SELECT id, client_id, marketplace, external_id, credentials FROM client_marketplaces WHERE marketplace = 'shopee' AND credentials IS NOT NULL",
        );
        const conta = contas.find((c) => {
          const cr = decryptJSON<StoredCredentials>(c.credentials);
          return String(cr?.shop_id ?? c.external_id ?? "") === shopId;
        });
        if (!conta) {
          await run("UPDATE webhook_events SET result = ?, error = ? WHERE id = ?", "ignorado", `loja ${shopId} não conectada`, eventoId);
          return;
        }

        const creds = await refreshIfNeeded({
          externalId: conta.external_id,
          credentials: decryptJSON<StoredCredentials>(conta.credentials),
          accountId: conta.id,
          saveCredentials: async (next) => {
            await run("UPDATE client_marketplaces SET credentials = ? WHERE id = ?", encryptJSON(next), conta.id);
          },
        });

        const { dia } = await processarPedidoShopee(conta.id, creds, orderSn, status ?? "");
        const refMonth = dia.slice(0, 7);
        const resultado = await resultadoDoMesShopee(conta.id, refMonth);
        await gravarResultado(conta, refMonth, resultado, null);

        await run(
          "UPDATE webhook_events SET result = ? WHERE id = ?",
          `pedido ${orderSn} (${status}) atualizado; ${refMonth} com ${resultado.orders} pedidos`,
          eventoId,
        );
      } catch (e) {
        await run(
          "UPDATE webhook_events SET result = 'erro', error = ? WHERE id = ?",
          e instanceof Error ? e.message : String(e),
          eventoId,
        );
      }
    });
  }

  return NextResponse.json({ code: 0, message: "ok" });
}
