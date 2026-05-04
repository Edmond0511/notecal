import { supabase } from '@/lib/supabase';
import { NutritionResolveResponse, Macros, FoodItem, NutritionReasoning } from '@/types';
import { computeConfidenceScore, getCacheEntry, setCacheEntry } from './nutritionCache';

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

export interface RateLimitInfo {
  reason?: 'minute_limit' | 'day_limit';
  retryAfterSeconds?: number;
  usedDay?: number;
  limitDay?: number;
  usedMinute?: number;
  limitMinute?: number;
}

export class NutritionRateLimitError extends NutritionApiError {
  reason?: 'minute_limit' | 'day_limit';
  retryAfterSeconds: number;
  usedDay?: number;
  limitDay?: number;
  usedMinute?: number;
  limitMinute?: number;

  constructor(message: string, info: RateLimitInfo = {}) {
    super(message, 429);
    this.name = 'NutritionRateLimitError';
    this.reason = info.reason;
    this.retryAfterSeconds = info.retryAfterSeconds ?? 60;
    this.usedDay = info.usedDay;
    this.limitDay = info.limitDay;
    this.usedMinute = info.usedMinute;
    this.limitMinute = info.limitMinute;
  }
}

export class NutritionQuotaExceededError extends NutritionApiError {
  constructor(message: string) {
    super(message, 403);
    this.name = 'NutritionQuotaExceededError';
  }
}

export class NutritionNotFoodError extends NutritionApiError {
  constructor() {
    super('No food items identified in photo', 422);
    this.name = 'NutritionNotFoodError';
  }
}

export class NutritionAuthRequiredError extends NutritionApiError {
  constructor(message: string = 'Please sign in to log food.') {
    super(message, 401);
    this.name = 'NutritionAuthRequiredError';
  }
}

export class NutritionInputTooLargeError extends NutritionApiError {
  constructor(
    message: string = 'That entry is too long. Try shortening it (max 500 characters).'
  ) {
    super(message, 413);
    this.name = 'NutritionInputTooLargeError';
  }
}

export class NutritionServiceUnavailableError extends NutritionApiError {
  constructor(
    message: string = 'Food logging is temporarily unavailable. Please try again in a moment.'
  ) {
    super(message, 503);
    this.name = 'NutritionServiceUnavailableError';
  }
}

// supabase.functions.invoke wraps non-2xx responses in FunctionsHttpError
// where the original Response is on `error.context`. If the edge function
// returned 429, parse the structured body and throw a typed rate-limit error.
async function throwIfRateLimited(error: unknown): Promise<void> {
  const ctx = (error as any)?.context;
  if (!ctx || typeof ctx.status !== 'number' || ctx.status !== 429) return;

  let body: any = {};
  try {
    body = await ctx.json();
  } catch {
    // body might already be consumed — fall through with empty info
  }

  const reason = body.reason as 'minute_limit' | 'day_limit' | undefined;
  const message =
    reason === 'minute_limit'
      ? "You're moving too fast — wait a minute before trying again."
      : "Daily AI limit reached. Try again tomorrow.";

  throw new NutritionRateLimitError(message, {
    reason,
    retryAfterSeconds: body.retryAfterSeconds,
    usedDay: body.usedDay,
    limitDay: body.limitDay,
    usedMinute: body.usedMinute,
    limitMinute: body.limitMinute,
  });
}

// Map 401/413/503 responses from the edge function to typed errors with
// user-friendly messages. Mirrors the throwIfRateLimited pattern above.
async function throwIfStatusError(error: unknown): Promise<void> {
  const ctx = (error as any)?.context;
  const status = ctx && typeof ctx.status === 'number' ? ctx.status : undefined;
  if (status !== 401 && status !== 413 && status !== 503) return;

  // Best-effort body parse for any custom message, but fall back to defaults.
  let body: any = {};
  try {
    body = await ctx.json();
  } catch {
    // ignore — body may be empty/consumed
  }

  const customMessage =
    typeof body?.message === 'string' && body.message.trim().length > 0
      ? body.message
      : undefined;

  if (status === 401) {
    throw new NutritionAuthRequiredError(customMessage);
  }
  if (status === 413) {
    throw new NutritionInputTooLargeError(customMessage);
  }
  // status === 503
  throw new NutritionServiceUnavailableError(customMessage);
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

  const cached = getCacheEntry(userId ?? null, foodText);
  if (cached) {
    if (__DEV__) {
      console.log('[nutritionApi] CACHE HIT:', foodText.trim());
    }
    return cached;
  }

  try {
    // userId no longer goes in the body — the edge function derives it from
    // the JWT that supabase-js attaches automatically. We still keep userId
    // for the local MMKV cache key.
    const requestBody = {
      foodText: foodText.trim(),
    };

    if (__DEV__) {
      console.log('[nutritionApi] REQ:', JSON.stringify(requestBody));
    }

    const { data, error } = await supabase.functions.invoke<NutritionResolveResponse>('nutrition-resolve', {
      body: requestBody,
    });

    if (__DEV__) {
      if (error) {
        console.log('[nutritionApi] ERR:', JSON.stringify({ message: error.message, status: (error as any).status, context: (error as any).context?.status }));
      } else {
        console.log('[nutritionApi] RES:', JSON.stringify({ items: data?.resolved?.length, totals: data?.totals }));
      }
    }

    if (error) {
      await throwIfRateLimited(error);
      await throwIfStatusError(error);
      throw new NutritionApiError(
        error.message || 'Failed to resolve nutrition',
        (error as any).status
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

    setCacheEntry(userId ?? null, foodText, data, computeConfidenceScore(data));

    return data;

  } catch (error) {
    if (error instanceof NutritionApiError) {
      throw error;
    }

    // Network or other errors
    throw new NutritionApiError(
      `Failed to resolve nutrition: ${(error as Error)?.message ?? 'unknown'}`,
      undefined,
      error as Error
    );
  }
}

/**
 * Resolve nutrition from a photo using Gemini multimodal analysis
 * @param base64Image Base64-encoded image data
 * @param mimeType Image MIME type (e.g., 'image/jpeg')
 * @param options Optional configuration including user ID
 * @returns NutritionResolveResponse with identified food items
 */
export async function resolveNutritionFromPhoto(
  base64Image: string,
  mimeType: string,
  _options: NutritionApiOptions = {}
): Promise<NutritionResolveResponse> {
  try {
    const requestBody = {
      photoMode: true,
      base64Image,
      mimeType,
    };

    if (__DEV__) {
      console.log('[nutritionApi] PHOTO REQ: base64 length=', base64Image.length);
    }

    const { data, error } = await supabase.functions.invoke<NutritionResolveResponse>('nutrition-resolve', {
      body: requestBody,
    });

    if (__DEV__) {
      if (error) {
        console.log('[nutritionApi] PHOTO ERR:', JSON.stringify({ message: error.message, status: (error as any).status, context: (error as any).context?.status }));
      } else {
        console.log('[nutritionApi] PHOTO RES:', JSON.stringify({ items: data?.resolved?.length, totals: data?.totals }));
      }
    }

    if (error) {
      await throwIfRateLimited(error);
      await throwIfStatusError(error);
      throw new NutritionApiError(
        error.message || 'Failed to analyze photo',
        (error as any).status
      );
    }

    if (!data) {
      throw new NutritionApiError('No data returned from photo analysis');
    }

    // Edge Function returns 200 with { error: "not_food" } when no food detected
    if ((data as any).error === 'not_food') {
      throw new NutritionNotFoodError();
    }

    if (!data.resolved || !Array.isArray(data.resolved)) {
      throw new NutritionApiError('Invalid response format: missing resolved items');
    }

    return data;
  } catch (error) {
    if (error instanceof NutritionApiError) {
      throw error;
    }

    throw new NutritionApiError(
      `Failed to analyze photo: ${(error as Error)?.message ?? 'unknown'}`,
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
        const error: Error = promiseResult.status === 'fulfilled'
          ? promiseResult.value.error ?? new Error('Unknown batch error')
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
  correctedQty?: number;
  correctedUnit?: string;
  explanation: string;
  confidence?: number;
  reasoning?: NutritionReasoning;
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
  _options: NutritionApiOptions = {}
): Promise<CorrectionResponse> {
  if (!feedback || feedback.trim().length === 0) {
    throw new NutritionApiError('Feedback is required');
  }

  try {
    const correctionBody = {
      correctionMode: true,
      foodText: item.label,
      currentMacros: item.macros,
      qty: item.qty,
      unit: item.unit,
      userFeedback: feedback.trim(),
    };

    if (__DEV__) {
      console.log('[nutritionApi] CORRECTION REQ:', JSON.stringify(correctionBody));
    }

    const { data, error } = await supabase.functions.invoke<CorrectionResponse>('nutrition-resolve', {
      body: correctionBody,
    });

    if (__DEV__) {
      if (error) {
        console.log('[nutritionApi] CORRECTION ERR:', JSON.stringify({ message: error.message, status: (error as any).status, context: (error as any).context?.status }));
      } else {
        console.log('[nutritionApi] CORRECTION RES:', JSON.stringify({ kcal: data?.correctedMacros?.kcal, label: data?.correctedLabel }));
      }
    }

    if (error) {
      await throwIfRateLimited(error);
      await throwIfStatusError(error);
      throw new NutritionApiError(
        error.message || 'Failed to correct nutrition',
        (error as any).status
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

    throw new NutritionApiError(
      `Failed to correct nutrition: ${(error as Error)?.message ?? 'unknown'}`,
      undefined,
      error as Error
    );
  }
}