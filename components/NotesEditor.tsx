import { Entry } from "@/types";
import { truncateNumber } from "@/utils/formatNumber";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NutritionReasoningPopup } from "./NutritionReasoningPopup";
import { ThinkingIndicator } from "./ThinkingIndicator";

// Constants
const LINE_HEIGHT = 21;
const TEXT_INPUT_PADDING_TOP = 10;
const FONT_VERTICAL_OFFSET = 4;
const INDICATOR_VERTICAL_OFFSET = 2;
const EM_DASH = "—"; // U+2014

// Adaptive debounce delays based on entry completeness
const DELAY_COMPLETE_ENTRY = 1500; // Entry appears complete → responsive feedback
const DELAY_INCOMPLETE_ENTRY = 2500; // Entry appears incomplete → wait for user to finish

// Text diff utilities for detecting user actions
interface TextDiff {
  type: "insert" | "delete" | "replace" | "none";
  position: number;
  deletedText: string;
  insertedText: string;
}

function computeTextDiff(oldText: string, newText: string): TextDiff {
  // Find common prefix
  let prefixEnd = 0;
  while (
    prefixEnd < oldText.length &&
    prefixEnd < newText.length &&
    oldText[prefixEnd] === newText[prefixEnd]
  ) {
    prefixEnd++;
  }

  // Find common suffix
  let oldSuffixStart = oldText.length;
  let newSuffixStart = newText.length;
  while (
    oldSuffixStart > prefixEnd &&
    newSuffixStart > prefixEnd &&
    oldText[oldSuffixStart - 1] === newText[newSuffixStart - 1]
  ) {
    oldSuffixStart--;
    newSuffixStart--;
  }

  const deletedText = oldText.slice(prefixEnd, oldSuffixStart);
  const insertedText = newText.slice(prefixEnd, newSuffixStart);

  if (!deletedText && !insertedText) {
    return { type: "none", position: prefixEnd, deletedText: "", insertedText: "" };
  }
  if (!deletedText) {
    return { type: "insert", position: prefixEnd, deletedText: "", insertedText };
  }
  if (!insertedText) {
    return { type: "delete", position: prefixEnd, deletedText, insertedText: "" };
  }
  return { type: "replace", position: prefixEnd, deletedText, insertedText };
}

function getLineAtPosition(text: string, position: number) {
  const lines = text.split("\n");
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = charCount;
    const lineEnd = charCount + lines[i].length;
    if (position >= lineStart && position <= lineEnd) {
      const lineText = lines[i];
      const trimmed = lineText.trim();
      const isEmDash = trimmed.startsWith(`${EM_DASH} `);
      const isDash = trimmed.startsWith("- ");
      return {
        lineIndex: i,
        lineStart,
        lineEnd,
        lineText,
        isEntryLine: isEmDash || isDash,
        markerType: isEmDash ? EM_DASH : isDash ? "-" : null,
        textAfterMarker: isEmDash ? trimmed.slice(2) : isDash ? trimmed.slice(2) : "",
      };
    }
    charCount = lineEnd + 1; // +1 for the newline character
  }
  return null;
}

// Assess whether a food entry appears complete or incomplete
// Returns the appropriate debounce delay
function assessEntryCompleteness(entryText: string): number {
  // Strip the leading marker (— or -)
  const text = entryText.replace(/^[—-]\s*/, "").trim();

  // Too short - likely incomplete
  if (text.length < 5) {
    return DELAY_INCOMPLETE_ENTRY;
  }

  // Trailing comma - user is adding quantity
  if (text.endsWith(",")) {
    return DELAY_INCOMPLETE_ENTRY;
  }

  // Trailing space - mid-typing
  if (entryText.endsWith(" ")) {
    return DELAY_INCOMPLETE_ENTRY;
  }

  // Number without unit at end (e.g., "chicken 150" but not "chicken 150g")
  // Matches: ends with number not followed by unit letters
  if (/\d$/.test(text) && !/\d+\s*(g|kg|mg|oz|lb|ml|l|cup|cups|tbsp|tsp|piece|pieces|slice|slices)$/i.test(text)) {
    return DELAY_INCOMPLETE_ENTRY;
  }

  // Check for quantity+unit patterns or count patterns (these are complete)
  // Patterns: "150g", "2 cups", "100ml", "2 eggs", etc.
  const hasQuantityUnit = /\d+\s*(g|kg|mg|oz|lb|ml|l|cup|cups|tbsp|tsp|piece|pieces|slice|slices)\s*$/i.test(text);
  const hasCountPattern = /^\d+\s+\w+/.test(text); // "2 eggs", "3 bananas"

  if (hasQuantityUnit || hasCountPattern) {
    return DELAY_COMPLETE_ENTRY;
  }

  // Standalone food with reasonable length (e.g., "banana", "apple")
  // If it's a single word or simple phrase without quantity, it's likely complete
  if (text.length >= 5 && !text.includes(",")) {
    return DELAY_COMPLETE_ENTRY;
  }

  // Default to incomplete for safety
  return DELAY_INCOMPLETE_ENTRY;
}

// Find the most recently edited entry line from text
function findMostRecentEntryLine(text: string, cursorPosition?: number): string | null {
  const lines = text.split("\n");
  let charCount = 0;

  // If we have cursor position, find the line at that position
  if (cursorPosition !== undefined) {
    for (const line of lines) {
      const lineEnd = charCount + line.length;
      if (cursorPosition >= charCount && cursorPosition <= lineEnd) {
        const trimmed = line.trim();
        if (trimmed.startsWith("-") || trimmed.startsWith(EM_DASH)) {
          return trimmed;
        }
        break;
      }
      charCount = lineEnd + 1;
    }
  }

  // Fallback: return the last entry line
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("-") || trimmed.startsWith(EM_DASH)) {
      return trimmed;
    }
  }

  return null;
}

// Transform "- " to "— " when space is typed after dash at line start
function checkDashSpaceTransform(
  oldText: string,
  newText: string,
  diff: TextDiff
): { transformedText: string; newCursor: number } | null {
  if (diff.type !== "insert" || diff.insertedText !== " ") return null;

  const line = getLineAtPosition(newText, diff.position);
  if (!line) return null;

  const beforeSpace = newText.slice(line.lineStart, diff.position);
  if (beforeSpace.trim() !== "-") return null;

  // Transform "- " to "— "
  const leadingSpace = beforeSpace.match(/^(\s*)/)?.[1] ?? "";
  const transformedText =
    newText.slice(0, line.lineStart) +
    leadingSpace +
    `${EM_DASH} ` +
    newText.slice(diff.position + 1);

  return { transformedText, newCursor: line.lineStart + leadingSpace.length + 2 };
}

// Auto-insert "— " on Enter after a non-empty entry line
function checkEnterAutoInsert(
  oldText: string,
  newText: string,
  diff: TextDiff
): { transformedText: string; newCursor: number } | null {
  if (diff.type !== "insert" || !diff.insertedText.includes("\n")) return null;

  // Get the line the cursor is on when Enter was pressed
  const currentLine = getLineAtPosition(oldText, diff.position);
  if (!currentLine) return null;

  // Only auto-insert if currently on an entry line with content
  if (!currentLine.isEntryLine || !currentLine.textAfterMarker.trim()) return null;

  // Only apply when Enter is pressed at end of line
  if (diff.position < currentLine.lineEnd) return null;

  const insertPos = diff.position + diff.insertedText.length;
  const transformedText =
    newText.slice(0, insertPos) + `${EM_DASH} ` + newText.slice(insertPos);
  return { transformedText, newCursor: insertPos + 2 };
}

// Revert "—" back to "-" when space is deleted after em-dash
function checkRevertEmDash(
  oldText: string,
  newText: string,
  diff: TextDiff
): { transformedText: string; newCursor: number } | null {
  if (diff.type !== "delete" || diff.deletedText !== " ") return null;

  const line = getLineAtPosition(newText, diff.position);
  if (!line) return null;

  // Check if line now has "—" without space after (user backspaced the space)
  const trimmed = line.lineText.trim();
  if (!trimmed.startsWith(EM_DASH) || trimmed.startsWith(`${EM_DASH} `)) return null;

  const dashPos = line.lineStart + line.lineText.indexOf(EM_DASH);
  const transformedText = newText.slice(0, dashPos) + "-" + newText.slice(dashPos + 1);
  return { transformedText, newCursor: dashPos + 1 };
}

// Remove empty "— " line on double-Enter (exit list mode)
// Keeps the line (now empty), cursor stays on the same line
function checkDoubleEnterExit(
  oldText: string,
  newText: string,
  diff: TextDiff
): { transformedText: string; newCursor: number } | null {
  if (diff.type !== "insert" || diff.insertedText !== "\n") return null;

  const line = getLineAtPosition(oldText, diff.position);
  if (!line) return null;

  const trimmed = line.lineText.trim();
  if (trimmed !== EM_DASH && trimmed !== `${EM_DASH} `) return null;

  // Remove just the emdash content, keep the line (now empty)
  // Also remove the inserted newline
  const before = newText.slice(0, line.lineStart);
  const after = newText.slice(line.lineEnd + 1); // +1 to skip the inserted newline

  // Cursor stays on the same line (now empty)
  return { transformedText: before + after, newCursor: line.lineStart };
}

// Styles defined early so memoized components can reference them
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hiddenMeasureText: {
    position: "absolute",
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingLeft: 20,
    paddingRight: 90,
    paddingTop: 12,
    color: "transparent",
    fontFamily: "System",
    includeFontPadding: false,
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    pointerEvents: "none",
  },
  documentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingLeft: 20,
    paddingRight: 90,
    paddingTop: 12,
    color: "#333",
    fontFamily: "System",
    includeFontPadding: false,
  },
  overlay: {
    position: "absolute",
    top: TEXT_INPUT_PADDING_TOP + FONT_VERTICAL_OFFSET,
    left: 0,
    right: 0,
    bottom: 100,
    pointerEvents: "box-none",
  },
  indicatorWrapper: {
    position: "absolute",
    right: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  inlineCalories: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
  },
  caloriesText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#1A6872",
    fontFamily: "System",
    fontWeight: "600",
    includeFontPadding: false,
  },
  inlineWater: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
    gap: 3,
    marginLeft: 4,
  },
  waterText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#1A6872",
    fontFamily: "System",
    fontWeight: "600",
    includeFontPadding: false,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#C62828",
    fontFamily: "System",
    fontWeight: "600",
    includeFontPadding: false,
  },
});

// Memoized calorie badge - only re-renders when kcal changes
const CaloriesBadge = React.memo<{
  kcal: number;
  onPress: () => void;
}>(({ kcal, onPress }) => (
  <TouchableOpacity
    style={styles.inlineCalories}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={styles.caloriesText}>{truncateNumber(kcal, 6)} cal</Text>
  </TouchableOpacity>
));
CaloriesBadge.displayName = "CaloriesBadge";

// Memoized water badge - only re-renders when amount changes
const WaterBadge = React.memo<{ amountL: number }>(({ amountL }) => (
  <View style={styles.inlineWater}>
    <Text style={styles.waterText}>{amountL}L</Text>
  </View>
));
WaterBadge.displayName = "WaterBadge";

// Memoized error badge - shown when nutrition resolution fails
const ErrorBadge = React.memo(() => (
  <View style={styles.inlineError}>
    <Text style={styles.errorText}>error</Text>
  </View>
));
ErrorBadge.displayName = "ErrorBadge";

// Memoized indicator row - only re-renders when entry data changes
const IndicatorRow = React.memo<{
  entry: Entry;
  yPosition: number;
  opacity: number;
  onTap: (entry: Entry) => void;
}>(
  ({ entry, yPosition, opacity, onTap }) => {
    const handlePress = useCallback(() => onTap(entry), [entry, onTap]);

    // Calculate water amount from entry items
    const waterAmount = useMemo(() => {
      return entry.items.reduce((sum, item) => sum + (item.macros.water ?? 0), 0);
    }, [entry.items]);

    const hasCalories = entry.inlineKcal != null && entry.inlineKcal > 0;
    const hasWater = waterAmount > 0;

    return (
      <View style={[styles.indicatorWrapper, { top: yPosition, opacity }]}>
        {entry.status === "pending" ? (
          <ThinkingIndicator />
        ) : entry.status === "ok" ? (
          <>
            {hasCalories && (
              <CaloriesBadge kcal={entry.inlineKcal!} onPress={handlePress} />
            )}
            {hasWater && <WaterBadge amountL={waterAmount} />}
          </>
        ) : entry.status === "error" ? (
          <ErrorBadge />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.entry.id === next.entry.id &&
    prev.entry.status === next.entry.status &&
    prev.entry.inlineKcal === next.entry.inlineKcal &&
    prev.entry.items === next.entry.items &&
    prev.yPosition === next.yPosition &&
    prev.opacity === next.opacity,
);
IndicatorRow.displayName = "IndicatorRow";

interface NotesEditorProps {
  entries: Entry[];
  initialDocumentText: string;
  onDocumentTextChange: (text: string) => void;
  onAddEntry: (text: string) => void;
  onUpdateEntry?: (id: string, text: string) => Promise<void>;
  onDeleteEntry: (id: string) => void;
  currentDate?: string;
}

export function NotesEditor({
  entries,
  initialDocumentText,
  onDocumentTextChange,
  onAddEntry,
  onDeleteEntry,
}: NotesEditorProps) {
  const [documentText, setDocumentText] = useState(initialDocumentText);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [showReasoningPopup, setShowReasoningPopup] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  // Map of entry text prefix -> y position (for entries starting with "-" or "—")
  const [entryYMap, setEntryYMap] = useState<Map<string, number[]>>(new Map());
  // Track the text that was measured, so we know if positions are stale
  const [measuredText, setMeasuredText] = useState<string>("");
  // Track previous text for detecting user actions via text diffing
  const previousTextRef = useRef<string>(initialDocumentText);
  // Controlled selection for cursor positioning after transforms
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  // Flag to prevent recursive text change handling during transforms
  const isTransformingRef = useRef<boolean>(false);
  // Keyboard height for dynamic bottom padding
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Track when user is actively scrolling to suppress auto-scroll
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle TextInput scroll to sync indicator positions
  const handleScroll = useCallback((event: any) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  // Scroll gesture handlers - track when user is manually scrolling
  const handleScrollBeginDrag = useCallback(() => {
    setIsUserScrolling(true);
    if (scrollCooldownRef.current) {
      clearTimeout(scrollCooldownRef.current);
    }
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    // Add cooldown before re-enabling auto-scroll
    scrollCooldownRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 500);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    scrollCooldownRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 500);
  }, []);


  // Handle text layout - extract y positions for indicator positioning
  const handleTextLayout = useCallback(
    (event: any) => {
      const { lines } = event.nativeEvent;
      if (!lines?.length) return;

      // Group y-positions by text prefix for indicator positioning
      const yMap = new Map<string, number[]>();
      for (const line of lines) {
        const text = (line.text || "").trim();
        if (text.startsWith("-") || text.startsWith(EM_DASH)) {
          const prefix = text.substring(0, 20);
          const positions = yMap.get(prefix) || [];
          positions.push(line.y ?? 0);
          yMap.set(prefix, positions);
        }
      }
      setEntryYMap(yMap);
      setMeasuredText(documentText);
    },
    [documentText],
  );

  // Update document text when initialDocumentText changes (date navigation)
  useEffect(() => {
    setDocumentText(initialDocumentText);
    previousTextRef.current = initialDocumentText; // Sync for text diffing
    setEntryYMap(new Map());
    setMeasuredText(""); // Clear so indicators wait for fresh measurements
  }, [initialDocumentText]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (scrollCooldownRef.current) {
        clearTimeout(scrollCooldownRef.current);
      }
    };
  }, []);

  // Keyboard listeners for dynamic bottom padding
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Handle selection changes - no-op, scroll handled in handleTextChange
  const handleSelectionChange = useCallback((_event: any) => {
    // Selection tracking not needed - cursor position passed directly to scroll function
  }, []);

  // Calculate Y position of cursor based on character position
  const getCursorLineY = useCallback((cursorPos: number, text: string): number => {
    const textBeforeCursor = text.substring(0, cursorPos);
    const lineIndex = textBeforeCursor.split('\n').length - 1;
    return lineIndex * LINE_HEIGHT + TEXT_INPUT_PADDING_TOP;
  }, []);

  // Scroll to keep caret visible at specified position
  const scrollToKeepCaretVisible = useCallback((cursorPos: number, text: string) => {
    // Skip if user is actively scrolling or keyboard is not open
    if (isUserScrolling || keyboardHeight === 0 || !scrollViewRef.current) return;

    // Get cursor Y from the provided cursor position
    const cursorY = getCursorLineY(cursorPos, text);

    // Calculate visible area above keyboard
    const screenHeight = Dimensions.get('window').height;
    const HEADER_HEIGHT = 100;
    const BOTTOM_BAR_HEIGHT = 88;
    const visibleHeight = screenHeight - HEADER_HEIGHT - keyboardHeight - BOTTOM_BAR_HEIGHT;

    const visibleTop = scrollOffset;
    const visibleBottom = scrollOffset + visibleHeight;
    const SCROLL_MARGIN = LINE_HEIGHT;

    // Only scroll if cursor is outside visible area
    if (cursorY + LINE_HEIGHT > visibleBottom - SCROLL_MARGIN) {
      // Cursor below visible area - scroll down
      const targetScroll = cursorY - visibleHeight + LINE_HEIGHT + SCROLL_MARGIN;
      scrollViewRef.current.scrollTo({ y: Math.max(0, targetScroll), animated: true });
    } else if (cursorY < visibleTop + SCROLL_MARGIN) {
      // Cursor above visible area - scroll up
      scrollViewRef.current.scrollTo({ y: Math.max(0, cursorY - SCROLL_MARGIN), animated: true });
    }
  }, [isUserScrolling, keyboardHeight, scrollOffset, getCursorLineY]);

  // Parse document text to find lines that start with "-" or "—"
  const parseDocumentForFoodEntries = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-") || line.startsWith(EM_DASH));
  }, []);

  // Process document changes and update nutrition data
  const processDocumentChanges = useCallback(
    (newText: string) => {
      const foodLines = parseDocumentForFoodEntries(newText);

      // Count occurrences of each line in the document
      const docLineCounts = new Map<string, number>();
      for (const line of foodLines) {
        docLineCounts.set(line, (docLineCounts.get(line) || 0) + 1);
      }

      // Count occurrences of each rawText in entries
      const entryLineCounts = new Map<string, number>();
      for (const entry of entries) {
        entryLineCounts.set(
          entry.rawText,
          (entryLineCounts.get(entry.rawText) || 0) + 1,
        );
      }

      // Find lines that need new entries (doc has more than entries)
      const linesToAdd: string[] = [];
      for (const [line, docCount] of docLineCounts) {
        const entryCount = entryLineCounts.get(line) || 0;
        const diff = docCount - entryCount;
        for (let i = 0; i < diff; i++) {
          linesToAdd.push(line);
        }
      }

      // Find entries to remove (entries has more than doc)
      const entriesToRemove: string[] = [];
      for (const [line, entryCount] of entryLineCounts) {
        const docCount = docLineCounts.get(line) || 0;
        const diff = entryCount - docCount;
        if (diff > 0) {
          // Find entries with this rawText and mark excess for removal
          const matchingEntries = entries.filter((e) => e.rawText === line);
          for (let i = 0; i < diff && i < matchingEntries.length; i++) {
            entriesToRemove.push(matchingEntries[i].id);
          }
        }
      }

      // Delete removed entries
      for (const entryId of entriesToRemove) {
        onDeleteEntry(entryId);
      }

      // Add new entries
      for (const line of linesToAdd) {
        onAddEntry(line);
      }
    },
    [entries, parseDocumentForFoodEntries, onAddEntry, onDeleteEntry],
  );

  // Handle text changes with debouncing and Apple Notes-style list transforms
  const handleTextChange = useCallback(
    (newText: string) => {
      // Prevent recursive handling during programmatic text changes
      if (isTransformingRef.current) return;

      const oldText = previousTextRef.current;
      const diff = computeTextDiff(oldText, newText);

      // Try transforms in priority order
      let result = checkDashSpaceTransform(oldText, newText, diff);
      if (!result) result = checkDoubleEnterExit(oldText, newText, diff);
      if (!result) result = checkEnterAutoInsert(oldText, newText, diff);
      if (!result) result = checkRevertEmDash(oldText, newText, diff);

      if (result) {
        isTransformingRef.current = true;
        // Set selection synchronously with text to avoid cursor jump
        setSelection({ start: result.newCursor, end: result.newCursor });
        setDocumentText(result.transformedText);
        previousTextRef.current = result.transformedText;
        onDocumentTextChange(result.transformedText);

        // Clear selection control after render and scroll if newline was added
        requestAnimationFrame(() => {
          setTimeout(() => {
            setSelection(undefined);
            isTransformingRef.current = false;
            // Scroll after transform (often includes newline insertion)
            if (diff.type === 'insert' && diff.insertedText.includes('\n')) {
              scrollToKeepCaretVisible(result.newCursor, result.transformedText);
            }
          }, 50);
        });
      } else {
        setDocumentText(newText);
        previousTextRef.current = newText;
        onDocumentTextChange(newText);

        // Scroll if newline was inserted - cursor is after the inserted newline
        if (diff.type === 'insert' && diff.insertedText.includes('\n')) {
          const newCursorPos = diff.position + diff.insertedText.length;
          requestAnimationFrame(() => scrollToKeepCaretVisible(newCursorPos, newText));
        }
      }

      // Clear previous timeout to properly debounce
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      const finalText = result?.transformedText ?? newText;

      // Check for Enter-key instant trigger:
      // If user pressed Enter after an entry line with content, process immediately
      if (diff.type === "insert" && diff.insertedText.includes("\n")) {
        const lineBeforeEnter = getLineAtPosition(oldText, diff.position);
        if (lineBeforeEnter?.isEntryLine && lineBeforeEnter.textAfterMarker.trim()) {
          // User pressed Enter after completing an entry line - process immediately
          processDocumentChanges(finalText);
          return;
        }
      }

      // Instant trigger: all food entries removed from document
      const currentFoodLines = parseDocumentForFoodEntries(finalText);
      if (currentFoodLines.length === 0 && entries.length > 0) {
        processDocumentChanges(finalText);
        return;
      }

      // Adaptive debounce based on entry completeness
      const mostRecentEntry = findMostRecentEntryLine(finalText);
      const delay = mostRecentEntry
        ? assessEntryCompleteness(mostRecentEntry)
        : DELAY_COMPLETE_ENTRY;

      debounceTimeoutRef.current = setTimeout(() => {
        processDocumentChanges(finalText);
      }, delay);
    },
    [processDocumentChanges, onDocumentTextChange, scrollToKeepCaretVisible, parseDocumentForFoodEntries, entries],
  );

  // Handle indicator tap
  const handleIndicatorTap = useCallback((entry: Entry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedEntry(entry);
    setShowReasoningPopup(true);
  }, []);

  const handleClosePopup = useCallback(() => {
    setShowReasoningPopup(false);
    setSelectedEntry(null);
  }, []);

  // Check if current measurements are fresh (match current text)
  const hasFreshMeasurements = measuredText === documentText;

  // Compute indicator data only when dependencies change
  const indicatorData = useMemo(() => {
    const lines = documentText.split("\n");
    const usedEntryIds = new Set<string>();
    const positionCounts = new Map<string, number>();

    const indicators: Array<{
      entryId: string;
      entry: Entry;
      yPosition: number;
    }> = [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("-") && !trimmedLine.startsWith(EM_DASH)) return;

      const matchedEntry = entries.find(
        (e) => e.rawText === trimmedLine && !usedEntryIds.has(e.id),
      );
      if (!matchedEntry) return;

      usedEntryIds.add(matchedEntry.id);

      // Calculate Y position
      const prefix = trimmedLine.substring(0, 20);
      const positions = entryYMap.get(prefix);
      let yPosition: number;

      if (positions?.length) {
        const usedCount = positionCounts.get(prefix) || 0;
        if (usedCount < positions.length) {
          positionCounts.set(prefix, usedCount + 1);
          yPosition = positions[usedCount];
        } else {
          yPosition = index * LINE_HEIGHT;
        }
      } else {
        yPosition = index * LINE_HEIGHT;
      }

      indicators.push({
        entryId: matchedEntry.id,
        entry: matchedEntry,
        yPosition: yPosition + INDICATOR_VERTICAL_OFFSET,
      });
    });

    return indicators;
  }, [documentText, entries, entryYMap]);

  // Dynamic scroll content style with keyboard-based bottom padding
  // This allows native TextInput to keep the caret visible automatically
  const scrollContentStyle = useMemo(() => ({
    flexGrow: 1,
    paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0,
  }), [keyboardHeight]);

  return (
    <View style={styles.container}>
      {/* Hidden Text component for reliable layout measurement */}
      {/* TextInput.onTextLayout is unreliable for wrapped text */}
      <Text style={styles.hiddenMeasureText} onTextLayout={handleTextLayout}>
        {documentText || " "}
      </Text>

      {/* ScrollView wrapper enables keyboard dismiss on drag */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContainer}
        contentContainerStyle={scrollContentStyle}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {/* Document editor - full screen */}
        <TextInput
          ref={textInputRef}
          style={styles.documentInput}
          value={documentText}
          onChangeText={handleTextChange}
          onSelectionChange={handleSelectionChange}
          selection={selection}
          placeholder="Enter food items starting with '-'"
          placeholderTextColor="#ccc"
          multiline
          autoFocus
          textAlignVertical="top"
          autoCorrect={false}
          autoCapitalize="sentences"
          spellCheck={false}
          underlineColorAndroid="transparent"
          selectionColor="#007AFF"
          contextMenuHidden={false}
          selectTextOnFocus={false}
          clearTextOnFocus={false}
        />
      </ScrollView>

      {/* Overlay for inline nutrition indicators */}
      <View style={styles.overlay} pointerEvents="box-none">
        {indicatorData.map((item) => (
          <IndicatorRow
            key={item.entryId}
            entry={item.entry}
            yPosition={item.yPosition - scrollOffset}
            opacity={hasFreshMeasurements ? 1 : 0}
            onTap={handleIndicatorTap}
          />
        ))}
      </View>

      {/* Reasoning Popup */}
      <NutritionReasoningPopup
        visible={showReasoningPopup}
        onClose={handleClosePopup}
        entry={selectedEntry}
      />
    </View>
  );
}
