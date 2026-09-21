"use client";

/**
 * Salvar em PDF pela impressão do navegador, como o relatório do cliente:
 * respeita fonte, tema e quebra de página sem embutir um navegador no
 * servidor, e a pessoa escolhe salvar ou imprimir no mesmo diálogo.
 */
export function BotaoImprimir({ rotulo = "Salvar em PDF" }: { rotulo?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      {rotulo}
    </button>
  );
}
