import { supabase } from '@/lib/supabase';
import { NutritionResolveResponse, Macros, FoodItem } from '@/types';

export interface NutritionApiOptions {
  userId?: string;
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
 * Resolve nutrition information using Supabase Edge Functions with Gemini AI
 * @param foodText The food text to analyze
 * @param options Optional configuration including user ID
 * @returns NutritionResolveResponse with calculated nutrition data
 */
export async function resolveNutrition(
  foodText: string,
  options: NutritionApiOptions = {}
): Promise<NutritionResolveResponse> {
  const { userId } = options;

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
        userId
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
    if (!data.resolved || !Array.isArray(data.resolved)) {
      throw new NutritionApiError('Invalid response format: missing resolved items array');
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
  // Return zeros when AI service is unavailable
  const nutrition = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0 };

  return {
    resolved: [{
      id: Date.now().toString(),
      entryId: 'fallback',
      label: foodText.trim(),
      qty: 0,
      unit: 'g',
      source: 'fallback' as const,
      sourceId: 'fallback',
      macros: nutrition,
      confidence: 0,
      citations: []
    }],
    totals: nutrition,
    errors: ['AI service unavailable']
  };
}

/**
 * Correction response from the AI
 */
export interface CorrectionResponse {
  correctedMacros: Macros;
  correctedLabel?: string;
  explanation: string;
}

/**
 * Correct nutrition data for a food item based on user feedback
 * @param item The food item to correct
 * @param feedback User's description of what's wrong
 * @param options Optional configuration including user ID
 * @returns CorrectionResponse with updated values and explanation
 */
export async function correctNutrition(
  item: FoodItem,
  feedback: string,
  options: NutritionApiOptions = {}
): Promise<CorrectionResponse> {
  const { userId } = options;

  if (!feedback || feedback.trim().length === 0) {
    throw new NutritionApiError('Feedback is required');
  }

  try {
    // Check user quota if userId is provided
    if (userId) {
      await checkUserQuota(userId);
    }

    // Call the Supabase Edge Function with correction mode
    const { data, error } = await supabase.functions.invoke<CorrectionResponse>('nutrition-resolve', {
      body: {
        correctionMode: true,
        foodText: item.label,
        currentMacros: item.macros,
        userFeedback: feedback.trim(),
        userId
      }
    });

    if (error) {
      throw new NutritionApiError(
        error.message || 'Failed to correct nutrition',
        error.status
      );
    }

    if (!data) {
      throw new NutritionApiError('No data returned from correction service');
    }

    // Validate response structure
    if (!data.correctedMacros || typeof data.correctedMacros !== 'object') {
      throw new NutritionApiError('Invalid response format: missing correctedMacros');
    }

    if (!data.explanation || typeof data.explanation !== 'string') {
      throw new NutritionApiError('Invalid response format: missing explanation');
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
      `Failed to correct nutrition: ${error.message}`,
      undefined,
      error as Error
    );
  }
}