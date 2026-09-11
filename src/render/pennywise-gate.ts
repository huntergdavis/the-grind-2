import { Container, Graphics } from "pixi.js";
import type { PennywiseGatePhase } from "../ui/pennywise-gate-view";

/** Close-up staging coordinates, not atlas/world coordinates. Progress is supplied
 * separately by the committed route; this module cannot move or charge the hero.
 */
export function projectPennywiseGateTableau(phase: PennywiseGatePhase) {
  return Object.freeze({ heroX: phase === "approach" ? 130 : phase === "lifting" ? 158 : 224,
    heroY: 133, pivotX: 174, pivotY: 128, raised: phase !== "approach", lifting: phase === "lifting" });
}

export function drawPennywiseGate(phase: PennywiseGatePhase): Container {
  const stage = projectPennywiseGateTableau(phase), layer = new Container();
  const wood = 0x8b6843, edge = 0x3c3028, brass = 0xc7ab65;
  // A real road fixture: two grounded posts, a lifting bar and an unattended honor box.
  layer.addChild(new Graphics().rect(170, 122, 8, 34).fill(wood).rect(173, 126, 2, 27).fill(0xb99b68)
    .rect(166, 154, 17, 4).fill(edge));
  const bar = new Container(); bar.position.set(stage.pivotX, stage.pivotY);
  bar.rotation = stage.raised ? -1.12 : 0;
  bar.addChild(new Graphics().roundRect(-4, -3, 62, 6, 1).fill(wood)
    .moveTo(0, -1.2).lineTo(54, -1.2).stroke({ color: 0xc7b17d, width: 1.1 })
    .circle(0, 0, 3).fill(brass));
  layer.addChild(bar);
  layer.addChild(new Graphics().rect(90, 122, 6, 29).fill(wood)
    .roundRect(82, 114, 22, 20, 2).fill(0x655b44).stroke({ color: edge, width: 1.3 })
    .rect(88, 117, 10, 2).fill(0x17212e)
    .circle(89, 126, 2.7).circle(97, 126, 2.7).stroke({ color: brass, width: 1.2 }));
  if (phase === "paid") layer.addChild(new Graphics().circle(93, 119, 2.1).fill(0xe5c666));
  return layer;
}
