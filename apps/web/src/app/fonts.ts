import localFont from "next/font/local";

/**
 * Mona Sans — the Röbel App primary typeface (GitHub, SIL OFL 1.1).
 *
 * A single variable file spans weight 200–900 AND the width axis (75–125%),
 * so this one face covers both "Mona Sans" and "Mona Sans SemiCondensed"
 * (SemiCondensed = `font-stretch: 87.5%`). Used for body/UI text and, at
 * SemiCondensed Bold, for headlines (see `.font-heading` in globals.css).
 */
export const monaSans = localFont({
  src: "../../public/fonts/mona-sans/MonaSansVF.woff2",
  variable: "--font-mona-sans",
  display: "swap",
  weight: "200 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});

/**
 * Mona Sans Mono — variable monospace companion (weight 200–900).
 * Used for code, addresses and tabular numbers.
 */
export const monaSansMono = localFont({
  src: "../../public/fonts/mona-sans/MonaSansMonoVF.woff2",
  variable: "--font-mona-sans-mono",
  display: "swap",
  weight: "200 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});
