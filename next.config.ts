import type { NextConfig } from "next";

/**
 * The whole site is statically prerenderable — no API routes, no server
 * actions, no image optimisation — so it can be exported to flat files and
 * served free from GitHub Pages.
 *
 * The export is opt-in via NEXT_EXPORT so that `npm run dev` and `npm start`
 * keep behaving exactly as they always have locally; CI turns it on.
 */
const isExport = process.env.NEXT_EXPORT === "true";

/**
 * GitHub Pages serves a project repo from /<repo-name>, so every asset URL
 * needs that prefix. A user/organisation site (<user>.github.io) serves from
 * the root and must have no prefix. CI works out which and sets this.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  experimental: {
    optimizePackageImports: ["@react-three/drei", "framer-motion"],
  },

  ...(isExport
    ? {
        output: "export" as const,
        // Pages has no image optimiser behind it.
        images: { unoptimized: true },
        // Emits /index.html rather than /index, which static hosts prefer.
        trailingSlash: true,
      }
    : {}),

  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
