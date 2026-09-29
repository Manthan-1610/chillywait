import type { GameId } from './constants';
import { isLeaderboardConfigured, LEADERBOARD_API_URL } from './leaderboard-config';
import type { LeaderboardEntry } from './leaderboard';

export async function fetchGlobalLeaderboard(
  game: GameId,
  limit = 25,
): Promise<LeaderboardEntry[]> {
  if (!isLeaderboardConfigured()) return [];

  const params = new URLSearchParams({ game, limit: String(limit) });
  const res = await fetch(`${LEADERBOARD_API_URL}/v1/leaderboard?${params}`);
  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed (${res.status})`);
  }

  const body = (await res.json()) as { entries?: LeaderboardEntry[] };
  return body.entries ?? [];
}

export async function submitGlobalScore(
  game: GameId,
  score: number,
  playerId: string,
): Promise<boolean> {
  if (!isLeaderboardConfigured()) return false;
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) return false;

  const res = await fetch(`${LEADERBOARD_API_URL}/v1/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game,
      playerId,
      score: Math.floor(score),
    }),
  });

  if (!res.ok) return false;
  const body = (await res.json()) as { ok?: boolean; submitted?: boolean };
  return Boolean(body.ok && body.submitted);
}
