import localFont from "next/font/local";

/**
 * Mona Sans — the Röbel / Netizen primary typeface (GitHub, SIL OFL 1.1).
 *
 * A single variable file spans weight 200–900 AND the width axis (75–125%), so
 * this one face covers both "Mona Sans" (body/UI, `--font-sans` + `--font-heading`)
 * and "Mona Sans SemiCondensed" (headings, applied via `font-stretch: 87.5%`
 * in globals.css). Never load Google Fonts / Inter / system-ui as the primary
 * face — the fonts ship self-hosted in `public/fonts/`.
 */
export const monaSans = localFont({
  src: "../public/fonts/mona-sans/MonaSansVF.woff2",
  variable: "--font-mona-sans",
  display: "swap",
  weight: "200 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});

/**
 * Mona Sans Mono — variable monospace companion (weight 200–900).
 * Used for figures/amounts (with `tabular-nums`) and any code.
 */
export const monaSansMono = localFont({
  src: "../public/fonts/mona-sans/MonaSansMonoVF.woff2",
  variable: "--font-mona-sans-mono",
  display: "swap",
  weight: "200 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});
