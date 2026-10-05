/** Keep in sync with src/shared/score-limits.ts */

const RATE_PER_SEC = {
  traffic: 180,
  coffee: 600,
  'compile-run': 120,
};

const BASE_ALLOWANCE = 200;

export function maxAllowedScore(game, durationMs) {
  const secs = Math.max(0, Number(durationMs) || 0) / 1000;
  const rate = RATE_PER_SEC[game] ?? 100;
  return Math.floor(BASE_ALLOWANCE + secs * rate);
}

export function isScorePlausible(game, score, durationMs) {
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) return false;
  if (!Number.isFinite(durationMs) || durationMs < 0) return false;
  if (score > 500 && durationMs < 1_500) return false;
  return score <= maxAllowedScore(game, durationMs);
}

export function utcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
