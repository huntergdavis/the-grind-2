import { Container, Graphics } from "pixi.js";
import type { ElsewhereLoafPacket } from "../ui/elsewhere-loaf-view";

export const elsewhereLoafTableau = Object.freeze({ actorX: 148, actorY: 136, productX: 176, productY: 123,
  ovenX: 230, ovenY: 115 });

export function projectElsewhereLoafPose(phase: ElsewhereLoafPacket["phase"], elapsed: number, reducedMotion: boolean) {
  const progress = reducedMotion ? 1 : Math.min(1, Math.max(0, Number.isFinite(elapsed) ? elapsed / 1.6 : 0));
  const press = phase === "admission" ? Math.sin(progress * Math.PI * 2) ** 2 : progress;
  return Object.freeze({ progress,
    frontArm: phase === "admission" ? -1.12 - press * 0.12 : -1.12 + progress * 0.42,
    rearArm: 0.18 - press * 0.14,
    body: phase === "admission" ? press * 0.012 : progress * -0.018 });
}

/** One admitted worksite, not a home or a physical delivery to the hero. */
export function drawElsewhereLoaf(packet: Pick<ElsewhereLoafPacket, "product">): Container {
  const layer = new Container();
  const room = new Graphics().rect(0, 0, 320, 180).fill(0x182333)
    .rect(24, 34, 272, 112).fill(0x3c393b).rect(0, 145, 320, 35).fill(0x514a3d)
    .rect(39, 51, 48, 53).fill(0x192b3e).rect(61, 51, 3, 53).fill(0x756b56)
    .rect(39, 75, 48, 3).fill(0x756b56);
  room.label = "admitted-inn-worksite"; layer.addChild(room);
  const oven = new Graphics().roundRect(212, 67, 65, 80, 26).fill(0x796f65)
    .roundRect(222, 90, 45, 50, 20).fill(0x1a2028)
    .rect(214, 137, 63, 10).fill(0x978371)
    .moveTo(234, 132).lineTo(255, 125).moveTo(235, 124).lineTo(254, 132).stroke({ color: 0xbd793c, width: 3 });
  oven.label = "admitted-oven"; layer.addChild(oven);
  const table = new Graphics().rect(147, 130, 61, 8).fill(0x987152)
    .rect(152, 138, 5, 25).rect(198, 138, 5, 25).fill(0x705540);
  table.label = "trial-worktable"; layer.addChild(table);
  const food = new Graphics(); food.label = packet.product;
  food.position.set(elsewhereLoafTableau.productX, elsewhereLoafTableau.productY);
  if (packet.product === "dough") food.ellipse(0, 0, 13, 7).fill(0xe8dcc3);
  else if (packet.product === "bricklike-loaf") {
    food.rect(-16, -8, 32, 15).fill(0x774533).rect(-13, -5, 26, 9).stroke({ color: 0xa46846, width: 1 });
  } else {
    food.ellipse(0, packet.product === "unexpected-delight" ? -2 : 0, 17, packet.product === "unexpected-delight" ? 11 : 8)
      .fill(packet.product === "unexpected-delight" ? 0xd79d54 : 0xbb864b)
      .moveTo(-8, -5).lineTo(-5, 3).moveTo(-1, -6).lineTo(2, 3).moveTo(6, -5).lineTo(9, 2)
      .stroke({ color: 0xf0c98c, width: 1.7 });
  }
  layer.addChild(food); return layer;
}
