import { Entry } from "@/types";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NutritionReasoningPopup } from "./NutritionReasoningPopup";
import { ThinkingIndicator } from "./ThinkingIndicator";

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

  // Track which positions have been used (for handling duplicate entries)
  const usedPositionCounts = useRef<Map<string, number>>(new Map());

  // Get Y position for an entry by matching its text prefix
  const getEntryYPosition = useCallback((entryText: string, fallbackIndex: number): number => {
    const prefix = entryText.trim().substring(0, 20);
    const positions = entryYMap.get(prefix);

    if (positions?.length) {
      // Track how many times we've used this prefix (for duplicates)
      const usedCount = usedPositionCounts.current.get(prefix) || 0;
      if (usedCount < positions.length) {
        usedPositionCounts.current.set(prefix, usedCount + 1);
        return positions[usedCount];
      }
    }

    // Fallback to calculated position
    return fallbackIndex * LINE_HEIGHT;
  }, [entryYMap]);

  // Render indicator for a matched entry
  const renderIndicator = (entry: Entry | undefined) => {
    if (!entry) return null;

    if (entry.status === "pending") {
      return <ThinkingIndicator />;
    }

    if (entry.status === "ok" && entry.inlineKcal != null) {
      return (
        <TouchableOpacity
          style={styles.inlineCalories}
          onPress={() => handleIndicatorTap(entry)}
          activeOpacity={0.7}
        >
          <Text style={styles.caloriesText}>{entry.inlineKcal} cal</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  // Check if current measurements are fresh (match current text)
  const hasFreshMeasurements = measuredText === documentText;

  // Render inline calorie indicators for dash lines
  const renderDocumentWithCalories = () => {
    const lines = documentText.split("\n");
    const usedEntryIds = new Set<string>();

    // Reset position tracking for this render
    usedPositionCounts.current.clear();

    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("-")) return null;

      // Find matching entry
      const matchedEntry = entries.find(
        (e) => e.rawText === trimmedLine && !usedEntryIds.has(e.id)
      );
      if (matchedEntry) usedEntryIds.add(matchedEntry.id);

      const indicator = renderIndicator(matchedEntry);
      if (!indicator) return null;

      // Get Y position from measured layout, with fallback
      const y = getEntryYPosition(trimmedLine, index) + INDICATOR_VERTICAL_OFFSET - scrollOffset;

      // Hide indicator until we have fresh measurements (prevents position jump)
      const opacity = hasFreshMeasurements ? 1 : 0;

      return (
        <View key={`indicator-${index}`} style={[styles.indicatorWrapper, { top: y, opacity }]}>
          {indicator}
        </View>
      );
    });
  };

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
        {renderDocumentWithCalories()}
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

const LINE_HEIGHT = 21;
const TEXT_INPUT_PADDING_TOP = 10;

// Font vertical offset to align indicators with text
const FONT_VERTICAL_OFFSET = 4;

// Vertical offset to center indicator within line height
const INDICATOR_VERTICAL_OFFSET = 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  hiddenMeasureText: {
    // Same styling as documentInput for accurate measurement
    position: "absolute",
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingLeft: 20,
    paddingRight: 90,
    paddingTop: 12,
    color: "transparent",
    fontFamily: "System",
    includeFontPadding: false,
    // Position to match TextInput but invisible
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
    fontFamily: "System", // SF Pro on iOS
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
  errorIndicator: {
    fontSize: 16,
    marginLeft: 8,
  },
});

