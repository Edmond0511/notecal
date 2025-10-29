import axios from 'axios';
import { FoodSearchResult } from '../types';

// Using Open Food Facts API (free, no API key required)
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/search';

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
