import { Avatar, Card, Chip, Empty } from "./ui";
import { monthLabel, num, pct } from "@/lib/format";

export interface LinhaRanking {
  id: string;
  name: string;
  color: string;
  points: number;
  concluidas: number;
  retrabalho: number;
  /** null quando ninguém teve tarefa com prazo no mês */
  pontualidade: number | null;
}

/**
 * Ranking do mês.
 *
 * Mostra pontos, entregas e pontualidade lado a lado de propósito. Só a
 * pontuação faria a lista virar disputa de volume; só o volume esconderia
 * quem entrega tudo atrasado.
 */
export function Ranking({ linhas, refMonth }: { linhas: LinhaRanking[]; refMonth: string }) {
  const comAtividade = linhas.filter((l) => l.concluidas > 0);

  return (
    <Card
      title="Ranking do mês"
      subtitle={monthLabel(refMonth)}
      bodyClassName={comAtividade.length ? "p-0" : "p-5"}
    >
      {comAtividade.length ? (
        <div className="table-wrap">
          <table className="data responsiva">
            <thead>
              <tr>
                <th>#</th>
                <th>Pessoa</th>
                <th className="num">Pontos</th>
                <th className="num">Aprovadas</th>
                <th className="num">No prazo</th>
                <th className="num">Retrabalho</th>
              </tr>
            </thead>
            <tbody>
              {comAtividade.map((l, i) => (
                <tr key={l.id}>
                  <td className="text-xs text-dim" data-label="#">{i + 1}</td>
                  <td data-label="Pessoa">
                    <span className="flex items-center gap-2">
                      <Avatar name={l.name} color={l.color} size={24} />
                      <span className="text-sm text-ink">{l.name}</span>
                    </span>
                  </td>
                  <td className="num font-semibold text-ink" data-label="Pontos">{num(l.points)}</td>
                  <td className="num text-muted" data-label="Aprovadas">{num(l.concluidas)}</td>
                  <td className="num" data-label="No prazo">
                    {l.pontualidade === null ? (
                      <span className="text-dim">—</span>
                    ) : (
                      <Chip tone={l.pontualidade >= 0.8 ? "ok" : l.pontualidade >= 0.5 ? "warn" : "bad"}>
                        {pct(l.pontualidade)}
                      </Chip>
                    )}
                  </td>
                  <td className="num text-muted" data-label="Retrabalho">
                    {l.retrabalho ? <Chip tone="warn">{l.retrabalho} voltas</Chip> : <span className="text-dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Nenhuma tarefa aprovada neste mês"
          hint="Os pontos entram quando um gestor aprova a tarefa, não quando ela é marcada como pronta."
        />
      )}
    </Card>
  );
}
