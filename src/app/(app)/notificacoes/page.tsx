import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { relativeBR, dateTimeBR } from "@/lib/format";
import { Avatar, Card, Chip, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { abrirNotificacaoAction, marcarLidaAction, marcarTodasLidasAction } from "@/lib/actions/notificacoes";

const ROTULO: Record<string, { label: string; tone: "brand" | "warn" | "ok" | "bad" | "info" | "neutral" }> = {
  atribuicao: { label: "atribuição", tone: "brand" },
  mencao: { label: "menção", tone: "info" },
  comentario: { label: "comentário", tone: "neutral" },
  revisao: { label: "revisão", tone: "warn" },
  aprovada: { label: "aprovada", tone: "ok" },
  reprovada: { label: "ajuste pedido", tone: "bad" },
  prazo: { label: "prazo", tone: "warn" },
};

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const mostrarLidas = sp.ver === "lidas";

  const linhas = await all<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    href: string;
    read_at: string | null;
    created_at: string;
    autor: string | null;
    cor: string | null;
  }>(
    `SELECT n.id, n.type, n.title, n.body, n.href, n.read_at, n.created_at,
            u.name AS autor, u.color AS cor
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? AND n.read_at IS ${mostrarLidas ? "NOT NULL" : "NULL"}
      ORDER BY n.created_at DESC LIMIT 100`,
    user.id,
  );

  return (
    <>
      <PageHeader
        title="Notificações"
        subtitle={mostrarLidas ? "O que você já leu" : "O que aconteceu enquanto você não estava aqui"}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={mostrarLidas ? "/notificacoes" : "/notificacoes?ver=lidas"} className="btn btn-ghost btn-sm">
              {mostrarLidas ? "Ver não lidas" : "Ver lidas"}
            </a>
            {!mostrarLidas && linhas.length > 0 && (
              <form action={marcarTodasLidasAction}>
                <SubmitButton variant="ghost" size="sm">
                  Marcar todas como lidas
                </SubmitButton>
              </form>
            )}
          </div>
        }
      />

      <Card bodyClassName="p-0">
        {linhas.length ? (
          <ul className="divide-y divide-line">
            {linhas.map((n) => {
              const r = ROTULO[n.type] ?? { label: n.type, tone: "neutral" as const };
              return (
                <li key={n.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  {n.autor ? (
                    <Avatar name={n.autor} color={n.cor} size={30} />
                  ) : (
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs text-dim">
                      E
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={r.tone}>{r.label}</Chip>
                      <span className={`text-sm ${n.read_at ? "text-muted" : "font-medium text-ink"}`}>
                        {n.title}
                      </span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[0.65rem] text-dim" title={dateTimeBR(n.created_at)}>
                      {relativeBR(n.created_at)}
                    </span>
                  </span>

                  <span className="flex gap-1.5">
                    <form action={abrirNotificacaoAction}>
                      <input type="hidden" name="notification_id" value={n.id} />
                      <SubmitButton variant="ghost" size="sm">
                        Abrir
                      </SubmitButton>
                    </form>
                    {!n.read_at && (
                      <form action={marcarLidaAction}>
                        <input type="hidden" name="notification_id" value={n.id} />
                        <SubmitButton variant="ghost" size="sm">
                          ✓
                        </SubmitButton>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <Empty
              title={mostrarLidas ? "Nada lido ainda" : "Nada pendente"}
              hint={
                mostrarLidas
                  ? "As notificações que você marcar como lidas aparecem aqui."
                  : "Você é avisado quando alguém te atribui uma tarefa, te cita com @, comenta no que é seu ou revisa seu trabalho."
              }
            />
          </div>
        )}
      </Card>
    </>
  );
}
