// Date conversion utilities for pager index ↔ date string mapping.
// Page index 0 = today, -1 = yesterday, +1 = tomorrow, etc.

// Cached "today" value — avoids creating a new Date on every call.
// Invalidated after 60 seconds to handle midnight rollover gracefully.
let _cachedToday: Date | null = null;
let _cachedTodayTs = 0;
const CACHE_TTL = 60_000; // 60 seconds

/** Returns today at midnight local time, cached for 60s. */
function getToday(): Date {
  const now = Date.now();
  if (_cachedToday && now - _cachedTodayTs < CACHE_TTL) {
    return new Date(_cachedToday.getTime()); // return clone so callers can mutate
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  _cachedToday = d;
  _cachedTodayTs = now;
  return new Date(d.getTime());
}

/** Parse a YYYYMMDD string into a Date at midnight local time. */
export function stringToDate(dateString: string): Date {
  return new Date(
    Number.parseInt(dateString.substring(0, 4)),
    Number.parseInt(dateString.substring(4, 6)) - 1,
    Number.parseInt(dateString.substring(6, 8)),
  );
}

/** Format a Date to YYYYMMDD string. */
export function dateToString(date: Date): string {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  );
}

// Small LRU cache for indexToDate — the pager typically calls with index
// -1, 0, +1 on every render, so caching these avoids repeated Date math.
const _indexCache = new Map<number, string>();
const INDEX_CACHE_MAX = 8;

/** Convert a pager index to a YYYYMMDD string. Index 0 = today. */
export function indexToDate(index: number): string {
  const cached = _indexCache.get(index);
  if (cached !== undefined) return cached;

  const d = getToday();
  d.setDate(d.getDate() + index);
  const result = dateToString(d);

  // Evict oldest entries when cache is full
  if (_indexCache.size >= INDEX_CACHE_MAX) {
    const first = _indexCache.keys().next().value;
    if (first !== undefined) _indexCache.delete(first);
  }
  _indexCache.set(index, result);
  return result;
}

/** Invalidate the index cache (called after midnight rollover). */
export function invalidateDateCache(): void {
  _cachedToday = null;
  _indexCache.clear();
}

/** Convert a YYYYMMDD string to a pager index. Today = 0. */
export function dateToIndex(dateString: string): number {
  const target = stringToDate(dateString);
  const diffMs = target.getTime() - getToday().getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Format a YYYYMMDD string for display: "Today" or "Mon, Jan 15". */
export function formatDateDisplay(dateString: string): string {
  const today = new Date();
  const date = stringToDate(dateString);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
