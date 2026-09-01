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
  useMasteryLevel: number | null;
  useMasteryStage: 0 | 1 | 2 | 3;
}

export type HeroAppearance = Readonly<Record<EquipmentSlot, GearAppearance | null>>;

export interface HeroIdentityAppearance {
  skin: number;
  hair: number;
  tunic: number;
  cloak: number;
  belt: number;
}

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

const skinColors = [0xf1c7a2, 0xd9a278, 0xb97855, 0x8d5a43, 0xe1b58d] as const;
const hairColors = [0x30252a, 0x5b3928, 0x8a5b35, 0xc3a06a, 0x59606b, 0x6b3543] as const;
const clothColors = [
  [0x477c72, 0x294c4c],
  [0x54749a, 0x303f64],
  [0x9a5d55, 0x5e3542],
  [0x8b7547, 0x4c4932],
  [0x735c8f, 0x433b61],
  [0x4f7a8a, 0x2d4c5c],
] as const;

function stableOrdinal(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

function namedWeaponSilhouette(name: string): Extract<GearSilhouette, "sword" | "spear" | "wand"> | null {
  const words = new Set(name.toLowerCase().match(/[a-z]+/g) ?? []);
  if (["blade", "sword", "saber", "sabre"].some((word) => words.has(word))) return "sword";
  if (["spear", "pike", "lance"].some((word) => words.has(word))) return "spear";
  if (["wand", "staff", "rod"].some((word) => words.has(word))) return "wand";
  return null;
}

export function projectGearAppearance(item: ItemState): GearAppearance | null {
  if (item.kind !== "equipment" || item.slot === null) return null;
  const options = silhouettes[item.slot];
  const silhouette = item.slot === "weapon"
    ? namedWeaponSilhouette(item.name) ?? options[stableOrdinal(`${item.slot}:${item.id}`) % options.length]
    : options[stableOrdinal(`${item.slot}:${item.id}`) % options.length];
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
    useMasteryLevel: item.useMastery?.level ?? null,
    useMasteryStage: item.slot !== "weapon" || item.useMastery === null
      ? 0
      : item.useMastery.level >= 10 ? 3 : item.useMastery.level >= 7 ? 2 : item.useMastery.level >= 4 ? 1 : 0,
  };
}

export function projectHeroIdentityAppearance(hero: Pick<DetailedHeroState, "id">): HeroIdentityAppearance {
  const skin = skinColors[stableOrdinal(`${hero.id}:skin`) % skinColors.length];
  const hair = hairColors[stableOrdinal(`${hero.id}:hair`) % hairColors.length];
  const cloth = clothColors[stableOrdinal(`${hero.id}:cloth`) % clothColors.length];
  if (skin === undefined || hair === undefined || cloth === undefined) throw new Error("Missing hero identity appearance recipe");
  return { skin, hair, tunic: cloth[0], cloak: cloth[1], belt: 0x493629 };
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
