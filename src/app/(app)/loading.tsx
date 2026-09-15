/**
 * O que aparece no instante do clique, enquanto o servidor monta a tela.
 *
 * Sem isto, o Next segura a tela antiga até a nova ficar pronta, e o clique
 * parece não ter funcionado. Com um esqueleto no lugar, a troca de módulo
 * responde na hora e os números entram quando chegam.
 */
export default function Carregando() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 space-y-2">
        <div className="h-8 w-56 rounded-lg bg-surface-3" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-3" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-[14px] border border-line bg-surface" />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="h-72 rounded-[14px] border border-line bg-surface lg:col-span-2" />
        <div className="h-72 rounded-[14px] border border-line bg-surface" />
      </div>
    </div>
  );
}
