import { Card, Chip } from "./ui";
import { SCORE_LABEL, SCORE_TONE, type Score } from "@/lib/score";

/** Selo compacto, para listas e tabelas. */
export function ScoreChip({ score, mostrarMotivo = false }: { score: Score; mostrarMotivo?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <Chip tone={SCORE_TONE[score.classe]}>{score.valor}</Chip>
        <span className="text-[0.7rem] text-dim">{SCORE_LABEL[score.classe]}</span>
      </span>
      {mostrarMotivo && score.principal && (
        <span className="text-[0.65rem] leading-tight text-dim">{score.principal}</span>
      )}
    </span>
  );
}

/**
 * Card completo com a nota e a lista de motivos.
 *
 * Mostrar os motivos não é enfeite: sem eles a equipe discute o número em
 * vez de resolver o problema que ele aponta.
 */
export function ScoreSaude({ score }: { score: Score }) {
  const positivos = score.motivos.filter((m) => m.peso > 0);
  const negativos = score.motivos.filter((m) => m.peso < 0);

  return (
    <Card
      title="Saúde do cliente"
      subtitle={negativos.length ? `${negativos.length} pontos de atenção` : "nada pesando contra"}
      actions={<Chip tone={SCORE_TONE[score.classe]}>{SCORE_LABEL[score.classe]}</Chip>}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`text-4xl font-bold ${
            score.classe === "saudavel" ? "text-ok" : score.classe === "atencao" ? "text-warn" : "text-bad"
          }`}
        >
          {score.valor}
        </span>
        <span className="text-sm text-dim">de 100</span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${
            score.classe === "saudavel" ? "bg-ok" : score.classe === "atencao" ? "bg-warn" : "bg-bad"
          }`}
          style={{ width: `${Math.max(3, score.valor)}%` }}
        />
      </div>

      {negativos.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {negativos.map((m) => (
            <li key={m.texto} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 font-mono text-bad">{m.peso}</span>
              <span className="text-muted">{m.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {positivos.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {positivos.map((m) => (
            <li key={m.texto} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 font-mono text-ok">+{m.peso}</span>
              <span className="text-muted">{m.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {!score.motivos.length && (
        <p className="mt-3 text-xs text-muted">
          Nada a apontar. O score cai quando o faturamento recua, a margem aperta, uma meta fura, uma loja para de
          atualizar ou uma tarefa atrasa.
        </p>
      )}
    </Card>
  );
}
