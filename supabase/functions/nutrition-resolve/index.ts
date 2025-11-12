import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NutritionRequest {
  foodText: string
  userId?: string
  aiProvider?: 'openai' | 'gemini' | 'claude'
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

    const { foodText, userId, aiProvider = 'openai' }: NutritionRequest = await req.json()

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
  switch (provider) {
    case 'openai':
      return await callOpenAI(foodText)
    case 'gemini':
      return await callGemini(foodText)
    case 'claude':
      return await callClaude(foodText)
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

async function callOpenAI(foodText: string): Promise<{ data: NutritionData, tokens?: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const prompt = `Extract food items from this text and calculate nutrition. Return JSON with this format:
{
  "items": [
    {
      "label": "food name",
      "qty": 150,
      "unit": "g",
      "confidence": 0.9,
      "macros": {"kcal": 200, "protein": 25, "fat": 8, "carbs": 10}
    }
  ],
  "totals": {"kcal": 200, "protein": 25, "fat": 8, "carbs": 10}
}

Food text: "${foodText}"`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert. Extract food items and provide accurate nutritional information.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`)
  }

  const data = await response.json()
  const tokens = data.usage?.total_tokens

  try {
    const nutritionData = JSON.parse(data.choices[0].message.content)
    return { data: nutritionData, tokens }
  } catch (parseError) {
    throw new Error('Failed to parse OpenAI response')
  }
}

async function callGemini(foodText: string): Promise<{ data: NutritionData, tokens?: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('Gemini API key not configured')

  const prompt = `Analyze this food text and extract food items with nutrition information.
Return only valid JSON in this format:
{
  "items": [{"label": "food", "qty": 100, "unit": "g", "confidence": 0.8, "macros": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}}],
  "totals": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}
}

Food text: "${foodText}"`

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

async function callClaude(foodText: string): Promise<{ data: NutritionData, tokens?: number }> {
  const apiKey = Deno.env.get('CLAUDE_API_KEY')
  if (!apiKey) throw new Error('Claude API key not configured')

  const prompt = `Parse this food text and extract food items with their nutritional information.
Return JSON with this exact structure:
{
  "items": [
    {
      "label": "food name",
      "qty": 120,
      "unit": "g",
      "confidence": 0.85,
      "macros": {"kcal": 180, "protein": 22, "fat": 6, "carbs": 12}
    }
  ],
  "totals": {"kcal": 180, "protein": 22, "fat": 6, "carbs": 12}
}

Food text: "${foodText}"`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`)
  }

  const data = await response.json()
  const tokens = data.usage?.input_tokens + data.usage?.output_tokens

  try {
    const nutritionData = JSON.parse(data.content[0].text)
    return { data: nutritionData, tokens }
  } catch (parseError) {
    throw new Error('Failed to parse Claude response')
  }
}

function calculateCost(tokens: number, provider: string): number {
  const costs = {
    openai: 0.5, // $0.50 per 1M tokens
    gemini: 0.25, // $0.25 per 1M tokens
    claude: 0.3 // $0.30 per 1M tokens
  }

  const costPerMillion = costs[provider as keyof typeof costs] || 0.5
  return Math.ceil((tokens / 1000000) * costPerMillion * 100) // convert to cents
}

function calculateConfidenceScore(data: NutritionData): number {
  if (!data.items || data.items.length === 0) return 0

  const avgConfidence = data.items.reduce((sum, item) => sum + item.confidence, 0) / data.items.length
  return Math.round(avgConfidence * 100) / 100
}

function generateFallbackResponse(foodText: string): NutritionData {
  // Very basic fallback estimation
  const lines = foodText.split('\n').filter(line => line.trim().length > 0)

  const items: FoodItem[] = lines.map((line, index) => ({
    label: line.trim(),
    qty: 100, // Default 100g
    unit: 'g',
    confidence: 0.3, // Low confidence
    macros: {
      kcal: 100 + (index * 20), // Rough estimation
      protein: 10 + (index * 2),
      fat: 3 + (index * 1),
      carbs: 15 + (index * 3)
    }
  }))

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