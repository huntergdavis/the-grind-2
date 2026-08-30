export interface SceneLayout {
  scale: number;
  x: number;
  y: number;
}

export const maximumProjectedTextResolution = 12;

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

export function animatedLayerY(baseY: number, elapsedSeconds: number): number {
  return baseY + Math.sin(elapsedSeconds * 0.7) * 0.8;
}
