import { NotesEditor } from '@/components/NotesEditor';
import { useAppStore } from '@/store/app-store';
import { useEntriesForDate } from '@/store/selectors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Keyboard, StyleSheet, View } from 'react-native';

interface DatePageProps {
  dateString: string;
  isActive: boolean;
  isOnline: boolean;
  contentTopInset?: number;
}

export const DatePage = React.memo(function DatePage({
  dateString,
  isActive,
  isOnline,
  contentTopInset,
}: DatePageProps) {
  // O(1) indexed lookup instead of O(n) filter
  const entries = useEntriesForDate(dateString);

  // Single selector for all store actions + derived state — one subscription
  const {
    addEntry,
    updateEntry,
    deleteEntry,
    deleteEntries,
    saveDocument,
    getDocument,
    waterTrackingEnabled,
    pendingInsertion,
    clearPendingInsertion,
  } = useAppStore(
    useShallow((s) => ({
      addEntry: s.addEntry,
      updateEntry: s.updateEntry,
      deleteEntry: s.deleteEntry,
      deleteEntries: s.deleteEntries,
      saveDocument: s.saveDocument,
      getDocument: s.getDocument,
      waterTrackingEnabled: s.goals?.manualTargets?.water !== undefined,
      pendingInsertion:
        s.pendingInsertion?.date === dateString ? s.pendingInsertion : null,
      clearPendingInsertion: s.clearPendingInsertion,
    })),
  );

  // Block pointer events briefly when page becomes active via swipe.
  // Prevents the swipe's touch-up from triggering keyboard focus on the
  // new page's TextInput or bottom-tap Pressable.
  const prevActiveRef = useRef(isActive);
  const [blockInteraction, setBlockInteraction] = useState(false);

  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setBlockInteraction(true);
      Keyboard.dismiss();
      const timer = setTimeout(() => setBlockInteraction(false), 200);
      prevActiveRef.current = isActive;
      return () => clearTimeout(timer);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  // Local document text state
  const [documentText, setDocumentText] = useState(() => {
    const doc = getDocument(dateString);
    return doc?.content ?? '';
  });
  const documentTextRef = useRef(documentText);
  documentTextRef.current = documentText;

  // Save document on unmount so text isn't lost when swiped away
  useEffect(() => {
    return () => {
      const text = documentTextRef.current.trim();
      saveDocument(dateString, text);
    };
  }, [dateString, saveDocument]);

  // Handle pending insertion for this date
  useEffect(() => {
    if (pendingInsertion && isActive) {
      const newLine = pendingInsertion.text;
      const currentText = documentTextRef.current;
      const updatedText = currentText
        ? `${currentText}\n${newLine}`
        : newLine;
      setDocumentText(updatedText);
      saveDocument(dateString, updatedText);
      clearPendingInsertion();
    }
  }, [pendingInsertion, dateString, isActive, saveDocument, clearPendingInsertion]);

  // Handle text changes from NotesEditor
  const handleDocumentTextChange = useCallback(
    (text: string) => {
      setDocumentText(text);
      saveDocument(dateString, text);
    },
    [dateString, saveDocument],
  );

  return (
    <View style={styles.container} pointerEvents={blockInteraction ? 'none' : 'auto'}>
      <NotesEditor
        entries={entries}
        initialDocumentText={documentText}
        onDocumentTextChange={handleDocumentTextChange}
        onAddEntry={addEntry}
        onUpdateEntry={updateEntry}
        onDeleteEntry={deleteEntry}
        onDeleteEntries={deleteEntries}
        currentDate={dateString}
        isOnline={isOnline}
        waterTrackingEnabled={waterTrackingEnabled}
        autoFocus={false}
        contentTopInset={contentTopInset}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
