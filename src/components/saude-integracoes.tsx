import Link from "next/link";
import { Card, Chip, MarketplaceChip } from "./ui";
import { relativeBR } from "@/lib/format";

interface Conta {
  id: string;
  client_id: string;
  client_name: string;
  marketplace: string;
  last_error: string | null;
  last_sync_at: string | null;
}

/**
 * Um sistema que sincroniza sozinho precisa dizer quando parou de sincronizar.
 * Sem isto, o número simplesmente congela e ninguém percebe por semanas.
 */
export function SaudeIntegracoes({
  conectadas,
  comErro,
  paradas,
  ultimoCron,
}: {
  conectadas: number;
  comErro: Conta[];
  paradas: Conta[];
  ultimoCron: { created_at: string; status: string; message: string | null } | null;
}) {
  const problemas = comErro.length + paradas.length;

  // nada conectado ainda: não vale ocupar espaço no dashboard
  if (!conectadas && !problemas) return null;

  const cronVelho = !ultimoCron || Date.now() - new Date(ultimoCron.created_at).getTime() > 2 * 864e5;

  return (
    <Card
      title="Integrações"
      subtitle={
        problemas
          ? `${problemas} ${problemas === 1 ? "conta precisa" : "contas precisam"} de atenção`
          : "todas atualizando normalmente"
      }
      actions={
        <Link href="/integracoes" className="link-more">
          Ver todas
        </Link>
      }
    >
      {problemas === 0 && !cronVelho ? (
        <p className="text-sm text-muted">
          {conectadas} {conectadas === 1 ? "conta conectada" : "contas conectadas"}, sincronizadas automaticamente
          todo dia.
        </p>
      ) : (
        <ul className="space-y-2">
          {comErro.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clientes/${c.client_id}`}
                className="block rounded-[10px] border border-bad/30 bg-bad-soft px-3 py-2.5 transition-colors hover:border-bad"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{c.client_name}</span>
                  <MarketplaceChip value={c.marketplace} />
                  <Chip tone="bad">com erro</Chip>
                </span>
                {c.last_error && <span className="mt-1 block text-xs text-bad">{c.last_error}</span>}
              </Link>
            </li>
          ))}

          {paradas.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clientes/${c.client_id}`}
                className="block rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2.5 transition-colors hover:border-warn"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{c.client_name}</span>
                  <MarketplaceChip value={c.marketplace} />
                  <Chip tone="warn">
                    {c.last_sync_at ? `parada desde ${relativeBR(c.last_sync_at)}` : "nunca sincronizou"}
                  </Chip>
                </span>
              </Link>
            </li>
          ))}

          {cronVelho && (
            <li className="rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2.5">
              <span className="text-sm font-medium text-ink">Sincronização automática</span>
              <span className="mt-0.5 block text-xs text-warn">
                {ultimoCron
                  ? `A última rodada foi ${relativeBR(ultimoCron.created_at)}. Deveria rodar todo dia.`
                  : "Nunca rodou. Avise o administrador do Elleva."}
              </span>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
