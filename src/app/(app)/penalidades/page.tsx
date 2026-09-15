import Link from "next/link";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { avisosMarketplace, clientOptions, penalidades, saudeContasML } from "@/lib/queries";
import { dateBR, dateTimeBR, pct, relativeBR } from "@/lib/format";
import { Card, Chip, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import {
  reabrirPenalidadeAction,
  resolverPenalidadeAction,
  tarefaDaPenalidadeAction,
  verificarPenalidadesAgoraAction,
} from "@/lib/actions/penalidades";
import { NIVEL_LABEL, posicaoNivel } from "@/lib/penalidades/regras";

export const maxDuration = 60;

const TIPOS: Record<string, string> = {
  reputacao: "Reputação",
  aviso: "Aviso oficial",
  infracao: "Infração em anúncio",
  punicao: "Punição",
};

const TOM_NIVEL: Record<number, "bad" | "warn" | "ok"> = { 1: "bad", 2: "bad", 3: "warn", 4: "ok", 5: "ok" };

export default async function PenalidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; status?: string; tipo?: string; verificado?: string; erros?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const escopo = await visibleClientIds(user);
  const resolve = can(user, "penalidades.resolver");

  const status = sp.status ?? "aberta";
  const lista = await penalidades({
    scope: escopo,
    clientId: sp.cliente,
    status: status === "todas" ? undefined : status,
    kind: sp.tipo,
  });
  const contas = await saudeContasML(escopo, sp.cliente);
  const avisos = await avisosMarketplace(escopo, 15);
  const clientes = await clientOptions(escopo);

  const abertas = await penalidades({ scope: escopo, status: "aberta" });
  const criticas = abertas.filter((p) => p.severity === "critico").length;
  const semPermissao = contas.filter((c) => c.items_permission === "pendente").length;
  const ultimaVerificacao = contas
    .map((c) => c.penalties_checked_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const aqui = `/penalidades?${new URLSearchParams({
    ...(sp.cliente ? { cliente: sp.cliente } : {}),
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.tipo ? { tipo: sp.tipo } : {}),
  })}`;

  return (
    <>
      <PageHeader
        title="Penalidades"
        subtitle={
          ultimaVerificacao
            ? `Lidas direto do Mercado Livre · última verificação ${relativeBR(ultimaVerificacao)}`
            : "Lidas direto do Mercado Livre · ainda não verificado"
        }
        actions={
          <form action={verificarPenalidadesAgoraAction}>
            <input type="hidden" name="client_id" value={sp.cliente ?? ""} />
            <input type="hidden" name="redirect_to" value={aqui} />
            <SubmitButton size="sm" pendingLabel="Verificando…">
              Verificar agora
            </SubmitButton>
          </form>
        }
      />

      {sp.verificado !== undefined && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Verificação concluída: {sp.verificado} {sp.verificado === "1" ? "penalidade nova" : "penalidades novas"}
          {sp.erros && sp.erros !== "0" ? ` · ${sp.erros} contas não responderam` : ""}.
        </div>
      )}

      {semPermissao > 0 && (
        <div className="mb-4 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">
            Infrações de anúncio ainda não são lidas em {semPermissao}{" "}
            {semPermissao === 1 ? "conta" : "contas"}.
          </p>
          <p className="mt-1 text-xs text-muted">
            O app do Elleva no Mercado Livre não tem a permissão de anúncios, e a API recusa a consulta. Reputação e
            avisos oficiais continuam sendo verificados. Para ver infrações, a permissão precisa ser liberada no app e
            o lojista precisa autorizar de novo.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Abertas" value={String(abertas.length)} tone={abertas.length ? "warn" : "ok"} />
        <Stat label="Críticas" value={String(criticas)} tone={criticas ? "bad" : "ok"} />
        <Stat label="Contas verificadas" value={String(contas.length)} tone="brand" />
        <Stat
          label="Sem leitura de anúncios"
          value={String(semPermissao)}
          hint={semPermissao ? "falta permissão no app" : "tudo liberado"}
          tone={semPermissao ? "warn" : "ok"}
        />
      </div>

      {contas.length > 0 && (
        <Card className="mt-3" title="Reputação das contas" subtitle="Última leitura de cada loja" bodyClassName="p-0">
          <div className="table-wrap">
            <table className="data responsiva">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Reputação</th>
                  <th className="num">Reclamações</th>
                  <th className="num">Atraso no envio</th>
                  <th className="num">Cancelamentos</th>
                  <th>Lido</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => {
                  const efetivo = c.real_level ?? c.level_id;
                  const pos = posicaoNivel(efetivo);
                  const protegida = Boolean(c.real_level && c.real_level !== c.level_id);
                  return (
                    <tr key={c.id}>
                      <td data-label="Cliente">
                        <Link href={`/clientes/${c.client_id}`} className="font-medium text-ink hover:text-brand">
                          {c.client_name}
                        </Link>
                      </td>
                      <td data-label="Reputação">
                        {pos ? (
                          <Chip tone={TOM_NIVEL[pos]}>{NIVEL_LABEL[efetivo!] ?? efetivo}</Chip>
                        ) : (
                          <span className="text-xs text-dim">sem cor ainda</span>
                        )}
                        {protegida && (
                          <span className="block text-[0.65rem] text-warn">
                            protegida, exibe {NIVEL_LABEL[c.level_id!] ?? c.level_id}
                            {c.protection_end_date && ` até ${dateBR(c.protection_end_date)}`}
                          </span>
                        )}
                      </td>
                      <td className="num text-muted" data-label="Reclamações">
                        {c.claims_rate === null ? "—" : pct(c.claims_rate)}
                      </td>
                      <td className="num text-muted" data-label="Atraso no envio">
                        {c.delayed_rate === null ? "—" : pct(c.delayed_rate)}
                      </td>
                      <td className="num text-muted" data-label="Cancelamentos">
                        {c.cancellations_rate === null ? "—" : pct(c.cancellations_rate)}
                      </td>
                      <td className="text-xs text-dim" data-label="Lido">
                        {c.captured_at ? relativeBR(c.captured_at) : "nunca"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mt-3" bodyClassName="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
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
              {Object.entries(TIPOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação">
            <select name="status" defaultValue={status} className="select">
              <option value="aberta">Abertas</option>
              <option value="resolvida">Resolvidas</option>
              <option value="todas">Todas</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <SubmitButton variant="ghost" size="sm">
              Filtrar
            </SubmitButton>
            <Link href="/penalidades" className="btn btn-ghost btn-sm">
              Limpar
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-3 space-y-3">
        {lista.length ? (
          lista.map((p) => (
            <Card key={p.id} bodyClassName="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={p.severity === "critico" ? "bad" : p.severity === "atencao" ? "warn" : "info"}>
                      {p.severity === "critico" ? "Crítica" : p.severity === "atencao" ? "Atenção" : "Informativa"}
                    </Chip>
                    <Chip tone="neutral">{TIPOS[p.kind] ?? p.kind}</Chip>
                    <span className="text-sm font-semibold text-ink">{p.title}</span>
                  </div>
                  <Link href={`/clientes/${p.client_id}`} className="mt-1 block text-xs text-muted hover:text-brand">
                    {p.client_name} · detectada {relativeBR(p.detected_at)}
                  </Link>
                  {p.detail && <p className="mt-1.5 text-xs text-muted">{p.detail}</p>}
                  {p.status === "resolvida" && (
                    <p className="mt-1.5 text-[0.7rem] text-ok">
                      {p.auto_resolved ? "Resolvida sozinha" : `Resolvida por ${p.resolved_by_name ?? "alguém"}`}
                      {p.resolved_at && ` em ${dateTimeBR(p.resolved_at)}`}
                      {p.resolution_note && ` · ${p.resolution_note}`}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {p.status === "aberta" ? (
                    <>
                      <form action={tarefaDaPenalidadeAction}>
                        <input type="hidden" name="penalty_id" value={p.id} />
                        <SubmitButton variant="accent" size="sm" pendingLabel="Criando…">
                          Criar tarefa
                        </SubmitButton>
                      </form>
                      {resolve && (
                        <details className="relative">
                          <summary className="btn btn-ghost btn-sm cursor-pointer list-none">Resolver</summary>
                          <form
                            action={resolverPenalidadeAction}
                            className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-[12px] border border-line bg-surface p-3 shadow-lg"
                          >
                            <input type="hidden" name="penalty_id" value={p.id} />
                            <input type="hidden" name="redirect_to" value={aqui} />
                            <Field label="O que foi feito *">
                              <textarea name="nota" rows={2} required className="textarea" />
                            </Field>
                            <SubmitButton size="sm" className="w-full">
                              Marcar resolvida
                            </SubmitButton>
                          </form>
                        </details>
                      )}
                    </>
                  ) : (
                    resolve && (
                      <form action={reabrirPenalidadeAction}>
                        <input type="hidden" name="penalty_id" value={p.id} />
                        <input type="hidden" name="redirect_to" value={aqui} />
                        <SubmitButton variant="ghost" size="sm">
                          Reabrir
                        </SubmitButton>
                      </form>
                    )
                  )}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <Empty
              title={status === "aberta" ? "Nenhuma penalidade aberta" : "Nada neste filtro"}
              hint={
                contas.length
                  ? "Queda de reputação e avisos oficiais de bloqueio aparecem aqui assim que o Mercado Livre registrar."
                  : "Nenhuma conta do Mercado Livre conectada nas lojas que você acompanha."
              }
            />
          </Card>
        )}
      </div>

      {avisos.length > 0 && (
        <Card
          className="mt-3"
          title="Avisos oficiais recebidos"
          subtitle="Tudo que o Mercado Livre mandou; só os marcados como alerta viram penalidade"
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                <Chip tone={a.is_alert ? "bad" : "neutral"}>{a.is_alert ? "alerta" : "aviso"}</Chip>
                <span className="text-ink">{a.title}</span>
                <span className="text-dim">
                  {a.client_name}
                  {a.from_date && ` · ${dateBR(a.from_date)}`}
                </span>
                <span className="ml-auto font-mono text-[0.6rem] text-dim">
                  {a.category}/{a.sub_category}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
