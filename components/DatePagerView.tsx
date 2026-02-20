import { Entry } from "@/types";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Keyboard, Platform, View } from "react-native";
import PagerView from "react-native-pager-view";
import { NotesEditor } from "./NotesEditor";

const INPUT_ACCESSORY_VIEW_ID = "totals-bar-accessory";

/** Convert YYYYMMDD to Date */
function parseDate(s: string): Date {
  return new Date(
    Number.parseInt(s.substring(0, 4)),
    Number.parseInt(s.substring(4, 6)) - 1,
    Number.parseInt(s.substring(6, 8)),
  );
}

/** Date → YYYYMMDD */
function formatDate(d: Date): string {
  return (
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0")
  );
}

/** Shift a YYYYMMDD string by +/- days */
function shiftDate(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

interface DatePagerViewProps {
  currentDate: string;
  onDateChange: (newDate: string) => void;
  allEntries: Entry[];
  getDocumentText: (date: string) => string;
  onDocumentTextChange: (date: string, text: string) => void;
  onAddEntry: (text: string) => void;
  onUpdateEntry?: (id: string, text: string) => Promise<void>;
  onDeleteEntry: (id: string) => void;
  isOnline: boolean;
  waterTrackingEnabled: boolean;
}

export function DatePagerView({
  currentDate,
  onDateChange,
  allEntries,
  getDocumentText,
  onDocumentTextChange,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  isOnline,
  waterTrackingEnabled,
}: DatePagerViewProps) {
  const pagerRef = useRef<PagerView>(null);
  // Track which date the pager is centered on (may lag behind currentDate during recentering)
  const internalDateRef = useRef(currentDate);
  // Guard to ignore onPageSelected events caused by programmatic setPage
  const isResettingRef = useRef(false);
  // Skip recentering on initial mount
  const isMountedRef = useRef(false);

  const dates = useMemo(
    () => [shiftDate(currentDate, -1), currentDate, shiftDate(currentDate, 1)],
    [currentDate],
  );

  // Unified recentering: handles both swipe-triggered and external date changes
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    internalDateRef.current = currentDate;
    isResettingRef.current = true;

    // setTimeout(0) runs after React commits new children to the native pager
    const recenterId = setTimeout(() => {
      pagerRef.current?.setPageWithoutAnimation(1);
    }, 0);

    // Guaranteed guard release — no reliance on native onPageSelected events
    const guardId = setTimeout(() => {
      isResettingRef.current = false;
    }, 150);

    return () => {
      clearTimeout(recenterId);
      clearTimeout(guardId);
    };
  }, [currentDate]);

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      if (isResettingRef.current) return;

      const page = e.nativeEvent.position;
      if (page === 1) return; // still on center

      const newDate = page === 0 ? dates[0] : dates[2];

      // Set guard IMMEDIATELY to block re-entrant onPageSelected events
      // that fire when React re-renders PagerView with new children/keys
      isResettingRef.current = true;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      internalDateRef.current = newDate;
      onDateChange(newDate);

      // Recentering is handled by the useEffect on currentDate
    },
    [dates, onDateChange],
  );

  const handlePageScrollStateChanged = useCallback(
    (e: { nativeEvent: { pageScrollState: string } }) => {
      if (e.nativeEvent.pageScrollState === "dragging") {
        Keyboard.dismiss();
      }
    },
    [],
  );

  // Memoized entries per date
  const entriesByDate = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const date of dates) {
      map[date] = allEntries.filter((entry) => entry.date === date);
    }
    return map;
  }, [dates, allEntries]);

  // Per-date document text change handlers
  const makeTextChangeHandler = useCallback(
    (date: string) => (text: string) => {
      onDocumentTextChange(date, text);
    },
    [onDocumentTextChange],
  );

  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={1}
      offscreenPageLimit={1}
      onPageSelected={handlePageSelected}
      onPageScrollStateChanged={handlePageScrollStateChanged}
    >
      {dates.map((date, index) => (
        <View key={date} style={{ flex: 1, paddingBottom: 88 }}>
          <NotesEditor
            entries={entriesByDate[date] ?? []}
            initialDocumentText={getDocumentText(date)}
            onDocumentTextChange={makeTextChangeHandler(date)}
            onAddEntry={onAddEntry}
            onUpdateEntry={onUpdateEntry}
            onDeleteEntry={onDeleteEntry}
            currentDate={date}
            isOnline={isOnline}
            waterTrackingEnabled={waterTrackingEnabled}
            isActive={index === 1}
            inputAccessoryViewID={
              index === 1 && Platform.OS === "ios"
                ? INPUT_ACCESSORY_VIEW_ID
                : undefined
            }
          />
        </View>
      ))}
    </PagerView>
  );
}
