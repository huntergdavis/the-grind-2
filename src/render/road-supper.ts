import { Container, Graphics } from "pixi.js";

export const roadSupperTableau = Object.freeze({ heroX: 124, heroY: 139, bowlX: 172, bowlY: 135, marketX: 211, marketY: 132 });

/** A single quiet wisp; paused/reduced-motion saves settle without replaying the gesture. */
export function projectRoadSupperSteam(elapsed: number, still: boolean) {
  const progress = still ? 1 : Math.min(1, Math.max(0, elapsed / 0.8));
  return Object.freeze({ progress, y: -12 * progress, alpha: (1 - progress) * 0.6 });
}

export function drawRoadSupper(phase: "purchase" | "prepared"): { layer: Container; steam: Container | null } {
  const layer = new Container();
  if (phase === "purchase") {
    layer.addChild(new Graphics().rect(174, 82, 79, 74).fill(0x795b42)
      .rect(168, 94, 91, 10).fill(0xa35443).poly([169, 94, 181, 68, 246, 68, 259, 94]).fill(0xc79d65)
      .rect(182, 105, 64, 30).fill(0x433d35).rect(174, 132, 80, 8).fill(0xa57d52));
    for (const x of [199, 224]) {
      const ration = new Graphics().roundRect(x - 8, 119, 16, 12, 2).fill(0xb29b6c)
        .moveTo(x - 8, 125).lineTo(x + 8, 125).moveTo(x, 119).lineTo(x, 131).stroke({ color: 0xeee0b9, width: 1 });
      ration.label = "purchased-road-ration"; layer.addChild(ration);
    }
    return { layer, steam: null };
  }
  layer.addChild(new Graphics().ellipse(207, 153, 23, 5).fill(0x182c2c)
    .moveTo(194, 151).lineTo(219, 155).moveTo(195, 156).lineTo(220, 149).stroke({ color: 0x775039, width: 5 })
    .poly([197, 150, 208, 124, 218, 150]).fill(0xd48846).poly([203, 150, 209, 137, 213, 150]).fill(0xffd789)
    .roundRect(109, 145, 35, 11, 3).fill(0x79634c)
    .rect(155, 144, 37, 6).fill(0x806344));
  const bowl = new Graphics().poly([157, 135, 164, 144, 182, 144, 188, 135]).fill(0x926647)
    .ellipse(172, 135, 16, 4).fill(0xc5a074).ellipse(172, 134, 13, 2.6).fill(0xa9773d);
  bowl.label = "prepared-supper-bowl"; layer.addChild(bowl);
  // Empty wrappers describe the consumed ration units, not food left in inventory.
  for (const x of [159, 186]) {
    const wrapper = new Graphics().poly([x - 5, 156, x + 2, 153, x + 7, 159, x - 2, 159]).stroke({ color: 0xcdbd92, width: 1 });
    wrapper.label = "consumed-ration-wrapper"; layer.addChild(wrapper);
  }
  const steam = new Container(); steam.label = "supper-steam";
  steam.addChild(new Graphics().moveTo(167, 127).bezierCurveTo(163, 121, 175, 121, 170, 115)
    .moveTo(177, 127).bezierCurveTo(183, 123, 174, 120, 181, 115).stroke({ color: 0xf0dbb2, width: 1.2 }));
  layer.addChild(steam); return { layer, steam };
}
