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
  IconAlert,
  IconBell,
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
  { href: "/alertas", label: "Atenção", Icon: IconAlert },
  { href: "/ads", label: "Ads", Icon: IconMegaphone },
  { href: "/financeiro", label: "Financeiro", Icon: IconDollar, roles: ["admin", "gestor"] },
  { href: "/tarefas", label: "Tarefas", Icon: IconCheckSquare },
  { href: "/equipe", label: "Equipe", Icon: IconUsers },
  { href: "/notificacoes", label: "Notificações", Icon: IconBell },
  { href: "/chat", label: "Chat", Icon: IconChat },
  // a tela das conexões é do admin; gestor e membro sincronizam pelo cliente
  { href: "/integracoes", label: "Integrações", Icon: IconSync, roles: ["admin"] },
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

export function Sidebar({
  user,
  pendingTasks = 0,
  naoLidas = 0,
}: {
  user: User;
  pendingTasks?: number;
  naoLidas?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((i) => !i.roles || i.roles.includes(user.role)).map(({ href, label, Icon, exact }) => {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    // o contador fica no item, não num sininho separado: um número no menu
    // que a pessoa já usa é mais visto do que um ícone a mais no topo
    const badge = href === "/notificacoes" ? naoLidas : href === "/tarefas" ? pendingTasks : 0;
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
        {badge > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold text-white ${
              href === "/notificacoes" ? "bg-accent" : "bg-brand"
            }`}
          >
            {badge > 99 ? "99+" : badge}
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

      {/* no celular o menu cobre a tela: meia tela de menu sobre meia tela
          de conteudo confunde mais do que ajuda */}
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`${
          open ? "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[300px] overflow-y-auto" : "hidden"
        } shrink-0 flex-col border-line bg-surface p-3 lg:sticky lg:top-0 lg:left-auto lg:z-auto lg:flex lg:h-screen lg:w-[236px] lg:max-w-none lg:border-r`}
      >
        <div className="mb-6 flex items-center justify-between px-2 pt-3">
          <Link href="/" onClick={() => setOpen(false)}>
            <Wordmark />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="btn btn-ghost btn-sm lg:hidden"
          >
            ✕
          </button>
        </div>

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
