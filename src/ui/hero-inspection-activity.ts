import { attentionPolicyForMode } from "../core/simulation";
import type { AttentionPolicy, SceneMode, WorldState } from "../core/types";
import {
  projectHeroAppearance,
  projectHeroIdentityAppearance,
  type HeroAppearance,
  type HeroIdentityAppearance,
} from "../render/hero-appearance";
import {
  projectCodexView,
  projectInventoryView,
  projectJournalView,
  projectMapView,
  projectSpellbookView,
  type InspectionView,
} from "./view-projection";

export type HeroInspectionView = Exclude<InspectionView, "watch">;
export type HeroInspectionProp = "compass" | "pack" | "journal" | "lens" | "grimoire";
export type HeroInspectionPose = "route" | "examine" | "review" | "study" | "practice" | "alert" | "battle";

export interface HeroInspectionActivity {
  view: HeroInspectionView;
  tick: number;
  sceneMode: SceneMode;
  attention: AttentionPolicy;
  heroName: string;
  classAndLevel: string;
  location: string;
  sceneHeadline: string;
  sceneAction: string;
  activityLabel: string;
  subjectId: string | null;
  subjectLabel: string;
  subjectDetail: string;
  prop: HeroInspectionProp;
  pose: HeroInspectionPose;
  liveNotice: string | null;
  identity: HeroIdentityAppearance;
  appearance: HeroAppearance;
}

interface SubjectProjection {
  activityLabel: string;
  subjectId: string | null;
  subjectLabel: string;
  subjectDetail: string;
  prop: HeroInspectionProp;
  pose: Exclude<HeroInspectionPose, "alert" | "battle">;
}

function modifierLabel(name: string, value: number): string {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return `${value >= 0 ? "+" : ""}${value} ${spaced}`;
}

function mapSubject(state: WorldState): SubjectProjection {
  const map = projectMapView(state);
  return {
    activityLabel: map.currentLeg === null ? "Studies the known roads" : "Traces the active road",
    subjectId: state.depth.atlas.route?.destinationId ?? state.depth.atlas.currentLocationId,
    subjectLabel: map.currentLeg === null ? `At ${map.currentPlace}` : map.currentLeg,
    subjectDetail: `${map.progress} · ${map.discovered}`,
    prop: "compass",
    pose: "route",
  };
}

function inventorySubject(state: WorldState, preferredSubjectId?: string): SubjectProjection {
  const inventory = projectInventoryView(state);
  const preferred = inventory.items.find((item) => item.id === preferredSubjectId);
  const featured = preferred
    ?? inventory.items.find((item) => item.equippedSlot === "weapon")
    ?? inventory.items.find((item) => item.equippedSlot === "offhand")
    ?? inventory.items.find((item) => item.equippedSlot !== null)
    ?? inventory.items[0];
  if (featured === undefined) {
    return {
      activityLabel: "Checks an empty pack",
      subjectId: null,
      subjectLabel: "No carried items",
      subjectDetail: `${inventory.gold} gold · 0 stacks`,
      prop: "pack",
      pose: "examine",
    };
  }
  const modifiers = featured.modifiers.map((entry) => modifierLabel(entry.name, entry.value));
  return {
    activityLabel: featured.equippedSlot === null ? "Examines a carried item" : "Checks equipped gear",
    subjectId: featured.id,
    subjectLabel: featured.name,
    subjectDetail: `${featured.rarity} · ${featured.equippedSlot === null ? featured.slot ?? featured.kind : `equipped ${featured.equippedSlot}`} · ×${featured.quantity}${modifiers.length === 0 ? " · no stat modifiers" : ` · ${modifiers.join(", ")}`}`,
    prop: "pack",
    pose: "examine",
  };
}

function journalSubject(state: WorldState, preferredSubjectId?: string): SubjectProjection {
  const journal = projectJournalView(state);
  const objectives = journal.quests.flatMap((quest) => quest.objectives.map((objective) => ({
    ...objective,
    questTitle: quest.title,
  })));
  const preferred = objectives.find((objective) => objective.id === preferredSubjectId && objective.status === "active");
  const featured = preferred ?? objectives.find((objective) => objective.status === "active") ?? objectives[0];
  if (featured === undefined) {
    return {
      activityLabel: "Reviews a quiet journal",
      subjectId: null,
      subjectLabel: journal.questTitle,
      subjectDetail: journal.questSummary,
      prop: "journal",
      pose: "review",
    };
  }
  return {
    activityLabel: featured.status === "active" ? "Reviews the next objective" : "Reviews a recorded objective",
    subjectId: featured.id,
    subjectLabel: featured.description,
    subjectDetail: `${featured.questTitle} · ${featured.progress} · ${featured.status}`,
    prop: "journal",
    pose: "review",
  };
}

function codexSubject(state: WorldState, preferredSubjectId?: string): SubjectProjection {
  const codex = projectCodexView(state);
  const featured = codex.monsters.find((monster) => monster.monsterId === preferredSubjectId) ?? codex.monsters[0];
  if (featured === undefined) {
    return {
      activityLabel: "Waits for a creature trail",
      subjectId: null,
      subjectLabel: "No encountered creatures",
      subjectDetail: "The Codex records only witnessed species.",
      prop: "lens",
      pose: "study",
    };
  }
  const technique = featured.technique === null
    ? `${featured.insight}/${featured.requiredInsight} insight · ${featured.remainingVictories} victories still required`
    : `${featured.technique.name} verified · Level ${featured.technique.level} · ${featured.technique.uses} battle uses`;
  return {
    activityLabel: "Studies an encountered creature",
    subjectId: featured.monsterId,
    subjectLabel: featured.monsterName,
    subjectDetail: `${featured.encounters} encounters · ${featured.victories} victories · ${technique}`,
    prop: "lens",
    pose: "study",
  };
}

function spellbookSubject(state: WorldState, preferredSubjectId?: string): SubjectProjection {
  const spellbook = projectSpellbookView(state);
  const preferred = spellbook.abilities.find((ability) => ability.id === preferredSubjectId);
  const breakthrough = spellbook.closestBreakthrough === null
    ? undefined
    : spellbook.abilities.find((ability) => ability.id === spellbook.closestBreakthrough?.abilityId);
  const mostUsed = [...spellbook.abilities].sort((left, right) => right.battleUses - left.battleUses)[0];
  const featured = preferred ?? breakthrough ?? mostUsed;
  if (featured === undefined) {
    return {
      activityLabel: "Waits for an art to awaken",
      subjectId: null,
      subjectLabel: "No owned abilities",
      subjectDetail: "The Spellbook records only learned spells and techniques.",
      prop: "grimoire",
      pose: "practice",
    };
  }
  return {
    activityLabel: featured.mastered ? "Rehearses a mastered art" : "Studies the next breakthrough",
    subjectId: featured.id,
    subjectLabel: featured.name,
    subjectDetail: `${featured.kind} · ${featured.effect} · Level ${featured.level} · ${featured.masteryCurrent}/${featured.masterySpan} current-tier mastery · ${featured.battleUses} battle uses`,
    prop: "grimoire",
    pose: "practice",
  };
}

function subjectForView(state: WorldState, view: HeroInspectionView, preferredSubjectId?: string): SubjectProjection {
  if (view === "map") return mapSubject(state);
  if (view === "inventory") return inventorySubject(state, preferredSubjectId);
  if (view === "journal") return journalSubject(state, preferredSubjectId);
  if (view === "codex") return codexSubject(state, preferredSubjectId);
  return spellbookSubject(state, preferredSubjectId);
}

export function projectViewHero(
  state: WorldState,
  view: HeroInspectionView,
  preferredSubjectId?: string,
): HeroInspectionActivity {
  const subject = subjectForView(state, view, preferredSubjectId);
  const attention = attentionPolicyForMode(state.scene.mode);
  const pose: HeroInspectionPose = state.scene.mode === "battle"
    ? "battle"
    : attention === "backgroundSafe" ? subject.pose : "alert";
  const liveNotice = attention === "forbiddenDuringCatchUp"
    ? "Battle continues off-screen — return to Watch for the full action."
    : attention === "queueForPresentation"
      ? "A significant scene continues off-screen — return to Watch for the full action."
      : null;
  return {
    view,
    tick: state.tick,
    sceneMode: state.scene.mode,
    attention,
    heroName: state.depth.hero.name,
    classAndLevel: `${state.depth.hero.className} · Level ${state.depth.hero.level}`,
    location: state.scene.location,
    sceneHeadline: state.scene.headline,
    sceneAction: state.scene.action,
    ...subject,
    pose,
    liveNotice,
    identity: projectHeroIdentityAppearance(state.depth.hero),
    appearance: projectHeroAppearance(state.depth.hero),
  };
}
