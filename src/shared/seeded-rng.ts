/** Mulberry32 — tiny deterministic PRNG for fair run seeds. */
export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let t = seed >>> 0;
  if (t === 0) t = 0x9e3779b9;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cryptographically random 32-bit seed for a new run. */
export function freshRunSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] || 1) >>> 0;
  }
  return ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) || 1;
}
