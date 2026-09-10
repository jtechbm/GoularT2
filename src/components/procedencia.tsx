import { Chip } from "./ui";
import { relativeBR, dateTimeBR } from "@/lib/format";

export type Origem = "api" | "manual" | "misto" | "estimado" | "vazio";

const ROTULO: Record<Origem, string> = {
  api: "Direto da loja",
  manual: "Lançado à mão",
  misto: "Loja + à mão",
  estimado: "Estimado pelo contrato",
  vazio: "Sem dados",
};

const TOM: Record<Origem, "ok" | "neutral" | "warn" | "info"> = {
  api: "ok",
  manual: "neutral",
  misto: "info",
  estimado: "warn",
  vazio: "warn",
};

/**
 * De onde veio o número e quando ele chegou.
 *
 * A tela mostrava a data em que alguém editou o cadastro do cliente e
 * chamava aquilo de "atualizado em". Quem lia entendia que o faturamento
 * era daquele dia, e não era. Aqui a data é sempre a da última vez que o
 * dado em si mudou, e o rótulo diz se ele veio da loja, foi digitado ou é
 * projeção de contrato.
 */
export function Procedencia({
  origem,
  atualizadoEm,
  contas,
  comDados,
  className = "",
}: {
  origem: Origem;
  /** ISO da última mudança do dado, não do cadastro */
  atualizadoEm?: string | null;
  /** quantas contas de loja o recorte tem, para julgar se está completo */
  contas?: number;
  /** quantas dessas contas já trouxeram número no mês */
  comDados?: number;
  className?: string;
}) {
  const incompleto = contas !== undefined && comDados !== undefined && contas > 0 && comDados < contas;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 text-[0.7rem] text-dim ${className}`}>
      <Chip tone={TOM[origem]}>{ROTULO[origem]}</Chip>
      {atualizadoEm ? (
        <span title={dateTimeBR(atualizadoEm)}>atualizado {relativeBR(atualizadoEm)}</span>
      ) : (
        origem !== "estimado" && <span>nunca atualizado</span>
      )}
      {incompleto && (
        <Chip tone="warn">
          {comDados} de {contas} lojas
        </Chip>
      )}
      {contas !== undefined && contas > 0 && !incompleto && origem !== "vazio" && <Chip tone="ok">completo</Chip>}
    </span>
  );
}
