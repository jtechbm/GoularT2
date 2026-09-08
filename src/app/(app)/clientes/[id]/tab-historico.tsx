import { Avatar, Card, Chip, Empty, Field } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { addNoteAction, deleteNoteAction, toggleNotePinAction } from "@/lib/actions/clients";
import { dateTimeBR, relativeBR } from "@/lib/format";
import type { Client, ClientNote } from "@/lib/types";
import type { Tone } from "@/components/ui";

const KINDS: { value: string; label: string; tone: Tone }[] = [
  { value: "nota", label: "Nota", tone: "neutral" },
  { value: "reuniao", label: "Reunião", tone: "info" },
  { value: "alerta", label: "Alerta", tone: "bad" },
  { value: "mudanca", label: "Mudança", tone: "brand" },
  { value: "financeiro", label: "Financeiro", tone: "accent" },
];

export function TabHistorico({
  client,
  notes,
  currentUserId,
  manager,
}: {
  client: Client;
  notes: (ClientNote & { user_name: string | null; user_color: string | null })[];
  currentUserId: string;
  manager: boolean;
}) {
  const kind = (value: string) => KINDS.find((k) => k.value === value) ?? KINDS[0];

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <form action={addNoteAction} className="lg:col-span-1">
        <input type="hidden" name="client_id" value={client.id} />
        <Card title="Nova anotação" subtitle="Visível apenas para a equipe" bodyClassName="p-5 pb-0">
          <div className="space-y-3">
            <Field label="Tipo">
              <select name="kind" className="select" defaultValue="nota">
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anotação">
              <textarea
                name="body"
                rows={6}
                required
                className="textarea"
                placeholder="O que aconteceu, o que foi combinado, o que precisa de atenção…"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="pinned" className="accent-[var(--primary)]" />
              Fixar no topo do histórico
            </label>
          </div>
          <SaveBar label="Registrar anotação" hint="" />
        </Card>
      </form>

      <Card className="lg:col-span-2" title="Histórico interno" subtitle={`${notes.length} registros`}>
        {notes.length ? (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {notes.map((n) => (
              <li key={n.id} className="relative">
                <span
                  className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface)]"
                  style={{ background: n.pinned ? "var(--accent)" : "var(--primary)" }}
                />
                <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Avatar name={n.user_name ?? "Equipe"} color={n.user_color} size={22} />
                    <span className="text-xs font-semibold text-ink">{n.user_name ?? "Equipe"}</span>
                    <Chip tone={kind(n.kind).tone}>{kind(n.kind).label}</Chip>
                    {n.pinned === 1 && <Chip tone="accent">fixada</Chip>}
                    <span className="ml-auto text-xs text-muted" title={dateTimeBR(n.created_at)}>
                      {relativeBR(n.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{n.body}</p>

                  {(manager || n.user_id === currentUserId) && (
                    <div className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
                      <form action={toggleNotePinAction}>
                        <input type="hidden" name="client_id" value={client.id} />
                        <input type="hidden" name="note_id" value={n.id} />
                        <SubmitButton variant="ghost" size="sm">
                          {n.pinned ? "Desafixar" : "Fixar"}
                        </SubmitButton>
                      </form>
                      <form action={deleteNoteAction}>
                        <input type="hidden" name="client_id" value={client.id} />
                        <input type="hidden" name="note_id" value={n.id} />
                        <SubmitButton variant="ghost" size="sm" confirm="Excluir esta anotação?">
                          Excluir
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            title="Histórico vazio"
            hint="Registre reuniões, mudanças de estratégia e alertas para que qualquer pessoa da equipe entenda a conta rapidamente."
          />
        )}
      </Card>
    </div>
  );
}
