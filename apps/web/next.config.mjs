/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Vercel build container is 4 cores / 8GB. Type-checking + ESLint over the
  // heavy crypto deps (thirdweb, snarkjs, ffjavascript, semaphore) ran the container
  // out of memory (exit 137 / SIGKILL) right after webpack compile. Move both passes
  // out of the production build — run `turbo run typecheck` / `lint` in CI instead.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // The Netizen mini-app SDK ships untranspiled TS source (main: src/index.ts),
  // so it must be transpiled by the app that consumes it.
  transpilePackages: ["@netizen/miniapp-sdk"],
  // Keep heavy server-only packages OUT of the webpack bundle (loaded from
  // node_modules at runtime instead). @safe-global/protocol-kit pulls in
  // @safe-global/safe-deployments — multi-MB of all-chain Safe contract JSON —
  // which, when bundled, blew the 8GB build container's memory (exit 137 / OOM).
  // These are imported server-side only (safe-server.ts / api-kit.ts).
  // `typescript` is required at runtime by the AI-builder preview route (it
  // transpiles generated TSX in a node:vm); keep it external so it loads from
  // node_modules instead of being bundled.
  serverExternalPackages: [
    "pino-pretty",
    "got",
    "typescript",
    "@safe-global/protocol-kit",
    "@safe-global/api-kit",
    "@safe-global/safe-deployments",
    "@safe-global/safe-modules-deployments",
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        got: false,
        // react-pdf/pdfjs reference node "canvas" which is not needed in the browser
        canvas: false,
      };
    }
    return config;
  },
  // Headers for Universal Links (iOS) and App Links (Android)
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/wasm/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
