import type { GameId } from './constants';

/** Generous per-second score ceilings used to reject impossible submissions. */
const RATE_PER_SEC: Record<GameId, number> = {
  traffic: 180,
  coffee: 600,
  'compile-run': 120,
};

const BASE_ALLOWANCE = 200;

/**
 * Upper bound for a legitimate score given how long the run lasted.
 * Tuned above theoretical perfect play so false rejects are rare.
 */
export function maxAllowedScore(game: GameId, durationMs: number): number {
  const secs = Math.max(0, Number(durationMs) || 0) / 1000;
  const rate = RATE_PER_SEC[game] ?? 100;
  return Math.floor(BASE_ALLOWANCE + secs * rate);
}

export function isScorePlausible(
  game: GameId,
  score: number,
  durationMs: number,
): boolean {
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) return false;
  if (!Number.isFinite(durationMs) || durationMs < 0) return false;
  // Very short runs cannot post huge scores
  if (score > 500 && durationMs < 1_500) return false;
  return score <= maxAllowedScore(game, durationMs);
}

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
