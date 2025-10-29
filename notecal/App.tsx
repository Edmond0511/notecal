import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { FoodInput } from './components/FoodInput';
import { FoodList } from './components/FoodList';
import { DailySummary } from './components/DailySummary';
import { DateNavigation } from './components/DateNavigation';
import { getDailyLog, getCurrentDate, saveCurrentDate } from './services/storage';
import { DailyLog } from './types';

export default function App() {
  const [currentDate, setCurrentDate] = useState('');
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);

  useEffect(() => {
    loadCurrentDate();
  }, []);

  useEffect(() => {
    if (currentDate) {
      loadDailyLog();
    }
  }, [currentDate]);

  const loadCurrentDate = async () => {
    try {
      const savedDate = await getCurrentDate();
      setCurrentDate(savedDate);
    } catch (error) {
      console.error('Error loading current date:', error);
      setCurrentDate(new Date().toISOString().split('T')[0]);
    }
  };

  const loadDailyLog = async () => {
    try {
      const log = await getDailyLog(currentDate);
      setDailyLog(log);
    } catch (error) {
      console.error('Error loading daily log:', error);
    }
  };

  const handleDateChange = async (newDate: string) => {
    setCurrentDate(newDate);
    await saveCurrentDate(newDate);
  };

  const handleFoodAdded = () => {
    loadDailyLog();
  };

  const handleFoodDeleted = () => {
    loadDailyLog();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <DateNavigation 
            currentDate={currentDate}
            onDateChange={handleDateChange}
          />
          
          <View style={styles.mainContent}>
            <FoodInput 
              onFoodAdded={handleFoodAdded}
              currentDate={currentDate}
            />
            
            <FoodList 
              entries={dailyLog?.entries || []}
              onFoodDeleted={handleFoodDeleted}
              currentDate={currentDate}
            />
          </View>

          <DailySummary totals={dailyLog?.totals} />
        </View>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
