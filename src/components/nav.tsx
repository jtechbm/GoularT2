"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { logoutAction } from "@/lib/actions/auth";
import {
  EllevaMark,
  IconChat,
  IconChevronDown,
  IconCheckSquare,
  IconDollar,
  IconHome,
  IconMegaphone,
  IconMenu,
  IconPower,
  IconSync,
  IconUser,
  IconUsers,
} from "./icons";
import type { User } from "@/lib/types";

const NAV: { href: string; label: string; Icon: typeof IconHome; exact?: boolean; roles?: string[] }[] = [
  { href: "/", label: "Dashboard", Icon: IconHome, exact: true },
  { href: "/clientes", label: "Clientes", Icon: IconUser },
  { href: "/ads", label: "Ads", Icon: IconMegaphone },
  { href: "/financeiro", label: "Financeiro", Icon: IconDollar, roles: ["admin", "gestor"] },
  { href: "/tarefas", label: "Tarefas", Icon: IconCheckSquare },
  { href: "/equipe", label: "Equipe", Icon: IconUsers },
  { href: "/chat", label: "Chat", Icon: IconChat },
  { href: "/integracoes", label: "Marketplaces", Icon: IconSync },
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", gestor: "Gestor", membro: "Membro" };

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <EllevaMark size={lg ? 40 : 28} />
      <span className={`font-bold tracking-tight ${lg ? "text-3xl" : "text-xl"}`}>Elleva</span>
    </span>
  );
}

export function Sidebar({ user, pendingTasks = 0 }: { user: User; pendingTasks?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((i) => !i.roles || i.roles.includes(user.role)).map(({ href, label, Icon, exact }) => {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
          active
            ? "bg-brand-soft font-medium text-brand"
            : "text-muted hover:bg-surface-3 hover:text-ink"
        }`}
      >
        <Icon size={19} className={active ? "text-brand" : "text-dim"} />
        <span className="flex-1">{label}</span>
        {href === "/tarefas" && pendingTasks > 0 && (
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
            {pendingTasks}
          </span>
        )}
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <IconMenu size={18} />
          </button>
        </div>
      </div>

      <aside
        className={`${
          open ? "flex" : "hidden"
        } w-full shrink-0 flex-col border-b border-line bg-surface p-3 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[236px] lg:border-b-0 lg:border-r`}
      >
        <Link href="/" className="mb-6 hidden px-2 pt-3 lg:block">
          <Wordmark />
        </Link>

        <nav className="flex flex-col gap-1">{items}</nav>

        <div className="mt-auto space-y-2 pt-4">
          <ThemeToggle />
          <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-2.5 py-2">
            <Avatar name={user.name} color={user.color} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{user.name.split(" ")[0]}</div>
              <div className="text-xs text-muted">{ROLE_LABEL[user.role] ?? user.role}</div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Sair"
                aria-label="Sair"
                className="flex text-dim transition-colors hover:text-bad"
              >
                <IconPower size={17} />
              </button>
            </form>
            <IconChevronDown size={15} className="hidden text-dim" />
          </div>
        </div>
      </aside>
    </>
  );
}
