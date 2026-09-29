import type { GameId } from './constants';
import { isExtensionContextValid } from './extension-context';
import type {
  LeaderboardEntry,
  LeaderboardFetchResponse,
  LeaderboardStatusResponse,
  LeaderboardSubmitResponse,
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
): Promise<LeaderboardFetchResponse> {
  return sendMessage<LeaderboardFetchResponse>({ type: 'leaderboard_fetch', game });
}

export async function submitScore(
  game: GameId,
  score: number,
): Promise<LeaderboardSubmitResponse> {
  return sendMessage<LeaderboardSubmitResponse>({
    type: 'leaderboard_submit',
    game,
    score,
  });
}

export async function getLeaderboardStatus(): Promise<LeaderboardStatusResponse> {
  return sendMessage<LeaderboardStatusResponse>({ type: 'leaderboard_status' });
}

export type { LeaderboardEntry };
