"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Troca o cliente da tela na hora, sem botão de confirmar.
 *
 * Existe por causa de um erro real: com um `select` dentro de formulário e um
 * botão "Abrir", a pessoa escolhia a loja na lista, clicava direto em
 * "Analisar agora" e o servidor analisava a loja anterior — a que ainda
 * estava na URL. Escolher e navegar viraram o mesmo gesto para essa
 * armadilha não existir.
 *
 * O parâmetro da análise aberta é descartado na troca: análise de um cliente
 * não vale para o outro.
 */
export function ClientePicker({
  clientes,
  value,
  param = "cliente",
  descartar = ["a", "pronta", "erro"],
}: {
  clientes: { id: string; name: string; hint?: string }[];
  value: string;
  param?: string;
  descartar?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(next: string) {
    const params = new URLSearchParams(search.toString());
    params.set(param, next);
    for (const p of descartar) params.delete(p);
    router.push(`${pathname}?${params}`);
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => go(e.target.value)}
      aria-label="Cliente"
    >
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.hint ? ` — ${c.hint}` : ""}
        </option>
      ))}
    </select>
  );
}
