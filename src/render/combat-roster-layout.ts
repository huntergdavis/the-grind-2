export interface CombatRosterBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CombatRosterLayout {
  plates: readonly CombatRosterBounds[];
  upcoming: CombatRosterBounds;
  bottom: number;
}

export interface CombatCueVerticalLayout {
  reticleTop: number;
  reticleBottom: number;
  statusCenterY: number;
  statusBottom: number;
}

const designWidth = 320;
const plateColumns = 3;
const horizontalInset = 6;
const plateGap = 3;
const plateHeight = 14;
const rowGap = 2;
const upcomingGap = 3;
const upcomingHeight = 9;

export function projectCombatRosterLayout(unitCount: number, top: number): CombatRosterLayout {
  const boundedCount = Math.max(0, Math.min(6, Math.floor(Number.isFinite(unitCount) ? unitCount : 0)));
  const boundedTop = Math.max(0, Number.isFinite(top) ? top : 0);
  const plateWidth = (designWidth - horizontalInset * 2 - plateGap * (plateColumns - 1)) / plateColumns;
  const plates = Array.from({ length: boundedCount }, (_, index): CombatRosterBounds => ({
    x: horizontalInset + (index % plateColumns) * (plateWidth + plateGap),
    y: boundedTop + Math.floor(index / plateColumns) * (plateHeight + rowGap),
    width: plateWidth,
    height: plateHeight,
  }));
  const rows = Math.ceil(boundedCount / plateColumns);
  const upcomingY = boundedTop + rows * plateHeight + Math.max(0, rows - 1) * rowGap + upcomingGap;
  const upcoming = { x: horizontalInset, y: upcomingY, width: designWidth - horizontalInset * 2, height: upcomingHeight };
  return { plates, upcoming, bottom: upcomingY + upcomingHeight };
}

export function projectCombatCueVerticalLayout(spriteY: number, rosterBottom: number): CombatCueVerticalLayout {
  const safeSpriteY = Number.isFinite(spriteY) ? spriteY : 0;
  const safeRosterBottom = Math.max(0, Number.isFinite(rosterBottom) ? rosterBottom : 0);
  const cueTop = safeRosterBottom + 3;
  const statusCenterY = Math.max(safeSpriteY - 34, cueTop + 3);
  return {
    reticleTop: Math.max(safeSpriteY - 43, cueTop),
    reticleBottom: Math.min(176, safeSpriteY + 18),
    statusCenterY,
    statusBottom: statusCenterY + 5.5,
  };
}
