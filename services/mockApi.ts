import { FoodItem, NutritionResolveResponse } from '@/types';

// Mock nutrition data for testing
const mockFoodDatabase: Record<string, Partial<FoodItem>> = {
  'oats': {
    label: 'Oats',
    source: 'FDC',
    sourceId: '175236',
    macros: { kcal: 389, protein: 16.9, fat: 6.9, carbs: 66 },
    confidence: 0.9,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/175236/nutrients' }]
  },
  'chicken breast': {
    label: 'Chicken Breast',
    source: 'FDC',
    sourceId: '172180',
    macros: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
    confidence: 0.95,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/172180/nutrients' }]
  },
  'rice': {
    label: 'White Rice',
    source: 'FDC',
    sourceId: '175236',
    macros: { kcal: 130, protein: 2.7, fat: 0.3 },
    confidence: 0.85,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/175236/nutrients' }]
  },
  'egg': {
    label: 'Egg',
    source: 'FDC',
    sourceId: '175236',
    macros: { kcal: 155, protein: 13, fat: 11 },
    confidence: 0.9,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/175236/nutrients' }]
  },
  'banana': {
    label: 'Banana',
    source: 'FDC',
    sourceId: '175236',
    macros: { kcal: 89, protein: 1.1, fat: 0.3 },
    confidence: 0.95,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/175236/nutrients' }]
  },
  'apple': {
    label: 'Apple',
    source: 'FDC',
    sourceId: '175236',
    macros: { kcal: 52, protein: 0.3, fat: 0.2 },
    confidence: 0.9,
    citations: [{ provider: 'USDA FDC', url: 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/175236/nutrients' }]
  }
};

// Mock Gemini extraction function
function mockExtractFoodItems(textLine: string): Array<{label: string, qty: number, unit: string}> {
  // Simple mock extraction - in real implementation this would call Gemini
  const items: Array<{label: string, qty: number, unit: string}> = [];

  // Match patterns like "oats, 50g" or "2 eggs" or "chicken breast 100g"
  const patterns = [
    /(\d+)\s*(.+?),?\s*(\d+)g?/i,  // "2 eggs, 100g" or "2 chicken breast 100g"
    /(.+?),?\s*(\d+)g?/i,         // "oats, 50g" or "oats 50g"
    /(\d+)\s*(.+?)(?:\s|$)/i      // "2 eggs"
  ];

  for (const pattern of patterns) {
    const match = textLine.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        // Pattern with quantity and amount
        items.push({
          label: match[2].trim(),
          qty: parseInt(match[3]),
          unit: 'g'
        });
      } else if (pattern === patterns[1]) {
        // Pattern with just amount
        items.push({
          label: match[1].trim(),
          qty: parseInt(match[2]),
          unit: 'g'
        });
      } else if (pattern === patterns[2]) {
        // Pattern with just quantity
        items.push({
          label: match[2].trim(),
          qty: parseInt(match[1]),
          unit: 'piece'
        });
      }
      break;
    }
  }

  // Fallback: treat the whole line as one food item
  if (items.length === 0) {
    items.push({
      label: textLine.trim(),
      qty: 100, // Default 100g
      unit: 'g'
    });
  }

  return items;
}

// Mock nutrition resolution function
function mockResolveNutrition(items: Array<{label: string, qty: number, unit: string}>): FoodItem[] {
  return items.map((item, index) => {
    // Find matching food in our mock database (case insensitive)
    const normalizedLabel = item.label.toLowerCase();
    let mockData = mockFoodDatabase[normalizedLabel];

    // If no exact match, try partial matching
    if (!mockData) {
      const keys = Object.keys(mockFoodDatabase);
      const match = keys.find(key => normalizedLabel.includes(key) || key.includes(normalizedLabel));
      if (match) {
        mockData = mockFoodDatabase[match];
      }
    }

    // If still no match, use default values
    if (!mockData) {
      mockData = {
        label: item.label,
        source: 'FDC',
        sourceId: 'unknown',
        macros: { kcal: 100, protein: 10, fat: 5 },
        confidence: 0.3,
        citations: [{ provider: 'Mock Data', url: '#' }]
      };
    }

    return {
      id: `mock-${index}-${Date.now()}`,
      entryId: 'mock-entry',
      label: mockData.label || item.label,
      qty: item.qty,
      unit: item.unit,
      source: mockData.source || 'FDC',
      sourceId: mockData.sourceId || 'unknown',
      macros: {
        kcal: Math.round((mockData.macros?.kcal || 100) * item.qty / 100),
        protein: Math.round((mockData.macros?.protein || 10) * item.qty / 100 * 10) / 10,
        fat: Math.round((mockData.macros?.fat || 5) * item.qty / 100 * 10) / 10
      },
      confidence: mockData.confidence || 0.3,
      citations: mockData.citations || [{ provider: 'Mock Data', url: '#' }]
    };
  });
}

// Mock API function that simulates the real endpoint
export async function mockResolveLine(textLine: string, locale: string = 'en-US'): Promise<NutritionResolveResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

  try {
    // Extract food items
    const extractedItems = mockExtractFoodItems(textLine);

    // Resolve nutrition for each item
    const resolved = mockResolveNutrition(extractedItems);

    // Calculate totals
    const totals = resolved.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.macros.kcal,
        protein: acc.protein + item.macros.protein,
        fat: acc.fat + item.macros.fat
      }),
      { kcal: 0, protein: 0, fat: 0 }
    );

    return {
      resolved,
      totals
    };
  } catch (error) {
    return {
      resolved: [],
      totals: { kcal: 0, protein: 0, fat: 0 },
      errors: ['Failed to resolve nutrition information']
    };
  }
}