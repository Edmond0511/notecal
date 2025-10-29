import axios from 'axios';
import { FoodSearchResult } from '../types';

// Using Open Food Facts API (free, no API key required)
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/search';

export const searchFoods = async (query: string): Promise<FoodSearchResult[]> => {
  if (!query.trim()) return [];

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
      .filter((product: any) => product.nutriments && product.nutriments['energy-kcal_100g'])
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

// Fallback common foods database for offline functionality
export const getCommonFoods = (): FoodSearchResult[] => {
  return [
    {
      food_name: 'Apple',
      serving_qty: 100,
      serving_unit: 'g',
      nf_calories: 52,
      nf_protein: 0.3,
      nf_carbohydrates: 14,
      nf_total_fat: 0.2,
      nf_fiber: 2.4,
      nf_sugars: 10.4,
    },
    {
      food_name: 'Banana',
      serving_qty: 100,
      serving_unit: 'g',
      nf_calories: 89,
      nf_protein: 1.1,
      nf_carbohydrates: 23,
      nf_total_fat: 0.3,
      nf_fiber: 2.6,
      nf_sugars: 12.2,
    },
    {
      food_name: 'Chicken Breast',
      serving_qty: 100,
      serving_unit: 'g',
      nf_calories: 165,
      nf_protein: 31,
      nf_carbohydrates: 0,
      nf_total_fat: 3.6,
    },
    {
      food_name: 'White Rice',
      serving_qty: 100,
      serving_unit: 'g',
      nf_calories: 130,
      nf_protein: 2.7,
      nf_carbohydrates: 28,
      nf_total_fat: 0.3,
    },
    {
      food_name: 'Whole Wheat Bread',
      serving_qty: 100,
      serving_unit: 'g',
      nf_calories: 247,
      nf_protein: 13,
      nf_carbohydrates: 41,
      nf_total_fat: 3.4,
      nf_fiber: 7,
    },
  ];
};
