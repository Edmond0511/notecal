import { supabase } from '@/lib/supabase';
import { BarcodeProduct, FatSecretServing, FoodItem } from '@/types';

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

/**
 * Looks up a barcode via the barcode-lookup edge function.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct> {
  let data: any;
  let error: any;

  try {
    const result = await supabase.functions.invoke('barcode-lookup', {
      body: { barcode },
    });
    data = result.data;
    error = result.error;
  } catch (err) {
    throw new BarcodeLookupError('Network error — check your connection');
  }

  if (error) {
    if ((error as any).status === 404 || data?.error === 'not_found') {
      throw new BarcodeNotFoundError(barcode);
    }
    throw new BarcodeLookupError(error.message || 'Failed to look up barcode');
  }

  if (!data || !data.servings?.length) {
    throw new BarcodeNotFoundError(barcode);
  }

  return {
    barcode: data.barcode,
    foodId: data.foodId,
    name: data.name,
    brand: data.brand || undefined,
    imageUrl: data.imageUrl || undefined,
    servings: data.servings as FatSecretServing[],
  };
}

/**
 * Creates a FoodItem from a BarcodeProduct for a selected serving.
 * If no servingId is provided, picks the first gram-based serving or first overall.
 */
export function barcodeProductToFoodItem(
  product: BarcodeProduct,
  entryId: string,
  selectedServingId?: string,
): FoodItem {
  const servings = product.servings;
  const serving = selectedServingId
    ? servings.find((s) => s.servingId === selectedServingId) ?? servings[0]
    : servings.find((s) => s.metricUnit === 'g') ?? servings[0];

  return {
    id: `${entryId}-barcode-0`,
    entryId,
    label: product.name,
    brand: product.brand,
    qty: serving.metricAmount ?? 0,
    unit: serving.metricUnit ?? 'serving',
    source: 'FS',
    sourceId: product.foodId,
    macros: { ...serving.macros },
    originalMacros: { ...serving.macros },
    confidence: 0.95,
    citations: [
      {
        provider: 'FatSecret',
        url: `https://www.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(product.name)}`,
      },
    ],
    reasoning: {
      interpretation: `Scanned barcode ${product.barcode}${product.brand ? ` (${product.brand})` : ''}`,
      assumptions: [
        'Nutrition data from FatSecret database',
        `Serving: ${serving.description}`,
      ],
      dataSource: 'FatSecret',
    },
    barcode: product.barcode,
    fsServings: servings,
    fsSelectedServingId: serving.servingId,
  };
}
