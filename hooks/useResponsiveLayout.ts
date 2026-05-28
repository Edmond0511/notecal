import { useWindowDimensions } from "react-native";

/**
 * Apple's "Regular" horizontal size class typically kicks in at 768pt+.
 * Anything below that we treat as compact (iPhone-like) — which is also
 * correct for iPad multitasking (1/3 Split View ≈ 320pt, 1/2 ≈ 507pt).
 */
const REGULAR_WIDTH_BREAKPOINT = 768;

/**
 * Comfortable reading width for centered iPhone-tuned content on iPad.
 * Roughly matches the widest iPhone (Pro Max ~430pt) plus a touch of
 * breathing room — keeps phone-shaped UI from stretching uncomfortably.
 */
const CONTENT_MAX_WIDTH = 560;

/**
 * Sheets/modals present as a centered floating card on iPad.
 * Slightly wider than CONTENT_MAX_WIDTH so the sheet itself feels
 * intentional rather than a thin strip.
 */
const SHEET_MAX_WIDTH = 600;

export interface ResponsiveLayout {
  width: number;
  height: number;
  /** True when running at iPad-regular width or larger. */
  isRegular: boolean;
  /** True when running at iPhone / iPad-multitasking-compact width. */
  isCompact: boolean;
  /** Max width for centered primary content (forms, hero copy, lists). */
  contentMaxWidth: number;
  /** Max width for centered bottom sheets / modal cards on iPad. */
  sheetMaxWidth: number;
  /** Grid column count for action menus. 3 on iPad, 2 on iPhone. */
  actionGridColumns: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isRegular = width >= REGULAR_WIDTH_BREAKPOINT;
  return {
    width,
    height,
    isRegular,
    isCompact: !isRegular,
    contentMaxWidth: isRegular ? CONTENT_MAX_WIDTH : width,
    sheetMaxWidth: isRegular ? SHEET_MAX_WIDTH : width,
    actionGridColumns: isRegular ? 3 : 2,
  };
}
