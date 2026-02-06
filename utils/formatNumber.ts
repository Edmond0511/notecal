/**
 * Formats a number for display, using compact notation for large values.
 * Small numbers are shown as-is; large ones get "k" or "M" suffixes.
 * @param value - The number to format
 * @param maxDigits - Max character length before compacting (default: 5)
 * @returns Formatted string like "1234", "12.3k", "1.2M"
 */
export function truncateNumber(value: number, maxDigits: number = 5): string {
  const rounded = Math.round(value);
  const str = rounded.toString();
  if (str.length <= maxDigits) {
    return str;
  }
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000;
    return m >= 100 ? `${Math.round(m)}M` : `${parseFloat(m.toFixed(1))}M`;
  }
  if (rounded >= 1_000) {
    const k = rounded / 1_000;
    return k >= 100 ? `${Math.round(k)}k` : `${parseFloat(k.toFixed(1))}k`;
  }
  return str.slice(0, maxDigits);
}
