import colors from './tokens/colors.json';
import typography from './tokens/typography.json';
import metrics from './tokens/metrics.json';
export { colors, typography, metrics };
export type ThemeName = keyof typeof colors;
export type Palette = typeof colors.dark;
export type TextSize = keyof typeof metrics.a11y.textScales;
export type TypeStyle = keyof typeof typography;
export function combinedTextScale(inAppScale: number, systemScale: number) {
  return Math.min(inAppScale * systemScale, metrics.a11y.maxCombinedScale);
}
