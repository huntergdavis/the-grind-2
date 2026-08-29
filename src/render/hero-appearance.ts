import type { DetailedHeroState, EquipmentSlot, ItemState } from "../depth/types";

export type GearSilhouette =
  | "sword"
  | "spear"
  | "wand"
  | "shield"
  | "book"
  | "lantern"
  | "cap"
  | "crown"
  | "helm"
  | "coat"
  | "mail"
  | "plate"
  | "boots"
  | "greaves"
  | "sandals"
  | "orb"
  | "sigil"
  | "halo";

export interface GearAppearance {
  itemId: string;
  itemName: string;
  slot: EquipmentSlot;
  rarity: ItemState["rarity"];
  color: number;
  accent: number;
  silhouette: GearSilhouette;
}

export type HeroAppearance = Readonly<Record<EquipmentSlot, GearAppearance | null>>;

const silhouettes: Record<EquipmentSlot, readonly GearSilhouette[]> = {
  weapon: ["sword", "spear", "wand"],
  offhand: ["shield", "book", "lantern"],
  head: ["cap", "crown", "helm"],
  body: ["coat", "mail", "plate"],
  feet: ["boots", "greaves", "sandals"],
  charm: ["orb", "sigil", "halo"],
};

const rarityColors: Record<ItemState["rarity"], readonly [number, number]> = {
  common: [0xaeb7c1, 0x687583],
  uncommon: [0x79b392, 0x365f4c],
  rare: [0x7ab6d9, 0x35506f],
  legendary: [0xffc857, 0xa8612a],
};

function stableOrdinal(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

export function projectGearAppearance(item: ItemState): GearAppearance | null {
  if (item.kind !== "equipment" || item.slot === null) return null;
  const options = silhouettes[item.slot];
  const silhouette = options[stableOrdinal(`${item.slot}:${item.id}`) % options.length];
  const colors = rarityColors[item.rarity];
  if (silhouette === undefined || colors === undefined) throw new Error("Missing equipment appearance recipe");
  return {
    itemId: item.id,
    itemName: item.name,
    slot: item.slot,
    rarity: item.rarity,
    color: colors[0],
    accent: colors[1],
    silhouette,
  };
}

export function projectHeroAppearance(hero: DetailedHeroState): HeroAppearance {
  const result = {} as Record<EquipmentSlot, GearAppearance | null>;
  for (const slot of Object.keys(silhouettes) as EquipmentSlot[]) {
    const itemId = hero.equipment[slot];
    const item = itemId === null ? undefined : hero.inventory.find((candidate) => candidate.id === itemId);
    result[slot] = item === undefined ? null : projectGearAppearance(item);
  }
  return result;
}
