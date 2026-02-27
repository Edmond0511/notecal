import { NotesEditor } from '@/components/NotesEditor';
import { useAppStore } from '@/store/app-store';
import { Entry } from '@/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface DatePageProps {
  dateString: string;
  isActive: boolean;
  isOnline: boolean;
  inputAccessoryViewID?: string;
}

export const DatePage = React.memo(function DatePage({
  dateString,
  isActive,
  isOnline,
  inputAccessoryViewID,
}: DatePageProps) {
  // Subscribe to the full entries array (stable reference from Zustand)
  // then filter in useMemo to avoid getSnapshot infinite loop from .filter()
  const allEntries = useAppStore((s) => s.entries);
  const entries = useMemo(
    () => allEntries.filter((e: Entry) => e.date === dateString),
    [allEntries, dateString],
  );

  const addEntry = useAppStore((s) => s.addEntry);
  const updateEntry = useAppStore((s) => s.updateEntry);
  const deleteEntry = useAppStore((s) => s.deleteEntry);
  const deleteEntries = useAppStore((s) => s.deleteEntries);
  const saveDocument = useAppStore((s) => s.saveDocument);
  const getDocument = useAppStore((s) => s.getDocument);
  const goals = useAppStore((s) => s.goals);
  const pendingInsertion = useAppStore((s) => s.pendingInsertion);
  const clearPendingInsertion = useAppStore((s) => s.clearPendingInsertion);

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
    if (
      pendingInsertion &&
      pendingInsertion.date === dateString &&
      isActive
    ) {
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
    <View style={styles.container}>
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
        waterTrackingEnabled={goals?.manualTargets?.water !== undefined}
        inputAccessoryViewID={inputAccessoryViewID}
        autoFocus={false}
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
