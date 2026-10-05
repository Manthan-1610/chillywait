import type { GameId } from './constants';

export type LeaderboardPeriod = 'all' | 'daily';

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  username: string;
  score: number;
  updated_at?: string;
}

export type LeaderboardFetchRequest = {
  type: 'leaderboard_fetch';
  game: GameId;
  period?: LeaderboardPeriod;
};

export type LeaderboardSubmitRequest = {
  type: 'leaderboard_submit';
  game: GameId;
  score: number;
  durationMs: number;
  seed?: number;
};

export type LeaderboardStatusRequest = { type: 'leaderboard_status' };

export type LeaderboardWakeRequest = { type: 'leaderboard_wake' };

export type LeaderboardRequest =
  | LeaderboardFetchRequest
  | LeaderboardSubmitRequest
  | LeaderboardStatusRequest
  | LeaderboardWakeRequest;

export type LeaderboardFetchResponse = {
  ok: true;
  entries: LeaderboardEntry[];
  configured: boolean;
  period?: LeaderboardPeriod;
  day?: string;
  waking?: boolean;
  error?: string;
};

export type LeaderboardSubmitResponse = {
  ok: boolean;
  submitted?: boolean;
  configured?: boolean;
  waking?: boolean;
  error?: string;
};

export type LeaderboardStatusResponse = {
  configured: boolean;
};

export type LeaderboardWakeResponse = {
  ok: boolean;
  configured: boolean;
  waking?: boolean;
  error?: string;
};

export type LeaderboardResponse =
  | LeaderboardFetchResponse
  | LeaderboardSubmitResponse
  | LeaderboardStatusResponse
  | LeaderboardWakeResponse;

export const GAME_LABELS: Record<GameId, string> = {
  traffic: 'Traffic Rider',
  coffee: 'Last Token',
  'compile-run': 'Compile Run',
};
