import { isLeaderboardConfigured, LEADERBOARD_API_URL } from './leaderboard-config';
import { sanitizeUsername } from './profile';

export type ClaimUsernameResult =
  | { ok: true; username: string; username_set_at: string }
  | { ok: false; error: 'invalid_format' | 'taken' | 'cooldown'; eligible_at?: string };

export async function checkUsernameAvailable(
  username: string,
  playerId: string,
): Promise<boolean> {
  if (!isLeaderboardConfigured()) return false;

  const clean = sanitizeUsername(username);
  const res = await fetch(`${LEADERBOARD_API_URL}/v1/username/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: clean, playerId }),
  });

  if (!res.ok) return false;
  const body = (await res.json()) as { available?: boolean };
  return body.available === true;
}

export async function claimUsername(
  playerId: string,
  username: string,
): Promise<ClaimUsernameResult> {
  if (!isLeaderboardConfigured()) {
    return { ok: false, error: 'invalid_format' };
  }

  const clean = sanitizeUsername(username);
  const res = await fetch(`${LEADERBOARD_API_URL}/v1/username/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, username: clean }),
  });

  if (!res.ok) {
    return { ok: false, error: 'invalid_format' };
  }

  return (await res.json()) as ClaimUsernameResult;
}
