import { supabase } from '@/lib/supabase';
import { DatabaseSearchResult, FatSecretServing } from '@/types';

export interface FoodSearchResponse {
  common: DatabaseSearchResult[];
  branded: DatabaseSearchResult[];
  query: string;
  cached: boolean;
}

export interface FoodSearchOptions {
  limit?: number;
}

export class FoodSearchError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'FoodSearchError';
  }
}

export class FoodSearchRateLimitError extends FoodSearchError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'FoodSearchRateLimitError';
  }
}

export async function searchFoodDatabase(
  query: string,
  options: FoodSearchOptions = {}
): Promise<FoodSearchResponse> {
  if (!query || query.trim().length < 2) {
    throw new FoodSearchError('Search query must be at least 2 characters');
  }

  try {
    const requestBody: Record<string, unknown> = {
      query: query.trim(),
    };

    if (options.limit) {
      requestBody.limit = options.limit;
    }

    if (__DEV__) {
      console.log('[foodSearchApi] REQ:', JSON.stringify(requestBody));
    }

    const { data, error } = await supabase.functions.invoke<FoodSearchResponse>('food-search', {
      body: requestBody,
    });

    if (__DEV__) {
      if (error) {
        console.log('[foodSearchApi] ERR:', JSON.stringify({ message: error.message, status: (error as any).status }));
      } else {
        console.log('[foodSearchApi] RES:', JSON.stringify({ common: data?.common?.length, branded: data?.branded?.length, cached: data?.cached }));
      }
    }

    if (error) {
      throw new FoodSearchError(
        error.message || 'Failed to search food database',
        (error as any).status
      );
    }

    if (!data) {
      throw new FoodSearchError('No data returned from food search');
    }

    if (!Array.isArray(data.common) || !Array.isArray(data.branded)) {
      throw new FoodSearchError('Invalid response format: missing common/branded arrays');
    }

    return data;
  } catch (error: any) {
    if (error instanceof FoodSearchError) {
      throw error;
    }

    if (error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
      throw new FoodSearchRateLimitError('Rate limit exceeded. Please try again later.');
    }

    throw new FoodSearchError(
      `Failed to search food database: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Fetch full food detail (servings) by FatSecret food_id.
 */
export async function fetchFoodDetail(foodId: string): Promise<FatSecretServing[]> {
  try {
    const { data, error } = await supabase.functions.invoke<{ servings: FatSecretServing[]; foodId: string; name: string }>('food-search', {
      body: { mode: 'detail', foodId },
    });

    if (error || !data?.servings) {
      if (__DEV__) {
        console.log('[foodSearchApi] Detail fetch failed:', error?.message ?? 'no data');
      }
      return [];
    }

    return data.servings;
  } catch {
    return [];
  }
}
