"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size,
  className = "",
  confirm,
  title,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "accent" | "ghost" | "danger";
  size?: "sm";
  className?: string;
  confirm?: string;
  title?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {pending ? (pendingLabel ?? "Salvando…") : children}
    </button>
  );
}

/**
 * Barra fixa de salvamento no fim do formulário.
 * Nada nesta aplicação salva sozinho: toda alteração passa por este botão.
 */
export function SaveBar({
  label = "Salvar alterações",
  hint,
  extra,
}: {
  label?: string;
  hint?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-b-[var(--radius-xl2)] border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
      <div className="text-xs text-dim">{hint ?? "As alterações só são gravadas ao clicar em salvar."}</div>
      <div className="flex items-center gap-2">
        {extra}
        <SubmitButton>{label}</SubmitButton>
      </div>
    </div>
  );
}
