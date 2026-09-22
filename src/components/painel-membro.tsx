import Link from "next/link";
import { jogoDoMembro, rankingMensal, tasks } from "@/lib/queries";
import { conquistasDoMes, nivelDe, sequenciaDeDias } from "@/lib/gamificacao";
import { currentMonth, monthLabel, pct, relativeBR } from "@/lib/format";
import { rotuloPrazo } from "@/lib/prazo-tarefa";
import { claimTaskAction } from "@/lib/actions/tasks";
import type { User } from "@/lib/types";
import { Avatar, Card, Chip, Empty } from "./ui";
import { SubmitButton } from "./submit";
import { PrazoChip } from "./prazo-tarefa";

const TOM_PRIORIDADE: Record<string, "bad" | "warn" | "brand" | "neutral"> = {
  urgente: "bad",
  alta: "warn",
  media: "brand",
  baixa: "neutral",
};

/**
 * A tela inicial de quem não vê a carteira: o jogo das tarefas.
 *
 * O membro não precisa de faturamento de cliente; precisa saber o que fazer
 * agora, quanto isso vale e onde ele está. Nível, sequência, ranking e
 * conquistas saem todos dos pontos que a aprovação já dá.
 */
export async function PainelMembro({ user, semAcesso }: { user: User; semAcesso: string | null }) {
  const mes = currentMonth();
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

  const [minhas, mural, ranking, jogo] = await Promise.all([
    tasks({ statuses: ["assumida", "em_andamento", "em_revisao"], assignee: user.id }),
    tasks({ status: "disponivel" }),
    rankingMensal(mes),
    jogoDoMembro(user.id),
  ]);

  const nivel = nivelDe(jogo.pontosTotais);
  const sequencia = sequenciaDeDias(jogo.dias, hoje);
  const ativos = ranking.filter((r) => r.points > 0 || r.id === user.id);
  const eu = ranking.find((r) => r.id === user.id);
  const posicao = eu && eu.points > 0 ? ranking.findIndex((r) => r.id === user.id) + 1 : null;
  const acima = posicao && posicao > 1 ? ranking[posicao - 2] : null;
  const conquistas = conquistasDoMes({
    aprovadas: eu?.concluidas ?? 0,
    noPrazo: eu?.no_prazo ?? 0,
    comPrazo: eu?.com_prazo ?? 0,
    retrabalho: eu?.retrabalho ?? 0,
    posicao,
    sequencia,
  });
  const ganhas = conquistas.filter((c) => c.ganhou).length;
  const emAberto = minhas.filter((t) => t.status !== "em_revisao");
  const emRevisao = minhas.filter((t) => t.status === "em_revisao");
  const valendo = emAberto.reduce((s, t) => s + t.points, 0);

  return (
    <>
      {semAcesso && (
        <div className="mb-4 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">Essa parte do sistema não está liberada para você.</p>
          <p className="mt-1 text-xs text-muted">
            A permissão que falta é “{semAcesso}”. Quem libera é o admin, na tela de Equipe.
          </p>
        </div>
      )}

      {/* o placar: quem é, em que nível está e quanto falta */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-gradient-to-l from-brand-soft to-transparent" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="relative">
            <Avatar name={user.name} color={user.color} size={64} />
            <span className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white ring-2 ring-surface">
              {nivel.numero}
            </span>
          </div>
          <div className="min-w-52 flex-1">
            <p className="text-sm text-muted">Olá, {user.name.split(" ")[0]} 👋</p>
            <h1 className="text-2xl font-bold text-ink">
              Nível {nivel.numero} · {nivel.nome}
            </h1>
            <div className="mt-2 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(nivel.progresso * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-dim">
              {nivel.faltam === null
                ? `${jogo.pontosTotais} pontos: nível máximo`
                : `${jogo.pontosTotais} pontos · faltam ${nivel.faltam} para ${nivel.proximoNome}`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Placar valor={String(eu?.points ?? 0)} rotulo={`pontos em ${monthLabel(mes)}`} />
            <Placar valor={posicao ? `${posicao}º` : "—"} rotulo={posicao ? `de ${ativos.length} no ranking` : "sem pontos no mês"} />
            <Placar valor={`${sequencia}${sequencia ? " 🔥" : ""}`} rotulo={sequencia === 1 ? "dia seguido" : "dias seguidos"} />
          </div>
        </div>
        {acima && eu && (
          <p className="relative mt-4 text-xs text-muted">
            Faltam <span className="font-semibold text-ink">{acima.points - eu.points + 1} pontos</span> para passar{" "}
            {acima.name.split(" ")[0]} e subir para {posicao! - 1}º.
          </p>
        )}
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Suas missões"
          subtitle={
            emAberto.length
              ? `${emAberto.length} na sua mão · valem ${valendo} pontos${emRevisao.length ? ` · ${emRevisao.length} esperando revisão` : ""}`
              : emRevisao.length
                ? `${emRevisao.length} esperando revisão`
                : "Nada na sua mão agora"
          }
          actions={
            <Link href="/tarefas?aba=minhas" className="link-more">
              Ver todas
            </Link>
          }
          bodyClassName="p-0"
        >
          {minhas.length ? (
            <ul className="divide-y divide-line">
              {minhas.map((t) => (
                <li key={t.id}>
                  <Link href={`/tarefas/${t.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Chip tone={TOM_PRIORIDADE[t.priority] ?? "neutral"}>{t.priority}</Chip>
                        {t.status === "em_revisao" ? <Chip tone="warn">em revisão</Chip> : <PrazoChip t={t} />}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
                      +{t.points} pts
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty title="Nenhuma missão com você" hint="Pegue uma no mural ao lado e comece a pontuar." />
            </div>
          )}
        </Card>

        <Card title="Ranking do mês" subtitle={monthLabel(mes)} bodyClassName="p-0">
          {ativos.length ? (
            <ol className="divide-y divide-line">
              {ativos.slice(0, 6).map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-2.5 px-4 py-2.5 ${r.id === user.id ? "bg-brand-soft" : ""}`}
                >
                  <span className="w-6 text-center text-sm font-bold text-dim">
                    {i === 0 && r.points > 0 ? "🥇" : i === 1 && r.points > 0 ? "🥈" : i === 2 && r.points > 0 ? "🥉" : `${i + 1}`}
                  </span>
                  <Avatar name={r.name} color={r.color} size={26} />
                  <span className={`flex-1 truncate text-sm ${r.id === user.id ? "font-semibold text-ink" : "text-muted"}`}>
                    {r.id === user.id ? "Você" : r.name.split(" ")[0]}
                  </span>
                  <span className="text-sm font-bold text-ink">{r.points}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-5 text-sm text-dim">Ninguém pontuou este mês ainda. O primeiro lugar está livre.</p>
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Mural: missões disponíveis"
          subtitle={mural.length ? "Quem pega primeiro fica com ela" : "Nada no mural agora"}
          bodyClassName="p-0"
        >
          {mural.length ? (
            <ul className="divide-y divide-line">
              {mural.slice(0, 8).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/tarefas/${t.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                      {t.title}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Chip tone={TOM_PRIORIDADE[t.priority] ?? "neutral"}>{t.priority}</Chip>
                      {t.sla_hours && <Chip tone="neutral">prazo de {rotuloPrazo(t.sla_hours)}</Chip>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-brand">+{t.points} pts</span>
                  <form action={claimTaskAction}>
                    <input type="hidden" name="task_id" value={t.id} />
                    <SubmitButton size="sm" pendingLabel="Pegando…">
                      Pegar
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty title="Mural vazio" hint="Quando o gestor publicar uma tarefa, ela aparece aqui." />
            </div>
          )}
        </Card>

        <Card title="Conquistas do mês" subtitle={`${ganhas} de ${conquistas.length}`}>
          <div className="grid grid-cols-3 gap-2">
            {conquistas.map((c) => (
              <div
                key={c.chave}
                title={`${c.nome}: ${c.como}`}
                className={`flex flex-col items-center rounded-[10px] border px-1 py-2.5 text-center ${
                  c.ganhou ? "border-brand/30 bg-brand-soft" : "border-line bg-surface-2 opacity-50 grayscale"
                }`}
              >
                <span className="text-2xl">{c.emoji}</span>
                <span className="mt-1 text-[0.65rem] leading-tight font-medium text-ink">{c.nome}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.7rem] text-dim">Passe o mouse numa conquista para ver como ganhar.</p>
        </Card>
      </div>

      <Card className="mt-3" title="Últimos pontos" subtitle="O que você ganhou e por quê" bodyClassName="p-0">
        {jogo.ultimos.length ? (
          <ul className="divide-y divide-line">
            {jogo.ultimos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-bold text-ok">+{e.points}</span>
                <Link href={`/tarefas/${e.task_id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:text-brand">
                  {e.title}
                </Link>
                <span className="text-[0.7rem] text-dim">{relativeBR(e.created_at)}</span>
                {e.meta && <span className="w-full text-[0.7rem] text-muted">{e.meta}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-dim">
            Os pontos entram quando o gestor aprova a tarefa. Entregar no prazo e de primeira vale mais
            {eu?.com_prazo ? ` · sua pontualidade no mês: ${pct(eu.no_prazo / eu.com_prazo, 0)}` : ""}.
          </p>
        )}
      </Card>
    </>
  );
}

function Placar({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-24 rounded-[12px] border border-line bg-surface px-3 py-2.5">
      <div className="text-xl font-bold text-ink">{valor}</div>
      <div className="text-[0.65rem] leading-tight text-dim">{rotulo}</div>
    </div>
  );
}
