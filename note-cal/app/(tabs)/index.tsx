import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { NotesEditor } from '@/components/NotesEditor';
import { useAppStore } from '@/store/app-store';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function HomeScreen() {
  const {
    getEntriesForDate,
    currentDate,
    addEntry,
    updateEntry,
    deleteEntry,
    setCurrentDate
  } = useAppStore();

  const entries = getEntriesForDate(currentDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Convert YYYYMMDD string to Date object
  const stringToDate = (dateString: string): Date => {
    return new Date(
      Number.parseInt(dateString.substring(0, 4)),
      Number.parseInt(dateString.substring(4, 6)) - 1,
      Number.parseInt(dateString.substring(6, 8))
    );
  };

  // Date navigation functions
  const formatDateDisplay = (dateString: string) => {
    const today = new Date();
    const date = stringToDate(dateString);

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
    const current = stringToDate(currentDate);

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

  // Calendar picker function
  const openDatePicker = () => {
    setTempDate(stringToDate(currentDate));
    setShowDatePicker(true);
  };

  // Handle iOS date picker change
  const onDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) {
      const newDateString = selectedDate.getFullYear().toString() +
        (selectedDate.getMonth() + 1).toString().padStart(2, '0') +
        selectedDate.getDate().toString().padStart(2, '0');
      setCurrentDate(newDateString);
    }
    setShowDatePicker(false);
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

          <TouchableOpacity onPress={openDatePicker}>
            <View style={styles.dateButtonContent}>
              <Text style={styles.dateText}>
                {formatDateDisplay(currentDate)}
              </Text>
            </View>
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

      {/* DateTimePicker - iOS calendar with overlay */}
      {showDatePicker && (
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Select Date</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={onDateChange}
              style={styles.datePicker}
              textColor="#000000"
              accentColor="#007AFF"
            />
          </View>
        </View>
      )}
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
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarIcon: {
    marginRight: 4,
  },
  datePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  datePickerContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  datePickerCloseButton: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F0F8FF',
  },
  datePicker: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
});
