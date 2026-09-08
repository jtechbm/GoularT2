import { Avatar, Card, Chip, Field } from "@/components/ui";
import { SaveBar } from "@/components/submit";
import { saveTeamAction } from "@/lib/actions/clients";
import type { Client, User } from "@/lib/types";

const TEAM_ROLES = ["responsavel", "analista", "trafego", "conteudo", "financeiro", "suporte"];

export function TabEquipe({
  client,
  team,
  users,
  manager,
}: {
  client: Client;
  team: (User & { team_role: string })[];
  users: User[];
  manager: boolean;
}) {
  const memberRole = new Map(team.map((t) => [t.id, t.team_role]));

  if (!manager) {
    return (
      <Card title="Equipe do cliente">
        <ul className="space-y-2.5">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
              <Avatar name={m.name} color={m.color} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                <span className="text-xs text-dim">{m.job_title ?? m.role}</span>
              </span>
              {m.id === client.owner_id ? <Chip tone="accent">responsável</Chip> : <Chip>{m.team_role}</Chip>}
            </li>
          ))}
          {!team.length && <p className="text-sm text-dim">Nenhuma pessoa atribuída a este cliente.</p>}
        </ul>
      </Card>
    );
  }

  return (
    <form action={saveTeamAction}>
      <input type="hidden" name="client_id" value={client.id} />
      <Card
        title="Responsável e equipe"
        subtitle="O responsável responde pela conta; a equipe enxerga o cliente como seu."
        bodyClassName="p-5 pb-0"
      >
        <Field label="Responsável pela conta" className="max-w-md">
          <select name="owner_id" defaultValue={client.owner_id ?? ""} className="select">
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.job_title ?? u.role}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-5">
          <span className="label">Equipe atribuída</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {users.map((u) => {
              const checked = memberRole.has(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong"
                >
                  <input
                    type="checkbox"
                    name="members"
                    value={u.id}
                    defaultChecked={checked}
                    className="accent-[var(--primary)]"
                  />
                  <Avatar name={u.name} color={u.color} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                    <span className="text-[0.7rem] text-dim">{u.job_title ?? u.role}</span>
                  </span>
                  <select
                    name={`role_${u.id}`}
                    defaultValue={memberRole.get(u.id) ?? "analista"}
                    className="select !w-32 !py-1 text-xs"
                  >
                    {TEAM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>

        <SaveBar label="Salvar equipe" hint="O responsável entra automaticamente na equipe." />
      </Card>
    </form>
  );
}
