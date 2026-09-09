"use client";

import { useEffect, useState } from "react";
import { dateBR } from "@/lib/format";

/**
 * Link pronto para o Kadu mandar. O caminho principal é o botão do WhatsApp,
 * que abre a conversa com a mensagem escrita — copiar o link é o plano B.
 * A origem sai do navegador, então funciona igual em local e em produção.
 */
export function AuthLink({
  token,
  expiresAt,
  marketplaceLabel,
  clientPhone,
}: {
  token: string;
  expiresAt: string | null;
  marketplaceLabel: string;
  clientPhone?: string | null;
}) {
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/a/${token}`);
  }, [token]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão de área de transferência — o campo continua selecionável */
    }
  }

  const mensagem =
    `Oi! Para acompanharmos os números da sua loja no ${marketplaceLabel}, ` +
    `abra este link e aprove o acesso: ${url}\n\n` +
    `Leva menos de um minuto, é feito no site do próprio ${marketplaceLabel} e você não precisa criar conta nenhuma.`;

  // só dígitos; celular brasileiro sem DDI ganha o 55
  const digitos = (clientPhone ?? "").replace(/\D/g, "");
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  const whatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

  return (
    <div className="rounded-[10px] border border-brand/40 bg-brand-soft p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">Link pronto para enviar ao cliente</span>
        {expiresAt && <span className="text-xs text-muted">vence em {dateBR(expiresAt)}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {url && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            {numero ? "Mandar no WhatsApp" : "Abrir WhatsApp"}
          </a>
        )}
        <button type="button" onClick={copiar} className="btn btn-ghost">
          {copiado ? "Link copiado" : "Copiar link"}
        </button>
      </div>

      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="input mt-3 !bg-surface font-mono text-xs"
      />

      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        O cliente abre o link, entra na conta dele do {marketplaceLabel} e aprova. Ele não entra no Elleva e não vê
        nada do sistema. O link vale uma vez só.
      </p>
    </div>
  );
}
