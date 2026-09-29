import type { PauseReason, RunEndReason, RunResult } from '../engine/types';

export type ScoreCallback = (score: number) => void;

export type RunEndCallback = (result: RunResult) => void;

export interface GameController {
  destroy(): void;
  pause(reason?: PauseReason): void;
  resume(): void;
  /** End the current run and emit RunResult (bank / quit). */
  endRun(reason: RunEndReason): void;
  getScore(): number;
}
