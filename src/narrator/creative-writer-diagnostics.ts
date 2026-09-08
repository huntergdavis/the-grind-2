export interface CreativeWriterDiagnosticRecord {
  step: number;
  vocabularySize: number;
  nanCount: number;
  positiveInfinityCount: number;
  negativeInfinityCount: number;
  finiteMin: number | null;
  finiteMax: number | null;
  sampledToken: number | "non-finite" | null;
  sampledTokenInRange: boolean | null;
}

/** Bounded numerical observations only: no score changes, vectors, or prose. */
export function createCreativeWriterDiagnostics() {
  const records: CreativeWriterDiagnosticRecord[] = [];
  let current: CreativeWriterDiagnosticRecord | null = null;

  return {
    reset(): void {
      records.length = 0;
      current = null;
    },
    observeLogits(data: Float32Array): void {
      // An unrecorded step's token must never overwrite the final recorded step.
      current = null;
      if (records.length >= 64) return;
      let nanCount = 0, positiveInfinityCount = 0, negativeInfinityCount = 0;
      let finiteMin: number | null = null, finiteMax: number | null = null;
      for (let index = 0; index < data.length; index++) {
        const value = data[index]!;
        if (Number.isNaN(value)) nanCount++;
        else if (value === Infinity) positiveInfinityCount++;
        else if (value === -Infinity) negativeInfinityCount++;
        else {
          finiteMin = finiteMin === null ? value : Math.min(finiteMin, value);
          finiteMax = finiteMax === null ? value : Math.max(finiteMax, value);
        }
      }
      current = {
        step: records.length + 1, vocabularySize: data.length,
        nanCount, positiveInfinityCount, negativeInfinityCount, finiteMin, finiteMax,
        sampledToken: null, sampledTokenInRange: null,
      };
      records.push(current);
    },
    observeToken(token: number): void {
      if (current === null) return;
      current.sampledToken = Number.isFinite(token) ? token : "non-finite";
      current.sampledTokenInRange = Number.isInteger(token) && token >= 0 && token < current.vocabularySize;
    },
    snapshot(): readonly Readonly<CreativeWriterDiagnosticRecord>[] {
      return Object.freeze(records.map((record) => Object.freeze({ ...record })));
    },
  };
}
