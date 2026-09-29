/** Authored spawn rhythm for Traffic Rider — calm → dense → gap → peak → calm. */

import {
  escalate,
  escalateDown,
  runPressure,
  runStage,
} from './run-difficulty';

export interface TrafficWave {
  id: string;
  /** Duration in fixed ticks (~60/sec). */
  duration: number;
  /** Frames between spawn attempts. */
  spawnInterval: number;
  /** 0–1 chance a spawn attempt succeeds. */
  spawnChance: number;
  /** Max cars that may share nearby Z in different lanes. */
  maxParallel: number;
  /** Prefer trucks more often. */
  truckChance: number;
}

export interface ScaledTrafficWave extends TrafficWave {
  stage: number;
  pressure: number;
  /** Derived road scroll speed for this moment in the run. */
  speed: number;
}

export const TRAFFIC_WAVES: TrafficWave[] = [
  { id: 'calm', duration: 360, spawnInterval: 90, spawnChance: 0.55, maxParallel: 1, truckChance: 0.1 },
  { id: 'build', duration: 300, spawnInterval: 70, spawnChance: 0.7, maxParallel: 2, truckChance: 0.2 },
  { id: 'dense', duration: 420, spawnInterval: 48, spawnChance: 0.85, maxParallel: 2, truckChance: 0.3 },
  { id: 'gap', duration: 180, spawnInterval: 140, spawnChance: 0.35, maxParallel: 1, truckChance: 0.15 },
  { id: 'peak', duration: 360, spawnInterval: 40, spawnChance: 0.95, maxParallel: 3, truckChance: 0.4 },
];

const SPEED_BASE = 0.018;
const SPEED_SOFT = 0.052;

export function waveAt(tick: number): TrafficWave {
  const cycle = TRAFFIC_WAVES.reduce((sum, w) => sum + w.duration, 0);
  let t = ((tick % cycle) + cycle) % cycle;
  for (const wave of TRAFFIC_WAVES) {
    if (t < wave.duration) return wave;
    t -= wave.duration;
  }
  return TRAFFIC_WAVES[0];
}

/**
 * Wave pattern + long-run pressure.
 * Breathing phases stay; intervals/chance/trucks/speed escalate forever.
 */
export function scaledWaveAt(tick: number): ScaledTrafficWave {
  const base = waveAt(tick);
  const pressure = runPressure(tick);
  const stage = runStage(tick);

  // Interval multiplier: denser over time, but gaps still breathe relatively
  const intervalMul = escalateDown(1, 0.5, pressure, {
    rise: 0.75,
    drip: 0.025,
    hardMin: 0.32,
  });
  const spawnInterval = Math.max(
    16,
    Math.round(base.spawnInterval * intervalMul),
  );

  const spawnChance = Math.min(
    1,
    base.spawnChance + pressure * 0.045 + Math.min(0.12, stage * 0.01),
  );

  const truckChance = Math.min(0.78, base.truckChance + pressure * 0.055);

  // Unlock 3-wide packs earlier as stages climb; peak already has 3
  let maxParallel = base.maxParallel;
  if (pressure >= 1.2 && maxParallel < 2) maxParallel = 2;
  if (pressure >= 2.5 && maxParallel < 3) maxParallel = 3;
  if (base.id === 'peak' && pressure >= 3.5) maxParallel = 3;

  const speed = escalate(SPEED_BASE, SPEED_SOFT, pressure, {
    rise: 0.8,
    drip: 0.0018,
  });

  return {
    ...base,
    spawnInterval,
    spawnChance,
    truckChance,
    maxParallel,
    stage,
    pressure,
    speed,
  };
}
