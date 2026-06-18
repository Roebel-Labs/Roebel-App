import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite + React 19 + Tailwind v4. Runs as a Circles miniapp (loaded in the Circles
// app's iframe). `base: "./"` keeps asset paths relative so it works under any host path.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5174, host: true },
});
