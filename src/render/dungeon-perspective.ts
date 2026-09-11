import { Container, Graphics, Text } from "pixi.js";
import type { DungeonPerspectiveExit, DungeonPerspectiveTrap, DungeonPerspectiveView } from "../ui/dungeon-perspective-view";
import { dungeonFramingViewRect } from "./dungeon-framing";
import { projectHeroIdentityAppearance } from "./hero-appearance";

export interface DungeonPerspectiveDrawing {
  readonly layer: Container;
  readonly labels: readonly Text[];
  readonly viewport: typeof dungeonFramingViewRect;
}

/** Fixed room geometry: no hidden coordinates, onward passages or world state enter here. */
export const dungeonPerspectiveDoorPolygons = Object.freeze({
  front: Object.freeze([97, 83, 97, 38, 135, 38, 135, 83]),
  left: Object.freeze([10, 42, 49, 45, 49, 91, 10, 113]),
  right: Object.freeze([183, 45, 222, 42, 222, 113, 183, 91]),
});

function keyGlyph(x: number, y: number, color = 0xffd166): Graphics {
  return new Graphics().circle(x, y, 3).stroke({ color, width: 1.5 })
    .moveTo(x + 3, y).lineTo(x + 11, y).lineTo(x + 11, y + 3)
    .moveTo(x + 7, y).lineTo(x + 7, y + 2).stroke({ color, width: 1.5 });
}

function trapGlyph(trap: DungeonPerspectiveTrap, x: number, y: number, size = 6): Graphics {
  const color = trap.status === "armed" ? trap.kind === "mana-siphon" ? 0x9bcfed : 0xffd166 : 0x8cab99;
  const glyph = new Graphics();
  if (trap.kind === "tripwire") {
    glyph.moveTo(x - size, y + 2).lineTo(x + size, y - 2).stroke({ color, width: 1.4 })
      .circle(x - size, y + 2, 2).circle(x + size, y - 2, 2).fill(color);
  } else if (trap.kind === "mana-siphon") {
    glyph.poly([x, y - size, x + size * 0.7, y, x, y + size, x - size * 0.7, y])
      .stroke({ color, width: 1.5 }).moveTo(x, y - 3).lineTo(x, y + 3)
      .lineTo(x - 2, y + 1).stroke({ color, width: 1.2 });
  } else {
    glyph.circle(x, y, size).stroke({ color, width: 1.2 })
      .poly([x, y - size * 0.7, x + size * 0.7, y + size * 0.5, x - size * 0.7, y + size * 0.5])
      .stroke({ color, width: 1.2 });
  }
  if (trap.status !== "armed") glyph.moveTo(x - size, y - size).lineTo(x + size, y + size)
    .stroke({ color, width: 1.6 });
  return glyph;
}

/** Static 2.5D preview of this one known room. This function cannot move or reveal anything. */
export function drawDungeonPerspective(view: DungeonPerspectiveView): DungeonPerspectiveDrawing {
  const layer = new Container();
  layer.position.set(dungeonFramingViewRect.x, dungeonFramingViewRect.y);
  const labels: Text[] = [];
  try {
    layer.addChild(new Graphics().rect(0, 0, 232, 124).fill(0x10191e)
      .poly([0, 0, 232, 0, 165, 17, 67, 17]).fill(0x1b252a)
      .poly([0, 0, 67, 17, 67, 83, 0, 124]).fill(0x3c474a)
      .poly([165, 17, 232, 0, 232, 124, 165, 83]).fill(0x303b40)
      .rect(67, 17, 98, 66).fill(0x495459)
      .poly([0, 124, 67, 83, 165, 83, 232, 124]).fill(0x56544b));
    const stone = new Graphics();
    for (const y of [31, 47, 64]) stone.moveTo(67, y).lineTo(165, y);
    for (const [x, y] of [[88, 17], [121, 17], [104, 31], [145, 31], [81, 47], [127, 47], [101, 64], [145, 64]]) {
      stone.moveTo(x!, y!).lineTo(x!, Math.min(83, y! + 16));
    }
    for (const [outer, inner] of [[28, 31], [58, 47], [88, 64]]) {
      stone.moveTo(0, outer!).lineTo(67, inner!).moveTo(165, inner!).lineTo(232, outer!);
    }
    stone.moveTo(67, 17).lineTo(67, 83).lineTo(0, 124)
      .moveTo(165, 17).lineTo(165, 83).lineTo(232, 124)
      .moveTo(87, 83).lineTo(58, 124).moveTo(145, 83).lineTo(178, 124)
      .moveTo(44, 98).lineTo(188, 98).stroke({ color: 0x1c272d, width: 1.2, alpha: 0.7 });
    layer.addChild(stone);
    const label = (copy: string, x: number, y: number, color = 0xe9dfc9): Text => {
      const text = new Text({ text: copy, style: { fontFamily: "ui-monospace, monospace", fontSize: 9, fill: color, fontWeight: "700" }, roundPixels: true });
      text.anchor.set(0.5); text.position.set(x, y); layer.addChild(text); labels.push(text); return text;
    };
    const door = (exit: DungeonPerspectiveExit): void => {
      if (exit.relative === "back") return;
      const points = dungeonPerspectiveDoorPolygons[exit.relative];
      const x = exit.relative === "front" ? 116 : exit.relative === "left" ? 30 : 202;
      const y = exit.relative === "front" ? 59 : 71;
      // A flat, dark doorway discloses no neighboring room's onward geometry.
      layer.addChild(new Graphics().poly([...points]).fill(exit.gate === "locked" ? 0x403e35 : 0x081117)
        .poly([...points]).stroke({ color: view.secretPassage?.phase === "open" && view.secretPassage.direction === exit.direction
          ? 0xa3d7df : exit.gate === "open" ? 0x97cfa9 : exit.available ? 0x9a927c : 0x657377, width: 2.2 }));
      if (exit.gate === "locked") {
        const grille = new Graphics();
        for (const dx of [-10, 0, 10]) grille.moveTo(x + dx, y - 17).lineTo(x + dx, y + 16);
        grille.stroke({ color: 0xb79c5d, width: 2 });
        grille.roundRect(x - 5, y - 2, 10, 8, 1).fill(0xd6b768)
          .moveTo(x - 3, y - 2).lineTo(x - 3, y - 6).lineTo(x + 3, y - 6).lineTo(x + 3, y - 2)
          .stroke({ color: 0xd6b768, width: 1.5 });
        layer.addChild(grille);
      } else if (exit.trap !== null) layer.addChild(trapGlyph(exit.trap, x, y + 4));
      if (exit.sightedKey) layer.addChild(keyGlyph(x - 5, y + 17));
      label(exit.direction[0]!.toUpperCase(), x, exit.relative === "front" ? 28 : 34);
    };
    for (const exit of view.exits) door(exit);
    const passage = view.secretPassage;
    if (passage?.phase === "draught") {
      // Air against intact stone, not a premature dark doorway or a revealed destination.
      const x = passage.relative === "front" ? 116 : passage.relative === "left" ? 30 : passage.relative === "right" ? 202 : 184;
      const y = passage.relative === "front" ? 58 : passage.relative === "back" ? 110 : 69;
      const air = new Graphics();
      for (const offset of [-5, 0, 5]) air.moveTo(x - 9, y + offset)
        .bezierCurveTo(x - 3, y + offset - 3, x + 2, y + offset + 3, x + 9, y + offset);
      air.stroke({ color: 0xbce5e8, width: 1.5, alpha: 0.95 });
      layer.addChild(air);
      if (passage.relative !== "back") label(passage.direction[0]!.toUpperCase(), x, passage.relative === "front" ? 28 : 34, 0xbce5e8);
    }
    if (view.landmark?.here) {
      const color = view.landmark.status === "awakened" ? 0x9ce2df : 0x7d9997;
      layer.addChild(new Graphics().poly([71, 88, 78, 70, 85, 88]).fill(0x354f50)
        .poly([78, 72, 82, 79, 78, 84, 74, 79]).fill(color)
        .rect(69, 88, 18, 4).fill(0x829a8e));
    }
    if (view.completed) {
      const stairs = new Graphics();
      for (let step = 0; step < 3; step++) stairs.rect(142 - step * 3, 80 + step * 5, 16 + step * 6, 4);
      stairs.fill(0xa7b5b2); layer.addChild(stairs);
    }
    if (view.currentTrap !== null) {
      layer.addChild(trapGlyph(view.currentTrap, 116, 87, 7));
      label(view.currentTrap.status === "armed" ? "ARMED" : "SPENT", 116, 98,
        view.currentTrap.status === "armed" ? 0xffd166 : 0xb8d6c6);
    }
    const back = view.exits.find(exit => exit.relative === "back");
    const rearDirection = back?.direction ?? (passage?.relative === "back" ? passage.direction : undefined);
    const compass = `↑ ${view.facing[0]!.toUpperCase()}${rearDirection === undefined ? "" : ` · ↓ ${rearDirection[0]!.toUpperCase()}${back?.gate === "locked" ? " ×" : ""}`}`;
    layer.addChild(new Graphics().roundRect(67, 105, 98, 19, 3).fill({ color: 0x111a21, alpha: 0.94 }));
    label(compass, 116, 114, passage?.relative === "back" ? 0xbce5e8 : 0xe9dfc9);
    if (back?.trap !== null && back?.trap !== undefined) layer.addChild(trapGlyph(back.trap, 176, 114, 5));
    if (view.keyStatus === "carried") layer.addChild(keyGlyph(55, 104));
    // First-person hands use the existing hero's identity, not an invented actor or item.
    const hero = projectHeroIdentityAppearance({ id: view.heroId });
    layer.addChild(new Graphics().poly([0, 124, 0, 114, 18, 109, 31, 124]).fill(hero.cloak)
      .ellipse(19, 112, 8, 5).fill(hero.skin)
      .poly([201, 124, 213, 109, 232, 114, 232, 124]).fill(hero.cloak)
      .ellipse(213, 112, 8, 5).fill(hero.skin));
    return Object.freeze({ layer, labels: Object.freeze(labels), viewport: dungeonFramingViewRect });
  } catch (error) {
    layer.destroy({ children: true });
    throw error;
  }
}
