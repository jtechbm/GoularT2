"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('goulart-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("goulart-theme", next);
    } catch {
      /* storage indisponível — apenas mantém na sessão */
    }
  }

  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => apply(isDark ? "light" : "dark")}
        className="btn btn-ghost btn-sm"
        title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
        aria-label="Alternar tema"
      >
        {isDark ? "☀" : "☾"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
      {(["dark", "light"] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          className={`flex-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            theme === t ? "bg-brand text-white" : "text-dim hover:text-ink"
          }`}
        >
          {t === "dark" ? "☾ Escuro" : "☀ Claro"}
        </button>
      ))}
    </div>
  );
}
