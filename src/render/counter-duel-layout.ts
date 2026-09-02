export interface CounterDuelDesignBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CounterDuelWitnessLayout {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly cueX: number;
  readonly cueY: number;
  readonly panelBounds: CounterDuelDesignBounds;
  readonly heroEvidenceBounds: CounterDuelDesignBounds;
  readonly evidenceGap: number;
}

const freezeBounds = (bounds: CounterDuelDesignBounds): CounterDuelDesignBounds => Object.freeze(bounds);

export const counterDuelWitnessLayout: CounterDuelWitnessLayout = Object.freeze({
  centerX: 35,
  centerY: 105,
  width: 66,
  height: 18,
  cueX: -19,
  cueY: 24,
  panelBounds: freezeBounds({ left: 2, top: 97, right: 68, bottom: 115 }),
  heroEvidenceBounds: freezeBounds({ left: 72, top: 78, right: 94, bottom: 111 }),
  evidenceGap: 4,
});

export function designBoundsOverlap(
  left: CounterDuelDesignBounds,
  right: CounterDuelDesignBounds,
): boolean {
  return left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top;
}
