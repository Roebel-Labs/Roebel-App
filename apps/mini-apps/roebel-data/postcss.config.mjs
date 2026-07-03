/** Tailwind v4 uses the PostCSS plugin (no tailwind.config.js needed — tokens
 *  live in `app/globals.css` via `@theme`). */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
