import { useAppStore } from "@/store/app-store";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { Keyboard } from "react-native";
import type PagerView from "react-native-pager-view";

// YYYYMMDD string ↔ Date helpers
function parseDate(dateString: string): Date {
  return new Date(
    Number.parseInt(dateString.substring(0, 4)),
    Number.parseInt(dateString.substring(4, 6)) - 1,
    Number.parseInt(dateString.substring(6, 8)),
  );
}

function formatDate(date: Date): string {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0")
  );
}

function addDays(dateString: string, days: number): string {
  const d = parseDate(dateString);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

interface UseDatePagerOptions {
  onBeforeNavigate?: () => void; // called before date change to save current document
}

export function useDatePager(options?: UseDatePagerOptions) {
  const currentDate = useAppStore((state) => state.currentDate);
  const setCurrentDate = useAppStore((state) => state.setCurrentDate);
  const pagerRef = useRef<PagerView>(null);
  // Guard against double-fires from onPageSelected
  const isResettingRef = useRef(false);
  // Store callback in ref so useCallback deps stay stable across re-renders
  const onBeforeNavigateRef = useRef(options?.onBeforeNavigate);
  onBeforeNavigateRef.current = options?.onBeforeNavigate;

  // 3-page window: [prev, current, next]
  const dates = useMemo<[string, string, string]>(
    () => [addDays(currentDate, -1), currentDate, addDays(currentDate, 1)],
    [currentDate],
  );

  const onPageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const page = e.nativeEvent.position;

      // When pager resets to center, clear the guard
      if (page === 1) {
        isResettingRef.current = false;
        return;
      }

      // Block re-entrant navigation while resetting
      if (isResettingRef.current) return;
      isResettingRef.current = true;

      // Save current document before navigating
      onBeforeNavigateRef.current?.();

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const newDate = page === 0 ? dates[0] : dates[2];
      setCurrentDate(newDate);

      // Reset to center page after React re-renders with new dates.
      // requestAnimationFrame ensures the new content is rendered first.
      // The guard clears when onPageSelected(1) fires from the reset.
      requestAnimationFrame(() => {
        pagerRef.current?.setPageWithoutAnimation(1);
        // Safety: clear guard after timeout in case onPageSelected(1) never fires
        setTimeout(() => {
          isResettingRef.current = false;
        }, 500);
      });
    },
    [dates, setCurrentDate],
  );

  const onPageScrollStateChanged = useCallback(
    (e: { nativeEvent: { pageScrollState: string } }) => {
      if (e.nativeEvent.pageScrollState === "dragging") {
        Keyboard.dismiss();
      }
    },
    [],
  );

  // Arrow button navigation - triggers animated slide
  const navigateByArrow = useCallback(
    (direction: "prev" | "next") => {
      onBeforeNavigateRef.current?.();
      const targetPage = direction === "prev" ? 0 : 2;
      pagerRef.current?.setPage(targetPage);
    },
    [],
  );

  // Calendar picker - jump directly (no animation for multi-day jumps)
  const jumpToDate = useCallback(
    (dateString: string) => {
      onBeforeNavigateRef.current?.();
      setCurrentDate(dateString);
      // Ensure pager is centered after the date change
      requestAnimationFrame(() => {
        pagerRef.current?.setPageWithoutAnimation(1);
      });
    },
    [setCurrentDate],
  );

  return {
    dates,
    pagerRef,
    onPageSelected,
    onPageScrollStateChanged,
    navigateByArrow,
    jumpToDate,
  };
}
