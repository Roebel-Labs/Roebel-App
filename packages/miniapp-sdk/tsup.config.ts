import { defineConfig } from "tsup";

// Builds the npm-publishable output. The monorepo consumes ./src directly (see the
// `main`/`exports` in package.json); `publishConfig` swaps those to ./dist on publish.
// Two entry points → the "." and "./host" subpaths.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    host: "src/host/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: false,
  target: "es2020",
});
