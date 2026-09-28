import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeClient, requirePermission } from "@/lib/auth";
import { clientMarketplaces, getClient, periodoDe, serieDiaria, totaisPorLojaNoPeriodo } from "@/lib/queries";
import { dateTimeBR } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { AnaliseRapida, periodoEmTexto, type DadosAnalise } from "@/components/analise-rapida";

export const maxDuration = 60;

/**
 * A mesma análise da aba, sem a navegação do sistema em volta.
 *
 * Existe para virar PDF: o CSS de impressão já esconde menu, cabeçalho e
 * qualquer coisa marcada com `print:hidden`, então o que sobra na folha é o
 * resumo. Quem desenha é o mesmo componente da aba.
 */
export default async function AnaliseClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; ate?: string; dia1?: string; dia2?: string }>;
}) {
  const user = await requirePermission("clientes.ver");
  const { id } = await params;
  const sp = await searchParams;

  const client = await getClient(id);
  if (!client) notFound();
  if (!(await canSeeClient(user, client.id))) notFound();

  // dois dias soltos têm prioridade sobre o intervalo: é o comparativo
  const diaValido = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const d1 = diaValido(sp.dia1);
  const d2 = diaValido(sp.dia2);
  const comparandoDias = Boolean(d1 && d2);

  const intervalo = comparandoDias
    ? { inicio: d1!, fim: d1!, label: d1! }
    : periodoDe("personalizado", undefined, sp.de, sp.ate);

  const [dias, lojas, porLoja, diasComp, porLojaComp] = await Promise.all([
    serieDiaria(intervalo.inicio, intervalo.fim, { clientId: client.id }),
    clientMarketplaces(client.id),
    totaisPorLojaNoPeriodo(client.id, intervalo.inicio, intervalo.fim),
    comparandoDias ? serieDiaria(d2!, d2!, { clientId: client.id }) : Promise.resolve(null),
    comparandoDias ? totaisPorLojaNoPeriodo(client.id, d2!, d2!) : Promise.resolve(null),
  ]);

  const ativas = lojas.filter((l) => l.status !== "desativado");
  const montar = (
    inicio: string,
    fim: string,
    serie: { revenue: number; orders: number; units: number }[],
    porLojaDoPeriodo: Map<string, { revenue: number; orders: number }>,
  ): DadosAnalise => ({
    clienteNome: client.name,
    inicio,
    fim,
    ...serie.reduce(
      (a, d) => ({ revenue: a.revenue + d.revenue, orders: a.orders + d.orders, units: a.units + d.units }),
      { revenue: 0, orders: 0, units: 0 },
    ),
    lojas: ativas.map((l) => ({
      ...l,
      revenue: porLojaDoPeriodo.get(l.id)?.revenue ?? 0,
      orders: porLojaDoPeriodo.get(l.id)?.orders ?? 0,
    })),
  });

  const dados = montar(intervalo.inicio, intervalo.fim, dias, porLoja);
  const comparacao = d2 && diasComp && porLojaComp ? montar(d2, d2, diasComp, porLojaComp) : null;

  return (
    <>
      {/* a barra de ações some na impressão: PDF não precisa de botão */}
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <Link href={`/clientes/${client.id}?tab=analise`} className="hover:text-brand">
              {client.name}
            </Link>
          }
          title="Análise"
          subtitle={
            comparacao
              ? `${periodoEmTexto(intervalo.inicio, intervalo.fim)} · comparado com ${periodoEmTexto(comparacao.inicio, comparacao.fim)}`
              : periodoEmTexto(intervalo.inicio, intervalo.fim)
          }
          actions={<BotaoImprimir />}
        />
      </div>

      {/* cabeçalho que só aparece no papel, para o PDF não sair anônimo */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">{client.name}</h1>
        <p className="text-sm">
          Análise · {periodoEmTexto(intervalo.inicio, intervalo.fim)}
          {comparacao ? ` · comparado com ${periodoEmTexto(comparacao.inicio, comparacao.fim)}` : ""}
        </p>
      </div>

      <AnaliseRapida dados={dados} comparacao={comparacao} />

      <p className="mt-6 text-center text-[0.7rem] text-dim">Gerado em {dateTimeBR(new Date().toISOString())}</p>
    </>
  );
}
