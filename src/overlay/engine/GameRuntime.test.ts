import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GameRuntime } from './GameRuntime';

describe('GameRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls update with fixed timestep while simulating', () => {
    const updates: number[] = [];
    const runtime = new GameRuntime(
      {
        update: (dt) => updates.push(dt),
        render: () => undefined,
        isSimulating: () => true,
      },
      { fixedDt: 1 / 60, maxSubSteps: 5 },
    );

    runtime.start();
    vi.advanceTimersByTime(100);
    runtime.stop();

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every((dt) => Math.abs(dt - 1 / 60) < 1e-9)).toBe(true);
  });

  it('skips update when not simulating but keeps running', () => {
    let updates = 0;
    let renders = 0;
    const runtime = new GameRuntime({
      update: () => {
        updates++;
      },
      render: () => {
        renders++;
      },
      isSimulating: () => false,
    });

    runtime.start();
    vi.advanceTimersByTime(50);
    runtime.stop();

    expect(updates).toBe(0);
    expect(renders).toBeGreaterThan(0);
  });
});
