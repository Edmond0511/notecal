/**
 * Truncates a number to a max length, appending "..." if exceeded.
 * When truncated, shows first 3 digits followed by "...".
 * @param value - The number to format
 * @param maxDigits - Max digits before truncation (default: 5)
 * @returns Formatted string like "12345" or "123..."
 */
export function truncateNumber(value: number, maxDigits: number = 5): string {
  const rounded = Math.round(value);
  const str = rounded.toString();
  if (str.length <= maxDigits) {
    return str;
  }
  return str.slice(0, 3) + '...';
}
