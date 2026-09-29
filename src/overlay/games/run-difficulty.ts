/**
 * Endless-run difficulty helpers.
 *
 * Design goals (arcade / wait-session):
 * - Early game teaches controls (noticeable steps every ~15s).
 * - Mid game keeps climbing so a 1–2 min Gemini wait stays tense.
 * - Late game never hard-caps — soft asymptote + tiny drip forever.
 * - Keep "breathing" patterns (waves/gaps); only escalate their parameters.
 */

/** Fixed-sim ticks per stage (~15s at 60Hz). */
export const TICKS_PER_STAGE = 900;

/** Continuous pressure: 0 at start, +1 every stage. */
export function runPressure(
  tick: number,
  ticksPerStage = TICKS_PER_STAGE,
): number {
  return Math.max(0, tick) / ticksPerStage;
}

/** 1-based stage for HUD / milestones. */
export function runStage(
  tick: number,
  ticksPerStage = TICKS_PER_STAGE,
): number {
  return 1 + Math.floor(Math.max(0, tick) / ticksPerStage);
}

/**
 * Grow from `base` toward `softMax`, then keep dripping past it.
 * `rise` controls how fast we approach softMax; `drip` is per-pressure after.
 */
export function escalate(
  base: number,
  softMax: number,
  pressure: number,
  opts: { rise?: number; drip?: number } = {},
): number {
  const rise = opts.rise ?? 0.85;
  const drip = opts.drip ?? 0.02;
  const span = softMax - base;
  const approach = softMax - span * Math.exp(-pressure * rise);
  const over = Math.max(0, pressure - 1.5) * drip * Math.abs(span);
  return approach + over;
}

/**
 * Shrink from `base` toward `softMin`, then keep dripping lower.
 * Floor at `hardMin` so the game stays reactable.
 */
export function escalateDown(
  base: number,
  softMin: number,
  pressure: number,
  opts: { rise?: number; drip?: number; hardMin?: number } = {},
): number {
  const rise = opts.rise ?? 0.85;
  const drip = opts.drip ?? 0.02;
  const hardMin = opts.hardMin ?? softMin * 0.55;
  const span = base - softMin;
  const approach = softMin + span * Math.exp(-pressure * rise);
  const under = Math.max(0, pressure - 1.5) * drip * Math.abs(span);
  return Math.max(hardMin, approach - under);
}
