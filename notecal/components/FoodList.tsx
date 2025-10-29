import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodEntry } from '../types';
import { deleteFoodEntry } from '../services/storage';
import { formatNumber } from '../utils/calculations';

interface FoodListProps {
  entries: FoodEntry[];
  onFoodDeleted: () => void;
  currentDate: string;
}

export const FoodList: React.FC<FoodListProps> = ({ 
  entries, 
  onFoodDeleted, 
  currentDate 
}) => {
  const handleDeleteEntry = async (entryId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this food entry?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFoodEntry(currentDate, entryId);
              onFoodDeleted();
            } catch (error) {
              console.error('Error deleting entry:', error);
              Alert.alert('Error', 'Failed to delete entry');
            }
          },
        },
      ]
    );
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const renderFoodEntry = ({ item, index }: { item: FoodEntry; index: number }) => (
    <View style={styles.entryContainer}>
      <View style={styles.entryContent}>
        <View style={styles.entryHeader}>
          <Text style={styles.foodName}>{item.name}</Text>
          <Text style={styles.quantity}>
            {formatNumber(item.quantity)}{item.unit}
          </Text>
        </View>
        
        <View style={styles.nutritionRow}>
          <Text style={styles.nutritionText}>
            {item.nutrition.calories} cal
          </Text>
          <Text style={styles.nutritionText}>
            P: {formatNumber(item.nutrition.protein, 1)}g
          </Text>
          <Text style={styles.nutritionText}>
            C: {formatNumber(item.nutrition.carbs, 1)}g
          </Text>
          <Text style={styles.nutritionText}>
            F: {formatNumber(item.nutrition.fat, 1)}g
          </Text>
        </View>
        
        <Text style={styles.timestamp}>
          {formatTime(new Date(item.timestamp))}
        </Text>
      </View>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteEntry(item.id)}
      >
        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  if (entries.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="restaurant-outline" size={48} color="#C7C7CC" />
        <Text style={styles.emptyText}>No food entries yet</Text>
        <Text style={styles.emptySubtext}>
          Start by typing a food above
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderFoodEntry}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  entryContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F2F2F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  entryContent: {
    flex: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  quantity: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
    marginLeft: 8,
  },
  nutritionRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  nutritionText: {
    fontSize: 12,
    color: '#666666',
    marginRight: 16,
  },
  timestamp: {
    fontSize: 11,
    color: '#999999',
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#C7C7CC',
    textAlign: 'center',
  },
});
