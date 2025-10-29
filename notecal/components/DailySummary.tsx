import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NutritionInfo } from '../types';
import { formatNumber } from '../utils/calculations';

interface DailySummaryProps {
  totals?: NutritionInfo;
}

export const DailySummary: React.FC<DailySummaryProps> = ({ totals }) => {
  if (!totals) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Daily Summary</Text>
        <Text style={styles.emptyText}>No entries yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Summary</Text>
      </View>
      
      <View style={styles.summaryContent}>
        <View style={styles.primaryStat}>
          <Text style={styles.caloriesValue}>{formatNumber(totals.calories)}</Text>
          <Text style={styles.caloriesLabel}>Calories</Text>
        </View>
        
        <View style={styles.macrosRow}>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>
              {formatNumber(totals.protein, 1)}g
            </Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>
              {formatNumber(totals.carbs, 1)}g
            </Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>
              {formatNumber(totals.fat, 1)}g
            </Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
        </View>
        
        {(totals.fiber !== undefined && totals.fiber > 0) && (
          <View style={styles.fiberRow}>
            <Text style={styles.fiberText}>
              Fiber: {formatNumber(totals.fiber, 1)}g
            </Text>
            {totals.sugar !== undefined && totals.sugar > 0 && (
              <Text style={styles.sugarText}>
                Sugar: {formatNumber(totals.sugar, 1)}g
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  summaryContent: {
    alignItems: 'center',
  },
  primaryStat: {
    alignItems: 'center',
    marginBottom: 16,
  },
  caloriesValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 4,
  },
  caloriesLabel: {
    fontSize: 14,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 12,
  },
  macroItem: {
    alignItems: 'center',
    flex: 1,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 12,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fiberRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  fiberText: {
    fontSize: 12,
    color: '#666666',
  },
  sugarText: {
    fontSize: 12,
    color: '#666666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
