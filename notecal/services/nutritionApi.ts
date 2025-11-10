import axios from 'axios';
import { FoodSearchResult } from '../types';

// Using Open Food Facts API (free, no API key required)
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/search';

// Common foods with basic nutrition data for fallback
const commonFoods: FoodSearchResult[] = [
  {
    food_name: 'Apple',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 52,
    nf_protein: 0.3,
    nf_carbohydrates: 14,
    nf_total_fat: 0.2,
    nf_dietary_fiber: 2.4,
    nf_sugars: 10,
  },
  {
    food_name: 'Banana',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 89,
    nf_protein: 1.1,
    nf_carbohydrates: 23,
    nf_total_fat: 0.3,
    nf_dietary_fiber: 2.6,
    nf_sugars: 12,
  },
  {
    food_name: 'Chicken Breast',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 165,
    nf_protein: 31,
    nf_carbohydrates: 0,
    nf_total_fat: 3.6,
    nf_dietary_fiber: 0,
    nf_sugars: 0,
  },
  {
    food_name: 'Brown Rice',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 111,
    nf_protein: 2.6,
    nf_carbohydrates: 23,
    nf_total_fat: 0.9,
    nf_dietary_fiber: 1.8,
    nf_sugars: 0.4,
  },
  {
    food_name: 'Broccoli',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 34,
    nf_protein: 2.8,
    nf_carbohydrates: 7,
    nf_total_fat: 0.4,
    nf_dietary_fiber: 2.6,
    nf_sugars: 1.5,
  },
  {
    food_name: 'Eggs',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 155,
    nf_protein: 13,
    nf_carbohydrates: 1.1,
    nf_total_fat: 11,
    nf_dietary_fiber: 0,
    nf_sugars: 1.1,
  },
  {
    food_name: 'Greek Yogurt',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 59,
    nf_protein: 10,
    nf_carbohydrates: 3.6,
    nf_total_fat: 0.4,
    nf_dietary_fiber: 0,
    nf_sugars: 3.6,
  },
  {
    food_name: 'Oats',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 389,
    nf_protein: 16.9,
    nf_carbohydrates: 66,
    nf_total_fat: 6.9,
    nf_dietary_fiber: 10.6,
    nf_sugars: 0.6,
  },
  {
    food_name: 'Salmon',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 208,
    nf_protein: 25.4,
    nf_carbohydrates: 0,
    nf_total_fat: 12.4,
    nf_dietary_fiber: 0,
    nf_sugars: 0,
  },
  {
    food_name: 'Sweet Potato',
    serving_qty: 100,
    serving_unit: 'g',
    nf_calories: 86,
    nf_protein: 1.6,
    nf_carbohydrates: 20,
    nf_total_fat: 0.1,
    nf_dietary_fiber: 3,
    nf_sugars: 4.2,
  },
];

export const getCommonFoods = (): FoodSearchResult[] => {
  return commonFoods;
};

export const searchFoods = async (query: string): Promise<FoodSearchResult[]> => {
  try {
    const response = await axios.get(OPEN_FOOD_FACTS_API, {
      params: {
        search_terms: query,
        search_simple: 1,
        action: 'process',
        json: 1,
        page_size: 10,
        fields: 'product_name,brands,nutriments,serving_size',
      },
    });

    const products = response.data.products || [];

    return products
      .filter((product: any) => product.nutriments?.['energy-kcal_100g'])
      .map((product: any): FoodSearchResult => ({
        food_name: product.product_name || 'Unknown Food',
        brand_name: product.brands || undefined,
        serving_qty: 100, // Standardize to 100g
        serving_unit: 'g',
        nf_calories: product.nutriments['energy-kcal_100g'] || 0,
        nf_protein: product.nutriments.proteins_100g || 0,
        nf_carbohydrates: product.nutriments.carbohydrates_100g || 0,
        nf_total_fat: product.nutriments.fat_100g || 0,
        nf_dietary_fiber: product.nutriments.fiber_100g,
        nf_sugars: product.nutriments.sugars_100g,
      }))
      .slice(0, 5); // Limit to 5 results
  } catch (error) {
    console.error('Error searching foods:', error);
    return [];
  }
};
