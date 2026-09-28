import Link from "next/link";
import { AnaliseRapida, type DadosAnalise } from "@/components/analise-rapida";
import { Card } from "@/components/ui";

const ATALHOS = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Mês" },
];

/**
 * Análise rápida do cliente, e o comparativo de dois dias.
 *
 * O comparativo é entre duas datas, não entre dois intervalos: os dois campos
 * são os dois dias que entram lado a lado. A versão anterior lia os campos
 * como "de" e "até" e comparava aquele intervalo com o período de cima, que
 * não é o que se quer ao perguntar "o dia 18 vendeu mais que o 19?".
 */
export function TabAnalise({
  clientId,
  dados,
  comparacao,
  atalhoAtivo,
  refMonth,
  de,
  ate,
  dia1,
  dia2,
  hoje,
  ontem,
}: {
  clientId: string;
  dados: DadosAnalise;
  comparacao: DadosAnalise | null;
  atalhoAtivo: string;
  refMonth: string;
  de?: string;
  ate?: string;
  /** os dois dias do comparativo */
  dia1?: string;
  dia2?: string;
  hoje: string;
  ontem: string;
}) {
  const escolhido = atalhoAtivo === "personalizado";
  const comparando = Boolean(comparacao);
  const base = `/clientes/${clientId}?tab=analise&mes=${refMonth}`;

  const pdf = new URLSearchParams(
    comparando && dia1 && dia2
      ? { dia1, dia2 }
      : { de: dados.inicio, ate: dados.fim },
  );

  return (
    <div className="space-y-3">
      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-dim">Período:</span>
            <nav className="flex flex-wrap gap-1">
              {ATALHOS.map((a) => (
                <Link
                  key={a.key}
                  href={`${base}&periodo=${a.key}`}
                  className={`btn btn-sm ${!comparando && atalhoAtivo === a.key ? "btn-primary" : "btn-ghost"}`}
                >
                  {a.label}
                </Link>
              ))}
            </nav>

            <form method="get" action={`/clientes/${clientId}`} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="tab" value="analise" />
              <input type="hidden" name="mes" value={refMonth} />
              <input type="hidden" name="periodo" value="personalizado" />
              <input
                type="date"
                name="de"
                defaultValue={de ?? ""}
                aria-label="Data inicial"
                className={`input h-8 w-[9.5rem] px-2 py-1 text-xs ${!comparando && escolhido ? "border-brand" : ""}`}
              />
              <span className="text-xs text-dim">até</span>
              <input
                type="date"
                name="ate"
                defaultValue={ate ?? ""}
                aria-label="Data final"
                className={`input h-8 w-[9.5rem] px-2 py-1 text-xs ${!comparando && escolhido ? "border-brand" : ""}`}
              />
              <button
                type="submit"
                className={`btn btn-sm ${!comparando && escolhido ? "btn-primary" : "btn-ghost"}`}
              >
                Aplicar
              </button>
            </form>
          </div>

          <Link href={`/clientes/${clientId}/analise?${pdf}`} target="_blank" className="btn btn-primary btn-sm">
            Baixar PDF
          </Link>
        </div>

        {/* dois dias, não um intervalo: cada campo é um dos lados da comparação */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-dim">Comparar dois dias:</span>

          <form method="get" action={`/clientes/${clientId}`} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="tab" value="analise" />
            <input type="hidden" name="mes" value={refMonth} />
            <input
              type="date"
              name="dia1"
              defaultValue={dia1 ?? ""}
              aria-label="Primeiro dia"
              className={`input h-8 w-[9.5rem] px-2 py-1 text-xs ${comparando ? "border-brand" : ""}`}
            />
            <span className="text-xs text-dim">contra</span>
            <input
              type="date"
              name="dia2"
              defaultValue={dia2 ?? ""}
              aria-label="Segundo dia"
              className={`input h-8 w-[9.5rem] px-2 py-1 text-xs ${comparando ? "border-brand" : ""}`}
            />
            <button type="submit" className={`btn btn-sm ${comparando ? "btn-primary" : "btn-ghost"}`}>
              Comparar
            </button>
          </form>

          <Link href={`${base}&dia1=${hoje}&dia2=${ontem}`} className="btn btn-sm btn-ghost">
            Hoje × ontem
          </Link>

          {comparando && (
            <Link href={`${base}&periodo=${atalhoAtivo}`} className="text-xs text-dim hover:text-brand">
              limpar comparação
            </Link>
          )}
        </div>
      </Card>

      <AnaliseRapida dados={dados} comparacao={comparacao} />
    </div>
  );
}
