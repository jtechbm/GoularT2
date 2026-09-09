"use client";

import { useEffect, useState } from "react";
import { dateBR } from "@/lib/format";

/**
 * Mostra o link de autorização pronto para o Kadu copiar e mandar no WhatsApp.
 * A origem sai do próprio navegador, então funciona igual em local e produção.
 */
export function AuthLink({ token, expiresAt }: { token: string; expiresAt: string | null }) {
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
      /* sem permissão de área de transferência — o texto continua selecionável */
    }
  }

  return (
    <div className="rounded-[10px] border border-brand/40 bg-brand-soft p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink">Link de autorização — mande para o lojista</span>
        {expiresAt && <span className="text-xs text-muted">vence em {dateBR(expiresAt)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 !bg-surface font-mono text-xs"
        />
        <button type="button" onClick={copiar} className="btn btn-primary btn-sm">
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        O lojista abre, entra na conta dele do marketplace e aprova o acesso. Ele não entra no Elleva e o link vale
        uma vez só.
      </p>
    </div>
  );
}
