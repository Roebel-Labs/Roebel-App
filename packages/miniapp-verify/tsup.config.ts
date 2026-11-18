import { defineConfig } from "tsup";

// Builds the npm-publishable output. The monorepo consumes ./src directly; `publishConfig`
// swaps `main`/`exports` to ./dist on publish. jose and viem stay external.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  splitting: false,
  sourcemap: false,
  target: "es2020",
});
