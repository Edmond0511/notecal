/**
 * Formats a number for display, using compact notation for large values.
 * Small numbers are shown as-is; large ones get "k" or "M" suffixes.
 * @param value - The number to format
 * @param maxDigits - Max character length before compacting (default: 5)
 * @returns Formatted string like "1234", "12.3k", "1.2M"
 */
export function truncateNumber(value: number, maxDigits: number = 5): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const str = rounded.toString();
  if (str.length <= maxDigits) {
    return str;
  }
  const sign = rounded < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) {
    const t = abs / 1_000_000_000_000;
    return sign + (t >= 100 ? `${Math.round(t)}T` : `${parseFloat(t.toFixed(1))}T`);
  }
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    return sign + (b >= 100 ? `${Math.round(b)}B` : `${parseFloat(b.toFixed(1))}B`);
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return sign + (m >= 100 ? `${Math.round(m)}M` : `${parseFloat(m.toFixed(1))}M`);
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return sign + (k >= 100 ? `${Math.round(k)}k` : `${parseFloat(k.toFixed(1))}k`);
  }
  return str.slice(0, maxDigits);
}

/**
 * Formats a water amount (in milliliters) for display. Values under 1000ml
 * render in ml; values >= 1000ml render in liters with one decimal (trimmed
 * if whole). Returned separately so callers can style the unit.
 */
export function formatWater(ml: number): { value: string; unit: "ml" | "L" } {
  if (!Number.isFinite(ml) || ml < 0) return { value: "0", unit: "ml" };
  if (ml < 1000) return { value: String(Math.round(ml)), unit: "ml" };
  const liters = ml / 1000;
  const rounded = Math.round(liters * 10) / 10;
  const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return { value, unit: "L" };
}
