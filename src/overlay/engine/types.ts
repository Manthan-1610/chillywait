import type { GameId } from '../../shared/constants';

export type PauseReason = 'user' | 'answer' | 'minimize' | 'start';

export type RunEndReason = 'death' | 'bank' | 'quit';

export interface RunResult {
  game: GameId;
  score: number;
  durationMs: number;
  reason: RunEndReason;
  /** Per-run PRNG seed for audit / future replay. */
  seed?: number;
}

export interface GameRuntimeHooks {
  /** Fixed-timestep simulation. Called 0–N times per frame. */
  update(dt: number): void;
  /** Render at display refresh. `alpha` is unused for now (interpolation later). */
  render(alpha: number): void;
  /** When false, update() is skipped but render() still runs. */
  isSimulating(): boolean;
}

export interface GameRuntimeOptions {
  /** Fixed simulation step in seconds. Default 1/60. */
  fixedDt?: number;
  /** Cap sub-steps per frame to avoid spiral of death. */
  maxSubSteps?: number;
}
