import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Entry } from '@/types';

interface NotesEditorProps {
  entries: Entry[];
  onAddEntry: (text: string) => Promise<void>;
  onUpdateEntry: (id: string, text: string) => Promise<void>;
  onDeleteEntry: (id: string) => void;
}

export function NotesEditor({ entries, onAddEntry, onUpdateEntry, onDeleteEntry }: NotesEditorProps) {
  const [documentText, setDocumentText] = useState('');
  const textInputRef = useRef<TextInput>(null);

  // Load existing entries into document on mount
  useEffect(() => {
    if (entries.length > 0) {
      const documentContent = entries.map(entry => entry.rawText).join('\n\n');
      setDocumentText(documentContent);
    }
  }, [entries]);

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

    // Debounce processing to avoid too many API calls
    const timeoutId = setTimeout(() => {
      processDocumentChanges(newText);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [processDocumentChanges]);

  // Render inline calorie indicators for dash lines
  const renderDocumentWithCalories = () => {
    const lines = documentText.split('\n');

    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      const isFoodLine = trimmedLine.startsWith('- ');

      // Find matching entry for this line
      const matchingEntry = entries.find(entry => entry.rawText === trimmedLine);

      return (
        <View key={`line-${index}-${line.slice(0, 10)}`} style={styles.lineContainer}>
          <Text style={styles.documentLine}>{line || '\n'}</Text>

          {/* Show inline calories for resolved food lines */}
          {isFoodLine && matchingEntry?.status === 'ok' && matchingEntry.inlineKcal && (
            <View style={styles.inlineCalories}>
              <Text style={styles.caloriesText}>
                {matchingEntry.inlineKcal} kcal
              </Text>
              {matchingEntry.items.some(item => item.confidence < 0.8) && (
                <Text style={styles.lowConfidenceIndicator}>~</Text>
              )}
            </View>
          )}

          {/* Show error indicator for failed resolutions */}
          {isFoodLine && matchingEntry?.status === 'error' && (
            <Text style={styles.errorIndicator}>⚠️</Text>
          )}
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {/* Document editor - full screen */}
      <TextInput
        ref={textInputRef}
        style={[
          styles.documentInput,
          {
            borderWidth: 0,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
          }
        ]}
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
      <ScrollView
        style={styles.overlay}
        pointerEvents="none"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.overlayContent}
      >
        {renderDocumentWithCalories()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  documentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 100,
    color: '#333',
    fontFamily: 'System',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    outlineStyle: 'none' as any
  },
  overlay: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    bottom: 100,
  },
  overlayContent: {
    flexGrow: 1,
  },
  lineContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 24,
    marginBottom: 2,
  },
  documentLine: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: 'transparent',
  },
  inlineCalories: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 12,
    alignSelf: 'center',
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
    marginLeft: 12,
    alignSelf: 'center',
  },
});