// Mulberry32 — fast, reproducible 32-bit PRNG. Never call Math.random() directly.
function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

class RNG {
  private _seed: number;
  private _next: () => number;

  constructor(seed: number | string) {
    this._seed = typeof seed === 'string' ? seedFromString(seed) : seed >>> 0;
    this._next = mulberry32(this._seed);
  }

  /** Returns a float in [0, 1) */
  next(): number {
    return this._next();
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns a float in [min, max) */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Picks a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  get seed(): number {
    return this._seed;
  }

  reseed(seed: number | string): void {
    this._seed = typeof seed === 'string' ? seedFromString(seed) : seed >>> 0;
    this._next = mulberry32(this._seed);
  }
}

// Daily challenge seed: today's ISO date string e.g. "2026-06-10"
export function dailySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

// Session seed: random uint32, stored so bugs are reproducible
export function randomSessionSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export const rng = new RNG(randomSessionSeed());
export { RNG };
