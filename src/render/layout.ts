export interface SceneLayout {
  scale: number;
  x: number;
  y: number;
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
