import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query: string;
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
  source: "FDC";
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

const FDC_EXTENDED_NUTRIENT_IDS = {
  saturatedFat: 1258,
  transFat: 1257,
  cholesterol: 1253,
  calcium: 1087,
  iron: 1089,
  magnesium: 1090,
  phosphorus: 1091,
  zinc: 1095,
  vitaminA: 1106,
  vitaminC: 1162,
  vitaminD: 1114,
  vitaminE: 1109,
  vitaminK: 1185,
  vitaminB6: 1175,
  vitaminB12: 1178,
  folate: 1177,
  niacin: 1167,
  caffeine: 1057,
} as const;

const COMMON_DATA_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

const QUALIFIER_PENALTIES = [
  "dehydrated", "dried", "canned", "frozen", "powder", "concentrate",
  "infant", "commercial", "industrial", "unprepared", "dry mix",
];

// --- Name normalization ---

const JARGON_PATTERNS = [
  /\bbroilers or fryers\b/i,
  /\bmature seeds\b/i,
  /\bNFS\b/,
  /\bNS as to\b/i,
  /\bnot further specified\b/i,
  /\ball commercial types\b/i,
  /\ball varieties\b/i,
  /\ball types\b/i,
  /\bregular\b/i,
  /\bplain\b/i,
  /\(includes USDA commodity[^)]*\)/i,
  /\bUPC:\s*\d+/i,
  /\bGTIN:\s*\d+/i,
];

const CUT_WORDS = new Set([
  "breast", "thigh", "leg", "wing", "loin", "drumstick", "ground",
  "fillet", "steak", "chop", "rib", "tenderloin", "shank", "round",
  "sirloin", "flank", "brisket", "roast", "cutlet", "strip",
]);

const PREP_WORDS = new Set([
  "raw", "cooked", "grilled", "roasted", "fried", "baked", "boiled",
  "steamed", "broiled", "sauteed", "sautéed", "smoked", "braised",
  "poached", "microwaved", "stewed", "dehydrated", "dried", "canned",
  "frozen", "pickled", "fermented", "toasted",
]);

const DESCRIPTOR_WORDS = new Set([
  "skinless", "boneless", "whole", "sliced", "lean", "lean only",
  "fat-free", "low-fat", "reduced-fat", "nonfat", "extra lean",
  "chopped", "diced", "minced", "shredded", "grated", "mashed",
  "peeled", "unpeeled", "pitted", "seedless", "fresh", "ripe",
  "uncooked", "unprepared", "unsweetened", "unsalted", "salted",
  "sweetened", "enriched", "fortified", "organic",
]);

// Simple produce items where "raw" is implied
const PRODUCE_KEYWORDS = new Set([
  "banana", "apple", "orange", "grape", "strawberry", "blueberry",
  "raspberry", "blackberry", "mango", "pineapple", "watermelon",
  "cantaloupe", "peach", "pear", "plum", "cherry", "kiwi", "lemon",
  "lime", "avocado", "tomato", "cucumber", "carrot", "celery",
  "broccoli", "spinach", "lettuce", "kale", "onion", "garlic",
  "potato", "sweet potato", "pepper", "zucchini", "mushroom",
  "cabbage", "cauliflower", "corn", "pea", "bean", "lentil",
]);

// Cheese types where the type should come before "Cheese"
const CHEESE_TYPES = new Set([
  "cheddar", "mozzarella", "parmesan", "swiss", "gouda", "brie",
  "camembert", "feta", "provolone", "colby", "monterey jack",
  "gruyere", "havarti", "muenster", "ricotta", "cottage", "cream",
  "american", "blue", "goat", "mascarpone", "neufchatel",
]);

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, (ch) => ch.toUpperCase());
}

function singularize(s: string): string {
  if (s.endsWith("ies") && s.length > 4) return s.slice(0, -3) + "y";
  if (s.endsWith("es") && (s.endsWith("oes") || s.endsWith("atoes"))) return s.slice(0, -2);
  if (s.endsWith("s") && !s.endsWith("ss") && s.length > 3) return s.slice(0, -1);
  return s;
}

function normalizeFdcName(rawName: string, dataType?: string): string {
  // Only normalize common data types
  if (dataType && !COMMON_DATA_TYPES.has(dataType)) return rawName;

  // Split on commas and trim
  let segments = rawName.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return rawName;

  // Title-case the primary name
  let primary = toTitleCase(segments[0]);
  segments = segments.slice(1);

  // Strip jargon segments
  segments = segments.filter((seg) => {
    const lower = seg.toLowerCase();
    for (const pattern of JARGON_PATTERNS) {
      if (pattern.test(seg)) return false;
    }
    // Also strip "meat only" when a cut is already identified
    if (lower === "meat only" || lower === "meat and skin") {
      const allText = [primary, ...segments].join(" ").toLowerCase();
      for (const cut of CUT_WORDS) {
        if (allText.includes(cut)) return false;
      }
    }
    return true;
  });

  // Classify remaining segments
  const cuts: string[] = [];
  const preps: string[] = [];
  const descriptors: string[] = [];

  for (const seg of segments) {
    const lower = seg.toLowerCase().trim();
    if (!lower) continue;

    // Check each word in multi-word segments
    const words = lower.split(/\s+/);
    const firstWord = words[0];

    if (CUT_WORDS.has(lower) || CUT_WORDS.has(firstWord)) {
      cuts.push(toTitleCase(lower));
    } else if (PREP_WORDS.has(lower) || PREP_WORDS.has(firstWord)) {
      preps.push(lower);
    } else if (DESCRIPTOR_WORDS.has(lower) || DESCRIPTOR_WORDS.has(firstWord)) {
      descriptors.push(lower);
    } else if (lower.startsWith("or ") || lower.startsWith("and ")) {
      // "or banana powder" → treat as alternate form, take the useful part
      const altPart = lower.replace(/^(?:or|and)\s+/, "");
      if (altPart) descriptors.push(altPart);
    } else {
      // Unclassified — treat as descriptor
      descriptors.push(lower);
    }
  }

  // Merge cuts into primary name
  if (cuts.length > 0) {
    primary = `${primary} ${cuts.join(" ")}`;
  }

  // Handle cheese: "Cheese, cheddar" → "Cheddar Cheese"
  const primaryLower = primary.toLowerCase();
  if (primaryLower === "cheese" && descriptors.length > 0) {
    const cheeseType = descriptors[0];
    if (CHEESE_TYPES.has(cheeseType)) {
      primary = `${toTitleCase(cheeseType)} Cheese`;
      descriptors.shift();
    }
  }

  // For simple produce, drop "raw" since it's implied
  const primarySingular = singularize(primaryLower.split(" ")[0]);
  const isProduce = PRODUCE_KEYWORDS.has(primarySingular) || PRODUCE_KEYWORDS.has(primaryLower.split(" ")[0]);
  if (isProduce) {
    const rawIdx = preps.indexOf("raw");
    if (rawIdx !== -1) preps.splice(rawIdx, 1);
  }

  // Singularize primary if it's a simple plural produce name
  if (isProduce && primary.toLowerCase() !== singularize(primary.toLowerCase())) {
    primary = toTitleCase(singularize(primary.toLowerCase()));
  }

  // Build qualifiers (max 3)
  const qualifiers = [...descriptors, ...preps].slice(0, 3);

  if (qualifiers.length > 0) {
    return `${primary} (${qualifiers.join(", ")})`;
  }

  return primary;
}

// --- Category filtering ---

const EXCLUDED_CATEGORIES: { pattern: RegExp; keyword: string }[] = [
  { pattern: /\bbaby\s*food/i, keyword: "baby food" },
  { pattern: /\binfant\s*formula/i, keyword: "infant formula" },
  { pattern: /\bdietary\s*supplement/i, keyword: "supplement" },
  { pattern: /\bvitamin\b/i, keyword: "vitamin" },
  { pattern: /\bleavening\s*agent/i, keyword: "leavening" },
  { pattern: /\bMRE\b/i, keyword: "mre" },
  { pattern: /\bmilitary\s*ration/i, keyword: "military" },
];

function shouldExcludeFdcFood(
  food: { description?: string; foodCategory?: string },
  query: string,
): boolean {
  const name = (food.description || "").toLowerCase();
  const category = (food.foodCategory || "").toLowerCase();
  const normQuery = query.toLowerCase();

  for (const { pattern, keyword } of EXCLUDED_CATEGORIES) {
    if (pattern.test(name) || pattern.test(category)) {
      // If user is specifically searching for this, don't exclude
      if (normQuery.includes(keyword)) return false;
      return true;
    }
  }
  return false;
}

// --- Deduplication ---

function makeDedupeKey(name: string): string {
  // Lowercase, extract parenthetical content (prep state), strip the rest
  const lower = name.toLowerCase();
  const parenMatch = lower.match(/\(([^)]*)\)/);
  const baseName = lower.replace(/\([^)]*\)/g, "").trim();
  // Simple singularization for dedup
  const singular = singularize(baseName).replace(/\s+/g, " ");
  // Include prep state so "raw" and "cooked" stay separate
  const prepPart = parenMatch ? parenMatch[1].split(",").map((s) => s.trim()).sort().join(",") : "";
  return prepPart ? `${singular}|${prepPart}` : singular;
}

function qualityScore(result: DatabaseSearchResult): number {
  let score = 0;
  // Data type priority
  if (result.dataType === "Foundation") score += 30;
  else if (result.dataType === "SR Legacy") score += 20;
  else if (result.dataType === "Survey (FNDDS)") score += 10;

  // Nutrient completeness
  const m = result.macrosPer100g;
  if (m.fiber != null) score += 2;
  if (m.sugar != null) score += 2;
  if (m.sodium != null) score += 2;
  if (m.potassium != null) score += 2;

  // Serving info bonus
  if (result.defaultServingG) score += 5;

  return score;
}

function deduplicateResults(results: DatabaseSearchResult[]): DatabaseSearchResult[] {
  const groups = new Map<string, DatabaseSearchResult>();

  for (const result of results) {
    const key = makeDedupeKey(result.name);
    const existing = groups.get(key);
    if (!existing || qualityScore(result) > qualityScore(existing)) {
      groups.set(key, result);
    }
  }

  return Array.from(groups.values());
}

// --- Ranking ---

function normalizeForRanking(s: string): string {
  return s.toLowerCase().replace(/,/g, "").replace(/\([^)]*\)/g, "").trim();
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

    // Simplicity bonus: fewer words = simpler = better
    const wordCount = nameWords.length;
    score += Math.max(0, 15 - Math.max(0, wordCount - 3));

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

function rankBrandedResults(
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
    else if (normName.startsWith(normQuery)) score += 30;

    // Word match scoring
    const matchedWords = queryWords.filter((w) => normName.includes(w));
    if (matchedWords.length === queryWords.length && score === 0) score += 20;
    else score += matchedWords.length * 5;

    // Brand presence bonus
    if (result.brand) score += 3;

    // Serving info bonus
    if (result.defaultServingG) score += 2;

    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.result);
}

function isCommonFood(result: DatabaseSearchResult): boolean {
  if (result.dataType) {
    return COMMON_DATA_TYPES.has(result.dataType);
  }
  return false;
}

function normalizeCacheKey(query: string): string {
  return "v3:" + query.toLowerCase().trim().replace(/\s+/g, " ");
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

  // Extract extended nutrients (only include non-null values)
  const extRaw: Record<string, number | undefined> = {};
  for (const [key, id] of Object.entries(FDC_EXTENDED_NUTRIENT_IDS)) {
    extRaw[key] = extractFdcNutrient(nutrients, id);
  }
  const extendedNutrientsPer100g: Record<string, number> = {};
  for (const [key, val] of Object.entries(extRaw)) {
    if (val != null) {
      extendedNutrientsPer100g[key] = Math.round(val * 100) / 100;
    }
  }
  const hasExtended = Object.keys(extendedNutrientsPer100g).length > 0;

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

  // Normalize name: full normalization for common types, title-case ALL CAPS branded names
  const rawName = food.description || food.lowercaseDescription || "Unknown";
  const dataType = food.dataType || undefined;
  let name: string;
  if (dataType && COMMON_DATA_TYPES.has(dataType)) {
    name = normalizeFdcName(rawName, dataType);
  } else if (rawName === rawName.toUpperCase() && rawName.length > 1) {
    name = toTitleCase(rawName);
  } else {
    name = rawName;
  }

  return {
    fdcId: food.fdcId,
    source: "FDC",
    name,
    brand: food.brandName || food.brandOwner || undefined,
    category: food.foodCategory || undefined,
    dataType,
    macrosPer100g,
    ...(hasExtended && { extendedNutrientsPer100g }),
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
    pageSize: limit * 3, // fetch extra to account for filtering + dedup
    dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    nutrients: [...Object.values(FDC_NUTRIENT_IDS), ...Object.values(FDC_EXTENDED_NUTRIENT_IDS)],
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
    // Category filtering
    if (shouldExcludeFdcFood(food, query)) continue;

    const result = fdcFoodToResult(food);
    if (result) results.push(result);
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

    const { query, limit = 15, mode, fdcId }: SearchRequest = await req.json();

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

    // Check cache
    const { data: cached } = await supabase
      .from("food_search_cache")
      .select("results, expires_at, hit_count")
      .eq("search_query", cacheKey)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      // Increment hit count (fire and forget)
      supabase
        .from("food_search_cache")
        .update({ hit_count: (cached as any).hit_count + 1 })
        .eq("search_query", cacheKey)
        .then(() => {});

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

    // Search FDC
    const fdcApiKey = Deno.env.get("FDC_API_KEY");

    let allResults: DatabaseSearchResult[] = [];
    if (fdcApiKey) {
      allResults = await searchFDC(query.trim(), fdcApiKey, limit).catch((err) => {
        console.error("[food-search] FDC search failed:", err.message);
        return [];
      });
    }

    // Split into common and branded
    const commonRaw = allResults.filter(isCommonFood);
    const brandedRaw = allResults.filter((r) => !isCommonFood(r));

    // Deduplicate common results, then rank
    const common = rankCommonResults(deduplicateResults(commonRaw), query.trim()).slice(0, limit);
    // Rank branded results
    const branded = rankBrandedResults(brandedRaw, query.trim()).slice(0, limit);

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
