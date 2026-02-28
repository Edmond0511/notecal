// Date conversion utilities for pager index ↔ date string mapping.
// Page index 0 = today, -1 = yesterday, +1 = tomorrow, etc.

/** Returns today at midnight local time. Called fresh each time to handle midnight rollover. */
function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

/** Convert a pager index to a YYYYMMDD string. Index 0 = today. */
export function indexToDate(index: number): string {
  const d = getToday();
  d.setDate(d.getDate() + index);
  return dateToString(d);
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
