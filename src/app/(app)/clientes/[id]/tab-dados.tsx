import { Card, Field } from "@/components/ui";
import { SaveBar } from "@/components/submit";
import { updateClientAction } from "@/lib/actions/clients";
import { CLIENT_STATUS, type Client, type User } from "@/lib/types";

export function TabDados({ client, users, manager }: { client: Client; users: User[]; manager: boolean }) {
  if (!manager) {
    return (
      <Card title="Dados cadastrais">
        <p className="text-sm text-dim">Apenas gestores e admins editam o cadastro do cliente.</p>
      </Card>
    );
  }

  return (
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
  );
}
