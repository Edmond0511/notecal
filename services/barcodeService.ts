import { BarcodeProduct, FoodItem, Macros } from '@/types';

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,brands,serving_size,serving_quantity,nutriments,image_front_small_url,categories_tags';

interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'proteins_100g'?: number;
  'fat_100g'?: number;
  'carbohydrates_100g'?: number;
  'fiber_100g'?: number;
  'sugars_100g'?: number;
  'sodium_100g'?: number;
  'potassium_100g'?: number;
}

interface OFFProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: OFFNutriments;
  image_front_small_url?: string;
  categories_tags?: string[];
}

interface OFFResponse {
  status: number; // 1 = found, 0 = not found
  product?: OFFProduct;
}

export class BarcodeNotFoundError extends Error {
  constructor(barcode: string) {
    super(`Product not found for barcode: ${barcode}`);
    this.name = 'BarcodeNotFoundError';
  }
}

export class BarcodeLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BarcodeLookupError';
  }
}

export class BarcodeNonFoodError extends Error {
  constructor(barcode: string) {
    super(`Non-food product: ${barcode}`);
    this.name = 'BarcodeNonFoodError';
  }
}

const NON_FOOD_CATEGORY_PREFIXES = [
  // Pet food
  'en:pet-food', 'en:dog-food', 'en:cat-food', 'en:dog-treats', 'en:cat-treats',
  'en:pet-treats', 'en:bird-food', 'en:fish-food', 'en:animal-feed',
  // Cosmetics / beauty
  'en:cosmetics', 'en:beauty', 'en:skin-care', 'en:hair-care', 'en:body-care',
  'en:makeup', 'en:perfumes', 'en:deodorants', 'en:shaving', 'en:sun-care',
  // Cleaning / household
  'en:cleaning-products', 'en:household-products', 'en:laundry-detergents', 'en:dishwashing',
  // Tobacco
  'en:tobacco', 'en:cigarettes', 'en:e-cigarettes', 'en:e-liquids',
  // Baby non-food
  'en:baby-diapers', 'en:baby-wipes', 'en:baby-care',
  // Medical / dental
  'en:medicines', 'en:medical-devices', 'en:dental-care', 'en:toothpastes', 'en:mouthwashes',
];

function isNonFoodProduct(categoriesTags?: string[]): boolean {
  if (!categoriesTags?.length) return false;
  return categoriesTags.some(tag =>
    NON_FOOD_CATEGORY_PREFIXES.some(prefix => tag.startsWith(prefix))
  );
}

/**
 * Maps Open Food Facts nutriments to our Macros type.
 * OFF stores sodium in grams; we store in mg.
 */
export function offNutrimentsToMacros(nutriments: OFFNutriments): Macros {
  return {
    kcal: Math.round(nutriments['energy-kcal_100g'] ?? 0),
    protein: Math.round((nutriments['proteins_100g'] ?? 0) * 10) / 10,
    fat: Math.round((nutriments['fat_100g'] ?? 0) * 10) / 10,
    carbs: Math.round((nutriments['carbohydrates_100g'] ?? 0) * 10) / 10,
    fiber: nutriments['fiber_100g'] != null
      ? Math.round(nutriments['fiber_100g'] * 10) / 10
      : undefined,
    sugar: nutriments['sugars_100g'] != null
      ? Math.round(nutriments['sugars_100g'] * 10) / 10
      : undefined,
    sodium: nutriments['sodium_100g'] != null
      ? Math.round(nutriments['sodium_100g'] * 1000) // g → mg
      : undefined,
    potassium: nutriments['potassium_100g'] != null
      ? Math.round(nutriments['potassium_100g'] * 1000) // g → mg
      : undefined,
  };
}

/**
 * Scales per-100g macros to a given serving size in grams.
 */
export function scaleMacrosToServing(macrosPer100g: Macros, servingGrams: number): Macros {
  const factor = servingGrams / 100;
  return {
    kcal: Math.round(macrosPer100g.kcal * factor),
    protein: Math.round(macrosPer100g.protein * factor * 10) / 10,
    fat: Math.round(macrosPer100g.fat * factor * 10) / 10,
    carbs: Math.round(macrosPer100g.carbs * factor * 10) / 10,
    ...(macrosPer100g.fiber != null && {
      fiber: Math.round(macrosPer100g.fiber * factor * 10) / 10,
    }),
    ...(macrosPer100g.sugar != null && {
      sugar: Math.round(macrosPer100g.sugar * factor * 10) / 10,
    }),
    ...(macrosPer100g.sodium != null && {
      sodium: Math.round(macrosPer100g.sodium * factor),
    }),
    ...(macrosPer100g.potassium != null && {
      potassium: Math.round(macrosPer100g.potassium * factor),
    }),
  };
}

/**
 * Parses the serving_size string from OFF into grams.
 * Examples: "30g", "30 g", "1 bar (40g)", "250ml"
 * Returns undefined if unparseable.
 */
function parseServingSizeG(servingSize?: string, servingQuantity?: number): number | undefined {
  if (servingQuantity && servingQuantity > 0) {
    return servingQuantity;
  }
  if (!servingSize) return undefined;

  // Try to find a gram value in parentheses: "1 bar (40g)" → 40
  const parenMatch = servingSize.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenMatch) return parseFloat(parenMatch[1]);

  // Try plain gram value: "30g" or "30 g"
  const plainMatch = servingSize.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plainMatch) return parseFloat(plainMatch[1]);

  // Try ml (approximate 1ml ≈ 1g for liquids)
  const mlMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  return undefined;
}

/**
 * Looks up a barcode in Open Food Facts.
 * Returns a BarcodeProduct on success, throws on not found or error.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct> {
  const url = `${OFF_API_BASE}/${barcode}?fields=${OFF_FIELDS}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'NoteCal/1.0 (nutrition-tracker-app)',
      },
    });
  } catch (err) {
    throw new BarcodeLookupError('Network error — check your connection');
  }

  if (!response.ok) {
    throw new BarcodeNotFoundError(barcode);
  }

  const data: OFFResponse = await response.json();

  if (data.status !== 1 || !data.product) {
    throw new BarcodeNotFoundError(barcode);
  }

  const product = data.product;

  if (!product.nutriments || !product.product_name) {
    throw new BarcodeNotFoundError(barcode);
  }

  if (isNonFoodProduct(product.categories_tags)) {
    throw new BarcodeNonFoodError(barcode);
  }

  const macrosPer100g = offNutrimentsToMacros(product.nutriments);
  const servingSizeG = parseServingSizeG(product.serving_size, product.serving_quantity);

  return {
    barcode,
    name: product.product_name,
    brand: product.brands || undefined,
    servingSizeG,
    imageUrl: product.image_front_small_url || undefined,
    nutrimentsPer100g: macrosPer100g,
  };
}

/**
 * Creates a FoodItem from a BarcodeProduct for the given serving size.
 */
export function barcodeProductToFoodItem(
  product: BarcodeProduct,
  entryId: string,
  servingGrams: number,
): FoodItem {
  const macros = scaleMacrosToServing(product.nutrimentsPer100g, servingGrams);

  return {
    id: `${entryId}-barcode-0`,
    entryId,
    label: product.name,
    brand: product.brand,
    qty: servingGrams,
    unit: 'g',
    source: 'OFF',
    sourceId: product.barcode,
    macros,
    confidence: 0.95,
    citations: [
      {
        provider: 'Open Food Facts',
        url: `https://world.openfoodfacts.org/product/${product.barcode}`,
      },
    ],
    reasoning: {
      interpretation: `Scanned barcode ${product.barcode}${product.brand ? ` (${product.brand})` : ''}`,
      assumptions: [
        `Nutrition data from Open Food Facts database`,
        `Serving size: ${servingGrams}g`,
        `Values scaled from per-100g data`,
      ],
      dataSource: 'Open Food Facts (OFF)',
    },
    barcode: product.barcode,
  };
}
