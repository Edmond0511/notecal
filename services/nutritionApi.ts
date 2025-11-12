import { supabase } from '@/lib/supabase';
import { NutritionResolveResponse } from '@/types';

export interface NutritionApiOptions {
  userId?: string;
  aiProvider?: 'openai' | 'gemini' | 'claude';
}

export class NutritionApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NutritionApiError';
  }
}

export class NutritionRateLimitError extends NutritionApiError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'NutritionRateLimitError';
  }
}

export class NutritionQuotaExceededError extends NutritionApiError {
  constructor(message: string) {
    super(message, 403);
    this.name = 'NutritionQuotaExceededError';
  }
}

/**
 * Resolve nutrition information using Supabase Edge Functions with AI
 * @param foodText The food text to analyze
 * @param options Optional configuration including user ID and AI provider preference
 * @returns NutritionResolveResponse with calculated nutrition data
 */
export async function resolveNutrition(
  foodText: string,
  options: NutritionApiOptions = {}
): Promise<NutritionResolveResponse> {
  const { userId, aiProvider = 'openai' } = options;

  if (!foodText || foodText.trim().length === 0) {
    throw new NutritionApiError('Food text is required');
  }

  try {
    // Check user quota if userId is provided
    if (userId) {
      await checkUserQuota(userId);
    }

    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke<NutritionResolveResponse>('nutrition-resolve', {
      body: {
        foodText: foodText.trim(),
        userId,
        aiProvider
      }
    });

    if (error) {
      throw new NutritionApiError(
        error.message || 'Failed to resolve nutrition',
        error.status
      );
    }

    if (!data) {
      throw new NutritionApiError('No data returned from nutrition service');
    }

    // Validate response structure
    if (!data.items || !Array.isArray(data.items)) {
      throw new NutritionApiError('Invalid response format: missing items array');
    }

    if (!data.totals || typeof data.totals !== 'object') {
      throw new NutritionApiError('Invalid response format: missing totals object');
    }

    return data;

  } catch (error) {
    if (error instanceof NutritionApiError) {
      throw error;
    }

    // Handle specific error types
    if (error.message?.includes('rate limit')) {
      throw new NutritionRateLimitError('Rate limit exceeded. Please try again later.');
    }

    if (error.message?.includes('quota exceeded')) {
      throw new NutritionQuotaExceededError('Monthly quota exceeded. Please upgrade your plan.');
    }

    // Network or other errors
    throw new NutritionApiError(
      `Failed to resolve nutrition: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Batch resolve multiple food items
 * @param foodTexts Array of food texts to resolve
 * @param options Optional configuration
 * @returns Array of NutritionResolveResponse
 */
export async function batchResolveNutrition(
  foodTexts: string[],
  options: NutritionApiOptions = {}
): Promise<NutritionResolveResponse[]> {
  if (!foodTexts || foodTexts.length === 0) {
    return [];
  }

  const results: NutritionResolveResponse[] = [];
  const errors: Array<{ index: number; error: Error }> = [];

  // Process items in parallel (limit to avoid overwhelming the API)
  const batchSize = 3;
  for (let i = 0; i < foodTexts.length; i += batchSize) {
    const batch = foodTexts.slice(i, i + batchSize);

    const batchPromises = batch.map(async (foodText, index) => {
      try {
        const result = await resolveNutrition(foodText, options);
        return { index: i + index, result, error: null };
      } catch (error) {
        return { index: i + index, result: null, error: error as Error };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((promiseResult) => {
      if (promiseResult.status === 'fulfilled' && promiseResult.value.result) {
        results[promiseResult.value.index] = promiseResult.value.result;
      } else {
        const index = promiseResult.status === 'fulfilled'
          ? promiseResult.value.index
          : i + batch.indexOf(foodTexts[i + batchResults.length]);
        const error = promiseResult.status === 'fulfilled'
          ? promiseResult.value.error
          : new Error('Batch processing failed');

        errors.push({ index, error });

        // Add a fallback result for failed items
        results[index] = createFallbackResponse(foodTexts[index]);
      }
    });

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < foodTexts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Get user's current usage statistics
 * @param userId The user ID to check
 * @returns Usage statistics for the current month
 */
export async function getUserUsageStats(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_usage_summary')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new NutritionApiError(`Failed to fetch usage stats: ${error.message}`);
    }

    return data || {
      user_id: userId,
      usage_quota: 1000,
      current_usage: 0,
      total_requests: 0,
      total_tokens: 0,
      total_cost_cents: 0,
      last_request: null
    };
  } catch (error) {
    throw new NutritionApiError(
      `Failed to get usage statistics: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Get user's favorite foods for quick access
 * @param userId The user ID
 * @returns Array of favorite foods
 */
export async function getUserFavoriteFoods(userId: string) {
  try {
    const { data, error } = await supabase
      .from('favorite_foods')
      .select('*')
      .eq('user_id', userId)
      .order('frequency_score', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new NutritionApiError(`Failed to fetch favorite foods: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    throw new NutritionApiError(
      `Failed to get favorite foods: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Add or update a favorite food
 * @param userId The user ID
 * @param foodLabel The food label
 * @param portionQty Standard portion quantity
 * @param portionUnit Standard portion unit
 */
export async function updateFavoriteFood(
  userId: string,
  foodLabel: string,
  portionQty: number = 100,
  portionUnit: string = 'g'
) {
  try {
    const { data, error } = await supabase
      .from('favorite_foods')
      .upsert({
        user_id: userId,
        food_label: foodLabel.trim(),
        standard_portion_qty: portionQty,
        standard_portion_unit: portionUnit,
        frequency_score: 1, // Will be updated separately
        last_used_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,food_label'
      })
      .select()
      .single();

    if (error) {
      throw new NutritionApiError(`Failed to update favorite food: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new NutritionApiError(
      `Failed to update favorite food: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Clear the nutrition cache for a specific query
 * @param foodQuery The food query to clear from cache
 */
export async function clearCacheEntry(foodQuery: string) {
  try {
    const { error } = await supabase
      .from('nutrition_cache')
      .delete()
      .eq('food_query', foodQuery.toLowerCase().trim());

    if (error) {
      throw new NutritionApiError(`Failed to clear cache entry: ${error.message}`);
    }

    return true;
  } catch (error) {
    throw new NutritionApiError(
      `Failed to clear cache entry: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Get popular cached foods (frequently requested)
 * @param limit Maximum number of results to return
 */
export async function getPopularFoods(limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from('popular_foods')
      .select('*')
      .limit(limit);

    if (error) {
      throw new NutritionApiError(`Failed to get popular foods: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    throw new NutritionApiError(
      `Failed to get popular foods: ${error.message}`,
      undefined,
      error as Error
    );
  }
}

// Helper functions

async function checkUserQuota(userId: string) {
  const stats = await getUserUsageStats(userId);

  if (stats.current_usage >= stats.usage_quota) {
    throw new NutritionQuotaExceededError(
      `Monthly quota exceeded (${stats.current_usage}/${stats.usage_quota}). Please upgrade your plan.`
    );
  }
}

function createFallbackResponse(foodText: string): NutritionResolveResponse {
  // Very basic fallback estimation for failed API calls
  return {
    resolved: [{
      id: Date.now().toString(),
      entryId: 'fallback',
      label: foodText.trim(),
      qty: 100,
      unit: 'g',
      source: 'fallback' as const,
      sourceId: 'fallback',
      macros: {
        kcal: 150,
        protein: 15,
        fat: 5
      },
      confidence: 0.1, // Very low confidence
      citations: []
    }],
    totals: {
      kcal: 150,
      protein: 15,
      fat: 5
    },
    errors: ['AI service unavailable, showing estimated values']
  };
}