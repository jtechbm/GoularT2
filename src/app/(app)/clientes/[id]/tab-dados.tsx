import { Card, Field } from "@/components/ui";
import { SaveBar, SubmitButton } from "@/components/submit";
import { deleteClientAction, updateClientAction } from "@/lib/actions/clients";
import { CLIENT_STATUS, type Client, type User } from "@/lib/types";

export function TabDados({
  client,
  users,
  manager,
  admin,
  podeExcluir,
  erroExclusao,
}: {
  client: Client;
  users: User[];
  manager: boolean;
  admin: boolean;
  /** excluir é permissão à parte de editar: não tem volta */
  podeExcluir: boolean;
  /** o nome digitado não confere com o do cliente */
  erroExclusao?: boolean;
}) {
  if (!manager) {
    return (
      <Card title="Dados cadastrais">
        <p className="text-sm text-dim">Seu perfil não pode editar o cadastro do cliente.</p>
      </Card>
    );
  }

  return (
    <>
      <form action={updateClientAction}>
      <input type="hidden" name="client_id" value={client.id} />
      <Card className="max-w-4xl" title="Dados cadastrais" bodyClassName="p-5 pb-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cliente *" className="sm:col-span-2">
            <input name="name" defaultValue={client.name} required className="input" />
          </Field>
          <Field label="Nome fantasia / marca">
            <input name="trade_name" defaultValue={client.trade_name ?? ""} className="input" />
          </Field>
          <Field label="CNPJ / CPF">
            <input name="doc" defaultValue={client.doc ?? ""} className="input" />
          </Field>
          <Field label="Segmento">
            <input name="segment" defaultValue={client.segment ?? ""} className="input" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={client.status} className="select">
              {CLIENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          {admin && (
            <>
              <Field label="Responsável" className="sm:col-span-2">
                <select name="owner_id" defaultValue={client.owner_id ?? ""} className="select">
                  <option value="">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tipo de cadastro" className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
                  <input type="checkbox" name="kind" value="propria" className="mt-0.5 accent-[var(--primary)]" defaultChecked={client.kind === "propria"} />
                  <span className="text-sm text-ink">
                    Esta é uma loja própria
                    <span className="mt-0.5 block text-xs text-muted">
                      Marque só se a loja for do próprio Kadu. Ela fica fora da carteira de clientes, não gera
                      cobrança, e o resultado aparece separado no Financeiro.
                    </span>
                  </span>
                </label>
              </Field>
            </>
          )}

          <Field label="Contato — nome">
            <input name="contact_name" defaultValue={client.contact_name ?? ""} className="input" />
          </Field>
          <Field label="Contato — e-mail">
            <input name="contact_email" type="email" defaultValue={client.contact_email ?? ""} className="input" />
          </Field>
          <Field label="Contato — telefone">
            <input name="contact_phone" defaultValue={client.contact_phone ?? ""} className="input" />
          </Field>
          <Field label="Início do contrato">
            <input name="started_at" type="date" defaultValue={client.started_at ?? ""} className="input" />
          </Field>

          <Field label="Modelo de cobrança">
            <select name="fee_model" defaultValue={client.fee_model} className="select">
              <option value="fixo">Fee fixo</option>
              <option value="percentual">Percentual sobre faturamento</option>
              <option value="hibrido">Híbrido</option>
            </select>
          </Field>
          <Field label="Plano">
            <select name="tier" defaultValue={client.tier} className="select">
              <option value="light">Light</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </Field>
          <Field label="Fee mensal (R$)">
            <input name="monthly_fee" inputMode="decimal" defaultValue={client.monthly_fee} className="input" />
          </Field>
          <Field label="Comissão (%)" hint="0,05 = 5% do faturamento.">
            <input name="commission_pct" inputMode="decimal" defaultValue={client.commission_pct} className="input" />
          </Field>

          <Field label="Resumo da operação" className="sm:col-span-2">
            <textarea name="summary" rows={4} defaultValue={client.summary ?? ""} className="textarea" />
          </Field>
        </div>

        <SaveBar />
      </Card>
      </form>

      {/* excluir é permissão própria, separada de editar, para o Kadu poder
          tirar de um papel na tela de Equipe sem tirar a edição junto */}
      {podeExcluir && (
        <form action={deleteClientAction} className="mt-3">
          <input type="hidden" name="client_id" value={client.id} />
          <Card title="Excluir cliente" subtitle="Não tem volta">
            <p className="text-sm text-muted">
              Apaga <strong className="text-ink">{client.name}</strong> e tudo que é dele: lojas conectadas,
              fechamentos, histórico diário, Ads, anotações, metas, penalidades, análises e cobranças. As tarefas
              ficam no sistema, sem cliente.
            </p>
            {erroExclusao && (
              <p className="mt-3 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-xs text-bad">
                O nome digitado não confere. Nada foi apagado.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label={`Digite "${client.name}" para confirmar`} className="min-w-64 flex-1">
                <input name="confirmacao" className="input" placeholder={client.name} autoComplete="off" />
              </Field>
              <SubmitButton
                variant="danger"
                pendingLabel="Excluindo…"
                confirm={`Excluir ${client.name} e todo o histórico dele? Isso não tem volta.`}
              >
                Excluir cliente
              </SubmitButton>
            </div>
          </Card>
        </form>
      )}
    </>
  );
}
