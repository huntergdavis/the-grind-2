import { Container, Graphics } from "pixi.js";
import type { SmithyJobScene } from "../ui/smithy-job-view";

export const smithyJobTableau = Object.freeze({ heroX: 128, heroY: 130, residentX: 232, residentY: 130,
  anvilX: 176, anvilY: 136, hammerX: 149, hammerY: 119 });

/** A single committed stroke: lift, contact, settle. Never loops or changes the
 * workpiece/resources. Reduced motion shows the already committed contact pose.
 */
export function projectSmithyHammerPose(elapsed: number, still: boolean): number {
  if (still || elapsed >= 0.7) return 0.12;
  const time = Math.max(0, elapsed);
  if (time < 0.22) return 0.12 - time / 0.22 * 1.1;
  if (time < 0.46) return -0.98 + (time - 0.22) / 0.24 * 1.1;
  return 0.12;
}

export function drawSmithyJob(scene: Pick<SmithyJobScene, "shape" | "strokeCount">): { layer: Container; hammer: Container } {
  const layer = new Container();
  // One admitted work bay; no town crowd or inferred resident profession.
  layer.addChild(new Graphics().rect(70, 54, 195, 99).fill(0x373a42)
    .rect(68, 52, 199, 7).fill(0x6f5440).rect(74, 57, 7, 97).fill(0x624c3a)
    .rect(254, 57, 7, 97).fill(0x624c3a).rect(67, 150, 201, 13).fill(0x514334));
  // An ordinary smithy hearth is a worksite prop, not a new actor or item reward.
  layer.addChild(new Graphics().roundRect(88, 77, 28, 55, 3).fill(0x5c5960)
    .roundRect(93, 103, 18, 25, 6).fill(0x24232b).ellipse(102, 122, 7, 3).fill(0xa65a39)
    .moveTo(96, 123).lineTo(100, 112).lineTo(103, 118).lineTo(107, 110).lineTo(109, 123).closePath().fill(0xd89551));
  layer.addChild(new Graphics().rect(165, 137, 23, 17).fill(0x795338)
    .ellipse(176.5, 138, 12, 4).fill(0x97734c).rect(166, 130, 21, 9).fill(0x646e78)
    .poly([158, 124, 193, 124, 186, 130, 166, 130]).fill(0xa8b1bc)
    .rect(162, 122, 24, 3).fill(0xd5d4cc));
  const nail = new Graphics(), metal = 0xf0d59a;
  // Every terminal shape has its own silhouette. An intermediate blank is not
  // called a failure simply because only one stroke has happened so far.
  if (scene.shape === "bent") nail.moveTo(173, 113).lineTo(181, 113).moveTo(177, 113).lineTo(177, 120).lineTo(186, 120);
  else if (scene.shape === "straight") nail.moveTo(174, 110).lineTo(182, 110).moveTo(178, 110).lineTo(178, 121)
    .moveTo(176.5, 119).lineTo(178, 122).lineTo(179.5, 119);
  else nail.moveTo(174, 113).lineTo(181, 113).moveTo(178, 113).lineTo(178, 121).moveTo(176, 121).lineTo(180, 121);
  layer.addChild(nail.stroke({ color: metal, width: 2 }));
  // These are the two actual completed strokes, not a score or future promise.
  for (let index = 0; index < scene.strokeCount; index++) layer.addChild(new Graphics()
    .moveTo(170 + index * 9, 147).lineTo(173 + index * 9, 144).stroke({ color: 0xd0b684, width: 1.8 }));
  const hammer = new Container(); hammer.position.set(smithyJobTableau.hammerX, smithyJobTableau.hammerY);
  hammer.addChild(new Graphics().roundRect(0, -1.5, 29, 3, 1).fill(0xb98951)
    .roundRect(25, -5, 8, 10, 1).fill(0xbfc4c9).rect(25, -5, 2, 10).fill(0xe6dfcd));
  hammer.rotation = 0.12; layer.addChild(hammer);
  return { layer, hammer };
}
