/**
 * Deterministic seeded PRNG (Mulberry32) and random selection utilities.
 * Updates `state.rngSeed` deterministically on every draw/shuffle/selection.
 */

export interface RngCarrier {
  rngSeed: number;
}

/**
 * Pure Mulberry32 step: given a 32-bit seed, returns a float in [0, 1) and the next seed.
 */
export function nextRng(seed: number): { value: number; nextSeed: number } {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextSeed };
}

/**
 * Generates a float in [0, 1) and advances `carrier.rngSeed` in place.
 */
export function randomFloat(carrier: RngCarrier): number {
  const { value, nextSeed } = nextRng(carrier.rngSeed >>> 0);
  carrier.rngSeed = nextSeed;
  return value;
}

/**
 * Generates an integer in [0, maxExclusive - 1] and advances `carrier.rngSeed`.
 */
export function randomInt(carrier: RngCarrier, maxExclusive: number): number {
  if (maxExclusive <= 1) {
    // Still advance seed for determinism consistency or return 0
    if (maxExclusive <= 0) return 0;
    randomFloat(carrier);
    return 0;
  }
  const r = randomFloat(carrier);
  return Math.floor(r * maxExclusive);
}

/**
 * Fisher-Yates shuffle in-place using `carrier.rngSeed`.
 */
export function shuffleInPlace<T>(items: T[], carrier: RngCarrier): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat(carrier) * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Returns a new shuffled copy of `items` while advancing `carrier.rngSeed`.
 */
export function shuffle<T>(items: readonly T[], carrier: RngCarrier): T[] {
  const copy = [...items];
  return shuffleInPlace(copy, carrier);
}

/**
 * Selects up to `count` distinct indices from `[0, length - 1]` uniformly at random.
 * Returns indices sorted in ascending order.
 */
export function pickRandomIndices(length: number, count: number, carrier: RngCarrier): number[] {
  if (count <= 0 || length <= 0) return [];
  if (count >= length) {
    return Array.from({ length }, (_, idx) => idx);
  }
  const pool = Array.from({ length }, (_, idx) => idx);
  const chosen: number[] = [];
  for (let k = 0; k < count; k++) {
    const pickIdx = Math.floor(randomFloat(carrier) * pool.length);
    chosen.push(pool[pickIdx]!);
    pool.splice(pickIdx, 1);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * Picks a branch index according to positive weights (default weight = 1).
 */
export function pickWeightedIndex(weights: readonly number[], carrier: RngCarrier): number {
  if (weights.length === 0) return -1;
  const sanitized = weights.map((w) => (w > 0 ? w : 1));
  const total = sanitized.reduce((acc, w) => acc + w, 0);
  let roll = randomFloat(carrier) * total;
  for (let i = 0; i < sanitized.length; i++) {
    roll -= sanitized[i]!;
    if (roll <= 0) return i;
  }
  return sanitized.length - 1;
}
