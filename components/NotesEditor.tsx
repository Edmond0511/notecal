import { Entry } from "@/types";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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

  // Update document text when initialDocumentText changes (date navigation)
  useEffect(() => {
    setDocumentText(initialDocumentText);
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
          {entry.items.some((item) => item.confidence < 0.8) && (
            <Text style={styles.lowConfidenceIndicator}>~</Text>
          )}
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

      return (
        <View key={`line-${index}`} style={styles.lineContainer}>
          {/* Render line text with same styling as TextInput */}
          <Text style={styles.documentLine} numberOfLines={1}>
            {line || " "}
          </Text>
          {indicator}
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {/* Document editor - full screen */}
      <TextInput
        ref={textInputRef}
        style={styles.documentInput}
        value={documentText}
        onChangeText={handleTextChange}
        placeholder={
          entries.length === 0
            ? "Enter food items starting with '-'\n\nExamples:\n- oats, 50g\n- 2 eggs\n- banana\n- chicken breast, 150g"
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

const LINE_HEIGHT = 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  documentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 100,
    color: "#333",
    fontFamily: "Poppins_400Regular",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    bottom: 100,
  },
  lineContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: LINE_HEIGHT,
    pointerEvents: "box-none",
  },
  documentLine: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    color: "transparent",
    fontFamily: "Poppins_400Regular",
  },
  inlineCalories: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  caloriesText: {
    fontSize: 12,
    color: "#1976D2",
    fontFamily: "Poppins_600SemiBold",
  },
  lowConfidenceIndicator: {
    fontSize: 12,
    color: "#FF9800",
    marginLeft: 2,
    fontFamily: "Poppins_500Medium",
  },
  errorIndicator: {
    fontSize: 16,
    marginLeft: 8,
  },
});
