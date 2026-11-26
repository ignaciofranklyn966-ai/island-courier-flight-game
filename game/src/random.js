// Island Courier — deterministic random numbers.
//
// A small mulberry32 generator so the island layout, palm placement and
// ring positions are identical for the same seed. The screenshot mode leans
// on this: ?seed=N always builds the same archipelago.

export function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [min, max) from a seeded generator.
export function randomRange(random, min, max) {
  return min + random() * (max - min);
}

// Integer in [min, max] from a seeded generator.
export function randomInt(random, min, max) {
  return Math.floor(randomRange(random, min, max + 1));
}

// Pick one element of an array from a seeded generator.
export function randomPick(random, array) {
  return array[Math.floor(random() * array.length)];
}

// Smooth deterministic wobble used for terrain detail: two sines whose
// phases come from the seed, so the same seed always shapes the same hills.
export function terrainWobble(x, z, phaseA, phaseB) {
  return (
    Math.sin(x * 0.021 + phaseA) * Math.cos(z * 0.017 + phaseB) * 0.5 +
    Math.sin((x + z) * 0.008 + phaseB) * 0.5
  );
}
