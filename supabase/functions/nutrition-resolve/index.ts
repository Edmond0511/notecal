import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NutritionRequest {
  foodText: string
  userId?: string
  aiProvider?: 'gemini'
}

interface FoodItem {
  label: string
  qty: number
  unit: string
  confidence: number
  macros: {
    kcal: number
    protein: number
    fat: number
    carbs: number
  }
}

interface NutritionData {
  items: FoodItem[]
  totals: {
    kcal: number
    protein: number
    fat: number
    carbs: number
  }
  tokens?: number
}

interface ApiResponse {
  data?: NutritionData
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { foodText, userId, aiProvider = 'gemini' }: NutritionRequest = await req.json()

    if (!foodText || foodText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Food text is required' } as ApiResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const startTime = Date.now()
    let tokensUsed = 0
    let costCents = 0
    let nutritionData: NutritionData

    // 1. Check cache first
    const cacheKey = foodText.toLowerCase().trim()
    const { data: cachedData, error: cacheError } = await supabase
      .from('nutrition_cache')
      .select('*')
      .eq('food_query', cacheKey)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (!cacheError && cachedData) {
      // Cache hit - update hit count
      await supabase
        .from('nutrition_cache')
        .update({ hit_count: cachedData.hit_count + 1 })
        .eq('id', cachedData.id)

      nutritionData = cachedData.nutrition_data as NutritionData

      // Log cache hit usage
      if (userId) {
        await logApiUsage(supabase, userId, aiProvider, 0, 0, 'cache_hit', startTime)
      }

      return new Response(
        JSON.stringify({ data: nutritionData } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 2. Cache miss - call AI service
    try {
      const aiResult = await callAIService(foodText, aiProvider)
      nutritionData = aiResult.data
      tokensUsed = aiResult.tokens || 0
      costCents = calculateCost(tokensUsed, aiProvider)

      // 3. Cache the result
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

      await supabase
        .from('nutrition_cache')
        .upsert({
          food_query: cacheKey,
          normalized_query: foodText.toLowerCase().trim(),
          nutrition_data: nutritionData,
          confidence_score: calculateConfidenceScore(nutritionData),
          ai_provider: aiProvider,
          hit_count: 1,
          expires_at: expiresAt.toISOString()
        }, {
          onConflict: 'food_query'
        })

      // 4. Log API usage
      if (userId) {
        await logApiUsage(supabase, userId, aiProvider, tokensUsed, costCents, 'success', startTime)
      }

      return new Response(
        JSON.stringify({ data: nutritionData } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (aiError) {
      console.error('AI service error:', aiError)

      // Log error usage
      if (userId) {
        await logApiUsage(supabase, userId, aiProvider, 0, 0, 'ai_error', startTime, aiError.message)
      }

      // Return fallback response
      const fallbackData = generateFallbackResponse(foodText)

      return new Response(
        JSON.stringify({
          data: fallbackData,
          error: 'AI service unavailable, showing estimated values'
        } as ApiResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

  } catch (error) {
    console.error('Function error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      } as ApiResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function callAIService(foodText: string, provider: string): Promise<{ data: NutritionData, tokens?: number }> {
  // Use Gemini as the single AI provider
  return await callGemini(foodText)
}


async function callGemini(foodText: string): Promise<{ data: NutritionData, tokens?: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Gemini API key not configured')

  const prompt = `You are a certified nutritionist. Extract food items from this text and provide accurate macronutrient information.

Rules:
- Convert all quantities to grams (g) for consistency
- Use standard portion sizes if not specified
- Calculate realistic values based on USDA nutrition data
- Include all 4 macros: calories (kcal), protein (g), fat (g), carbs (g)
- Set confidence 0.9-1.0 for common foods, 0.6-0.8 for complex preparations
- Return ONLY valid JSON, no explanations

Format:
{
  "items": [
    {
      "label": "chicken breast",
      "qty": 150,
      "unit": "g",
      "confidence": 0.95,
      "macros": {"kcal": 165, "protein": 31, "fat": 3.6, "carbs": 0}
    }
  ],
  "totals": {"kcal": 165, "protein": 31, "fat": 3.6, "carbs": 0}
}

Food text: "${foodText}"

JSON:`

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    })
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.candidates[0].content.parts[0].text

  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in Gemini response')

    const nutritionData = JSON.parse(jsonMatch[0])
    return { data: nutritionData }
  } catch (parseError) {
    throw new Error('Failed to parse Gemini response')
  }
}

function calculateCost(tokens: number, provider: string): number {
  const costs = {
    gemini: 0.25, // $0.25 per 1M tokens
  }

  const costPerMillion = costs[provider as keyof typeof costs] || 0.25
  return Math.ceil((tokens / 1000000) * costPerMillion * 100) // convert to cents
}

function calculateConfidenceScore(data: NutritionData): number {
  if (!data.items || data.items.length === 0) return 0

  const avgConfidence = data.items.reduce((sum, item) => sum + item.confidence, 0) / data.items.length

  // Apply quality factors
  let qualityMultiplier = 1.0

  // Penalize very high calorie estimates (likely errors)
  const totalCalories = data.totals.kcal
  if (totalCalories > 2000) {
    qualityMultiplier *= 0.8
  }

  // Boost confidence for balanced macros
  const hasProtein = data.totals.protein > 0
  const hasFat = data.totals.fat > 0
  const hasCarbs = data.totals.carbs > 0
  if (hasProtein && hasFat && hasCarbs) {
    qualityMultiplier *= 1.1
  }

  // Penalize if all items have the same confidence (suggests generic estimation)
  const confidences = data.items.map(item => item.confidence)
  const hasVaryingConfidence = new Set(confidences).size > 1
  if (!hasVaryingConfidence && avgConfidence === 0.8) {
    qualityMultiplier *= 0.9
  }

  return Math.min(1.0, Math.round(avgConfidence * qualityMultiplier * 100) / 100)
}

function generateFallbackResponse(foodText: string): NutritionData {
  // Enhanced fallback with better nutrition estimation
  const lines = foodText.split('\n').filter(line => line.trim().length > 0)

  // Basic nutrition database for common foods (per 100g)
  const nutritionDatabase: Record<string, {kcal: number, protein: number, fat: number, carbs: number}> = {
    'chicken': { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
    'beef': { kcal: 250, protein: 26, fat: 15, carbs: 0 },
    'rice': { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
    'pasta': { kcal: 131, protein: 5, fat: 1.1, carbs: 25 },
    'bread': { kcal: 265, protein: 9, fat: 3.2, carbs: 49 },
    'egg': { kcal: 155, protein: 13, fat: 11, carbs: 1.1 },
    'banana': { kcal: 89, protein: 1.1, fat: 0.3, carbs: 23 },
    'apple': { kcal: 52, protein: 0.3, fat: 0.2, carbs: 14 },
    'oats': { kcal: 389, protein: 16.9, fat: 6.9, carbs: 66 },
    'yogurt': { kcal: 59, protein: 10, fat: 0.4, carbs: 3.6 },
    'cheese': { kcal: 402, protein: 25, fat: 33, carbs: 1.3 },
    'broccoli': { kcal: 34, protein: 2.8, fat: 0.4, carbs: 7 },
    'potato': { kcal: 77, protein: 2, fat: 0.1, carbs: 17 },
    'salmon': { kcal: 208, protein: 25, fat: 12, carbs: 0 },
    'tuna': { kcal: 132, protein: 28, fat: 1.3, carbs: 0 }
  }

  const items: FoodItem[] = lines.map((line) => {
    const foodLine = line.trim().toLowerCase()

    // Extract quantity if specified (e.g., "200g chicken", "2 eggs")
    const quantityMatch = foodLine.match(/(\d+)\s*([a-z]*)\s*(.+)|(.+)\s*(\d+)\s*([a-z]*)/)
    let qty = 100 // Default 100g
    let foodName = foodLine

    if (quantityMatch) {
      if (quantityMatch[1]) {
        qty = parseInt(quantityMatch[1])
        foodName = quantityMatch[3]
      } else {
        qty = parseInt(quantityMatch[5])
        foodName = quantityMatch[4]
      }
    }

    // Find matching nutrition data
    let nutrition = nutritionDatabase[foodName] || nutritionDatabase['chicken'] // Default fallback

    // Try partial matching
    if (!nutritionDatabase[foodName]) {
      const keys = Object.keys(nutritionDatabase)
      const match = keys.find(key => foodName.includes(key) || key.includes(foodName))
      if (match) {
        nutrition = nutritionDatabase[match]
      }
    }

    // Calculate nutrition based on quantity
    const multiplier = qty / 100

    return {
      label: line.trim(),
      qty: qty,
      unit: 'g',
      confidence: 0.6, // Medium confidence for fallback
      macros: {
        kcal: Math.round(nutrition.kcal * multiplier),
        protein: Math.round(nutrition.protein * multiplier * 10) / 10,
        fat: Math.round(nutrition.fat * multiplier * 10) / 10,
        carbs: Math.round(nutrition.carbs * multiplier * 10) / 10
      }
    }
  })

  const totals = items.reduce((acc, item) => ({
    kcal: acc.kcal + item.macros.kcal,
    protein: acc.protein + item.macros.protein,
    fat: acc.fat + item.macros.fat,
    carbs: acc.carbs + item.macros.carbs
  }), { kcal: 0, protein: 0, fat: 0, carbs: 0 })

  return { items, totals }
}

async function logApiUsage(
  supabase: any,
  userId: string,
  provider: string,
  tokens: number,
  costCents: number,
  status: string,
  startTime: number,
  errorMessage?: string
) {
  const responseTime = Date.now() - startTime

  await supabase
    .from('api_usage')
    .insert({
      user_id: userId,
      ai_provider: provider,
      tokens_used: tokens,
      cost_cents: costCents,
      request_type: 'nutrition',
      status,
      error_message: errorMessage,
      response_time_ms: responseTime
    })
}