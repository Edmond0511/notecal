import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callFatSecret,
  FatSecretApiError,
  normalizeServings,
  type NormalizedServing,
} from "../_shared/fatsecret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query?: string;
  limit?: number;
  mode?: "search" | "detail";
  foodId?: string;
  // Legacy field — ignored but accepted to avoid client errors during rollout
  fdcId?: number;
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
  foodId: string;
  source: "FS";
  name: string;
  brand?: string;
  category?: string;
  fsServings: NormalizedServing[];
  defaultServingMacros: Macros;
  defaultServingDescription: string;
}

function normalizeCacheKey(query: string): string {
  return "fs:search:" + query.toLowerCase().trim().replace(/\s+/g, " ");
}

function fsSearchResultToResult(food: any): DatabaseSearchResult | null {
  const foodId = String(food.food_id);
  const name = food.food_name || "Unknown";
  const brand = food.brand_name || undefined;
  const category = food.food_sub_categories?.food_sub_category?.[0] || undefined;

  // v3 API returns servings inline — use them directly
  const fsServings = normalizeServings(food);

  // Pick default serving for display macros (prefer gram-based)
  const defaultServing = fsServings.find((s) => s.metricUnit === "g") ?? fsServings[0];
  const defaultServingMacros: Macros = defaultServing
    ? defaultServing.macros
    : { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const defaultServingDescription = defaultServing?.description ?? "1 serving";

  return {
    foodId,
    source: "FS",
    name,
    brand,
    category,
    fsServings,
    defaultServingMacros,
    defaultServingDescription,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SearchRequest = await req.json();
    const { query, limit = 15, mode, foodId } = body;

    // --- Detail mode: fetch full food with servings ---
    if (mode === "detail" && foodId) {
      const detailCacheKey = `fs:food:${foodId}`;
      const { data: cachedDetail } = await supabase
        .from("food_search_cache")
        .select("results, expires_at")
        .eq("search_query", detailCacheKey)
        .maybeSingle();

      if (cachedDetail && new Date(cachedDetail.expires_at) > new Date()) {
        return new Response(
          JSON.stringify({ ...cachedDetail.results, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const data = await callFatSecret("food.get.v4", { food_id: foodId });
      const food = data.food;
      if (!food) {
        return new Response(
          JSON.stringify({ error: "Food not found", servings: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const servings = normalizeServings(food);
      const result = { servings, foodId, name: food.food_name };

      // Cache detail (7 days)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      supabase
        .from("food_search_cache")
        .upsert(
          { search_query: detailCacheKey, results: result, result_count: servings.length, hit_count: 0, expires_at: expiresAt },
          { onConflict: "search_query" },
        )
        .then(() => {});

      return new Response(
        JSON.stringify({ ...result, cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Search mode ---
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
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      supabase
        .from("food_search_cache")
        .update({ hit_count: (cached.hit_count || 0) + 1 })
        .eq("search_query", cacheKey)
        .then(() => {});

      return new Response(
        JSON.stringify({ ...cached.results, query: query.trim(), cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call FatSecret foods.search.v3
    const data = await callFatSecret("foods.search.v3", {
      search_expression: query.trim(),
      max_results: Math.min(limit * 3, 50),
    });

    const foods = data.foods_search?.results?.food;
    if (!foods) {
      const emptyResult = { common: [], branded: [], query: query.trim(), cached: false };
      return new Response(
        JSON.stringify(emptyResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const foodArray = Array.isArray(foods) ? foods : [foods];

    // Partition by food_type: Generic → common, Brand → branded
    const common: DatabaseSearchResult[] = [];
    const branded: DatabaseSearchResult[] = [];

    for (const food of foodArray) {
      const result = fsSearchResultToResult(food);
      if (!result) continue;

      if (food.food_type === "Brand") {
        branded.push(result);
      } else {
        common.push(result);
      }
    }

    const trimmedCommon = common.slice(0, limit);
    const trimmedBranded = branded.slice(0, limit);

    const responseBody = { common: trimmedCommon, branded: trimmedBranded };

    // Cache results (7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("food_search_cache")
      .upsert(
        {
          search_query: cacheKey,
          results: responseBody,
          result_count: trimmedCommon.length + trimmedBranded.length,
          hit_count: 0,
          expires_at: expiresAt,
        },
        { onConflict: "search_query" },
      )
      .then(() => {});

    return new Response(
      JSON.stringify({ ...responseBody, query: query.trim(), cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof FatSecretApiError && err.code === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.error("[food-search] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
