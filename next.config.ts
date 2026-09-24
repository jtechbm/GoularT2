import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    // O dev e o build não podem compartilhar chunks. Isso evita "Cannot find
    // module ./xxxx.js" quando um build roda com o localhost aberto.
    distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
    experimental: {
      serverActions: { bodySizeLimit: "4mb" },
    },
  };
}
