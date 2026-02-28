import { NotesEditor } from '@/components/NotesEditor';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppStore } from '@/store/app-store';
import { Entry } from '@/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StyleSheet, View } from 'react-native';

interface DatePageProps {
  dateString: string;
  isActive: boolean;
  inputAccessoryViewID?: string;
}

export const DatePage = React.memo(function DatePage({
  dateString,
  isActive,
  inputAccessoryViewID,
}: DatePageProps) {
  const { isOnline } = useNetworkStatus();
  const entries = useAppStore(
    useShallow((s) => s.entries.filter((e: Entry) => e.date === dateString)),
  );

  const addEntry = useAppStore((s) => s.addEntry);
  const updateEntry = useAppStore((s) => s.updateEntry);
  const deleteEntry = useAppStore((s) => s.deleteEntry);
  const deleteEntries = useAppStore((s) => s.deleteEntries);
  const saveDocument = useAppStore((s) => s.saveDocument);
  const getDocument = useAppStore((s) => s.getDocument);
  const waterTrackingEnabled = useAppStore(
    (s) => s.goals?.manualTargets?.water !== undefined,
  );
  const pendingInsertion = useAppStore((s) =>
    s.pendingInsertion?.date === dateString ? s.pendingInsertion : null,
  );
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
        waterTrackingEnabled={waterTrackingEnabled}
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
