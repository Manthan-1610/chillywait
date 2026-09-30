import type { GameId } from './constants';

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  username: string;
  score: number;
  updated_at?: string;
}

export type LeaderboardFetchRequest = { type: 'leaderboard_fetch'; game: GameId };

export type LeaderboardSubmitRequest = {
  type: 'leaderboard_submit';
  game: GameId;
  score: number;
};

export type LeaderboardStatusRequest = { type: 'leaderboard_status' };

export type LeaderboardRequest =
  | LeaderboardFetchRequest
  | LeaderboardSubmitRequest
  | LeaderboardStatusRequest;

export type LeaderboardFetchResponse = {
  ok: true;
  entries: LeaderboardEntry[];
  configured: boolean;
  error?: string;
};

export type LeaderboardSubmitResponse = {
  ok: boolean;
  submitted?: boolean;
  configured?: boolean;
  error?: string;
};

export type LeaderboardStatusResponse = {
  configured: boolean;
};

export type LeaderboardResponse =
  | LeaderboardFetchResponse
  | LeaderboardSubmitResponse
  | LeaderboardStatusResponse;

export const GAME_LABELS: Record<GameId, string> = {
  traffic: 'Traffic Rider',
  coffee: 'Last Token',
  'compile-run': 'Compile Run',
};
