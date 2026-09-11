import Link from "next/link";
import { Avatar, Card, Chip, Empty } from "./ui";
import { num, pct } from "@/lib/format";
import { faixaDeCarga, type DesempenhoPessoa } from "@/lib/queries";
import { ROLES } from "@/lib/types";

function horas(v: number | null): string {
  if (v === null) return "—";
  if (v < 1) return `${Math.round(v * 60)} min`;
  if (v < 48) return `${v.toFixed(1)} h`;
  return `${(v / 24).toFixed(1)} dias`;
}

/**
 * Desempenho da equipe.
 *
 * Sobrecarga e ociosidade são marcadas em relação à própria equipe, não a
 * um número fixo. Quem carrega mais que o dobro da mediana aparece como
 * sobrecarregado; quem está sem nada aparece como disponível. Um limite
 * chutado erraria em toda operação que não fosse a que inspirou o chute.
 */
export function DesempenhoEquipe({
  pessoas,
  periodoLabel,
}: {
  pessoas: DesempenhoPessoa[];
  periodoLabel: string;
}) {
  const faixa = faixaDeCarga(pessoas);

  if (!pessoas.length) {
    return (
      <Card title="Desempenho da equipe">
        <Empty title="Ninguém cadastrado" hint="Crie os acessos da equipe para acompanhar a carga." />
      </Card>
    );
  }

  return (
    <Card
      title="Desempenho da equipe"
      subtitle={`Carga atual e resultado de ${periodoLabel}`}
      bodyClassName="p-0"
    >
      <div className="table-wrap">
        <table className="data responsiva">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th className="num">Ativas</th>
              <th className="num">Atrasadas</th>
              <th className="num">Em revisão</th>
              <th className="num">Aprovadas</th>
              <th className="num">No prazo</th>
              <th className="num">Retrabalho</th>
              <th className="num">Tempo típico</th>
              <th className="num">Clientes</th>
              <th className="num">Pontos</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => {
              const sobrecarga = p.ativas > faixa.alta;
              const ocioso = p.ativas === 0 && p.clientes > 0;
              return (
                <tr key={p.id}>
                  <td data-label="Pessoa">
                    <span className="flex items-center gap-2">
                      <Avatar name={p.name} color={p.color} size={26} />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{p.name}</span>
                        <span className="block text-[0.65rem] text-dim">
                          {p.job_title ?? ROLES.find((r) => r.value === p.role)?.label ?? p.role}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={`num font-semibold ${sobrecarga ? "text-bad" : "text-ink"}`} data-label="Ativas">{num(p.ativas)}</td>
                  <td className="num" data-label="Atrasadas">
                    {p.atrasadas ? <Chip tone="bad">{p.atrasadas}</Chip> : <span className="text-dim">—</span>}
                  </td>
                  <td className="num text-muted" data-label="Em revisão">{p.emRevisao || "—"}</td>
                  <td className="num text-muted" data-label="Aprovadas">{num(p.aprovadas)}</td>
                  <td className="num" data-label="No prazo">
                    {p.pontualidade === null ? (
                      <span className="text-dim">—</span>
                    ) : (
                      <Chip tone={p.pontualidade >= 0.8 ? "ok" : p.pontualidade >= 0.5 ? "warn" : "bad"}>
                        {pct(p.pontualidade)}
                      </Chip>
                    )}
                  </td>
                  <td className="num text-muted" data-label="Retrabalho">
                    {p.reaberturas ? <Chip tone="warn">{p.reaberturas}</Chip> : <span className="text-dim">—</span>}
                  </td>
                  <td className="num text-muted" data-label="Tempo típico">{horas(p.tempoMedioHoras)}</td>
                  <td className="num text-muted" data-label="Clientes">
                    {p.clientes ? (
                      <Link href={`/clientes?resp=${p.id}`} className="hover:text-brand">
                        {p.clientes}
                      </Link>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="num font-semibold text-ink" data-label="Pontos">{num(p.pontos)}</td>
                  <td data-label="Situação">
                    {sobrecarga ? (
                      <Chip tone="bad">sobrecarregado</Chip>
                    ) : ocioso ? (
                      <Chip tone="warn">sem demanda</Chip>
                    ) : p.ativas > 0 ? (
                      <Chip tone="ok">equilibrado</Chip>
                    ) : (
                      <Chip tone="neutral">disponível</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-5 py-3 text-[0.7rem] text-dim">
        Nenhum indicador aqui mede tempo de tela ou horário de acesso. O que conta é trabalho aprovado, prazo
        cumprido e retrabalho gerado. O tempo típico é a mediana entre pegar a tarefa e mandá-la para revisão, para
        que uma tarefa esquecida não distorça o número da pessoa.
      </p>
    </Card>
  );
}
