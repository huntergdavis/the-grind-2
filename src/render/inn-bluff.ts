import { Container, Graphics } from "pixi.js";
import type { InnBluffScene } from "../ui/inn-bluff-view";

export const innBluffTableau = Object.freeze({ heroX: 128, heroY: 130, residentX: 232, residentY: 130,
  cupX: 176, cupY: 113, dieX: 176, dieY: 116 });

/** One lift/reveal, never a shuffle or a reroll. The actual face already exists
 * only in a result packet; a reduced-motion scene goes straight to the reveal.
 */
export function projectInnBluffReveal(elapsed: number, still: boolean) {
  const progress = still ? 1 : Math.min(1, Math.max(0, elapsed / 0.55));
  return Object.freeze({ cupX: innBluffTableau.cupX + 33 * progress,
    cupY: innBluffTableau.cupY - 22 * Math.sin(Math.PI * progress), progress });
}

type InnBluffDrawingView = { readonly phase: "admission" }
  | { readonly phase: "result"; readonly revealedFace: number };

export function drawInnBluff(scene: InnBluffDrawingView): { layer: Container; cup: Container } {
  const layer = new Container();
  layer.addChild(new Graphics().rect(70, 52, 198, 108).fill(0x4b393d)
    .rect(68, 52, 201, 7).fill(0x805b42).rect(75, 60, 6, 98).fill(0x704d39)
    .rect(256, 60, 6, 98).fill(0x704d39).rect(68, 151, 200, 13).fill(0x654b3d)
    .rect(86, 72, 27, 34).fill(0x8a7259).rect(89, 75, 21, 28).fill(0x84918f)
    .rect(98, 74, 3, 30).fill(0x5c493d).rect(88, 87, 23, 3).fill(0x5c493d));
  // Two actual admitted seats, not a crowd or a fabricated innkeeper.
  layer.addChild(new Graphics().rect(113, 140, 31, 5).fill(0x936747).rect(116, 144, 5, 15).fill(0x704e38)
    .rect(137, 144, 5, 15).fill(0x704e38).rect(218, 140, 30, 5).fill(0x936747)
    .rect(220, 144, 5, 15).fill(0x704e38).rect(241, 144, 5, 15).fill(0x704e38));
  layer.addChild(new Graphics().rect(169, 131, 14, 26).fill(0x775238)
    .ellipse(176, 156, 29, 4).fill(0x6d4a34).ellipse(176, 129, 49, 11).fill(0x8e6042)
    .ellipse(176, 126, 49, 10).fill(0xbb8b5b).ellipse(176, 126, 46, 8).stroke({ color: 0xd0a878, width: 0.8 }));
  if (scene.phase === "result") {
    const die = new Container(); die.label = "inn-bluff-die";
    die.position.set(innBluffTableau.dieX, innBluffTableau.dieY);
    die.addChild(new Graphics().roundRect(-8, -8, 16, 16, 2).fill(0xf0e5ce).stroke({ color: 0x705c4d, width: 1 }));
    const pipPositions: readonly (readonly [number, number])[] = scene.revealedFace === 1 ? [[0, 0]]
      : scene.revealedFace === 2 ? [[-4, -4], [4, 4]]
      : scene.revealedFace === 3 ? [[-4, -4], [0, 0], [4, 4]]
      : scene.revealedFace === 4 ? [[-4, -4], [4, -4], [-4, 4], [4, 4]]
      : scene.revealedFace === 5 ? [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]]
      : [[-4, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [4, 4]];
    for (const [x, y] of pipPositions) {
      const pip = new Graphics().circle(x, y, 1.5).fill(0x453d39); pip.label = "pip"; die.addChild(pip);
    }
    layer.addChild(die);
  }
  const cup = new Container(); cup.label = "inn-bluff-cup";
  cup.position.set(innBluffTableau.cupX, innBluffTableau.cupY);
  cup.addChild(new Graphics().poly([-8, -15, 8, -15, 12, 11, -12, 11]).fill(0x966347)
    .ellipse(0, -15, 8, 3).fill(0xb78253).ellipse(0, 11, 12, 3).fill(0x684631)
    .moveTo(-4, -11).lineTo(-6, 6).stroke({ color: 0xc49260, width: 2 }));
  if (scene.phase === "result") {
    const revealed = projectInnBluffReveal(1, true); cup.position.set(revealed.cupX, revealed.cupY);
  }
  layer.addChild(cup); return { layer, cup };
}

// Compile-time check: the renderer accepts the public discriminated union,
// never a private admission face or the canonical encounter record.
export function innBluffDrawingView(scene: InnBluffScene): InnBluffDrawingView {
  return scene.phase === "admission" ? { phase: "admission" }
    : { phase: "result", revealedFace: scene.revealedFace };
}
