export interface CreativeDirectionLogits {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

/** Closed stage selection only. Eligible model scores are never rewritten. */
export function createCreativeDirectionMask(tokenIds: readonly number[]) {
  if ((tokenIds.length !== 2 && tokenIds.length !== 3) || new Set(tokenIds).size !== tokenIds.length
    || tokenIds.some((id) => !Number.isSafeInteger(id) || id < 0)) {
    throw new Error("Direction needs two or three distinct single-token labels");
  }
  const labels = [...tokenIds];
  const allowed = new Set(labels);
  return (logits: CreativeDirectionLogits): CreativeDirectionLogits => {
    if (logits.dims.length !== 2 || logits.dims[0] !== 1
      || !(logits.data instanceof Float32Array) || logits.dims[1] !== logits.data.length
      || labels.some((id) => id >= logits.data.length || !Number.isFinite(logits.data[id]))) {
      throw new Error("Invalid direction model scores");
    }
    for (let id = 0; id < logits.data.length; id++) {
      if (!allowed.has(id)) logits.data[id] = Number.NEGATIVE_INFINITY;
    }
    return logits;
  };
}
