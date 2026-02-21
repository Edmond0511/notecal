import { Entry } from "@/types";
import * as Haptics from "expo-haptics";
import React, { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Keyboard, Platform, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import InfinitePager, {
  type InfinitePagerImperativeApi,
  type InfinitePagerPageProps,
} from "react-native-infinite-pager";
import { runOnJS } from "react-native-reanimated";
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

/** Date -> YYYYMMDD */
function formatDate(d: Date): string {
  return (
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0")
  );
}

/** Convert a page index to a YYYYMMDD string relative to baseDate */
function indexToDate(baseDate: string, index: number): string {
  const d = parseDate(baseDate);
  d.setDate(d.getDate() + index);
  return formatDate(d);
}

/** Convert a YYYYMMDD string to a page index relative to baseDate */
function dateToIndex(baseDate: string, dateStr: string): number {
  const base = parseDate(baseDate);
  const target = parseDate(dateStr);
  const diffMs = target.getTime() - base.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Context for passing shared props to DatePage
interface DatePagerContextValue {
  baseDate: string;
  allEntries: Entry[];
  getDocumentText: (date: string) => string;
  onDocumentTextChange: (date: string, text: string) => void;
  onAddEntry: (text: string) => void;
  onUpdateEntry?: (id: string, text: string) => Promise<void>;
  onDeleteEntry: (id: string) => void;
  onDeleteEntries: (ids: string[]) => void;
  isOnline: boolean;
  waterTrackingEnabled: boolean;
}

const DatePagerContext = React.createContext<DatePagerContextValue>(null!);

// Module-level page component (stable reference - never remounts)
function DatePage({ index, isActive }: InfinitePagerPageProps) {
  const ctx = useContext(DatePagerContext);
  const date = indexToDate(ctx.baseDate, index);

  const entries = useMemo(
    () => ctx.allEntries.filter((e) => e.date === date),
    [ctx.allEntries, date],
  );

  const handleTextChange = useCallback(
    (text: string) => ctx.onDocumentTextChange(date, text),
    [ctx.onDocumentTextChange, date],
  );

  return (
    <View style={{ flex: 1, paddingBottom: 88 }}>
      <NotesEditor
        entries={entries}
        initialDocumentText={ctx.getDocumentText(date)}
        onDocumentTextChange={handleTextChange}
        onAddEntry={ctx.onAddEntry}
        onUpdateEntry={ctx.onUpdateEntry}
        onDeleteEntry={ctx.onDeleteEntry}
        onDeleteEntries={ctx.onDeleteEntries}
        currentDate={date}
        isOnline={ctx.isOnline}
        waterTrackingEnabled={ctx.waterTrackingEnabled}
        isActive={isActive}
        inputAccessoryViewID={
          isActive && Platform.OS === "ios"
            ? INPUT_ACCESSORY_VIEW_ID
            : undefined
        }
      />
    </View>
  );
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
  onDeleteEntries: (ids: string[]) => void;
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
  onDeleteEntries,
  isOnline,
  waterTrackingEnabled,
}: DatePagerViewProps) {
  const pagerRef = useRef<InfinitePagerImperativeApi>(null);
  const baseDateRef = useRef(currentDate); // Fixed at mount
  const isInternalChangeRef = useRef(false);
  const isExternalNavRef = useRef(false);
  const currentIndexRef = useRef(0);

  // Fires for both swipes and programmatic setPage (via useAnimatedReaction → runOnJS)
  const handlePageChange = useCallback(
    (pageIndex: number) => {
      currentIndexRef.current = pageIndex;
      // setPage from external nav (arrows/calendar) triggers onPageChange too;
      // ignore it so we don't poison isInternalChangeRef for the next chevron click.
      if (isExternalNavRef.current) {
        isExternalNavRef.current = false;
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const date = indexToDate(baseDateRef.current, pageIndex);
      isInternalChangeRef.current = true;
      onDateChange(date);
    },
    [onDateChange],
  );

  // External navigation (arrows, calendar)
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    const targetIndex = dateToIndex(baseDateRef.current, currentDate);
    if (currentIndexRef.current === targetIndex) return;
    isExternalNavRef.current = true;
    pagerRef.current?.setPage(targetIndex, { animated: false });
    currentIndexRef.current = targetIndex;
  }, [currentDate]);

  // Dismiss keyboard on drag start
  const dismissKeyboardGesture = useMemo(
    () => Gesture.Pan().onStart(() => runOnJS(Keyboard.dismiss)()),
    [],
  );

  // Context value
  const contextValue = useMemo<DatePagerContextValue>(
    () => ({
      baseDate: baseDateRef.current,
      allEntries,
      getDocumentText,
      onDocumentTextChange,
      onAddEntry,
      onUpdateEntry,
      onDeleteEntry,
      onDeleteEntries,
      isOnline,
      waterTrackingEnabled,
    }),
    [
      allEntries,
      getDocumentText,
      onDocumentTextChange,
      onAddEntry,
      onUpdateEntry,
      onDeleteEntry,
      onDeleteEntries,
      isOnline,
      waterTrackingEnabled,
    ],
  );

  return (
    <DatePagerContext.Provider value={contextValue}>
      <InfinitePager
        ref={pagerRef}
        style={pagerStyle}
        pageWrapperStyle={pagerStyle}
        PageComponent={DatePage}
        onPageChange={handlePageChange}
        pageBuffer={1}
        initialIndex={0}
        simultaneousGestures={[dismissKeyboardGesture]}
      />
    </DatePagerContext.Provider>
  );
}

const pagerStyle = { flex: 1 } as const;
