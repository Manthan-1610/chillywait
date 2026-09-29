import { describe, expect, it } from 'vitest';
import {
  TRAFFIC_WAVES,
  scaledWaveAt,
  waveAt,
} from './traffic-waves';
import { TICKS_PER_STAGE } from './run-difficulty';

describe('traffic waves', () => {
  it('cycles through authored phases', () => {
    expect(waveAt(0).id).toBe('calm');
    expect(waveAt(TRAFFIC_WAVES[0].duration).id).toBe('build');
    const cycle = TRAFFIC_WAVES.reduce((sum, w) => sum + w.duration, 0);
    expect(waveAt(cycle).id).toBe('calm');
    expect(waveAt(cycle + TRAFFIC_WAVES[0].duration + 1).id).toBe('build');
  });

  it('has denser peak than calm', () => {
    const calm = TRAFFIC_WAVES.find((w) => w.id === 'calm')!;
    const peak = TRAFFIC_WAVES.find((w) => w.id === 'peak')!;
    expect(peak.spawnInterval).toBeLessThan(calm.spawnInterval);
    expect(peak.spawnChance).toBeGreaterThan(calm.spawnChance);
  });

  it('escalates density and speed across long runs', () => {
    const early = scaledWaveAt(0);
    const late = scaledWaveAt(TICKS_PER_STAGE * 8);
    expect(late.speed).toBeGreaterThan(early.speed);
    expect(late.spawnInterval).toBeLessThan(early.spawnInterval);
    expect(late.spawnChance).toBeGreaterThanOrEqual(early.spawnChance);
    expect(late.truckChance).toBeGreaterThan(early.truckChance);
    expect(late.stage).toBeGreaterThan(early.stage);
  });

  it('keeps escalating past soft speed — no hard plateau', () => {
    const a = scaledWaveAt(TICKS_PER_STAGE * 4);
    const b = scaledWaveAt(TICKS_PER_STAGE * 12);
    expect(b.speed).toBeGreaterThan(a.speed);
  });
});
