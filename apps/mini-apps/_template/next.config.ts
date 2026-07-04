import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK ships as TypeScript source (like @roebel/blockchain), so Next must
  // transpile it. MANDATORY for every mini app — without this the build fails.
  transpilePackages: ["@netizen-labs/miniapp-sdk"],

  // Emit a self-contained server so this mini app deploys standalone (Vercel /
  // Docker / Fly) without the rest of the monorepo. The host loads it by its
  // own `homeUrl`; it never runs "inside" the Röbel app process.
  output: "standalone",

  // Mini apps are embedded cross-origin in a WebView / iframe. Nothing here
  // needs to be reachable from the host's origin, so no rewrites/headers.
  reactStrictMode: true,
};

export default nextConfig;
