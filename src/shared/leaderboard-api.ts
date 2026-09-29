import type { GameId } from './constants';
import {
  isLeaderboardConfigured,
  LEADERBOARD_SUPABASE_KEY,
  LEADERBOARD_SUPABASE_URL,
} from './leaderboard-config';
import type { LeaderboardEntry } from './leaderboard';

const TABLE = 'leaderboard_scores';

function headers(): Record<string, string> {
  return {
    apikey: LEADERBOARD_SUPABASE_KEY,
    Authorization: `Bearer ${LEADERBOARD_SUPABASE_KEY}`,
  };
}

export async function fetchGlobalLeaderboard(
  game: GameId,
  limit = 25,
): Promise<LeaderboardEntry[]> {
  if (!isLeaderboardConfigured()) return [];

  const params = new URLSearchParams({
    select: 'player_id,username,score,updated_at',
    game_id: `eq.${game}`,
    order: 'score.desc',
    limit: String(limit),
  });

  const res = await fetch(`${LEADERBOARD_SUPABASE_URL}/rest/v1/${TABLE}?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed (${res.status})`);
  }

  const rows = (await res.json()) as Omit<LeaderboardEntry, 'rank'>[];
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

export async function submitGlobalScore(
  game: GameId,
  score: number,
  playerId: string,
): Promise<boolean> {
  if (!isLeaderboardConfigured()) return false;
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) return false;

  const res = await fetch(`${LEADERBOARD_SUPABASE_URL}/rest/v1/rpc/submit_leaderboard_score`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_player_id: playerId,
      p_game_id: game,
      p_score: Math.floor(score),
    }),
  });

  return res.ok;
}
