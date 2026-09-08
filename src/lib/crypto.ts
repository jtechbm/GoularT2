import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra as credenciais dos marketplaces antes de gravar no banco.
 * A chave sai de GOULART_SESSION_SECRET — troque em produção.
 */
function key(): Buffer {
  const secret = process.env.GOULART_SESSION_SECRET ?? "goulart-dev-secret";
  return createHash("sha256").update(secret).digest();
}

export function encryptJSON(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

export function decryptJSON<T>(payload: string | null): T | null {
  if (!payload) return null;
  try {
    const [iv, tag, data] = payload.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const out = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}
