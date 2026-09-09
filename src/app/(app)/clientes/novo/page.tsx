import Link from "next/link";
import { listUsers, requireRole } from "@/lib/auth";
import { createClientAction } from "@/lib/actions/clients";
import { Card, Field, PageHeader } from "@/components/ui";
import { SaveBar } from "@/components/submit";
import { CLIENT_STATUS, MARKETPLACES } from "@/lib/types";

export default async function NovoClientePage() {
  await requireRole("admin", "gestor");
  const team = await listUsers();

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Novo cliente"
        subtitle="Cadastro da operação — dá para completar os dados depois na página do cliente."
        actions={
          <Link href="/clientes" className="btn btn-ghost">
            Cancelar
          </Link>
        }
      />

      <form action={createClientAction}>
        <Card className="max-w-4xl" bodyClassName="p-5 pb-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do cliente *" className="sm:col-span-2">
              <input name="name" required className="input" placeholder="Razão social ou nome da marca" />
            </Field>
            <Field label="Nome fantasia / marca">
              <input name="trade_name" className="input" />
            </Field>
            <Field label="CNPJ / CPF">
              <input name="doc" className="input" placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Segmento">
              <input name="segment" className="input" placeholder="segmento de atuação" />
            </Field>
            <Field label="Status inicial">
              <select name="status" defaultValue="onboarding" className="select">
                {CLIENT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Responsável pela conta" className="sm:col-span-2">
              <select name="owner_id" className="select" defaultValue="">
                <option value="">Definir depois</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.job_title ?? u.role}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tipo de cadastro" className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
                <input type="checkbox" name="kind" value="propria" className="mt-0.5 accent-[var(--primary)]" />
                <span className="text-sm text-ink">
                  Esta é uma loja própria
                  <span className="mt-0.5 block text-xs text-muted">
                    Marque só se a loja for do próprio Kadu. Ela fica fora da carteira de clientes, não gera
                    cobrança, e o resultado aparece separado no Financeiro.
                  </span>
                </span>
              </label>
            </Field>

            <Field label="Contato — nome">
              <input name="contact_name" className="input" />
            </Field>
            <Field label="Contato — e-mail">
              <input name="contact_email" type="email" className="input" />
            </Field>
            <Field label="Contato — telefone">
              <input name="contact_phone" className="input" placeholder="(00) 00000-0000" />
            </Field>
            <Field label="Início do contrato">
              <input name="started_at" type="date" className="input" />
            </Field>

            <Field label="Modelo de cobrança">
              <select name="fee_model" defaultValue="fixo" className="select">
                <option value="fixo">Fee fixo</option>
                <option value="percentual">Percentual sobre faturamento</option>
                <option value="hibrido">Híbrido (fixo + percentual)</option>
              </select>
            </Field>
            <Field label="Plano">
              <select name="tier" defaultValue="standard" className="select">
                <option value="light">Light</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </Field>
            <Field label="Fee mensal (R$)">
              <input name="monthly_fee" inputMode="decimal" className="input" placeholder="0,00" />
            </Field>
            <Field label="Comissão (%)" hint="Use 0,05 para 5% do faturamento.">
              <input name="commission_pct" inputMode="decimal" className="input" placeholder="0" />
            </Field>

            <Field label="Marketplaces que o cliente usa" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {MARKETPLACES.map((m) => (
                  <label
                    key={m.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
                  >
                    <input type="checkbox" name="marketplaces" value={m.value} className="accent-[var(--primary)]" />
                    {m.label}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Resumo da operação" className="sm:col-span-2" hint="O que a equipe precisa saber de cara.">
              <textarea name="summary" className="textarea" rows={3} />
            </Field>
          </div>

          <SaveBar label="Cadastrar cliente" hint="O cliente é criado apenas ao confirmar aqui." />
        </Card>
      </form>
    </>
  );
}
