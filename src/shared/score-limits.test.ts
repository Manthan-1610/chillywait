import { describe, expect, it } from 'vitest';
import { createSeededRng, freshRunSeed } from './seeded-rng';
import { isScorePlausible, maxAllowedScore, utcDayKey } from './score-limits';

describe('createSeededRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it('returns values in [0, 1)', () => {
    const rng = createSeededRng(99);
    for (let i = 0; i < 40; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('freshRunSeed', () => {
  it('returns a positive 32-bit integer', () => {
    const seed = freshRunSeed();
    expect(seed).toBeGreaterThan(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('score limits', () => {
  it('allows normal traffic scores', () => {
    expect(isScorePlausible('traffic', 800, 10_000)).toBe(true);
  });

  it('rejects impossible traffic scores', () => {
    expect(isScorePlausible('traffic', 50_000, 5_000)).toBe(false);
  });

  it('rejects huge scores on tiny durations', () => {
    expect(isScorePlausible('coffee', 2_000, 500)).toBe(false);
  });

  it('grows ceiling with duration', () => {
    expect(maxAllowedScore('compile-run', 60_000)).toBeGreaterThan(
      maxAllowedScore('compile-run', 10_000),
    );
  });

  it('formats UTC day keys', () => {
    expect(utcDayKey(new Date('2026-10-04T23:00:00.000Z'))).toBe('2026-10-04');
  });
});
