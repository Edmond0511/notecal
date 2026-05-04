import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callFatSecret,
  FatSecretApiError,
  normalizeServings,
  type NormalizedServing,
} from "../_shared/fatsecret.ts";

const ALLOWED_ORIGINS = new Set([
  "https://notecal.app",
  "http://localhost:8081",
]);

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RateLimitDecision {
  response?: Response;
  pendingRowId: number | null;
}

async function checkRateLimit(
  supabase: any,
  userId: string,
  ipHash: string,
  requestType: string,
  cost: number,
  corsHeaders: Record<string, string>,
): Promise<RateLimitDecision> {
  try {
    const { data, error } = await supabase.rpc("check_and_record_usage", {
      p_user_id: userId,
      p_ip_hash: ipHash,
      p_request_type: requestType,
      p_cost_credits: cost,
    });

    if (error) {
      // Fail closed — refuse the request when rate-limit infra is unavailable.
      console.error("[RateLimit] RPC error, failing closed:", error);
      return {
        pendingRowId: null,
        response: new Response(
          JSON.stringify({ error: "rate_limit_unavailable" }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        ),
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error("[RateLimit] RPC returned no row, failing closed");
      return {
        pendingRowId: null,
        response: new Response(
          JSON.stringify({ error: "rate_limit_unavailable" }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        ),
      };
    }

    if (!row.allowed) {
      const retryAfter = row.retry_after_seconds ?? 60;
      const remaining = Math.max(0, (row.limit_day ?? 0) - (row.used_day ?? 0));
      return {
        pendingRowId: null,
        response: new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            reason: row.reason,
            usedDay: row.used_day,
            limitDay: row.limit_day,
            usedMinute: row.used_minute,
            limitMinute: row.limit_minute,
            retryAfterSeconds: retryAfter,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(row.limit_day ?? 0),
              "X-RateLimit-Remaining": String(remaining),
            },
          },
        ),
      };
    }

    return { pendingRowId: row.pending_row_id ?? null };
  } catch (e) {
    console.error("[RateLimit] Unexpected error, failing closed:", e);
    return {
      pendingRowId: null,
      response: new Response(
        JSON.stringify({ error: "rate_limit_unavailable" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ),
    };
  }
}

function normalizeCacheKey(query: string): string {
  // Bump the version suffix to invalidate after changing the nutrient
  // extraction in _shared/fatsecret.ts.
  return "fs:search:v2:" + query.toLowerCase().trim().replace(/\s+/g, " ");
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
  const corsHeaders = buildCors(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Auth gate: require valid Bearer JWT ---
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthenticated" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(
        token,
      );
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: "unauthenticated" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      userId = user.id;
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "unauthenticated" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // IP hash for rate-limit table (auth'd users still get logged with IP).
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const clientIp = xff.split(",")[0].trim() || "unknown";
    const ipHash = await sha256Hex(clientIp);

    const body: SearchRequest = await req.json();
    const { query, limit = 15, mode, foodId } = body;

    // --- Detail mode: fetch full food with servings ---
    if (mode === "detail" && foodId) {
      // Validate foodId shape (numeric or alphanumeric token, length-capped)
      if (typeof foodId !== "string" || foodId.length === 0 || foodId.length > 64) {
        return new Response(
          JSON.stringify({ error: "Invalid foodId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const rl = await checkRateLimit(supabase, userId, ipHash, "search", 1, corsHeaders);
      if (rl.response) return rl.response;

      const detailCacheKey = `fs:food:v2:${foodId}`;
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

    if (query.length > 100) {
      return new Response(
        JSON.stringify({ error: "Query too long (max 100 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rl = await checkRateLimit(supabase, userId, ipHash, "search", 1, corsHeaders);
    if (rl.response) return rl.response;

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
