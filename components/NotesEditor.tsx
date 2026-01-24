import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Entry } from '@/types';
import { ThinkingIndicator } from './ThinkingIndicator';

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
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- '));
  }, []);

  // Process document changes and update nutrition data
  const processDocumentChanges = useCallback(async (newText: string) => {
    const foodLines = parseDocumentForFoodEntries(newText);
    const existingEntryLines = new Set(entries.map(e => e.rawText));

    // Find new lines (in document but not in entries)
    const newLines = foodLines.filter(line => !existingEntryLines.has(line));

    // Find removed lines (in entries but not in document)
    const removedEntries = entries.filter(entry => !foodLines.includes(entry.rawText));

    // Delete removed entries
    for (const entry of removedEntries) {
      onDeleteEntry(entry.id);
    }

    // Add new entries
    for (const line of newLines) {
      await onAddEntry(line);
    }
  }, [entries, parseDocumentForFoodEntries, onAddEntry, onDeleteEntry]);

  // Handle text changes with debouncing
  const handleTextChange = useCallback((newText: string) => {
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
  }, [processDocumentChanges, onDocumentTextChange]);

  // Get indicator for a specific line
  const getIndicatorForLine = (line: string) => {
    const trimmedLine = line.trim();
    const isFoodLine = trimmedLine.startsWith('- ');

    if (!isFoodLine) return null;

    const matchingEntry = entries.find(entry => entry.rawText === trimmedLine);

    if (matchingEntry?.status === 'pending') {
      return <ThinkingIndicator />;
    }

    if (matchingEntry?.status === 'ok' && matchingEntry.inlineKcal != null) {
      return (
        <View style={styles.inlineCalories}>
          <Text style={styles.caloriesText}>
            {matchingEntry.inlineKcal} cal
          </Text>
          {matchingEntry.items.some(item => item.confidence < 0.8) && (
            <Text style={styles.lowConfidenceIndicator}>~</Text>
          )}
        </View>
      );
    }

    if (matchingEntry?.status === 'error') {
      return <Text style={styles.errorIndicator}>⚠️</Text>;
    }

    return null;
  };

  // Render inline calorie indicators for dash lines
  const renderDocumentWithCalories = () => {
    const lines = documentText.split('\n');

    return lines.map((line, index) => {
      const indicator = getIndicatorForLine(line);

      return (
        <View key={`line-${index}`} style={styles.lineContainer}>
          {/* Render line text with same styling as TextInput */}
          <Text
            style={styles.documentLine}
            numberOfLines={1}
          >
            {line || ' '}
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
        placeholder={entries.length === 0
          ? "Enter food items starting with '- ' (dash + space)\n\nExamples:\n- oats, 50g\n- 2 eggs\n- banana\n- chicken breast, 150g"
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
      <View
        style={styles.overlay}
        pointerEvents="none"
      >
        {renderDocumentWithCalories()}
      </View>
    </View>
  );
}

const LINE_HEIGHT = 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  documentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 100,
    color: '#333',
    fontFamily: 'System',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    bottom: 100,
  },
  lineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: LINE_HEIGHT,
  },
  documentLine: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    color: 'transparent',
    fontFamily: 'System',
  },
  inlineCalories: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  caloriesText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  lowConfidenceIndicator: {
    fontSize: 12,
    color: '#FF9800',
    marginLeft: 2,
  },
  errorIndicator: {
    fontSize: 16,
    marginLeft: 8,
  },
});
