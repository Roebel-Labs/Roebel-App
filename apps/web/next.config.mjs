/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Vercel build container is 4 cores / 8GB. Type-checking + ESLint over the
  // heavy crypto deps (thirdweb, snarkjs, ffjavascript, semaphore) ran the container
  // out of memory (exit 137 / SIGKILL) right after webpack compile. Move both passes
  // out of the production build — run `turbo run typecheck` / `lint` in CI instead.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ["pino-pretty", "got"],
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
