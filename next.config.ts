import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // permite gerar um build de medição fora do .next, sem corromper o servidor
  // de desenvolvimento que estiver rodando ao mesmo tempo
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
