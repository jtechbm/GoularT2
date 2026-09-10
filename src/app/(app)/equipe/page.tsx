import Link from "next/link";
import { listUsers, requireUser, visibleClientIds } from "@/lib/auth";
import { can, permissionsOf, PERMISSION_LABEL, PERMISSION_ORDER } from "@/lib/permissions";
import { all } from "@/lib/db";
import { clientRows, leaderboard, tasks } from "@/lib/queries";
import { brlShort, currentMonth, dateBR } from "@/lib/format";
import { Avatar, Card, Chip, Field, PageHeader, Stat } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { createTeamMemberAction, toggleTeamMemberAction, updateTeamMemberAction } from "@/lib/actions/team";
import { ROLES } from "@/lib/types";

const COLORS = ["#a855f7", "#7c3aed", "#f97316", "#fb923c", "#ec4899", "#22d3ee", "#34d399", "#facc15"];

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can(user, "equipe.gerenciar");

  const users = await listUsers(manager);
  const board = new Map((await leaderboard()).map((b) => [b.id, b] as const));
  const carteira = await clientRows(currentMonth(), undefined, await visibleClientIds(user));
  const openTasks = await tasks({ status: "em_andamento" });

  const memberships = await all<{ user_id: string; client_id: string; name: string; role: string }>(
    `SELECT ct.user_id, ct.client_id, c.name, ct.role
       FROM client_team ct JOIN clients c ON c.id = ct.client_id
      ORDER BY lower(c.name)`,
  );

  const selected = sp.u ? users.find((u) => u.id === sp.u) : undefined;

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle="Quem opera a carteira, com quais clientes e quanta tarefa carrega."
      />

      {sp.ok && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Alterações salvas.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pessoas ativas" value={String(users.filter((u) => u.active).length)} tone="brand" />
        <Stat label="Clientes na carteira" value={String(carteira.length)} tone="accent" href="/clientes" />
        <Stat label="Tarefas em andamento" value={String(openTasks.length)} tone="warn" href="/tarefas" />
        <Stat
          label="Sem responsável"
          value={String(carteira.filter((c) => !c.owner_id).length)}
          hint="clientes a distribuir"
          tone={carteira.some((c) => !c.owner_id) ? "bad" : "ok"}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {users.map((u) => {
            const points = board.get(u.id);
            const clients = memberships.filter((m) => m.user_id === u.id);
            const owned = carteira.filter((c) => c.owner_id === u.id);
            const load = openTasks.filter((t) => t.assignee_id === u.id);
            const editable = manager || u.id === user.id;
            const isOpen = selected?.id === u.id;

            return (
              <Card key={u.id} bodyClassName="p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Avatar name={u.name} color={u.color} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">{u.name}</h3>
                      <Chip tone={u.role === "admin" ? "bad" : u.role === "gestor" ? "brand" : "neutral"}>
                        {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                      </Chip>
                      {!u.active && <Chip tone="neutral">inativo</Chip>}
                      {u.id === user.id && <Chip tone="accent">você</Chip>}
                    </div>
                    <p className="mt-0.5 text-xs text-dim">
                      {u.job_title ?? "sem cargo definido"} · {u.email} · desde {dateBR(u.created_at)}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Mini label="Responsável por" value={String(owned.length)} />
                      <Mini label="Times" value={String(clients.length)} />
                      <Mini label="Tarefas ativas" value={String(load.length)} />
                      <Mini label="Pontos (30d)" value={String(points?.points ?? 0)} />
                    </div>

                    {owned.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {owned.map((c) => (
                          <Link key={c.id} href={`/clientes/${c.id}`} className="chip bg-brand-soft text-brand">
                            {c.name} · {brlShort(c.revenue)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {editable && (
                    <Link
                      href={isOpen ? "/equipe" : `/equipe?u=${u.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      {isOpen ? "Fechar" : "Editar"}
                    </Link>
                  )}
                </div>

                {isOpen && editable && (
                  <form action={updateTeamMemberAction} className="mt-4 border-t border-line pt-4">
                    <input type="hidden" name="user_id" value={u.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nome">
                        <input name="name" defaultValue={u.name} required className="input" />
                      </Field>
                      <Field label="E-mail">
                        <input
                          name="email"
                          type="email"
                          defaultValue={u.email}
                          className="input"
                          disabled={!manager}
                        />
                      </Field>
                      <Field label="Cargo">
                        <input name="job_title" defaultValue={u.job_title ?? ""} className="input" />
                      </Field>
                      {manager && (
                        <Field label="Papel no sistema">
                          <select name="role" defaultValue={u.role} className="select">
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label} — {r.description}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label="Cor do avatar">
                        <div className="flex flex-wrap gap-2">
                          {COLORS.map((c) => (
                            <label key={c} className="cursor-pointer">
                              <input
                                type="radio"
                                name="color"
                                value={c}
                                defaultChecked={u.color === c}
                                className="peer sr-only"
                              />
                              <span
                                className="block h-7 w-7 rounded-full ring-2 ring-transparent peer-checked:ring-[var(--text)]"
                                style={{ background: c }}
                              />
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Field label="Nova senha" hint="Deixe em branco para manter a atual.">
                        <input name="password" type="password" className="input" autoComplete="new-password" />
                      </Field>
                      {manager && (
                        <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
                          <input
                            type="checkbox"
                            name="active"
                            defaultChecked={Boolean(u.active)}
                            className="accent-[var(--primary)]"
                          />
                          Usuário ativo
                        </label>
                      )}
                    </div>

                    <div className="-mx-5 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                      <span className="text-xs text-dim">Nada muda até salvar.</span>
                      <SubmitButton>Salvar alterações</SubmitButton>
                    </div>
                  </form>
                )}

                {isOpen && manager && u.id !== user.id && (
                  <form action={toggleTeamMemberAction} className="-mx-5 -mb-5 border-t border-line px-5 py-3">
                    <input type="hidden" name="user_id" value={u.id} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      confirm={u.active ? "Desativar este usuário? As sessões abertas caem." : "Reativar este usuário?"}
                    >
                      {u.active ? "Desativar acesso" : "Reativar acesso"}
                    </SubmitButton>
                  </form>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-3">
          {manager && (
            <form action={createTeamMemberAction}>
              <Card title="Novo acesso" subtitle="Cria o login de alguém da equipe" bodyClassName="p-5 pb-0">
                <div className="space-y-3">
                  <Field label="Nome *">
                    <input name="name" required className="input" />
                  </Field>
                  <Field label="E-mail *">
                    <input name="email" type="email" required className="input" />
                  </Field>
                  <Field label="Senha provisória *" hint="Mínimo de 6 caracteres.">
                    <input name="password" type="password" required minLength={6} className="input" />
                  </Field>
                  <Field label="Cargo">
                    <input name="job_title" className="input" placeholder="cargo na operação" />
                  </Field>
                  <Field label="Papel">
                    <select name="role" defaultValue="membro" className="select">
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cor">
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((c, i) => (
                        <label key={c} className="cursor-pointer">
                          <input type="radio" name="color" value={c} defaultChecked={i === 0} className="peer sr-only" />
                          <span
                            className="block h-7 w-7 rounded-full ring-2 ring-transparent peer-checked:ring-[var(--text)]"
                            style={{ background: c }}
                          />
                        </label>
                      ))}
                    </div>
                  </Field>
                </div>
                <SaveBar label="Criar acesso" hint="" />
              </Card>
            </form>
          )}

          <Card title="Papéis do sistema" subtitle="O que cada papel pode fazer">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    {ROLES.map((r) => (
                      <th key={r.value} className="num">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_ORDER.map((p) => (
                    <tr key={p}>
                      <td className="text-xs text-muted">{PERMISSION_LABEL[p]}</td>
                      {ROLES.map((r) => {
                        const tem = permissionsOf(r.value).includes(p);
                        return (
                          <td key={r.value} className={`num ${tem ? "text-ok" : "text-dim"}`} title={r.description}>
                            {tem ? "sim" : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="text-xs text-muted">Ver clientes</td>
                    {ROLES.map((r) => (
                      <td key={r.value} className="num text-xs text-muted">
                        {permissionsOf(r.value).includes("carteira.completa") ? "todos" : "só os dele"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-center">
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="text-[0.62rem] leading-tight text-dim">{label}</div>
    </div>
  );
}
