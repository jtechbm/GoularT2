import Link from "next/link";
import { Card, Chip } from "./ui";
import { dateBR, relativeBR } from "@/lib/format";
import { NIVEL_LABEL, posicaoNivel } from "@/lib/penalidades/regras";
import type { PenalidadeRow } from "@/lib/queries";

const TOM: Record<number, "bad" | "warn" | "ok"> = { 1: "bad", 2: "bad", 3: "warn", 4: "ok", 5: "ok" };

/**
 * Reputação e penalidades abertas do cliente, na visão geral.
 *
 * Mostra a cor real mesmo quando a conta está protegida pelo Decola. A cor
 * exibida pelo Mercado Livre nesse período é enganosa de propósito, e quem
 * cuida da conta precisa saber o que vem quando a proteção acabar.
 */
export function PenalidadesCliente({
  clientId,
  penalidades,
  contas,
}: {
  clientId: string;
  penalidades: PenalidadeRow[];
  contas: {
    id: string;
    level_id: string | null;
    real_level: string | null;
    protection_end_date: string | null;
    items_permission: string | null;
    penalties_checked_at: string | null;
  }[];
}) {
  const relevantes = penalidades.filter((p) => p.severity !== "informativo");

  return (
    <Card
      title="Penalidades"
      subtitle={relevantes.length ? `${relevantes.length} em aberto` : "nada em aberto"}
      actions={
        <Link href={`/penalidades?cliente=${clientId}`} className="link-more">
          Ver todas
        </Link>
      }
    >
      <ul className="space-y-2">
        {contas.map((c) => {
          const efetivo = c.real_level ?? c.level_id;
          const pos = posicaoNivel(efetivo);
          const protegida = Boolean(c.real_level && c.real_level !== c.level_id);
          return (
            <li key={c.id} className="text-xs">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">Reputação no Mercado Livre</span>
                {pos ? (
                  <Chip tone={TOM[pos]}>{NIVEL_LABEL[efetivo!] ?? efetivo}</Chip>
                ) : (
                  <span className="text-dim">ainda não lida</span>
                )}
              </span>
              {protegida && (
                <span className="mt-0.5 block text-[0.65rem] text-warn">
                  Protegida pelo Decola: o Mercado Livre exibe {NIVEL_LABEL[c.level_id!] ?? c.level_id}
                  {c.protection_end_date && ` até ${dateBR(c.protection_end_date)}`}.
                </span>
              )}
              {c.items_permission === "pendente" && (
                <span className="mt-0.5 block text-[0.65rem] text-dim">
                  Infrações de anúncio não são lidas: falta permissão no app.
                </span>
              )}
              {c.penalties_checked_at && (
                <span className="mt-0.5 block text-[0.65rem] text-dim">
                  verificado {relativeBR(c.penalties_checked_at)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {relevantes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {relevantes.slice(0, 4).map((p) => (
            <li key={p.id} className="flex items-start gap-2 text-xs">
              <Chip tone={p.severity === "critico" ? "bad" : "warn"}>{p.severity === "critico" ? "crítica" : "atenção"}</Chip>
              <span className="text-ink">{p.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
