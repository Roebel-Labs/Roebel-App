/**
 * Chart colors. Single-series trends use the brand navy; categories use the validated reference
 * categorical slots in FIXED order (dataviz palette.md, light/dark stepped separately).
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;

export function seriesColors(isDark: boolean): readonly string[] {
  return isDark ? SERIES_DARK : SERIES_LIGHT;
}

/** Brand trend color (navy) and its dark-mode step. */
export function trendColor(isDark: boolean): string {
  return isDark ? '#5B9BE0' : '#00498B';
}
