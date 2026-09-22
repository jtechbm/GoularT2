import type { Metadata, Viewport } from "next";
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
  // "Adicionar à Tela de Início" no iPhone: abre em tela cheia, sem a barra
  // do Safari, com o nome curto embaixo do ícone (o ícone é app/apple-icon.png)
  appleWebApp: { capable: true, title: "Elleva", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // a barra de status do celular acompanha o tema
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
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
