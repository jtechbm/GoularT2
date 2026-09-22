import type { MetadataRoute } from "next";

/**
 * O sistema como aplicativo: "Adicionar à Tela de Início" no iPhone (Safari)
 * e "Instalar app" no Android (Chrome). Abre sem a barra do navegador, com o
 * ícone da marca, direto na tela inicial de cada um.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Elleva",
    short_name: "Elleva",
    description: "Gestão da carteira, marketplaces, ads e tarefas.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "pt-BR",
    icons: [
      { src: "/marca/elleva-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/elleva-512.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/elleva-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
