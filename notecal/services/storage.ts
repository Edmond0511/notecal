import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyLog, FoodEntry } from '../types';

const STORAGE_KEYS = {
  DAILY_LOGS: 'notecal_daily_logs',
  CURRENT_DATE: 'notecal_current_date',
};

export const saveDailyLog = async (dailyLog: DailyLog): Promise<void> => {
  try {
    const existingLogs = await getAllDailyLogs();
    const updatedLogs = {
      ...existingLogs,
      [dailyLog.date]: dailyLog,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_LOGS, JSON.stringify(updatedLogs));
  } catch (error) {
    console.error('Error saving daily log:', error);
  }
};

export const getDailyLog = async (date: string): Promise<DailyLog | null> => {
  try {
    const logs = await getAllDailyLogs();
    return logs[date] || null;
  } catch (error) {
    console.error('Error getting daily log:', error);
    return null;
  }
};

export const getAllDailyLogs = async (): Promise<Record<string, DailyLog>> => {
  try {
    const logs = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_LOGS);
    return logs ? JSON.parse(logs) : {};
  } catch (error) {
    console.error('Error getting all daily logs:', error);
    return {};
  }
};

export const addFoodEntry = async (date: string, entry: FoodEntry): Promise<DailyLog> => {
  try {
    const dailyLog = await getDailyLog(date);
    const updatedLog: DailyLog = {
      date,
      entries: [...(dailyLog?.entries || []), entry],
      totals: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    };
    
    // Calculate totals
    updatedLog.totals = updatedLog.entries.reduce(
      (totals, entry) => ({
        calories: totals.calories + entry.nutrition.calories,
        protein: totals.protein + entry.nutrition.protein,
        carbs: totals.carbs + entry.nutrition.carbs,
        fat: totals.fat + entry.nutrition.fat,
        fiber: (totals.fiber || 0) + (entry.nutrition.fiber || 0),
        sugar: (totals.sugar || 0) + (entry.nutrition.sugar || 0),
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
      }
    );

    await saveDailyLog(updatedLog);
    return updatedLog;
  } catch (error) {
    console.error('Error adding food entry:', error);
    throw error;
  }
};

export const deleteFoodEntry = async (date: string, entryId: string): Promise<DailyLog> => {
  try {
    const dailyLog = await getDailyLog(date);
    if (!dailyLog) throw new Error('Daily log not found');

    const updatedLog: DailyLog = {
      ...dailyLog,
      entries: dailyLog.entries.filter(entry => entry.id !== entryId),
    };

    // Recalculate totals
    updatedLog.totals = updatedLog.entries.reduce(
      (totals, entry) => ({
        calories: totals.calories + entry.nutrition.calories,
        protein: totals.protein + entry.nutrition.protein,
        carbs: totals.carbs + entry.nutrition.carbs,
        fat: totals.fat + entry.nutrition.fat,
        fiber: (totals.fiber || 0) + (entry.nutrition.fiber || 0),
        sugar: (totals.sugar || 0) + (entry.nutrition.sugar || 0),
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
      }
    );

    await saveDailyLog(updatedLog);
    return updatedLog;
  } catch (error) {
    console.error('Error deleting food entry:', error);
    throw error;
  }
};

export const saveCurrentDate = async (date: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_DATE, date);
  } catch (error) {
    console.error('Error saving current date:', error);
  }
};

export const getCurrentDate = async (): Promise<string> => {
  try {
    const date = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_DATE);
    return date || new Date().toISOString().split('T')[0];
  } catch (error) {
    console.error('Error getting current date:', error);
    return new Date().toISOString().split('T')[0];
  }
};
