import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query: string;
  sources?: ("FDC" | "OFF")[];
  limit?: number;
  mode?: "search" | "detail";
  fdcId?: number;
}

interface CommonPortion {
  label: string;
  grams: number;
}

interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
}

interface DatabaseSearchResult {
  fdcId?: number;
  offId?: string;
  source: "FDC" | "OFF";
  name: string;
  brand?: string;
  category?: string;
  dataType?: string;
  macrosPer100g: Macros;
  defaultServingG?: number;
  defaultServingLabel?: string;
}

// FDC nutrient ID mapping
const FDC_NUTRIENT_IDS = {
  kcal: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
  potassium: 1092,
} as const;

// OFF non-food category prefixes
const NON_FOOD_CATEGORY_PREFIXES = [
  "en:pet-food", "en:dog-food", "en:cat-food", "en:dog-treats", "en:cat-treats",
  "en:pet-treats", "en:bird-food", "en:fish-food", "en:animal-feed",
  "en:cosmetics", "en:beauty", "en:skin-care", "en:hair-care", "en:body-care",
  "en:makeup", "en:perfumes", "en:deodorants", "en:shaving", "en:sun-care",
  "en:cleaning-products", "en:household-products", "en:laundry-detergents", "en:dishwashing",
  "en:tobacco", "en:cigarettes", "en:e-cigarettes", "en:e-liquids",
  "en:baby-diapers", "en:baby-wipes", "en:baby-care",
  "en:medicines", "en:medical-devices", "en:dental-care", "en:toothpastes", "en:mouthwashes",
];

const COMMON_DATA_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

const QUALIFIER_PENALTIES = [
  "dehydrated", "dried", "canned", "frozen", "powder", "concentrate",
  "infant", "commercial", "industrial", "unprepared", "dry mix",
];

function normalizeForRanking(s: string): string {
  return s.toLowerCase().replace(/,/g, "").trim();
}

function rankCommonResults(
  results: DatabaseSearchResult[],
  query: string,
): DatabaseSearchResult[] {
  const normQuery = normalizeForRanking(query);
  const queryWords = normQuery.split(/\s+/).filter(Boolean);

  const scored = results.map((result) => {
    const normName = normalizeForRanking(result.name);
    let score = 0;

    // Exact match
    if (normName === normQuery) score += 50;
    // Starts with query
    else if (normName.startsWith(normQuery)) score += 30;

    // Word match scoring
    const nameWords = normName.split(/\s+/).filter(Boolean);
    const matchedWords = queryWords.filter((w) => normName.includes(w));
    if (matchedWords.length === queryWords.length && score === 0) score += 20;
    else score += matchedWords.length * 5;

    // Simplicity bonus: fewer commas and words = simpler = better
    const commaCount = (result.name.match(/,/g) || []).length;
    const wordCount = nameWords.length;
    score += Math.max(0, 15 - commaCount * 3 - Math.max(0, wordCount - 3));

    // DataType priority
    if (result.dataType === "Foundation") score += 10;
    else if (result.dataType === "SR Legacy") score += 5;

    // Qualifier penalties (only if not in the query)
    let penaltyApplied = 0;
    for (const qualifier of QUALIFIER_PENALTIES) {
      if (normName.includes(qualifier) && !normQuery.includes(qualifier)) {
        penaltyApplied += 3;
        if (penaltyApplied >= 15) break;
      }
    }
    score -= Math.min(penaltyApplied, 15);

    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.result);
}

function isCommonFood(result: DatabaseSearchResult): boolean {
  if (result.source === "FDC" && result.dataType) {
    return COMMON_DATA_TYPES.has(result.dataType);
  }
  return false; // OFF items are branded
}

function isNonFoodProduct(categoriesTags?: string[]): boolean {
  if (!categoriesTags?.length) return false;
  return categoriesTags.some((tag) =>
    NON_FOOD_CATEGORY_PREFIXES.some((prefix) => tag.startsWith(prefix))
  );
}

function offNutrimentsToMacros(nutriments: Record<string, number | undefined>): Macros {
  return {
    kcal: Math.round(nutriments["energy-kcal_100g"] ?? 0),
    protein: Math.round((nutriments["proteins_100g"] ?? 0) * 10) / 10,
    fat: Math.round((nutriments["fat_100g"] ?? 0) * 10) / 10,
    carbs: Math.round((nutriments["carbohydrates_100g"] ?? 0) * 10) / 10,
    fiber: nutriments["fiber_100g"] != null
      ? Math.round(nutriments["fiber_100g"] * 10) / 10
      : undefined,
    sugar: nutriments["sugars_100g"] != null
      ? Math.round(nutriments["sugars_100g"] * 10) / 10
      : undefined,
    sodium: nutriments["sodium_100g"] != null
      ? Math.round(nutriments["sodium_100g"] * 1000)
      : undefined,
    potassium: nutriments["potassium_100g"] != null
      ? Math.round(nutriments["potassium_100g"] * 1000)
      : undefined,
  };
}

function normalizeCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function extractFdcNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  nutrientId: number,
): number | undefined {
  const found = nutrients.find((n) => n.nutrientId === nutrientId);
  return found ? found.value : undefined;
}

function fdcFoodToResult(food: any): DatabaseSearchResult | null {
  const nutrients = food.foodNutrients ?? [];

  const kcal = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.kcal) ?? 0;
  const protein = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.protein) ?? 0;
  const fat = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.fat) ?? 0;
  const carbs = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.carbs) ?? 0;
  const fiber = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.fiber);
  const sugar = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.sugar);
  const sodium = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.sodium);
  const potassium = extractFdcNutrient(nutrients, FDC_NUTRIENT_IDS.potassium);

  // Skip results with no calorie data at all
  if (kcal === 0 && protein === 0 && fat === 0 && carbs === 0) return null;

  const macrosPer100g: Macros = {
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    ...(fiber != null && { fiber: Math.round(fiber * 10) / 10 }),
    ...(sugar != null && { sugar: Math.round(sugar * 10) / 10 }),
    ...(sodium != null && { sodium: Math.round(sodium) }),
    ...(potassium != null && { potassium: Math.round(potassium) }),
  };

  // Parse serving size from FDC if available
  let defaultServingG: number | undefined;
  let defaultServingLabel: string | undefined;
  if (food.servingSize && food.servingSizeUnit) {
    if (food.servingSizeUnit === "g" || food.servingSizeUnit === "GRM") {
      defaultServingG = food.servingSize;
    } else if (food.servingSizeUnit === "ml" || food.servingSizeUnit === "MLT") {
      defaultServingG = food.servingSize; // approximate 1ml = 1g
    }
    defaultServingLabel = food.householdServingFullText || undefined;
  }

  return {
    fdcId: food.fdcId,
    source: "FDC",
    name: food.description || food.lowercaseDescription || "Unknown",
    brand: food.brandName || food.brandOwner || undefined,
    category: food.foodCategory || undefined,
    dataType: food.dataType || undefined,
    macrosPer100g,
    defaultServingG,
    defaultServingLabel,
  };
}

async function searchFDC(
  query: string,
  apiKey: string,
  limit: number,
): Promise<DatabaseSearchResult[]> {
  const url = "https://api.nal.usda.gov/fdc/v1/foods/search";
  const body = {
    query,
    pageSize: limit * 2, // fetch extra to account for filtering
    dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    nutrients: Object.values(FDC_NUTRIENT_IDS),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`[food-search] FDC API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const foods = data.foods ?? [];

  const results: DatabaseSearchResult[] = [];
  for (const food of foods) {
    if (results.length >= limit) break;
    const result = fdcFoodToResult(food);
    if (result) results.push(result);
  }

  return results;
}

async function searchOFF(
  query: string,
  limit: number,
): Promise<DatabaseSearchResult[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    json: "1",
    page_size: String(limit * 2),
    fields: "product_name,brands,nutriments,serving_size,serving_quantity,categories_tags,code",
  });

  const url = `https://world.openfoodfacts.net/cgi/search.pl?${params}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "NoteCal/1.0 (nutrition-tracker-app)",
    },
  });

  if (!response.ok) {
    console.error(`[food-search] OFF API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const products = data.products ?? [];

  const results: DatabaseSearchResult[] = [];
  for (const product of products) {
    if (results.length >= limit) break;

    if (!product.product_name || !product.nutriments) continue;
    if (isNonFoodProduct(product.categories_tags)) continue;

    const macrosPer100g = offNutrimentsToMacros(product.nutriments);
    // Skip entries with no meaningful nutrition data
    if (macrosPer100g.kcal === 0 && macrosPer100g.protein === 0 &&
        macrosPer100g.fat === 0 && macrosPer100g.carbs === 0) continue;

    // Parse serving size
    let defaultServingG: number | undefined;
    if (product.serving_quantity && product.serving_quantity > 0) {
      defaultServingG = product.serving_quantity;
    } else if (product.serving_size) {
      const match = product.serving_size.match(/(\d+(?:\.\d+)?)\s*g/i);
      if (match) defaultServingG = parseFloat(match[1]);
    }

    results.push({
      offId: product.code || undefined,
      source: "OFF",
      name: product.product_name,
      brand: product.brands || undefined,
      macrosPer100g,
      defaultServingG,
    });
  }

  return results;
}

async function fetchFdcPortions(
  fdcId: number,
  apiKey: string,
): Promise<CommonPortion[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error(`[food-search] FDC detail API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const foodPortions = data.foodPortions ?? [];

  const portions: CommonPortion[] = [];
  for (const p of foodPortions) {
    const grams = p.gramWeight;
    if (typeof grams !== "number" || grams <= 0) continue;

    // Build a readable label from portionDescription or measureUnitName
    let label = p.portionDescription || p.modifier || "";
    const unitName = p.measureUnit?.name || p.measureUnit?.abbreviation || "";
    const amount = p.amount;

    if (!label && unitName) {
      label = amount && amount !== 1 ? `${amount} ${unitName}` : unitName;
    } else if (!label) {
      continue; // Skip entries with no usable label
    }

    // Skip duplicate labels
    if (portions.some((existing) => existing.label === label)) continue;

    portions.push({ label, grams: Math.round(grams * 10) / 10 });
  }

  return portions.slice(0, 8);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { query, sources, limit = 15, mode, fdcId }: SearchRequest = await req.json();

    // Handle detail mode — fetch FDC portion sizes
    if (mode === "detail" && fdcId) {
      const fdcApiKey = Deno.env.get("FDC_API_KEY");
      if (!fdcApiKey) {
        return new Response(
          JSON.stringify({ error: "FDC API key not configured", portions: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const portions = await fetchFdcPortions(fdcId, fdcApiKey);
      return new Response(
        JSON.stringify({ portions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Query must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cacheKey = normalizeCacheKey(query);
    const searchSources = sources ?? ["FDC"];

    // Check cache
    const { data: cached } = await supabase
      .from("food_search_cache")
      .select("results, expires_at")
      .eq("search_query", cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      // Increment hit count (fire and forget)
      supabase
        .from("food_search_cache")
        .update({ hit_count: supabase.rpc ? undefined : undefined })
        .eq("search_query", cacheKey)
        .then(() => {});

      // Use raw SQL for atomic increment
      supabase.rpc && await supabase
        .from("food_search_cache")
        .update({ hit_count: (cached as any).hit_count + 1 })
        .eq("search_query", cacheKey);

      // Handle old flat array format during cache transition
      if (Array.isArray(cached.results)) {
        const common = cached.results.filter(isCommonFood);
        const branded = cached.results.filter((r: DatabaseSearchResult) => !isCommonFood(r));
        return new Response(
          JSON.stringify({ common, branded, query: query.trim(), cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          ...cached.results,
          query: query.trim(),
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Search APIs in parallel
    const fdcApiKey = Deno.env.get("FDC_API_KEY");
    const searchPromises: Promise<DatabaseSearchResult[]>[] = [];

    if (searchSources.includes("FDC") && fdcApiKey) {
      searchPromises.push(
        searchFDC(query.trim(), fdcApiKey, limit).catch((err) => {
          console.error("[food-search] FDC search failed:", err.message);
          return [];
        }),
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    if (searchSources.includes("OFF")) {
      searchPromises.push(
        searchOFF(query.trim(), limit).catch((err) => {
          console.error("[food-search] OFF search failed:", err.message);
          return [];
        }),
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    const [fdcResults, offResults] = await Promise.all(searchPromises);

    // Partition into common (Foundation, SR Legacy, FNDDS) and branded
    const allResults = [...fdcResults, ...offResults];
    const common = rankCommonResults(allResults.filter(isCommonFood), query.trim()).slice(0, limit);
    const branded = allResults.filter((r) => !isCommonFood(r)).slice(0, limit);

    // Cache results (fire and forget)
    supabase
      .from("food_search_cache")
      .upsert(
        {
          search_query: cacheKey,
          results: { common, branded },
          result_count: common.length + branded.length,
          hit_count: 0,
        },
        { onConflict: "search_query" },
      )
      .then(() => {});

    return new Response(
      JSON.stringify({
        common,
        branded,
        query: query.trim(),
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[food-search] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
