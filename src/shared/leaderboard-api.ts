import type { GameId } from './constants';
import { isLeaderboardConfigured, LEADERBOARD_API_URL } from './leaderboard-config';
import type { LeaderboardEntry, LeaderboardPeriod } from './leaderboard';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free Render hosts sleep. First request can take ~30–50s.
 * Retry with a long timeout and surface waking=true to the UI.
 */
export async function fetchWithWake(
  path: string,
  init?: RequestInit,
  opts?: { attempts?: number },
): Promise<{ res: Response; waking: boolean }> {
  const attempts = opts?.attempts ?? 3;
  let waking = false;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    // First try is short so we can show "waking"; later tries wait out cold start.
    const timeoutMs = i === 0 ? 6_000 : 55_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${LEADERBOARD_API_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return { res, waking };
      }
      waking = true;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      waking = true;
      lastErr = err;
    }
    if (i < attempts - 1) await sleep(1_200 * (i + 1));
  }

  throw lastErr instanceof Error ? lastErr : new Error('leaderboard unreachable');
}

export async function wakeLeaderboard(): Promise<boolean> {
  if (!isLeaderboardConfigured()) return false;
  try {
    const { res } = await fetchWithWake('/health', undefined, { attempts: 2 });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchGlobalLeaderboard(
  game: GameId,
  period: LeaderboardPeriod = 'all',
  limit = 25,
): Promise<{ entries: LeaderboardEntry[]; period: LeaderboardPeriod; day?: string; waking: boolean }> {
  if (!isLeaderboardConfigured()) {
    return { entries: [], period, waking: false };
  }

  const params = new URLSearchParams({
    game,
    period,
    limit: String(limit),
  });
  const { res, waking } = await fetchWithWake(`/v1/leaderboard?${params}`);
  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed (${res.status})`);
  }

  const body = (await res.json()) as {
    entries?: LeaderboardEntry[];
    period?: LeaderboardPeriod;
    day?: string;
  };
  return {
    entries: body.entries ?? [],
    period: body.period ?? period,
    day: body.day,
    waking,
  };
}

export async function submitGlobalScore(
  game: GameId,
  score: number,
  playerId: string,
  durationMs: number,
  seed?: number,
): Promise<{ submitted: boolean; waking: boolean; error?: string }> {
  if (!isLeaderboardConfigured()) {
    return { submitted: false, waking: false, error: 'not configured' };
  }
  if (!Number.isFinite(score) || score < 1 || score > 9_999_999) {
    return { submitted: false, waking: false, error: 'invalid score' };
  }

  const { res, waking } = await fetchWithWake('/v1/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game,
      playerId,
      score: Math.floor(score),
      durationMs: Math.max(0, Math.floor(durationMs || 0)),
      seed: seed && seed > 0 ? Math.floor(seed) : undefined,
    }),
  });

  if (!res.ok) {
    return { submitted: false, waking, error: `submit failed (${res.status})` };
  }
  const body = (await res.json()) as { ok?: boolean; submitted?: boolean; error?: string };
  return {
    submitted: Boolean(body.ok && body.submitted),
    waking,
    error: body.error,
  };
}
