"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/format";

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

  const idx = months.indexOf(value);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
      <button
        type="button"
        className="btn btn-ghost btn-sm border-0 bg-transparent"
        disabled={idx <= 0}
        onClick={() => go(months[idx - 1])}
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <select className="select !w-auto !border-0 !bg-transparent !py-1 text-sm font-semibold" value={value} onChange={(e) => go(e.target.value)}>
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-ghost btn-sm border-0 bg-transparent"
        disabled={idx < 0 || idx >= months.length - 1}
        onClick={() => go(months[idx + 1])}
        aria-label="Próximo mês"
      >
        ›
      </button>
    </div>
  );
}
