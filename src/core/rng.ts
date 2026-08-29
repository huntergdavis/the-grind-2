function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function randomUnit(
  seed: string,
  domain: string,
  entityId: string,
  tick: number,
  purpose: string,
  ordinal = 0,
): number {
  let state = hash32(
    [seed, domain, entityId, String(tick), purpose, String(ordinal)].join("\u001f"),
  );
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x1_0000_0000;
}

export function randomInt(
  maximumExclusive: number,
  seed: string,
  domain: string,
  entityId: string,
  tick: number,
  purpose: string,
  ordinal = 0,
): number {
  if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
    throw new RangeError("maximumExclusive must be a positive safe integer");
  }

  return Math.floor(
    randomUnit(seed, domain, entityId, tick, purpose, ordinal) * maximumExclusive,
  );
}

export function pick<T>(
  values: readonly T[],
  seed: string,
  domain: string,
  entityId: string,
  tick: number,
  purpose: string,
  ordinal = 0,
): T {
  const value = values[
    randomInt(values.length, seed, domain, entityId, tick, purpose, ordinal)
  ];
  if (value === undefined) {
    throw new RangeError("Cannot pick from an empty collection");
  }
  return value;
}
