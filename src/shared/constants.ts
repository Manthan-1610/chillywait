export type PlatformId = 'gemini';

export type ActivationMode = 'threshold' | 'immediate';

export type GameId = 'traffic' | 'coffee' | 'compile-run';

export type GenerationState = 'idle' | 'generating';

export type WaitPhase =
  | 'idle'
  | 'generating'
  | 'overlay_visible'
  | 'answer_ready';

export interface ChillYWaitSettings {
  activationMode: ActivationMode;
  delaySeconds: number;
  enabledSites: Record<PlatformId, boolean>;
  lastGame: GameId;
  overlayPosition: { x: number; y: number };
  debug: boolean;
  /** Stable anonymous id for leaderboard submissions. */
  playerId: string;
  /** Globally unique username (claimed via API). */
  username: string;
  /** Epoch ms when username was last set/changed. */
  usernameSetAt: number;
  /** When true, new personal bests are submitted to the global leaderboard. */
  leaderboardOptIn: boolean;
  /** Mute procedural SFX in the overlay. */
  soundMuted: boolean;
}

export const DEFAULT_SETTINGS: ChillYWaitSettings = {
  activationMode: 'threshold',
  delaySeconds: 8,
  enabledSites: {
    gemini: true,
  },
  lastGame: 'traffic',
  overlayPosition: { x: -1, y: -1 },
  debug: false,
  playerId: '',
  username: '',
  usernameSetAt: 0,
  leaderboardOptIn: false,
  soundMuted: false,
};

export const PLATFORM_HOSTS: Record<PlatformId, string[]> = {
  gemini: ['gemini.google.com'],
};

export const CHILLYWAIT_MESSAGE_SOURCE = 'chillywait-extension';

export type OverlayMessage =
  | { type: 'state'; phase: WaitPhase; elapsedMs: number }
  | { type: 'settings'; settings: Partial<ChillYWaitSettings> }
  | { type: 'minimize' }
  | { type: 'dismiss' }
  | { type: 'game_change'; game: GameId }
  | { type: 'manual_open' }
  | { type: 'run_finish' }
  | { type: 'run_bank' };

export type NetworkHookMessage = {
  source: typeof CHILLYWAIT_MESSAGE_SOURCE;
  kind: 'generation_start' | 'generation_end';
  platform?: PlatformId;
  url?: string;
};
