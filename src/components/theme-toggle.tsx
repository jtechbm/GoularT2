"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "dark" | "light";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('elleva-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (document.documentElement.getAttribute("data-theme") as Theme) || "light";
    setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("elleva-theme", next);
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
        {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 p-1">
      {(["light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            theme === t ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink"
          }`}
        >
          {t === "light" ? <IconSun size={14} /> : <IconMoon size={14} />}
          {t === "light" ? "Claro" : "Escuro"}
        </button>
      ))}
    </div>
  );
}
