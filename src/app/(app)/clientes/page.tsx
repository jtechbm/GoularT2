import Link from "next/link";
import { Suspense } from "react";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { avaliarOnboardingEmLote, clientRows } from "@/lib/queries";
import { brlShort, currentMonth, dateBR, lastMonths, num, pct } from "@/lib/format";
import { Avatar, Card, Chip, Delta, Empty, MarketplaceChip, PageHeader, Stat, StatusChip } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { CLIENT_STATUS } from "@/lib/types";

function growth(current: number, previous: number): number {
  if (!previous) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; q?: string; status?: string; resp?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const months = lastMonths(12);
  const ref = params.mes && months.includes(params.mes) ? params.mes : currentMonth();

  const query = (params.q ?? "").toLowerCase().trim();
  const status = params.status ?? "";
  const onlyMine = params.resp === "eu";

  const all = await clientRows(ref, "cliente", await visibleClientIds(user));
  // só quem ainda está em onboarding precisa da barra de progresso
  const onboardings = await avaliarOnboardingEmLote(all.filter((c) => c.status === "onboarding"), ref);
  const rows = all.filter((c) => {
    if (status && c.status !== status) return false;
    if (onlyMine && c.owner_id !== user.id) return false;
    if (query && ![c.name, c.trade_name, c.segment, c.owner_name].some((v) => v?.toLowerCase().includes(query)))
      return false;
    return true;
  });

  const totals = rows.reduce(
    (acc, c) => ({
      revenue: acc.revenue + c.revenue,
      profit: acc.profit + c.profit,
      ads: acc.ads + c.ads,
      fee: acc.fee + (c.status === "encerrado" ? 0 : c.monthly_fee),
    }),
    { revenue: 0, profit: 0, ads: 0, fee: 0 },
  );

  const chip = (label: string, href: string, active: boolean) => (
    <Link key={href} href={href} className={`chip ${active ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>
      {label}
    </Link>
  );

  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ mes: ref });
    if (query) p.set("q", query);
    if (status) p.set("status", status);
    if (onlyMine) p.set("resp", "eu");
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k);
    return `/clientes?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${rows.length} de ${all.length} clientes na carteira`}
        actions={
          <>
            <Suspense fallback={null}>
              <MonthPicker months={months} value={ref} />
            </Suspense>
            {can(user, "clientes.gerenciar") && (
              <Link href="/clientes/novo" className="btn btn-primary">
                + Novo cliente
              </Link>
            )}
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento (filtro)" value={brlShort(totals.revenue)} tone="brand" />
        <Stat
          label="Lucro (filtro)"
          value={brlShort(totals.profit)}
          hint={totals.revenue ? `margem ${pct(totals.profit / totals.revenue)}` : "—"}
          tone="accent"
        />
        <Stat label="Ads (filtro)" value={brlShort(totals.ads)} tone="warn" />
        <Stat label="Fee recorrente" value={brlShort(totals.fee)} hint="contratos vigentes" tone="ok" />
      </div>

      <Card bodyClassName="p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-line p-4" action="/clientes" method="get">
          <input type="hidden" name="mes" value={ref} />
          <div className="min-w-52 flex-1">
            <label className="label">Buscar</label>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              className="input"
              placeholder="nome, segmento ou responsável…"
            />
          </div>
          <div className="w-44">
            <label className="label">Status</label>
            <select name="status" defaultValue={status} className="select">
              <option value="">Todos</option>
              {CLIENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">
            Filtrar
          </button>
          <div className="flex items-center gap-1.5">
            {chip("Todos", base({ resp: "" }), !onlyMine)}
            {chip("Meus clientes", base({ resp: "eu" }), onlyMine)}
          </div>
        </form>

        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Responsável</th>
                  <th>Equipe</th>
                  <th>Canais</th>
                  <th className="num">Faturamento</th>
                  <th className="num">Lucro</th>
                  <th className="num">Ads</th>
                  <th className="num">vs. ant.</th>
                  <th className="num">Tarefas</th>
                  <th>Última nota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clientes/${c.id}`} className="block min-w-40">
                        <span className="block font-semibold text-ink hover:text-brand">{c.name}</span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <StatusChip value={c.status} />
                          {c.segment && <span className="text-[0.7rem] text-dim">{c.segment}</span>}
                          {onboardings.has(c.id) && (
                            <span className="text-[0.7rem] text-warn">
                              onboarding {pct(onboardings.get(c.id)!.progresso)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {c.owner_name ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={c.owner_name} color={c.owner_color} size={24} />
                          <span className="text-xs text-muted">{c.owner_name.split(" ")[0]}</span>
                        </span>
                      ) : (
                        <Chip tone="warn">definir</Chip>
                      )}
                    </td>
                    <td className="num text-muted">{num(c.team_size)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {c.marketplaces ? (
                          c.marketplaces.split(",").map((m) => <MarketplaceChip key={m} value={m} />)
                        ) : (
                          <span className="text-xs text-dim">—</span>
                        )}
                      </span>
                    </td>
                    <td className="num font-semibold text-ink">{brlShort(c.revenue)}</td>
                    <td className="num">{brlShort(c.profit)}</td>
                    <td className="num text-muted">{brlShort(c.ads)}</td>
                    <td className="num">
                      <Delta value={growth(c.revenue, c.prev_revenue)} />
                    </td>
                    <td className="num">
                      {c.open_tasks > 0 ? <Chip tone="accent">{c.open_tasks}</Chip> : <span className="text-dim">—</span>}
                    </td>
                    <td className="text-xs text-dim">{c.last_note_at ? dateBR(c.last_note_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty
              title={all.length ? "Nenhum cliente para este filtro" : "Carteira vazia"}
              hint={
                all.length
                  ? "Ajuste a busca ou o status para ver outros clientes."
                  : "Cadastre o primeiro cliente para começar."
              }
              action={
                can(user, "clientes.gerenciar") ? (
                  <Link href="/clientes/novo" className="btn btn-primary btn-sm">
                    Cadastrar cliente
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}
      </Card>
    </>
  );
}
