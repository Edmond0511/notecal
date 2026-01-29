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
  const [linePositions, setLinePositions] = useState<number[]>([]);

  // Handle TextInput scroll to sync indicator positions
  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setScrollOffset(offsetY);
  }, []);

  // Handle text layout to get actual line positions (accounts for wrapped lines)
  const handleTextLayout = useCallback((event: any) => {
    const { lines } = event.nativeEvent;

    if (!lines || lines.length === 0) {
      return;
    }

    const logicalLines = documentText.split("\n");

    // Calculate the starting character index of each logical line in the full text
    const logicalLineStarts: number[] = [0];
    for (let i = 0; i < logicalLines.length - 1; i++) {
      logicalLineStarts.push(logicalLineStarts[i] + logicalLines[i].length + 1);
    }

    // SIMPLER APPROACH: For lines starting with "-", find the visual line that contains that dash
    // This avoids complex character counting and handles empty lines naturally
    const positions: number[] = new Array(logicalLines.length).fill(-1);

    // First pass: build a list of visual lines with their text and y positions
    const visualLineData: { text: string; y: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const visualLine = lines[i];
      visualLineData.push({
        text: visualLine.text || '',
        y: visualLine.y ?? 0,
      });
    }

    // Second pass: for each logical line, find its y position
    // Strategy: match the logical line's trimmed start with visual line content
    let searchFromVisualIndex = 0;

    for (let logicalIndex = 0; logicalIndex < logicalLines.length; logicalIndex++) {
      const logicalLine = logicalLines[logicalIndex];
      const trimmedLogical = logicalLine.trim();

      // Handle empty lines: estimate position based on surrounding lines
      if (trimmedLogical === '') {
        let nextNonEmptyY = -1;
        for (let v = searchFromVisualIndex; v < visualLineData.length; v++) {
          if (visualLineData[v].text.trim() !== '') {
            nextNonEmptyY = visualLineData[v].y;
            break;
          }
        }
        if (nextNonEmptyY !== -1) {
          positions[logicalIndex] = nextNonEmptyY - LINE_HEIGHT;
        } else if (logicalIndex > 0 && positions[logicalIndex - 1] !== -1) {
          positions[logicalIndex] = positions[logicalIndex - 1] + LINE_HEIGHT;
        } else {
          positions[logicalIndex] = logicalIndex * LINE_HEIGHT;
        }
        continue;
      }

      // Non-empty line: find the visual line that starts with the same content
      const searchPrefix = trimmedLogical.substring(0, Math.min(20, trimmedLogical.length));
      let foundY = -1;

      for (let v = searchFromVisualIndex; v < visualLineData.length; v++) {
        const visualText = visualLineData[v].text;
        const trimmedVisual = visualText.trim();

        if (trimmedVisual.startsWith(searchPrefix) || visualText.includes(searchPrefix.substring(0, 10))) {
          foundY = visualLineData[v].y;
          searchFromVisualIndex = v + 1;
          break;
        }
      }

      // Fallback: estimate based on line height
      if (foundY === -1) {
        foundY = logicalIndex * LINE_HEIGHT;
      }

      positions[logicalIndex] = foundY;
    }

    setLinePositions(positions);
  }, [documentText]);

  // Update document text when initialDocumentText changes (date navigation)
  useEffect(() => {
    setDocumentText(initialDocumentText);
    // Clear positions when navigating to a new date so we don't use stale data
    setLinePositions([]);
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

  // Calculate Y position for a logical line index
  // Uses actual measured positions if available (accounts for wrapped lines)
  // Falls back to calculated position if measurements not available yet
  const getLineYPosition = useCallback((lineIndex: number): number => {
    if (linePositions.length > lineIndex && linePositions[lineIndex] !== undefined) {
      return linePositions[lineIndex];
    }
    // Fallback to calculated position
    return lineIndex * LINE_HEIGHT;
  }, [linePositions]);

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

  // Render inline calorie indicators for dash lines
  const renderDocumentWithCalories = () => {
    const lines = documentText.split("\n");

    // Track which entries have been matched to lines (for duplicates)
    const usedEntryIds = new Set<string>();

    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      const isFoodLine = trimmedLine.startsWith("-");

      let matchedEntry: Entry | undefined;
      if (isFoodLine) {
        // Find an entry that matches this line and hasn't been used yet
        matchedEntry = entries.find(
          (entry) =>
            entry.rawText === trimmedLine && !usedEntryIds.has(entry.id),
        );
        if (matchedEntry) {
          usedEntryIds.add(matchedEntry.id);
        }
      }

      const indicator = isFoodLine ? renderIndicator(matchedEntry) : null;

      // Calculate Y position directly from line index, accounting for scroll
      const indicatorY = getLineYPosition(index) + INDICATOR_VERTICAL_OFFSET - scrollOffset;

      return indicator ? (
        <View
          key={`indicator-${index}`}
          style={[styles.indicatorWrapper, { top: indicatorY }]}
        >
          {indicator}
        </View>
      ) : null;
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

