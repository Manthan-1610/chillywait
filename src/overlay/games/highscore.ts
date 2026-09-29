import type { GameId } from '../../shared/constants';
import { isExtensionContextValid } from '../../shared/extension-context';

const STORAGE_KEY = 'chillywait_bests';
const LEGACY_PREFIX = 'chillywait-best-';

const GAMES: GameId[] = ['traffic', 'coffee', 'compile-run'];

type BestMap = Record<GameId, number>;

const cache: BestMap = {
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

/** Load bests from chrome.storage.local; migrate iframe localStorage once. */
export async function initHighscores(): Promise<BestMap> {
  if (hydrated) return { ...cache };

  const legacy = readLegacyLocalStorage();
  let stored: BestMap = emptyBests();

  if (isExtensionContextValid()) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const raw = result[STORAGE_KEY] as Partial<BestMap> | undefined;
      if (raw && typeof raw === 'object') {
        for (const game of GAMES) {
          stored[game] = Number(raw[game]) || 0;
        }
      }
    } catch {
      // ignore
    }
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
  isNewBest: boolean;
}

/** Call once per run end — updates local best. */
export function recordRunEnd(game: GameId, score: number): RunRecordResult {
  const prev = getBest(game);
  const best = setBest(game, score);
  return {
    score,
    best,
    isNewBest: score > prev,
  };
}
