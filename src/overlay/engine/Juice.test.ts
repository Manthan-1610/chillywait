import { describe, expect, it } from 'vitest';
import { Juice } from './Juice';

describe('Juice', () => {
  it('skips gameplay during hitstop then resumes', () => {
    const j = new Juice();
    j.addHitstop(3);
    expect(j.tick()).toBe(false);
    expect(j.tick()).toBe(false);
    expect(j.tick()).toBe(false);
    expect(j.tick()).toBe(true);
  });

  it('ages floaters and clears them', () => {
    const j = new Juice();
    j.addFloater('+50', 10, 20, 'near');
    expect(j.floaters).toHaveLength(1);
    for (let i = 0; i < 50; i++) j.tick();
    expect(j.floaters).toHaveLength(0);
  });

  it('bumpShake clamps and decays', () => {
    const j = new Juice();
    j.bumpShake(40);
    expect(j.shake).toBeLessThanOrEqual(18);
    const before = j.shake;
    j.tick();
    expect(j.shake).toBeLessThan(before);
  });
});
