import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NutritionRequest {
  textLine?: string;
  foodText?: string; // Keep for backward compatibility
  locale?: "en-CA" | "en-US";
  userId?: string;
}

interface FoodItem {
  label: string;
  qty: number;
  unit: string;
  confidence: number;
  macros: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}

interface NutritionData {
  items: FoodItem[];
  totals: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  tokens?: number;
}

interface ApiResponse {
  resolved?: FoodItem[];
  totals?: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      textLine,
      foodText: foodTextFromRequest,
      locale = "en-US",
      userId,
    }: NutritionRequest = await req.json();

    // Support both textLine and foodText for backward compatibility
    const foodText = (textLine || foodTextFromRequest || "").trim();

    if (!foodText || foodText.length === 0) {
      return new Response(
        JSON.stringify({ error: "Food text is required" } as ApiResponse),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const startTime = Date.now();
    let tokensUsed = 0;
    let costCents = 0;
    let nutritionData: NutritionData;

    // 1. Check cache first
    const cacheKey = foodText.toLowerCase().trim();
    const { data: cachedData, error: cacheError } = await supabase
      .from("nutrition_cache")
      .select("*")
      .eq("food_query", cacheKey)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (!cacheError && cachedData) {
      // Cache hit - update hit count
      await supabase
        .from("nutrition_cache")
        .update({ hit_count: cachedData.hit_count + 1 })
        .eq("id", cachedData.id);

      nutritionData = cachedData.nutrition_data as NutritionData;

      // Log cache hit usage
      if (userId) {
        await logApiUsage(supabase, userId, 0, 0, "cache_hit", startTime);
      }

      return new Response(
        JSON.stringify({
          resolved: nutritionData.items,
          totals: nutritionData.totals,
        } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Cache miss - call AI service
    try {
      const aiResult = await callAIService(foodText);
      nutritionData = aiResult.data;
      tokensUsed = aiResult.tokens || 0;
      costCents = calculateCost(tokensUsed);

      // 3. Cache the result
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

      await supabase.from("nutrition_cache").upsert(
        {
          food_query: cacheKey,
          normalized_query: foodText.toLowerCase().trim(),
          nutrition_data: nutritionData,
          confidence_score: calculateConfidenceScore(nutritionData),
          hit_count: 1,
          expires_at: expiresAt.toISOString(),
        },
        {
          onConflict: "food_query",
        },
      );

      // 4. Log API usage
      if (userId) {
        await logApiUsage(
          supabase,
          userId,
          tokensUsed,
          costCents,
          "success",
          startTime,
        );
      }

      return new Response(
        JSON.stringify({
          resolved: nutritionData.items,
          totals: nutritionData.totals,
        } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (aiError) {
      let errorMessage = "AI service unavailable, showing estimated values";
      let errorDetails = "Unknown error";

      // Check if it's a missing API key error
      if (aiError instanceof Error) {
        errorDetails = aiError.message;
        if (aiError.message === "GEMINI_API_KEY_NOT_CONFIGURED") {
          errorMessage = "AI service not configured, showing estimated values";
        }
      }

      console.error(`[AI Error] Food: "${foodText}" | Error: ${errorDetails}`);

      // Log error usage
      if (userId) {
        await logApiUsage(
          supabase,
          userId,
          0,
          0,
          "ai_error",
          startTime,
          errorDetails,
        );
      }

      // Return fallback response
      const fallbackData = generateFallbackResponse(foodText);
      console.log(`[Fallback] Returning estimated data: ${fallbackData.totals.kcal} kcal`);

      return new Response(
        JSON.stringify({
          resolved: fallbackData.items,
          totals: fallbackData.totals,
          error: errorMessage,
        } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Function error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";

    return new Response(
      JSON.stringify({
        error: errorMessage,
      } as ApiResponse),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

async function callAIService(
  foodText: string,
): Promise<{ data: NutritionData; tokens?: number }> {
  // Use Gemini as the single AI provider
  return await callGemini(foodText);
}

async function callGemini(
  foodText: string,
): Promise<{ data: NutritionData; tokens?: number }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[Gemini] API key not configured");
    throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
  }

  console.log(`[Gemini] Processing: "${foodText}"`);

  const prompt = `You are an expert Certified Nutritionist and Data Analyst. Your task is to extract food items from text and return precise macronutrient data.

DATA HIERARCHY & ACCURACY RULES:
1. Exact Matches: For branded itemsor restaurant chains, you MUST use official nutritional data from the manufacturer or restaurant rather than generic equivalents.
2. Niche Items: For less common foods, prioritize finding the most specific entry available in nutritional databases (USDA, NCCDB).
3. Ranges: If a food item implies a caloric range (e.g., a medium apple is 80-100kcal), you MUST calculate and return the MEDIAN value (90kcal). Do not return ranges.
4. Validation: Cross-reference caloric estimates against standard nutritional density to ensure physical realism (e.g., pure fat cannot exceed 9kcal/g).

FORMATTING RULES:
- Convert all quantities to grams (g) for consistency.
- Use standard portion sizes if the user does not specify quantity.
- Return ONLY valid JSON. No markdown formatting, no explanations.
- Set confidence:
   - 0.95-1.0: Exact brand match or precise weight given.
   - 0.8-0.9: Standard USDA generic match.
   - 0.6-0.7: AI estimate/Complex preparation without recipe.

OUTPUT FORMAT:
{
  "items": [
    {
      "label": "McDonald's Big Mac",
      "qty": 215,
      "unit": "g",
      "confidence": 0.99,
      "macros": {"kcal": 590, "protein": 25, "fat": 34, "carbs": 46}
    }
  ],
  "totals": {"kcal": 590, "protein": 25, "fat": 34, "carbs": 46}
}

Food text: "${foodText}"

JSON:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini] API error ${response.status}: ${errorText}`);
    throw new Error(
      `Gemini API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`,
    );
  }

  const data = await response.json();

  // Check for blocked or empty responses
  if (!data.candidates || data.candidates.length === 0) {
    console.error("[Gemini] No candidates in response:", JSON.stringify(data));
    throw new Error(`Gemini returned no candidates: ${data.promptFeedback?.blockReason || "unknown reason"}`);
  }

  const candidate = data.candidates[0];

  // Check finish reason
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    console.error(`[Gemini] Unexpected finish reason: ${candidate.finishReason}`);
  }

  if (!candidate.content?.parts?.[0]?.text) {
    console.error("[Gemini] No text in response:", JSON.stringify(candidate));
    throw new Error("Gemini response missing text content");
  }

  const content = candidate.content.parts[0].text;
  console.log(`[Gemini] Raw response length: ${content.length} chars`);

  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Gemini] No JSON found in response:", content.substring(0, 500));
      throw new Error("No JSON found in Gemini response");
    }

    const nutritionData = JSON.parse(jsonMatch[0]);
    console.log(`[Gemini] Success: ${nutritionData.items?.length || 0} items, ${nutritionData.totals?.kcal || 0} kcal`);
    return { data: nutritionData };
  } catch (parseError) {
    console.error("[Gemini] Parse error:", parseError, "Content:", content.substring(0, 500));
    throw new Error(`Failed to parse Gemini response: ${parseError}`);
  }
}

function calculateCost(tokens: number): number {
  const costPerMillion = 0.25; // $0.25 per 1M tokens for Gemini
  return Math.ceil((tokens / 1000000) * costPerMillion * 100); // convert to cents
}

function calculateConfidenceScore(data: NutritionData): number {
  if (!data.items || data.items.length === 0) return 0;

  const avgConfidence =
    data.items.reduce((sum, item) => sum + item.confidence, 0) /
    data.items.length;

  // Apply quality factors
  let qualityMultiplier = 1.0;

  // Penalize very high calorie estimates (likely errors)
  const totalCalories = data.totals.kcal;
  if (totalCalories > 2000) {
    qualityMultiplier *= 0.8;
  }

  // Boost confidence for balanced macros
  const hasProtein = data.totals.protein > 0;
  const hasFat = data.totals.fat > 0;
  const hasCarbs = data.totals.carbs > 0;
  if (hasProtein && hasFat && hasCarbs) {
    qualityMultiplier *= 1.1;
  }

  // Penalize if all items have the same confidence (suggests generic estimation)
  const confidences = data.items.map((item) => item.confidence);
  const hasVaryingConfidence = new Set(confidences).size > 1;
  if (!hasVaryingConfidence && avgConfidence === 0.8) {
    qualityMultiplier *= 0.9;
  }

  return Math.min(
    1.0,
    Math.round(avgConfidence * qualityMultiplier * 100) / 100,
  );
}

function generateFallbackResponse(foodText: string): NutritionData {
  // Return zeros when AI service is unavailable
  const lines = foodText.split("\n").filter((line) => line.trim().length > 0);

  const items: FoodItem[] = lines.map((line) => {
    return {
      label: line.trim(),
      qty: 0,
      unit: "g",
      confidence: 0,
      macros: {
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
      },
    };
  });

  return {
    items,
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  };
}

async function logApiUsage(
  supabase: any,
  userId: string,
  tokens: number,
  costCents: number,
  status: string,
  startTime: number,
  errorMessage?: string,
) {
  const responseTime = Date.now() - startTime;

  await supabase.from("api_usage").insert({
    user_id: userId,
    tokens_used: tokens,
    cost_cents: costCents,
    request_type: "nutrition",
    status,
    error_message: errorMessage,
    response_time_ms: responseTime,
  });
}
