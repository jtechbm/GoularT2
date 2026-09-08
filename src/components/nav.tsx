"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/lib/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧", exact: true },
  { href: "/clientes", label: "Clientes", icon: "◈" },
  { href: "/ads", label: "Ads", icon: "◭" },
  { href: "/tarefas", label: "Tarefas", icon: "☑" },
  { href: "/equipe", label: "Equipe", icon: "◉" },
  { href: "/chat", label: "Chat", icon: "◌" },
  { href: "/integracoes", label: "Integrações", icon: "⇄" },
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", gestor: "Gestor", membro: "Membro" };

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`font-black tracking-tight ${size === "lg" ? "text-3xl" : "text-xl"}`}>
      <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">Goular</span>
      <span className="text-accent">T</span>
    </span>
  );
}

export function Sidebar({ user, pendingTasks = 0 }: { user: User; pendingTasks?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = NAV.map((item) => {
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-brand-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <span className={`text-base leading-none ${active ? "text-accent" : "text-dim group-hover:text-brand"}`}>
          {item.icon}
        </span>
        <span className="flex-1">{item.label}</span>
        {item.href === "/tarefas" && pendingTasks > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.65rem] font-bold text-[var(--accent-contrast)]">
            {pendingTasks}
          </span>
        )}
        {active && <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand to-accent" />}
      </Link>
    );
  });

  return (
    <>
      {/* topo mobile */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Link href="/">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
            ☰
          </button>
        </div>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full shrink-0 border-b border-line bg-surface p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:border-b-0 lg:border-r`}
      >
        <div className="hidden lg:block">
          <Link href="/" className="block px-2 py-1">
            <Wordmark />
          </Link>
          <p className="mb-5 px-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-dim">Operação interna</p>
        </div>

        <nav className="flex flex-col gap-1">{items}</nav>

        <div className="mt-6 space-y-3 lg:absolute lg:bottom-4 lg:w-52">
          <ThemeToggle />
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
            <Avatar name={user.name} color={user.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">{user.name}</div>
              <div className="text-[0.65rem] text-dim">{ROLE_LABEL[user.role] ?? user.role}</div>
            </div>
            <form action={logoutAction}>
              <button type="submit" title="Sair" className="text-dim transition-colors hover:text-bad">
                ⏻
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
