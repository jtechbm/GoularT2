import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { alertasDaCarteira, clientOptions } from "@/lib/queries";
import { currentMonth, dateTimeBR, lastMonths, monthLabel } from "@/lib/format";
import { Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { MonthPicker } from "@/components/month-picker";
import { criarTarefaDoAlertaAction, reabrirAlertaAction, resolverAlertaAction } from "@/lib/actions/alertas";
import { NIVEL_LABEL, NIVEL_TOM, TIPOS_ALERTA, type NivelAlerta } from "@/lib/alertas";

export const maxDuration = 60;

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string; tipo?: string; ver?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const months = lastMonths(12);
  const ref = sp.mes && months.includes(sp.mes) ? sp.mes : currentMonth();

  const escopo = await visibleClientIds(user);
  const todos = await alertasDaCarteira(ref, escopo);
  const clientes = await clientOptions(escopo);

  const mostrarResolvidos = sp.ver === "resolvidos";
  const alertas = todos.filter((a) => {
    if (a.resolvido !== mostrarResolvidos) return false;
    if (sp.cliente && a.clientId !== sp.cliente) return false;
    if (sp.tipo && a.kind !== sp.tipo) return false;
    return true;
  });

  const abertos = todos.filter((a) => !a.resolvido);
  const porNivel = (n: NivelAlerta) => abertos.filter((a) => a.nivel === n).length;

  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("mes", ref);
    if (sp.cliente) p.set("cliente", sp.cliente);
    if (sp.tipo) p.set("tipo", sp.tipo);
    if (sp.ver) p.set("ver", sp.ver);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/alertas?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Atenção necessária"
        subtitle={`O que precisa de decisão hoje · ${monthLabel(ref)}`}
        actions={
          <Suspense fallback={null}>
            <MonthPicker months={months} value={ref} />
          </Suspense>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Críticos" value={String(porNivel("critico"))} tone={porNivel("critico") ? "bad" : "ok"} />
        <Stat label="Atenção" value={String(porNivel("atencao"))} tone={porNivel("atencao") ? "warn" : "ok"} />
        <Stat label="Informativos" value={String(porNivel("informativo"))} tone="info" />
        <Stat label="Resolvidos" value={String(todos.length - abertos.length)} tone="neutral" />
      </div>

      <Card className="mt-3" bodyClassName="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="mes" value={ref} />
          <Field label="Cliente">
            <select name="cliente" defaultValue={sp.cliente ?? ""} className="select">
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select name="tipo" defaultValue={sp.tipo ?? ""} className="select">
              <option value="">Todos</option>
              {TIPOS_ALERTA.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mostrar">
            <select name="ver" defaultValue={sp.ver ?? ""} className="select">
              <option value="">Em aberto</option>
              <option value="resolvidos">Resolvidos</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <SubmitButton variant="ghost" size="sm">
              Filtrar
            </SubmitButton>
            <Link href={`/alertas?mes=${ref}`} className="btn btn-ghost btn-sm">
              Limpar
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-3 space-y-3">
        {alertas.length ? (
          alertas.map((a) => (
            <Card key={a.key} bodyClassName="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={NIVEL_TOM[a.nivel]}>{NIVEL_LABEL[a.nivel]}</Chip>
                    <Link href={a.href} className="text-sm font-semibold text-ink hover:text-brand">
                      {a.titulo}
                    </Link>
                    {a.clientName && (
                      <Link href={`/clientes/${a.clientId}`} className="text-xs text-muted hover:text-brand">
                        {a.clientName}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">{a.detalhe}</p>
                  {a.resolvido && (
                    <p className="mt-1.5 text-[0.7rem] text-dim">
                      Resolvido por {a.resolvidoPor ?? "alguém"}
                      {a.resolvidoEm && ` em ${dateTimeBR(a.resolvidoEm)}`}
                      {a.resolvidoNota && ` · ${a.resolvidoNota}`}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {a.resolvido ? (
                    <form action={reabrirAlertaAction}>
                      <input type="hidden" name="alert_key" value={a.key} />
                      <input type="hidden" name="redirect_to" value={link({})} />
                      <SubmitButton variant="ghost" size="sm">
                        Reabrir
                      </SubmitButton>
                    </form>
                  ) : (
                    <>
                      <form action={criarTarefaDoAlertaAction}>
                        <input type="hidden" name="alert_key" value={a.key} />
                        <input type="hidden" name="kind" value={a.kind} />
                        <input type="hidden" name="client_id" value={a.clientId ?? ""} />
                        <input type="hidden" name="ref_month" value={a.refMonth ?? ""} />
                        <input type="hidden" name="titulo" value={a.tarefaSugerida} />
                        <input type="hidden" name="detalhe" value={a.detalhe} />
                        <input type="hidden" name="prioridade" value={a.nivel === "critico" ? "urgente" : "alta"} />
                        <SubmitButton variant="accent" size="sm" pendingLabel="Criando…">
                          Criar tarefa
                        </SubmitButton>
                      </form>
                      <form action={resolverAlertaAction}>
                        <input type="hidden" name="alert_key" value={a.key} />
                        <input type="hidden" name="kind" value={a.kind} />
                        <input type="hidden" name="client_id" value={a.clientId ?? ""} />
                        <input type="hidden" name="ref_month" value={a.refMonth ?? ""} />
                        <input type="hidden" name="redirect_to" value={link({})} />
                        <SubmitButton variant="ghost" size="sm">
                          Marcar resolvido
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <Empty
              title={mostrarResolvidos ? "Nada resolvido ainda" : "Nada precisando de atenção"}
              hint={
                mostrarResolvidos
                  ? "Quando a equipe marcar alertas como resolvidos, eles aparecem aqui."
                  : "Queda de faturamento, ACOS estourado, loja parada e cobrança vencida aparecem aqui automaticamente."
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}
