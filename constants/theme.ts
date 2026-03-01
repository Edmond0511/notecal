/**
 * NoteCal Design Tokens — Warm Sage palette.
 * Import `Tokens` for all new work. Legacy `Colors` kept for backward compat.
 */

import { Platform } from 'react-native';

// ── Design Tokens ──────────────────────────────────────────────────────

export const Tokens = {
  // Backgrounds
  background: '#FAFAF7',
  surface: '#F4F3EF',
  surfaceRaised: '#FFFFFF',

  // Text
  textPrimary: '#1C1C1E',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',

  // Accent (deep teal — from original colour palette commit)
  accent: '#1A6872',
  accentBright: '#1A6872',
  accentTint: '#E0F2F1',

  // Borders & dividers
  border: '#E8E7E3',

  // Semantic
  error: '#C62828',
  errorTint: '#FFEBEE',

  // Macro colors (unchanged — already well-differentiated)
  macroKcal: '#FF6B35',
  macroProtein: '#4A90D9',
  macroFat: '#F5A623',
  macroCarbs: '#9B6B9E',

  // Shadows
  shadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  } as const,
  shadowMedium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  } as const,

  // Typography scale (iOS HIG sizes)
  fontSize: {
    sm: 12,
    body: 17,
    title: 20,
  },
} as const;

// ── Legacy Colors (kept for backward compat) ──────────────────────────

const tintColorLight = Tokens.accent;
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: Tokens.textPrimary,
    background: Tokens.background,
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
