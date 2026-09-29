import type { GameRuntimeHooks, GameRuntimeOptions } from './types';

const DEFAULT_FIXED_DT = 1 / 60;
const DEFAULT_MAX_SUB_STEPS = 5;

/**
 * Shared fixed-timestep game loop (rAF + accumulator).
 * All ChillYWait games should run through this instead of setInterval.
 */
export class GameRuntime {
  private hooks: GameRuntimeHooks;
  private fixedDt: number;
  private maxSubSteps: number;
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  constructor(hooks: GameRuntimeHooks, options: GameRuntimeOptions = {}) {
    this.hooks = hooks;
    this.fixedDt = options.fixedDt ?? DEFAULT_FIXED_DT;
    this.maxSubSteps = options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Whether the rAF loop is scheduled (may still be paused for simulation). */
  isRunning(): boolean {
    return this.running;
  }

  private frame = (time: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    const rawDt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.hooks.isSimulating()) {
      this.accumulator += rawDt;
      let steps = 0;
      while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
        this.hooks.update(this.fixedDt);
        this.accumulator -= this.fixedDt;
        steps++;
      }
      if (steps === this.maxSubSteps) {
        this.accumulator = 0;
      }
    } else {
      this.accumulator = 0;
    }

    this.hooks.render(1);
  };
}
