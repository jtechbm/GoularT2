import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elleva — Operação que cresce",
  description: "Sistema interno de gestão da carteira de clientes, marketplaces, ads e tarefas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* evita o flash de tema errado antes da hidratação */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
