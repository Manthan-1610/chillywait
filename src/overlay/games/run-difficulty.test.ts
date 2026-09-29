import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_STAGE,
  escalate,
  escalateDown,
  runPressure,
  runStage,
} from './run-difficulty';

describe('run difficulty', () => {
  it('stage and pressure increase with tick', () => {
    expect(runStage(0)).toBe(1);
    expect(runPressure(0)).toBe(0);
    expect(runStage(TICKS_PER_STAGE)).toBe(2);
    expect(runPressure(TICKS_PER_STAGE)).toBe(1);
    expect(runStage(TICKS_PER_STAGE * 5)).toBe(6);
  });

  it('escalate keeps rising past soft max (no hard plateau)', () => {
    const early = escalate(3, 10, 1);
    const mid = escalate(3, 10, 3);
    const late = escalate(3, 10, 12);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(mid);
    expect(late).toBeGreaterThan(10);
  });

  it('escalateDown keeps shrinking with a hard floor', () => {
    const early = escalateDown(140, 50, 0.5, { hardMin: 28 });
    const late = escalateDown(140, 50, 10, { hardMin: 28 });
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThanOrEqual(28);
  });
});
