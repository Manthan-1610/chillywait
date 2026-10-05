import type { GameId } from './constants';
import { isExtensionContextValid } from './extension-context';
import type {
  LeaderboardEntry,
  LeaderboardFetchResponse,
  LeaderboardPeriod,
  LeaderboardStatusResponse,
  LeaderboardSubmitResponse,
  LeaderboardWakeResponse,
} from './leaderboard';

function sendMessage<T>(message: unknown): Promise<T> {
  if (!isExtensionContextValid()) {
    return Promise.reject(new Error('Extension context unavailable'));
  }
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as T);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function fetchLeaderboard(
  game: GameId,
  period: LeaderboardPeriod = 'all',
): Promise<LeaderboardFetchResponse> {
  return sendMessage<LeaderboardFetchResponse>({
    type: 'leaderboard_fetch',
    game,
    period,
  });
}

export async function submitScore(
  game: GameId,
  score: number,
  durationMs: number,
  seed?: number,
): Promise<LeaderboardSubmitResponse> {
  return sendMessage<LeaderboardSubmitResponse>({
    type: 'leaderboard_submit',
    game,
    score,
    durationMs,
    seed,
  });
}

export async function getLeaderboardStatus(): Promise<LeaderboardStatusResponse> {
  return sendMessage<LeaderboardStatusResponse>({ type: 'leaderboard_status' });
}

export async function wakeLeaderboard(): Promise<LeaderboardWakeResponse> {
  return sendMessage<LeaderboardWakeResponse>({ type: 'leaderboard_wake' });
}

export type { LeaderboardEntry, LeaderboardPeriod };
