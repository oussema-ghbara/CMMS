/** Returns a short human-readable elapsed duration from a past ISO date to now (e.g. "3h", "2j"). */
export function elapsedSince(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}j`;
}

/** Returns the ISO-8601 timestamp for the start of the current UTC day (midnight). */
export function todayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
