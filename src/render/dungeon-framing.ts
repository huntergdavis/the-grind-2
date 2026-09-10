/** The existing mechanism receipt stays above the known-space camera. */
export const dungeonFramingViewRect = Object.freeze({ x: 44, y: 32, width: 232, height: 124 });
export const dungeonFramingMaximumCellSize = 40;
export const dungeonFramingGutter = 0.25;

export interface DungeonFraming {
  readonly cellSize: number;
  /** A room's upper-left corner is offset + coordinate * cellSize. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
  readonly roomCount: number;
}

/** Callers supply discovered room coordinates only: no hidden geometry or state is accepted. */
export function projectDungeonFraming(cells: readonly { x: number; y: number }[]): DungeonFraming | null {
  if (!Array.isArray(cells) || cells.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const coordinates = new Set<string>();
  for (const cell of cells) {
    if (cell === null || typeof cell !== "object" || !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) return null;
    coordinates.add(`${cell.x}:${cell.y}`);
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }
  const columns = maxX - minX + 1;
  const rows = maxY - minY + 1;
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows)) return null;
  const rect = dungeonFramingViewRect;
  const cellSize = Math.min(dungeonFramingMaximumCellSize,
    rect.width / (columns + dungeonFramingGutter * 2),
    rect.height / (rows + dungeonFramingGutter * 2));
  const left = rect.x + (rect.width - columns * cellSize) / 2;
  const top = rect.y + (rect.height - rows * cellSize) / 2;
  const offsetX = left - minX * cellSize;
  const offsetY = top - minY * cellSize;
  // Reject extreme coordinates if floating-point cancellation would move the
  // projected rooms away from the centered public bounds.
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)
    || Math.abs(offsetX + minX * cellSize - left) > 0.000001
    || Math.abs(offsetY + minY * cellSize - top) > 0.000001) return null;
  return Object.freeze({ cellSize, offsetX, offsetY,
    bounds: Object.freeze({ minX, minY, maxX, maxY }), roomCount: coordinates.size });
}
