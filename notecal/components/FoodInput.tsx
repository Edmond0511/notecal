import React, { useState, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  FlatList,
  Keyboard,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchFoods, getCommonFoods } from '../services/nutritionApi';
import { addFoodEntry } from '../services/storage';
import { FoodSearchResult, FoodEntry, NutritionInfo } from '../types';
import { calculateNutritionForGrams, generateId } from '../utils/calculations';

interface FoodInputProps {
  onFoodAdded: () => void;
  currentDate: string;
}

export const FoodInput: React.FC<FoodInputProps> = ({ onFoodAdded, currentDate }) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (query.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        performSearch(query);
      }, 300);

      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setIsSearching(true);
    try {
      const results = await searchFoods(searchQuery);
      if (results.length === 0) {
        // Fallback to common foods if no API results
        const commonFoods = getCommonFoods().filter(food => 
          food.food_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSearchResults(commonFoods);
      } else {
        setSearchResults(results);
      }
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      // Show common foods on error
      const commonFoods = getCommonFoods().filter(food => 
        food.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(commonFoods);
      setShowResults(true);
    } finally {
      setIsSearching(false);
    }
  };

  const parseQuantity = (input: string): { quantity: number; foodName: string } => {
    // Parse patterns like "150g chicken" or "2 medium apples"
    const patterns = [
      /^(\d+(?:\.\d+)?)\s*g\s+(.+)$/i, // "150g chicken"
      /^(\d+(?:\.\d+)?)\s*grams?\s+(.+)$/i, // "150 grams chicken"
      /^(\d+(?:\.\d+)?)\s*oz\s+(.+)$/i, // "5oz chicken"
      /^(\d+(?:\.\d+)?)\s*(.+)$/i, // "2 medium apples"
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        let quantity = parseFloat(match[1]);
        const foodName = match[2].trim();

        // Convert ounces to grams
        if (input.toLowerCase().includes('oz')) {
          quantity = quantity * 28.35; // 1 oz = 28.35g
        }

        return { quantity, foodName };
      }
    }

    // Default: assume 100g if no quantity specified
    return { quantity: 100, foodName: input.trim() };
  };

  const addFoodFromQuery = async () => {
    if (!query.trim()) return;

    const { quantity, foodName } = parseQuantity(query);
    
    // Search for the food to get nutrition data
    try {
      const results = await searchFoods(foodName);
      let foodData: FoodSearchResult | null = null;

      if (results.length > 0) {
        foodData = results[0];
      } else {
        // Try common foods
        const commonFoods = getCommonFoods();
        foodData = commonFoods.find(food => 
          food.food_name.toLowerCase().includes(foodName.toLowerCase())
        ) || null;
      }

      if (foodData) {
        const baseNutrition: NutritionInfo = {
          calories: foodData.nf_calories,
          protein: foodData.nf_protein,
          carbs: foodData.nf_carbohydrates,
          fat: foodData.nf_total_fat,
          fiber: foodData.nf_dietary_fiber || foodData.nf_fiber,
          sugar: foodData.nf_sugars,
        };

        const nutrition = calculateNutritionForGrams(baseNutrition, quantity);

        const entry: FoodEntry = {
          id: generateId(),
          name: foodData.food_name,
          quantity,
          unit: 'g',
          nutrition,
          timestamp: new Date(),
        };

        await addFoodEntry(currentDate, entry);
        setQuery('');
        setShowResults(false);
        Keyboard.dismiss();
        onFoodAdded();
      } else {
        Alert.alert('Food Not Found', 'Could not find nutrition data for this food. Try being more specific.');
      }
    } catch (error) {
      console.error('Error adding food:', error);
      Alert.alert('Error', 'Failed to add food item');
    }
  };

  const selectFood = async (food: FoodSearchResult) => {
    const { quantity } = parseQuantity(query);
    
    const baseNutrition: NutritionInfo = {
      calories: food.nf_calories,
      protein: food.nf_protein,
      carbs: food.nf_carbohydrates,
      fat: food.nf_total_fat,
      fiber: food.nf_dietary_fiber || food.nf_fiber,
      sugar: food.nf_sugars,
    };

    const nutrition = calculateNutritionForGrams(baseNutrition, quantity);

    const entry: FoodEntry = {
      id: generateId(),
      name: food.food_name,
      quantity,
      unit: 'g',
      nutrition,
      timestamp: new Date(),
    };

    try {
      await addFoodEntry(currentDate, entry);
      setQuery('');
      setShowResults(false);
      Keyboard.dismiss();
      onFoodAdded();
    } catch (error) {
      console.error('Error adding food:', error);
      Alert.alert('Error', 'Failed to add food item');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.documentContainer}>
        <TextInput
          style={styles.documentInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={addFoodFromQuery}
          returnKeyType="done"
          multiline
          autoFocus
          textAlignVertical="top"
        />
        {!!query.trim() && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={addFoodFromQuery}
          >
            <Ionicons name="checkmark" size={20} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      {showResults && (
        <View style={styles.resultsContainer}>
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item, index) => `${item.food_name}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => selectFood(item)}
                >
                  <View style={styles.resultContent}>
                    <Text style={styles.foodName}>{item.food_name}</Text>
                    {item.brand_name && (
                      <Text style={styles.brandName}>{item.brand_name}</Text>
                    )}
                    <Text style={styles.nutritionInfo}>
                      {Math.round(item.nf_calories)} cal per 100g
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              )}
              style={styles.resultsList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    
  },
  documentContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 200,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  documentInput: {
    flex: 1,
    fontSize: 18,
    color: '#333',
    padding: 20,
    minHeight: 160,
    lineHeight: 24,
    fontWeight: '400',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 16,
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  resultsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    maxHeight: 240,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 10,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  resultsList: {
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#ffffff',
  },
  resultContent: {
    flex: 1,
  },
  foodName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#1d1d1f',
    marginBottom: 4,
    lineHeight: 22,
  },
  brandName: {
    fontSize: 14,
    color: '#86868b',
    marginBottom: 4,
    fontWeight: '400',
  },
  nutritionInfo: {
    fontSize: 13,
    color: '#86868b',
    fontWeight: '400',
  },
});
