"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/format";
import { IconCalendar, IconChevronDown } from "./icons";

/** Troca o mês de referência mantendo os demais filtros da URL. */
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
    <label className="relative flex cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong bg-surface py-2 pl-3 pr-8 text-sm text-ink transition-colors hover:border-brand">
      <IconCalendar size={16} className="shrink-0 text-muted" />
      <select
        className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-ink outline-none"
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
      <IconChevronDown size={15} className="pointer-events-none absolute right-2.5 text-muted" />
    </label>
  );
}
