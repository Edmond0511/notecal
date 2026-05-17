// Single source of truth for water unit conversions and preset volumes.
// Water is stored canonically in milliliters (ml) throughout the app.

export type WaterUnit = "ml" | "L" | "oz";

export const WATER_TO_ML: Record<WaterUnit, number> = {
  ml: 1,
  L: 1000,
  oz: 29.5735,
};

export function normalizeWaterUnit(raw: string): WaterUnit | null {
  const lower = raw.trim().toLowerCase();
  if (lower === "ml") return "ml";
  if (lower === "l") return "L";
  if (lower === "oz") return "oz";
  return null;
}

export function toMl(value: number, unit: WaterUnit): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * WATER_TO_ML[unit]);
}

export function fromMl(amountMl: number, unit: WaterUnit): number {
  if (!Number.isFinite(amountMl) || amountMl < 0) return 0;
  return amountMl / WATER_TO_ML[unit];
}

// Display a canonical-ml amount in the given unit. ml → integer, oz → floor
// to whole number, L → up to 2 decimals with trailing zeros stripped.
export function formatInUnit(amountMl: number, unit: WaterUnit): string {
  const raw = fromMl(amountMl, unit);
  if (unit === "ml") return String(Math.round(raw));
  if (unit === "oz") return String(Math.floor(raw));
  const rounded = Math.round(raw * 100) / 100;
  return String(rounded);
}

export interface WaterPreset {
  id: string;
  label: string;
  amountMl: number;
  displayValue: number;
  displayUnit: WaterUnit;
}

export const WATER_PRESETS: WaterPreset[] = [
  { id: "glass", label: "Glass", amountMl: 250, displayValue: 250, displayUnit: "ml" },
  { id: "cup", label: "Cup", amountMl: 240, displayValue: 240, displayUnit: "ml" },
  { id: "mug", label: "Mug", amountMl: 350, displayValue: 350, displayUnit: "ml" },
  { id: "bottle", label: "Bottle", amountMl: 500, displayValue: 500, displayUnit: "ml" },
  { id: "sports", label: "Sports", amountMl: 750, displayValue: 750, displayUnit: "ml" },
  { id: "bigBottle", label: "Big Bottle", amountMl: 1000, displayValue: 1, displayUnit: "L" },
];
