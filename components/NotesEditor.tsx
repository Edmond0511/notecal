import { Entry } from "@/types";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

// Styles defined early so memoized components can reference them
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    overflow: "hidden",
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
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
    
  },
  caloriesText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#1976D2",
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
    <Text style={styles.caloriesText}>{kcal} cal</Text>
  </TouchableOpacity>
));
CaloriesBadge.displayName = 'CaloriesBadge';

// Memoized indicator row - only re-renders when entry data changes
const IndicatorRow = React.memo<{
  entry: Entry;
  yPosition: number;
  opacity: number;
  onTap: (entry: Entry) => void;
}>(({ entry, yPosition, opacity, onTap }) => {
  const handlePress = useCallback(() => onTap(entry), [entry, onTap]);

  return (
    <View style={[styles.indicatorWrapper, { top: yPosition, opacity }]}>
      {entry.status === 'pending' ? (
        <ThinkingIndicator />
      ) : entry.status === 'ok' && entry.inlineKcal != null ? (
        <CaloriesBadge kcal={entry.inlineKcal} onPress={handlePress} />
      ) : null}
    </View>
  );
}, (prev, next) => (
  prev.entry.id === next.entry.id &&
  prev.entry.status === next.entry.status &&
  prev.entry.inlineKcal === next.entry.inlineKcal &&
  prev.yPosition === next.yPosition &&
  prev.opacity === next.opacity
));
IndicatorRow.displayName = 'IndicatorRow';

interface NotesEditorProps {
  entries: Entry[];
  initialDocumentText: string;
  onDocumentTextChange: (text: string) => void;
  onAddEntry: (text: string) => Promise<void>;
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
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [showReasoningPopup, setShowReasoningPopup] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  // Map of entry text prefix -> y position (for entries starting with "-")
  const [entryYMap, setEntryYMap] = useState<Map<string, number[]>>(new Map());
  // Track the text that was measured, so we know if positions are stale
  const [measuredText, setMeasuredText] = useState<string>('');

  // Handle TextInput scroll to sync indicator positions
  const handleScroll = useCallback((event: any) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  // Handle text layout - extract y positions for lines starting with "-"
  const handleTextLayout = useCallback((event: any) => {
    const { lines } = event.nativeEvent;
    if (!lines?.length) return;

    // Group y-positions by text prefix (first 20 chars) to handle duplicates
    const yMap = new Map<string, number[]>();

    for (const line of lines) {
      const text = (line.text || '').trim();
      if (text.startsWith('-')) {
        const prefix = text.substring(0, 20);
        const positions = yMap.get(prefix) || [];
        positions.push(line.y ?? 0);
        yMap.set(prefix, positions);
      }
    }

    setEntryYMap(yMap);
    setMeasuredText(documentText); // Mark these measurements as current
  }, [documentText]);

  // Update document text when initialDocumentText changes (date navigation)
  useEffect(() => {
    setDocumentText(initialDocumentText);
    setEntryYMap(new Map());
    setMeasuredText(''); // Clear so indicators wait for fresh measurements
  }, [initialDocumentText]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Parse document text to find lines that start with "-"
  const parseDocumentForFoodEntries = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"));
  }, []);

  // Process document changes and update nutrition data
  const processDocumentChanges = useCallback(
    async (newText: string) => {
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
        await onAddEntry(line);
      }
    },
    [entries, parseDocumentForFoodEntries, onAddEntry, onDeleteEntry],
  );

  // Handle text changes with debouncing
  const handleTextChange = useCallback(
    (newText: string) => {
      setDocumentText(newText);

      // Notify parent of text change for persistence
      onDocumentTextChange(newText);

      // Clear previous timeout to properly debounce
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Debounce processing to avoid too many API calls
      debounceTimeoutRef.current = setTimeout(() => {
        processDocumentChanges(newText);
      }, 1500); // Wait 1.5 seconds after user stops typing
    },
    [processDocumentChanges, onDocumentTextChange],
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
    const lines = documentText.split('\n');
    const usedEntryIds = new Set<string>();
    const positionCounts = new Map<string, number>();

    const indicators: Array<{
      entryId: string;
      entry: Entry;
      yPosition: number;
    }> = [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('-')) return;

      const matchedEntry = entries.find(
        (e) => e.rawText === trimmedLine && !usedEntryIds.has(e.id)
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

  return (
    <View style={styles.container}>
      {/* Hidden Text component for reliable layout measurement */}
      {/* TextInput.onTextLayout is unreliable for wrapped text */}
      <Text
        style={styles.hiddenMeasureText}
        onTextLayout={handleTextLayout}
      >
        {documentText || ' '}
      </Text>

      {/* Document editor - full screen */}
      <TextInput
        ref={textInputRef}
        style={styles.documentInput}
        value={documentText}
        onChangeText={handleTextChange}
        onScroll={handleScroll}
        placeholder={
          entries.length === 0
            ? "Enter food items starting with '-'"
            : "Continue writing..."
        }
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

