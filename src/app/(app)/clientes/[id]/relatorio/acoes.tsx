"use client";

import { useState } from "react";
import { registrarRelatorioAction } from "@/lib/actions/relatorio";

/**
 * Botões do relatório.
 *
 * O PDF sai pela impressão do navegador, não por uma biblioteca. Gerar PDF
 * no servidor exigiria embutir um navegador inteiro no projeto, e o
 * resultado seria pior: a impressão do navegador já respeita a fonte, o
 * tema e a quebra de página, e o usuário escolhe salvar ou imprimir de
 * verdade no mesmo diálogo.
 */
export function AcoesRelatorio({
  clientId,
  refMonth,
  resumo,
  telefone,
}: {
  clientId: string;
  refMonth: string;
  resumo: string;
  telefone: string | null;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // clipboard bloqueado (http, permissão): mostra o texto para copiar à mão
      window.prompt("Copie o resumo:", resumo);
    }
  }

  const zap = telefone
    ? `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(resumo)}`
    : `https://wa.me/?text=${encodeURIComponent(resumo)}`;

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copiar} className="btn btn-ghost btn-sm">
        {copiado ? "Copiado" : "Copiar resumo"}
      </button>

      <a href={zap} target="_blank" rel="noopener noreferrer" className="btn btn-accent btn-sm">
        Mandar no WhatsApp
      </a>

      <form action={registrarRelatorioAction}>
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="ref_month" value={refMonth} />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          onClick={() => {
            // registra a emissão e manda imprimir; a impressão é do
            // navegador, então roda aqui e não no servidor
            setTimeout(() => window.print(), 300);
          }}
        >
          Salvar em PDF
        </button>
      </form>
    </div>
  );
}
