import type { Metadata } from "next";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoularT — Operação interna",
  description: "Sistema interno de gestão da carteira de clientes, marketplaces, ads e tarefas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* evita o flash de tema errado antes da hidratação */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
