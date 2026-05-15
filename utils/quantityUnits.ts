export type QuantityUnit = "servings" | "g" | "oz" | "lbs" | "portion";

export const WEIGHT_UNITS: QuantityUnit[] = ["servings", "g", "oz", "lbs"];

export const GRAMS_PER: Record<string, number> = {
  g: 1,
  oz: 28.3495,
  lbs: 453.592,
};

export function normalizeUnit(unit: string): QuantityUnit | null {
  const lower = unit.toLowerCase().trim();
  if (lower === "g" || lower === "gram" || lower === "grams") return "g";
  if (lower === "oz" || lower === "ounce" || lower === "ounces") return "oz";
  if (
    lower === "lb" ||
    lower === "lbs" ||
    lower === "pound" ||
    lower === "pounds"
  )
    return "lbs";
  return null;
}

export function toGrams(value: number, unit: QuantityUnit): number | null {
  if (unit === "servings") return null;
  return value * (GRAMS_PER[unit] ?? 1);
}

export function fromGrams(grams: number, unit: QuantityUnit): number | null {
  if (unit === "servings") return null;
  return grams / (GRAMS_PER[unit] ?? 1);
}

export function formatQtyValue(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
}
