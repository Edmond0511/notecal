import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, SafeAreaView, TouchableOpacity } from 'react-native';
import { NotesEditor } from '@/components/NotesEditor';
import { useAppStore } from '@/store/app-store';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const {
    getEntriesForDate,
    currentDate,
    addEntry,
    updateEntry,
    deleteEntry,
    isLoading,
    setCurrentDate
  } = useAppStore();

  const entries = getEntriesForDate(currentDate);

  // Date navigation functions
  const formatDateDisplay = (dateString: string) => {
    const today = new Date();
    const date = new Date(
      parseInt(dateString.substring(0, 4)),
      parseInt(dateString.substring(4, 6)) - 1,
      parseInt(dateString.substring(6, 8))
    );

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

 
    // Otherwise show formatted date
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = new Date(
      parseInt(currentDate.substring(0, 4)),
      parseInt(currentDate.substring(4, 6)) - 1,
      parseInt(currentDate.substring(6, 8))
    );

    const newDate = new Date(current);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }

    const newDateString = newDate.getFullYear().toString() +
      (newDate.getMonth() + 1).toString().padStart(2, '0') +
      newDate.getDate().toString().padStart(2, '0');

    setCurrentDate(newDateString);
  };

  const goToToday = () => {
    const today = new Date();
    const todayString = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    setCurrentDate(todayString);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View style={styles.dateNavigationContainer}>
          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate('prev')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity onPress={goToToday} style={styles.dateButtonCompact}>
            <Text style={styles.dateText}>
              {formatDateDisplay(currentDate)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate('next')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-forward" size={20} color="#333" />
          </TouchableOpacity>
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
    borderBottomColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  dateNavigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafaf8ff',
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navButtonCompact: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  dateButtonCompact: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginHorizontal: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});
