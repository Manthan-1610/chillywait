import { describe, expect, it } from 'vitest';
import { lockQuote, stackValue } from './last-token';

describe('last token lock', () => {
  it('pays a 5-stack in full the first time', () => {
    const quote = lockQuote(5, 0, 0);
    expect(quote.rate).toBe(1);
    expect(quote.gain).toBe(stackValue(5));
    expect(quote.beat).toBe(false);
    expect(quote.nextBest).toBe(5);
  });

  it('taxes a repeat of the same height', () => {
    const quote = lockQuote(5, 1, 5);
    expect(quote.rate).toBe(0.8);
    expect(quote.gain).toBe(Math.round(stackValue(5) * 0.8));
  });

  it('pays a taller stack in full plus a bonus and resets the tax', () => {
    const raw = stackValue(6);
    const quote = lockQuote(6, 3, 5);
    expect(quote.beat).toBe(true);
    expect(quote.rate).toBe(1);
    expect(quote.gain).toBe(raw + Math.round(raw * 0.25));
    expect(quote.nextLocks).toBe(1);
    expect(quote.nextBest).toBe(6);
  });

  it('bottoms out at 40 percent', () => {
    expect(lockQuote(4, 8, 9).rate).toBe(0.4);
  });
});
