import { redirect } from "next/navigation";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { one } from "@/lib/db";
import { Sidebar } from "@/components/nav";
import { avisarTarefasAtrasadas } from "@/lib/tarefas-atraso";

// toda tela aqui depende da sessão e do banco: nada é pré-renderizado.
// sem isto, o build tenta avaliar as páginas e passa a depender do banco
// estar de pé no momento do deploy.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // convite pendente trava o sistema inteiro até a pessoa escolher a senha.
  // Deixar entrar com a senha temporária é o que faz ninguém trocá-la.
  if (user.must_change_password === 1 && user.invite_token) {
    redirect(`/convite/${user.invite_token}`);
  }

  // antes dos contadores, para o aviso de prazo estourado já entrar na conta
  // do sino. Falha aqui não pode derrubar a navegação.
  await avisarTarefasAtrasadas().catch(() => 0);

  // os três contadores do menu são independentes: disparados juntos, a
  // navegação espera o mais lento, não a soma dos três
  const escopo = await visibleClientIds(user);
  const [pendentes, notificacoes, penais] = await Promise.all([
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM tasks
        WHERE status = 'disponivel'
           OR (status IN ('assumida','em_andamento','em_revisao') AND assignee_id = ?)`,
      user.id,
    ),
    one<{ n: number }>("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id),
    // o contador respeita a carteira da pessoa: membro não vê número de
    // penalidade de cliente que ele não acompanha
    escopo !== null && escopo.length === 0
      ? Promise.resolve({ n: 0 })
      : one<{ n: number }>(
          `SELECT COUNT(*) n FROM penalties WHERE status = 'aberta' AND severity <> 'informativo'
             ${escopo ? `AND client_id IN (${escopo.map(() => "?").join(",")})` : ""}`,
          ...(escopo ?? []),
        ),
  ]);
  const pending = pendentes?.n ?? 0;
  const naoLidas = notificacoes?.n ?? 0;
  const penalidadesAbertas = penais?.n ?? 0;

  return (
    <div className="app-shell lg:flex">
      <Sidebar user={user} pendingTasks={pending} naoLidas={naoLidas} penalidadesAbertas={penalidadesAbertas} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
