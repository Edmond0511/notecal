import { supabase } from '@/lib/supabase';
import { CommonPortion, DatabaseSearchResult } from '@/types';

export interface FoodSearchResponse {
  results: DatabaseSearchResult[];
  query: string;
  cached: boolean;
}

export interface FoodSearchOptions {
  sources?: ('FDC' | 'OFF')[];
  limit?: number;
}

/** Convert "ALL CAPS TEXT" to "All Caps Text" */
function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, (ch) => ch.toUpperCase());
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

    if (options.sources) {
      requestBody.sources = options.sources;
    }
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
        console.log('[foodSearchApi] RES:', JSON.stringify({ count: data?.results?.length, cached: data?.cached }));
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

    if (!data.results || !Array.isArray(data.results)) {
      throw new FoodSearchError('Invalid response format: missing results array');
    }

    // Normalize uppercase names from database to title case
    data.results = data.results.map((r) => ({
      ...r,
      name: r.name === r.name.toUpperCase() ? titleCase(r.name) : r.name,
    }));

    return data;
  } catch (error: any) {
    if (error instanceof FoodSearchError) {
      throw error;
    }

    if (error.message?.includes('rate limit')) {
      throw new FoodSearchRateLimitError('Rate limit exceeded. Please try again later.');
    }

    throw new FoodSearchError(
      `Failed to search food database: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

export async function fetchFoodPortions(fdcId: number): Promise<CommonPortion[]> {
  try {
    const { data, error } = await supabase.functions.invoke<{ portions: CommonPortion[] }>('food-search', {
      body: { mode: 'detail', fdcId },
    });

    if (error || !data?.portions) {
      if (__DEV__) {
        console.log('[foodSearchApi] Portions fetch failed:', error?.message ?? 'no data');
      }
      return [];
    }

    return data.portions;
  } catch {
    return [];
  }
}
