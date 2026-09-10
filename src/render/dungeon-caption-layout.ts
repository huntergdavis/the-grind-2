export const dungeonCaptionMinimumTitleCssSize = 12;
export const dungeonCaptionMinimumDetailCssSize = 11;

export interface DungeonCaptionLineLayout {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export interface DungeonCaptionLayout {
  /** The renderer selects a short, factual variant; this helper never invents or truncates a result. */
  readonly compact: boolean;
  readonly rail: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly title: DungeonCaptionLineLayout;
  readonly detail: DungeonCaptionLineLayout | null;
  readonly maxTextWidth: number;
}

/** Design-space geometry from the actual CSS scene scale, independent of DPR and hidden game facts. */
export function projectDungeonCaptionLayout(sceneScale: number): DungeonCaptionLayout | null {
  // Below half scale even one readable line cannot usefully fit this existing rail.
  if (!Number.isFinite(sceneScale) || sceneScale < 0.5) return null;
  const compact = 7 * sceneScale < dungeonCaptionMinimumTitleCssSize
    || 4.5 * sceneScale < dungeonCaptionMinimumDetailCssSize;
  const rail = Object.freeze(compact
    ? { x: 44, y: 0, width: 232, height: 30 }
    : { x: 101, y: 2, width: 181, height: 23 });
  const textX = rail.x + 9;
  const maxTextWidth = rail.width - 18;
  if (!compact) return Object.freeze({ compact, rail, maxTextWidth,
    title: Object.freeze({ x: textX, y: 5, fontSize: 7, lineHeight: 8, letterSpacing: 1.1 }),
    detail: Object.freeze({ x: textX, y: 15, fontSize: 4.5, lineHeight: 5.5, letterSpacing: 0.35 }),
  });
  const titleSize = Math.max(7, dungeonCaptionMinimumTitleCssSize / sceneScale);
  if (sceneScale < 1) {
    const lineHeight = (dungeonCaptionMinimumTitleCssSize + 1) / sceneScale;
    return Object.freeze({ compact, rail, maxTextWidth,
      title: Object.freeze({ x: textX, y: rail.y + (rail.height - lineHeight) / 2,
        fontSize: titleSize, lineHeight, letterSpacing: 0.2 / sceneScale }),
      detail: null,
    });
  }
  const detailSize = Math.max(4.5, dungeonCaptionMinimumDetailCssSize / sceneScale);
  const titleLineHeight = titleSize + 1;
  const detailLineHeight = detailSize + 1;
  const titleY = rail.y + (rail.height - titleLineHeight - 1 - detailLineHeight) / 2;
  return Object.freeze({ compact, rail, maxTextWidth,
    title: Object.freeze({ x: textX, y: titleY, fontSize: titleSize,
      lineHeight: titleLineHeight, letterSpacing: 0.2 / sceneScale }),
    detail: Object.freeze({ x: textX, y: titleY + titleLineHeight + 1, fontSize: detailSize,
      lineHeight: detailLineHeight, letterSpacing: 0.1 / sceneScale }),
  });
}
