import { mmkv } from '@/lib/mmkv';
import { NutritionResolveResponse } from '@/types';

const KEY_PREFIX = 'nutrition-cache:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.6;

interface CacheEntry {
  data: NutritionResolveResponse;
  expiresAt: number;
  confidence: number;
}

export function normalizeCacheKey(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/^[-•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/[.!?]+$/, '');
}

function buildKey(userId: string | null, foodText: string): string {
  const scope = userId || 'anon';
  return `${KEY_PREFIX}${scope}:${normalizeCacheKey(foodText)}`;
}

export function getCacheEntry(
  userId: string | null,
  foodText: string,
): NutritionResolveResponse | null {
  const key = buildKey(userId, foodText);
  const raw = mmkv.getString(key);
  if (!raw) return null;

  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.expiresAt < Date.now()) {
      mmkv.remove(key);
      return null;
    }
    return entry.data;
  } catch {
    mmkv.remove(key);
    return null;
  }
}

export function setCacheEntry(
  userId: string | null,
  foodText: string,
  data: NutritionResolveResponse,
  confidence: number,
): void {
  if (confidence < MIN_CONFIDENCE) return;

  const entry: CacheEntry = {
    data,
    expiresAt: Date.now() + TTL_MS,
    confidence,
  };
  mmkv.set(buildKey(userId, foodText), JSON.stringify(entry));
}

export function clearNutritionCache(userId: string | null): number {
  const scope = userId || 'anon';
  const prefix = `${KEY_PREFIX}${scope}:`;
  const keys = mmkv.getAllKeys().filter((k) => k.startsWith(prefix));
  for (const k of keys) mmkv.remove(k);
  return keys.length;
}

export function computeConfidenceScore(data: NutritionResolveResponse): number {
  if (!data.resolved || data.resolved.length === 0) return 0;

  const avgConfidence =
    data.resolved.reduce((sum, item) => sum + item.confidence, 0) /
    data.resolved.length;

  let qualityMultiplier = 1.0;

  if (data.totals.kcal > 2000) {
    qualityMultiplier *= 0.8;
  }

  const hasProtein = data.totals.protein > 0;
  const hasFat = data.totals.fat > 0;
  const hasCarbs = data.totals.carbs > 0;
  if (hasProtein && hasFat && hasCarbs) {
    qualityMultiplier *= 1.1;
  }

  const confidences = data.resolved.map((item) => item.confidence);
  const hasVaryingConfidence = new Set(confidences).size > 1;
  if (!hasVaryingConfidence && avgConfidence === 0.8) {
    qualityMultiplier *= 0.9;
  }

  return Math.min(
    1.0,
    Math.round(avgConfidence * qualityMultiplier * 100) / 100,
  );
}
