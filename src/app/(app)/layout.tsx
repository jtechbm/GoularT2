import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { Sidebar } from "@/components/nav";

// toda tela aqui depende da sessão e do banco: nada é pré-renderizado.
// sem isto, o build tenta avaliar as páginas e passa a depender do banco
// estar de pé no momento do deploy.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending =
    (await one<{ n: number }>(
      `SELECT COUNT(*) n FROM tasks
        WHERE status = 'disponivel'
           OR (status IN ('assumida','em_andamento','em_revisao') AND assignee_id = ?)`,
      user.id,
    ))?.n ?? 0;

  return (
    <div className="app-shell lg:flex">
      <Sidebar user={user} pendingTasks={pending} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
