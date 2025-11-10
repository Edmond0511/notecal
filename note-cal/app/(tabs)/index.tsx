import React from 'react';
import { View, Text, StyleSheet, StatusBar, SafeAreaView } from 'react-native';
import { NotesEditor } from '@/components/NotesEditor';
import { useAppStore } from '@/store/app-store';

export default function HomeScreen() {
  const {
    getEntriesForDate,
    currentDate,
    addEntry,
    updateEntry,
    deleteEntry,
    isLoading
  } = useAppStore();

  const entries = getEntriesForDate(currentDate);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>NoteCal</Text>
            <Text style={styles.subtitle}>Nutrition Tracking</Text>
          </View>
        </View>
      </View>

      <NotesEditor
        entries={entries}
        onAddEntry={addEntry}
        onUpdateEntry={updateEntry}
        onDeleteEntry={deleteEntry}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 12,
    position: 'relative',
  },
  logo: {
    width: 32,
    height: 32,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  logoAccent: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
