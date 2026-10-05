import type { GameId } from '../../shared/constants';
import { isExtensionContextValid } from '../../shared/extension-context';
import { utcDayKey } from '../../shared/score-limits';

const STORAGE_KEY = 'chillywait_bests';
const DAILY_STORAGE_KEY = 'chillywait_daily_bests';
const LEGACY_PREFIX = 'chillywait-best-';

const GAMES: GameId[] = ['traffic', 'coffee', 'compile-run'];

type BestMap = Record<GameId, number>;

type DailyStore = {
  day: string;
  bests: BestMap;
};

const cache: BestMap = {
  traffic: 0,
  coffee: 0,
  'compile-run': 0,
};

let dailyDay = '';
const dailyCache: BestMap = {
  traffic: 0,
  coffee: 0,
  'compile-run': 0,
};

let hydrated = false;

function emptyBests(): BestMap {
  return { traffic: 0, coffee: 0, 'compile-run': 0 };
}

function readLegacyLocalStorage(): BestMap {
  const out = emptyBests();
  try {
    for (const game of GAMES) {
      const raw = localStorage.getItem(LEGACY_PREFIX + game);
      if (raw) out[game] = Number(raw) || 0;
    }
  } catch {
    // ignore
  }
  return out;
}

function clearLegacyLocalStorage(): void {
  try {
    for (const game of GAMES) {
      localStorage.removeItem(LEGACY_PREFIX + game);
    }
  } catch {
    // ignore
  }
}

async function persist(): Promise<void> {
  if (!isExtensionContextValid()) {
    try {
      for (const game of GAMES) {
        localStorage.setItem(LEGACY_PREFIX + game, String(cache[game]));
      }
    } catch {
      // ignore
    }
    return;
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...cache } });
  } catch {
    // ignore
  }
}

async function persistDaily(): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    const payload: DailyStore = {
      day: dailyDay,
      bests: { ...dailyCache },
    };
    await chrome.storage.local.set({ [DAILY_STORAGE_KEY]: payload });
  } catch {
    // ignore
  }
}

function ensureDailyDay(now = new Date()): void {
  const day = utcDayKey(now);
  if (day === dailyDay) return;
  dailyDay = day;
  for (const game of GAMES) dailyCache[game] = 0;
}

/** Load bests from chrome.storage.local; migrate iframe localStorage once. */
export async function initHighscores(): Promise<BestMap> {
  if (hydrated) return { ...cache };

  const legacy = readLegacyLocalStorage();
  let stored: BestMap = emptyBests();

  if (isExtensionContextValid()) {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY, DAILY_STORAGE_KEY]);
      const raw = result[STORAGE_KEY] as Partial<BestMap> | undefined;
      if (raw && typeof raw === 'object') {
        for (const game of GAMES) {
          stored[game] = Number(raw[game]) || 0;
        }
      }

      const dailyRaw = result[DAILY_STORAGE_KEY] as DailyStore | undefined;
      ensureDailyDay();
      if (dailyRaw && dailyRaw.day === dailyDay && dailyRaw.bests) {
        for (const game of GAMES) {
          dailyCache[game] = Number(dailyRaw.bests[game]) || 0;
        }
      }
    } catch {
      // ignore
    }
  } else {
    ensureDailyDay();
  }

  for (const game of GAMES) {
    cache[game] = Math.max(stored[game], legacy[game]);
  }

  const needsWrite = GAMES.some((g) => legacy[g] > stored[g]);
  if (needsWrite || GAMES.some((g) => legacy[g] > 0)) {
    await persist();
    clearLegacyLocalStorage();
  }

  hydrated = true;
  return { ...cache };
}

export function getBest(game: GameId): number {
  return cache[game] ?? 0;
}

export function getDailyBest(game: GameId): number {
  ensureDailyDay();
  return dailyCache[game] ?? 0;
}

/** Update local best if higher. Does not submit to leaderboard. */
export function setBest(game: GameId, score: number): number {
  const current = getBest(game);
  if (score <= current) return current;
  cache[game] = score;
  void persist();
  return score;
}

export interface RunRecordResult {
  score: number;
  best: number;
  dailyBest: number;
  isNewBest: boolean;
  isNewDailyBest: boolean;
}

/** Call once per run end — updates local all-time and UTC-daily bests. */
export function recordRunEnd(game: GameId, score: number): RunRecordResult {
  ensureDailyDay();
  const prev = getBest(game);
  const prevDaily = getDailyBest(game);
  const best = setBest(game, score);
  let dailyBest = prevDaily;
  const isNewDailyBest = score > prevDaily;
  if (isNewDailyBest) {
    dailyCache[game] = score;
    dailyBest = score;
    void persistDaily();
  }
  return {
    score,
    best,
    dailyBest,
    isNewBest: score > prev,
    isNewDailyBest,
  };
}
