import { Container, Graphics } from "pixi.js";
import type { GearAppearance } from "./hero-appearance";

export const spareGearTradeTableau = Object.freeze({ heroX: 124, heroY: 139,
  itemX: 211, itemY: 112, itemScale: 0.78, coinX: 161, coinY: 130 });

/** Existing weapon silhouettes and rarity colors, with only genuine mastery
 * marks. This is the sold object on the counter, not a newly equipped reward. */
export function drawSpareGearTrade(appearance: Readonly<GearAppearance>): Container {
  const layer = new Container();
  const stand = new Graphics().rect(174, 82, 79, 74).fill(0x795b42)
    .rect(168, 94, 91, 10).fill(0xa35443).poly([169, 94, 181, 68, 246, 68, 259, 94]).fill(0xc79d65)
    .rect(182, 105, 64, 30).fill(0x433d35).rect(174, 132, 80, 8).fill(0xa57d52);
  stand.label = "actual-market-stand"; layer.addChild(stand);
  const weapon = new Container(); weapon.label = "sold-spare-weapon";
  weapon.position.set(spareGearTradeTableau.itemX, spareGearTradeTableau.itemY);
  weapon.scale.set(spareGearTradeTableau.itemScale);
  if (appearance.silhouette === "sword") {
    weapon.addChild(new Graphics().moveTo(0, 18).lineTo(0, -18).stroke({ color: appearance.color, width: 3.4 })
      .poly([0, -24, 4, -16, -4, -16]).fill(appearance.color)
      .moveTo(-7, 12).lineTo(7, 12).stroke({ color: appearance.accent, width: 3 })
      .rect(-1.8, 12, 3.6, 11).fill(appearance.accent));
  } else if (appearance.silhouette === "spear") {
    weapon.addChild(new Graphics().moveTo(0, 25).lineTo(0, -21).stroke({ color: appearance.accent, width: 2.4 })
      .poly([0, -29, 5.5, -18, -5.5, -18]).fill(appearance.color)
      .rect(-1.4, 14, 2.8, 8).fill(appearance.color));
  } else {
    weapon.addChild(new Graphics().moveTo(-2, 23).lineTo(2, -12).stroke({ color: appearance.accent, width: 3.2 })
      .circle(2.5, -18, 10).fill({ color: appearance.color, alpha: 0.14 })
      .circle(2.5, -18, 4.5).fill(appearance.color)
      .circle(2.5, -18, 7).stroke({ color: appearance.color, width: 1, alpha: 0.65 }));
  }
  for (let index = 0; index < appearance.useMasteryStage; index += 1) {
    const mark = new Graphics().moveTo(-4.5, 5 - index * 5).lineTo(4.5, 3.5 - index * 5)
      .stroke({ color: 0xffefba, width: 1.2, alpha: 0.95 });
    mark.label = "recorded-weapon-mastery-mark"; weapon.addChild(mark);
  }
  layer.addChild(weapon);
  const coin = new Graphics().circle(spareGearTradeTableau.coinX, spareGearTradeTableau.coinY, 4).fill(0xe0ad4f)
    .circle(spareGearTradeTableau.coinX, spareGearTradeTableau.coinY, 2).stroke({ color: 0xffe8a1, width: 0.8 });
  coin.label = "sale-one-gold"; layer.addChild(coin);
  return layer;
}
