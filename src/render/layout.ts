export interface SceneLayout {
  scale: number;
  x: number;
  y: number;
}

export interface SceneLayoutBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const maximumProjectedTextResolution = 12;
export const animatedLayerMaximumOffset = 0.8;

export function projectedTextResolution(rendererResolution: number, sceneScale: number): number {
  const safeRendererResolution = Number.isFinite(rendererResolution) && rendererResolution > 0
    ? rendererResolution
    : 1;
  const safeSceneScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
  return Math.min(
    maximumProjectedTextResolution,
    Math.max(1, Math.ceil(safeRendererResolution * Math.max(1, safeSceneScale))),
  );
}

export function calculateSceneLayout(
  viewportWidth: number,
  viewportHeight: number,
  designWidth: number,
  designHeight: number,
): SceneLayout {
  const scale = Math.min(viewportWidth / designWidth, viewportHeight / designHeight);
  return {
    scale,
    x: (viewportWidth - designWidth * scale) / 2,
    y: (viewportHeight - designHeight * scale) / 2,
  };
}

export function calculateBoundedSceneLayout(
  bounds: SceneLayoutBounds,
  designWidth: number,
  designHeight: number,
): SceneLayout {
  const left = Number.isFinite(bounds.left) ? bounds.left : 0;
  const top = Number.isFinite(bounds.top) ? bounds.top : 0;
  const right = Math.max(left + 1, Number.isFinite(bounds.right) ? bounds.right : left + 1);
  const bottom = Math.max(top + 1, Number.isFinite(bounds.bottom) ? bounds.bottom : top + 1);
  const width = right - left;
  const height = bottom - top;
  const scale = Math.min(width / Math.max(1, designWidth), height / Math.max(1, designHeight));
  return {
    scale,
    x: left + (width - designWidth * scale) / 2,
    y: top + (height - designHeight * scale) / 2,
  };
}

export function animatedLayerY(baseY: number, elapsedSeconds: number): number {
  return baseY + Math.sin(elapsedSeconds * 0.7) * animatedLayerMaximumOffset;
}
