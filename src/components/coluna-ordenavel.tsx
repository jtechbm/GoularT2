import Link from "next/link";
import { proximaOrdem, type Ordem } from "@/lib/ordem-clientes";

/**
 * Cabeçalho de tabela que ordena ao clicar.
 *
 * A ordem vai na URL, e não em estado do navegador: dá para mandar o link
 * "clientes que mais investem" para alguém e a pessoa abre a mesma lista.
 */
export function ColunaOrdenavel({
  coluna,
  atual,
  href,
  children,
  className = "",
}: {
  coluna: Ordem;
  atual: { ordem: Ordem; asc: boolean };
  /** monta a URL com o novo valor de `ordem`, preservando os outros filtros */
  href: (ordem: string) => string;
  children: React.ReactNode;
  className?: string;
}) {
  const ativa = atual.ordem === coluna;
  return (
    <th className={className} aria-sort={ativa ? (atual.asc ? "ascending" : "descending") : undefined}>
      <Link
        href={href(proximaOrdem(atual, coluna))}
        scroll={false}
        className={`inline-flex items-center gap-1 hover:text-brand ${ativa ? "text-brand" : ""}`}
      >
        {children}
        <span aria-hidden className={ativa ? "" : "opacity-30"}>
          {ativa && atual.asc ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}
