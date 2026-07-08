// Shared formatting helpers used both server-side (home fundraiser card,
// rendered at build time) and client-side (Instagram template studio).
// Keeping them in one place guarantees the home page and the exported
// images format money and percentages identically.

/** "₴ 341 500" — Ukrainian grouping, normalized to regular spaces. */
export function fmtUAH(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  // toLocaleString('uk-UA') groups thousands with a non-breaking space; \s
  // matches NBSP/narrow-NBSP, so this normalizes to plain ASCII spaces.
  return '₴ ' + value.toLocaleString('uk-UA').replace(/\s/g, ' ');
}

/** Clamped raised/goal percentage, 0-100, rounded. */
export function percentOf(raised: number, goal: number): number {
  const g = Math.max(1, Number(goal) || 0);
  const r = Math.max(0, Number(raised) || 0);
  return Math.max(0, Math.min(100, Math.round((r / g) * 100)));
}

/** Ukrainian day pluralization: 1 день, 2 дні, 5 днів. */
export function dayWord(n: number): string {
  const num = Math.max(1, Number(n) || 1);
  const m10 = num % 10;
  const m100 = num % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дні';
  return 'днів';
}

/** "3 дні" */
export function dayFmt(n: number): string {
  const num = Math.max(1, Number(n) || 1);
  return num + ' ' + dayWord(num);
}
