import Link from "next/link";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { clientOptions } from "@/lib/queries";
import { brl, dateTimeBR, pct } from "@/lib/format";
import { marketplaceLabel } from "@/lib/types";
import { Card, Chip, Empty, Field, MarketplaceChip, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { buscarConcorrentesAction, importarAnunciosAction } from "@/lib/actions/precos";
import { diferencaRelativa } from "@/lib/precos/analise";
import {
  contasDoCliente,
  produtoDoUsuario,
  produtosDoCliente,
  reguaDoProduto,
} from "@/lib/precos/comparador";

/**
 * A busca na web leva uns 26 segundos. O teto padrão de 10s da plataforma
 * cortaria a chamada no meio, e isso só apareceria em produção.
 */
export const maxDuration = 60;

export default async function PrecosPage({
  searchParams,
}: {
  searchParams: Promise<{
    cliente?: string;
    mp?: string;
    produto?: string;
    importados?: string;
    precos?: string;
    achados?: string;
    fora?: string;
    proprios?: string;
    erro?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const escopo = await visibleClientIds(user);
  const clientes = await clientOptions(escopo);
  const podePesquisar = can(user, "precos.pesquisar");

  const clienteId = sp.cliente ?? clientes[0]?.id;
  const filtro = sp.mp ?? "todos";
  const [produtos, contas, produto] = await Promise.all([
    clienteId ? produtosDoCliente(clienteId, escopo) : [],
    clienteId ? contasDoCliente(clienteId) : [],
    sp.produto ? produtoDoUsuario(sp.produto, escopo) : null,
  ]);
  const regua = produto ? await reguaDoProduto(produto) : null;

  // o filtro é feito aqui, sobre a lista já carregada, para as contagens de
  // cada aba saírem do mesmo lugar que a lista e nunca discordarem dela
  const porMarketplace = (mp: string) => produtos.filter((p) => p.marketplace === mp).length;
  const visiveis = filtro === "todos" ? produtos : produtos.filter((p) => p.marketplace === filtro);
  const abas = [
    { valor: "todos", label: "Todos", total: produtos.length },
    { valor: "mercado_livre", label: "Mercado Livre", total: porMarketplace("mercado_livre") },
    { valor: "shopee", label: "Shopee", total: porMarketplace("shopee") },
  ].filter((a) => a.total > 0 || a.valor === "todos");

  // acima da mediana é o alerta; o verde fica para quem está abaixo
  const acima = produto && regua?.analise.total ? diferencaRelativa(produto.price, regua.analise.mediana) : 0;

  return (
    <>
      <PageHeader
        title="Preços do mercado"
        subtitle="Compara o anúncio da loja com os concorrentes do mesmo produto, na mesma plataforma"
      />

      {sp.erro && (
        <div className="mb-4 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-medium text-ink">Não deu para importar agora.</p>
          <p className="mt-1 text-xs text-muted">{sp.erro}</p>
        </div>
      )}
      {sp.importados !== undefined && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          {sp.importados} {sp.importados === "1" ? "anúncio importado" : "anúncios importados"}
          {sp.precos && sp.precos !== "0"
            ? ` · ${sp.precos} ${sp.precos === "1" ? "mudança de preço detectada" : "mudanças de preço detectadas"}`
            : ""}.
        </div>
      )}
      {sp.achados !== undefined && (
        <div className="flash mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-2.5 text-sm font-medium text-ok">
          Busca concluída: {sp.achados} {sp.achados === "1" ? "anúncio conferido" : "anúncios conferidos"}
          {sp.fora && sp.fora !== "0" ? ` · ${sp.fora} descartados por não bater com a fonte` : ""}
          {sp.proprios && sp.proprios !== "0" ? ` · ${sp.proprios} da própria loja ignorados` : ""}.
        </div>
      )}

      <Card title="Cliente" subtitle="Os produtos são os anúncios da própria loja, importados do marketplace">
        <form className="flex flex-wrap items-end gap-3">
          <Field label="Cliente">
            <select name="cliente" defaultValue={clienteId} className="input">
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton size="sm" variant="ghost" pendingLabel="Abrindo…">
            Abrir
          </SubmitButton>
        </form>

        {contas.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {contas.map((conta) => (
              <form key={conta.id} action={importarAnunciosAction}>
                <input type="hidden" name="conta_id" value={conta.id} />
                <SubmitButton size="sm" variant="ghost" pendingLabel="Importando…">
                  Importar anúncios do {marketplaceLabel(conta.marketplace)} ({conta.produtos})
                </SubmitButton>
              </form>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card
          title="Anúncios da loja"
          bodyClassName="p-0"
          actions={
            produtos.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {abas.map((aba) => (
                  <Link
                    key={aba.valor}
                    href={`/precos?cliente=${clienteId}${aba.valor === "todos" ? "" : `&mp=${aba.valor}`}`}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      filtro === aba.valor
                        ? "bg-brand text-white"
                        : "border border-line text-muted hover:border-line-strong"
                    }`}
                  >
                    {aba.label} ({aba.total})
                  </Link>
                ))}
              </div>
            ) : null
          }
        >
          {visiveis.length === 0 ? (
            <Empty
              title={produtos.length ? "Nenhum anúncio nesta plataforma" : "Nenhum anúncio importado"}
              hint={
                produtos.length
                  ? "A loja tem anúncios, mas não nesta plataforma."
                  : "Importe os anúncios da loja para começar a comparar."
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visiveis.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/precos?cliente=${p.client_id}${filtro === "todos" ? "" : `&mp=${filtro}`}&produto=${p.id}`}
                    className={`block px-4 py-3 transition-colors hover:bg-surface-2 ${
                      p.id === produto?.id ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="line-clamp-2 text-sm text-ink">{p.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <MarketplaceChip value={p.marketplace} />
                      {brl(p.price)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          {!produto || !regua ? (
            <Card>
              <Empty title="Escolha um anúncio" hint="A régua de preços aparece aqui." />
            </Card>
          ) : (
            <>
              <Card
                title={produto.title}
                subtitle={
                  regua.fonte === "api"
                    ? "Preço exato, do catálogo oficial do Mercado Livre"
                    : regua.atualizadoEm
                      ? `Preço estimado, lido da web em ${dateTimeBR(regua.atualizadoEm)}`
                      : "Preço estimado, lido da web"
                }
                actions={
                  regua.fonte === "busca" && podePesquisar ? (
                    <form action={buscarConcorrentesAction}>
                      <input type="hidden" name="produto_id" value={produto.id} />
                      <SubmitButton size="sm" pendingLabel="Buscando… (~30s)">
                        Buscar concorrentes agora
                      </SubmitButton>
                    </form>
                  ) : null
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Stat label="Seu preço" value={brl(produto.price)} tone="brand" />
                  <Stat
                    label="Mediana do mercado"
                    value={brl(regua.analise.mediana)}
                    hint={
                      regua.analise.total
                        ? acima > 0
                          ? `você está ${pct(acima)} acima`
                          : `você está ${pct(Math.abs(acima))} abaixo`
                        : "sem concorrentes"
                    }
                    tone={!regua.analise.total ? "neutral" : acima > 0.1 ? "bad" : acima > 0 ? "warn" : "ok"}
                  />
                  <Stat label="Média aparada" value={brl(regua.analise.mediaAparada)} hint="sem as duas pontas" />
                  <Stat label="Menor preço" value={brl(regua.analise.minimo)} />
                  <Stat
                    label="Analisados"
                    value={String(regua.analise.total)}
                    hint={regua.fonte === "api" ? "preço exato" : "preço estimado"}
                  />
                </div>

                {regua.observacao && (
                  <p className="mt-3 rounded-[12px] border border-line bg-surface-2 px-4 py-3 text-xs text-muted">
                    {regua.observacao}
                  </p>
                )}
              </Card>

              <Card className="mt-3" title="Concorrentes" bodyClassName="p-0">
                {regua.analise.total === 0 ? (
                  <Empty
                    title={
                      regua.semPermissao
                        ? "Falta liberar a leitura de anúncios"
                        : regua.fonte === "api"
                          ? regua.casaram === 0
                            ? "Nenhum produto casou com esse título"
                            : "Ninguém mais vende este produto"
                          : regua.atualizadoEm
                            ? "A busca não achou anúncio confiável"
                            : "Ainda não buscamos os concorrentes"
                    }
                    hint={
                      regua.semPermissao
                        ? "O Mercado Livre recusa a consulta ao catálogo enquanto o app não tiver a permissão de anúncios. É a mesma pendência das infrações: o lojista precisa autorizar de novo."
                        : regua.fonte === "api"
                          ? regua.casaram === 0
                            ? "Tente um nome mais curto e genérico: o catálogo casa por produto, não pela frase inteira do anúncio."
                            : "O produto existe no catálogo, mas nenhum outro vendedor tem anúncio ativo nele. Em algumas categorias cada vendedor cria o próprio anúncio, e aí não há catálogo para comparar."
                          : regua.atualizadoEm
                            ? "Só entra aqui o anúncio cujo preço foi conferido no próprio texto da página. É melhor não mostrar nada do que mostrar preço inventado."
                            : podePesquisar
                              ? "A busca leva uns 30 segundos e custa por execução, então só roda quando você pede."
                              : "Peça a um gestor para disparar a busca."
                    }
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="data responsiva">
                      <thead>
                        <tr>
                          <th>Anúncio</th>
                          <th>Vendedor</th>
                          <th className="num">Preço</th>
                          <th className="num">Comparado ao seu</th>
                          {regua.fonte === "busca" && <th>De onde veio o preço</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {regua.analise.ordenados.map((c) => {
                          const dif = diferencaRelativa(produto.price, c.preco);
                          return (
                            <tr key={c.idExterno}>
                              <td data-label="Anúncio">
                                {c.url ? (
                                  <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand hover:underline"
                                  >
                                    {c.titulo}
                                  </a>
                                ) : (
                                  c.titulo
                                )}
                              </td>
                              <td data-label="Vendedor">{c.vendedor ?? "—"}</td>
                              <td data-label="Preço" className="num">
                                {brl(c.preco)}
                              </td>
                              <td data-label="Comparado ao seu" className="num">
                                <Chip tone={dif > 0 ? "warn" : dif < 0 ? "ok" : "neutral"}>
                                  {dif > 0
                                    ? `você ${pct(dif)} acima`
                                    : dif < 0
                                      ? `você ${pct(Math.abs(dif))} abaixo`
                                      : "igual"}
                                </Chip>
                              </td>
                              {regua.fonte === "busca" && (
                                <td data-label="De onde veio o preço" className="text-xs text-muted">
                                  {c.trechoOrigem ?? "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
