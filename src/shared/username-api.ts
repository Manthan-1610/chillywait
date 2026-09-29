import {
  isLeaderboardConfigured,
  LEADERBOARD_SUPABASE_KEY,
  LEADERBOARD_SUPABASE_URL,
} from './leaderboard-config';
import { sanitizeUsername } from './profile';

function headers(): Record<string, string> {
  return {
    apikey: LEADERBOARD_SUPABASE_KEY,
    Authorization: `Bearer ${LEADERBOARD_SUPABASE_KEY}`,
  };
}

export type ClaimUsernameResult =
  | { ok: true; username: string; username_set_at: string }
  | { ok: false; error: 'invalid_format' | 'taken' | 'cooldown'; eligible_at?: string };

export async function checkUsernameAvailable(
  username: string,
  playerId: string,
): Promise<boolean> {
  if (!isLeaderboardConfigured()) return false;

  const clean = sanitizeUsername(username);
  const res = await fetch(
    `${LEADERBOARD_SUPABASE_URL}/rest/v1/rpc/check_username_available`,
    {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_username: clean, p_player_id: playerId }),
    },
  );

  if (!res.ok) return false;
  return (await res.json()) === true;
}

export async function claimUsername(
  playerId: string,
  username: string,
): Promise<ClaimUsernameResult> {
  if (!isLeaderboardConfigured()) {
    return { ok: false, error: 'invalid_format' };
  }

  const clean = sanitizeUsername(username);
  const res = await fetch(`${LEADERBOARD_SUPABASE_URL}/rest/v1/rpc/claim_username`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_player_id: playerId, p_username: clean }),
  });

  if (!res.ok) {
    return { ok: false, error: 'invalid_format' };
  }

  return (await res.json()) as ClaimUsernameResult;
}
