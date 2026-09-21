"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/format";
import { IconCalendar, IconChevronDown } from "./icons";

/**
 * Troca o mês de referência mantendo os demais filtros da URL.
 *
 * O select nativo fica invisível por cima da caixa inteira. Antes ele ocupava
 * só a largura do texto: clicar no ícone, na seta ou na borda (que parecem
 * parte do botão) não abria nada, e o seletor parecia quebrado.
 */
export function MonthPicker({ months, value, param = "mes" }: { months: string[]; value: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(next: string) {
    const params = new URLSearchParams(search.toString());
    params.set(param, next);
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="relative flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface py-2 pl-3 pr-8 text-sm text-ink transition-colors focus-within:border-brand hover:border-brand">
      <IconCalendar size={16} className="shrink-0 text-muted" />
      <span className="font-medium">{monthLabel(value)}</span>
      <IconChevronDown size={15} className="pointer-events-none absolute right-2.5 text-muted" />
      <select
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={value}
        onChange={(e) => go(e.target.value)}
        aria-label="Mês de referência"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
