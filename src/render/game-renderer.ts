import { Application, Container, Graphics, Text, type TextStyleOptions, type Ticker } from "pixi.js";
import { randomInt } from "../core/rng";
import type { SceneMode, WorldState } from "../core/types";
import { monsterDefinition } from "../depth/combat";
import { projectCombatRoster, type CombatRosterProjection, type CombatRosterStatus } from "../depth/combat-roster";
import { counterDuelStanceLabel, counterDuelTellText, projectCounterDuelHabit } from "../depth/counter-duel";
import { describeDungeonShrineUse, dungeonTrapKindLabel, projectDungeonKeyGate, projectDungeonLandmark, projectDungeonMoveKnowledge, projectDungeonTraps, projectDungeonWayfinding, projectLatestShrineUse } from "../depth/dungeon";
import { projectSuccessorQuestLead, questLeadAdmissionStatus } from "../depth/quest-lead";
import { describeEncounterThreat, encounterThreatBand, encounterThreatBandLabel } from "../depth/threat";
import type { AbilityEffect, AtlasEdge, AtlasState, AtlasTerrainPoint, CombatantState, CounterDuelStance, CounterDuelState, MazeDirection } from "../depth/types";
import { abilityEffectColor, combatCueDurationSeconds, combatEffectColor, projectCombatMotion, projectLatestCombatCue, projectLatestCombatTurn, type CombatVisualCue } from "./combat-choreography";
import { projectCombatCueVerticalLayout, projectCombatRosterLayout } from "./combat-roster-layout";
import { counterDuelCueDurationSeconds, projectCounterDuelMotion } from "./counter-duel-choreography";
import { counterDuelWitnessLayout } from "./counter-duel-layout";
import type {
  ProductionCutawayCandidate,
  ProductionCutawayRecipeKey,
} from "./cutaway-registry";
import {
  farewellCutawayStaticHoldSeconds,
  projectFarewellCutawayFrame,
  type FarewellCutawayPhase,
} from "./farewell-cutaway";
import {
  heroGrowthAllocationStaticHoldSeconds,
  projectHeroGrowthAllocationCutawayFrame,
  type HeroGrowthAllocationCutawayPhase,
} from "./hero-growth-allocation-cutaway";
import {
  heroLevelUpStaticHoldSeconds,
  projectHeroLevelUpCutawayFrame,
  type HeroLevelUpCutawayPhase,
} from "./hero-level-up-cutaway";
import {
  abilityResonanceStaticHoldSeconds,
  projectAbilityResonanceCutawayFrame,
  projectAbilityResonanceSourcePresentation,
  type AbilityResonanceCutawayPhase,
} from "./ability-resonance-cutaway";
import {
  battleSpoilsStaticHoldSeconds,
  projectBattleSpoilsCutawayFrame,
  type BattleSpoilsCutawayPhase,
} from "./battle-spoils-cutaway";
import {
  projectWeaponMemoryCutawayFrame,
  weaponMemoryStaticHoldSeconds,
  type WeaponMemoryCutawayPhase,
} from "./weapon-memory-cutaway";
import {
  projectTownItineraryCutawayFrame,
  townItineraryStaticHoldSeconds,
  type TownItineraryCutawayPhase,
} from "./town-itinerary-cutaway";
import { projectGearAppearance, projectHeroAppearance, projectHeroIdentityAppearance, type GearAppearance, type HeroAppearance } from "./hero-appearance";
import { projectHeroRigPose } from "./hero-rig";
import { animatedLayerY, calculateSceneLayout, projectedTextResolution } from "./layout";
import { projectRoute } from "./route-projection";
import {
  projectTrapCutawayFrame,
  resolveTrapCutawayFlavor,
  trapCutawayShotLayout,
  trapCutawayStaticHoldSeconds,
  trapCutawayOutcome,
  type TrapCutawayPhase,
  type TrapCutawayStaging,
} from "./trap-cutaway";
import { projectTravelCorridor, projectTravelHeroX, travelBiomeVisuals, type TravelBiomeVisual, type TravelCorridor } from "./travel-corridor";
import { projectTravelRoadFlow, projectTravelRoadGeometry, projectTravelRoadY, type TravelRoadGeometry, type TravelRoadPoint } from "./travel-road";
import { projectCombatFamiliarWeaponForm, projectFamiliarWeaponFormPose, type CombatFamiliarWeaponFormFact, type FamiliarWeaponFormPose } from "./weapon-form";
import { isInjuredPartyStatus, projectParty } from "../ui/party-projection";
import type { CompanionFarewellPacket } from "../ui/companion-farewell";
import type { HeroLevelUpPacketV1 } from "../ui/hero-level-up";
import type {
  HeroLevelUpPacketV2,
  HeroLevelUpPresentationPacket,
} from "../ui/hero-level-up-presentation";
import type { HeroGrowthAllocationPacketV1 } from "../ui/hero-growth-allocation";
import type { AbilityResonancePacketV1 } from "../ui/ability-resonance";
import type { TrapResolutionPacket } from "../ui/trap-resolution";
import type { WeaponMemoryCeremonyPacketV1 } from "../ui/weapon-memory";
import type { BattleSpoilsComparisonPacketV1 } from "../ui/battle-spoils";
import type { TownItineraryPacketV1 } from "../ui/town-itinerary";
import { projectCriticalRoadsideRecovery } from "../ui/critical-roadside-recovery";
import {
  projectCounterDuelPatternBreakSignature,
  type PatternBreakSignatureV1,
} from "../ui/pattern-break-signature";
import {
  projectPatternBreakObserverReaction,
  type PatternBreakObserverReactionV1,
} from "../ui/pattern-break-observer-reaction";

const designWidth = 320;
const designHeight = 180;
const mazeDirectionVector: Record<MazeDirection, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export type RendererViewMode = "live" | "map";

const palettes: Record<SceneMode, readonly [number, number, number]> = {
  town: [0x16283b, 0xdd9c57, 0x79b392],
  atlas: [0x172b36, 0x567f61, 0xe3c47b],
  travel: [0x1c3341, 0x456856, 0xdbba70],
  dungeon: [0x111820, 0x46505a, 0xd5985b],
  battle: [0x28171d, 0x933f43, 0xffc857],
  training: [0x17232f, 0x42677a, 0xe6cb8b],
  discovery: [0x21182f, 0x6b4b78, 0xc9a8ff],
  camp: [0x111a2a, 0x35506f, 0xf29e4c],
  chronicle: [0x241f2f, 0x695878, 0xe6cb8b],
};

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha = 1,
): Graphics {
  return new Graphics().rect(x, y, width, height).fill({ color, alpha });
}

function circle(x: number, y: number, radius: number, color: number, alpha = 1): Graphics {
  return new Graphics().circle(x, y, radius).fill({ color, alpha });
}

interface BattleUnitVisual {
  layer: Container;
  x: number;
  y: number;
  heroRig: HeroRigBinding | null;
}

interface BattleAnimationBinding {
  cue: CombatVisualCue;
  actor: BattleUnitVisual;
  target: BattleUnitVisual;
  effectLayer: Container;
  weaponForm: CombatFamiliarWeaponFormFact | null;
  weaponFormGlyph: Container | null;
  weaponFormPose: FamiliarWeaponFormPose | null;
}

interface CounterDuelAnimationBinding {
  tell: Container;
  prediction: Container;
  reveal: Container;
  patternBreak: Container;
  patternBreakTriggered: boolean;
  patternBreakSignature: PatternBreakSignatureV1 | null;
  consequence: Container;
  hero: BattleUnitVisual;
  opponent: BattleUnitVisual;
  observer: {
    layer: Container;
    reactionLayer: Container;
    x: number;
    y: number;
    baseRotation: number;
    reaction: PatternBreakObserverReactionV1;
  } | null;
}

interface TravelRoadAnimationBinding {
  readonly geometry: TravelRoadGeometry;
  readonly markers: readonly Container[];
}

interface HeroRigBinding {
  puppet: Container;
  frontArm: Container;
  rearArm: Container;
  frontLeg: Container;
  rearLeg: Container;
  mode: SceneMode;
}

interface TrapCutawayBinding {
  readonly packet: TrapResolutionPacket;
  readonly staging: TrapCutawayStaging;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly mechanism: Container;
  readonly resolvedMechanism: Container;
  readonly flourish: Container;
  readonly check: Container;
  readonly result: Container;
  readonly consequence: Container;
  readonly heroBaseX: number;
  readonly heroBaseY: number;
  readonly mechanismBaseScale: number;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: TrapCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: TrapCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface FarewellCutawayBinding {
  readonly packet: CompanionFarewellPacket;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly companion: Container;
  readonly companionRig: HeroRigBinding;
  readonly journey: Container;
  readonly arrival: Container;
  readonly farewell: Container;
  readonly legacy: Container;
  readonly heroBaseX: number;
  readonly heroBaseY: number;
  readonly companionBaseX: number;
  readonly companionBaseY: number;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: FarewellCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: FarewellCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface HeroLevelUpCutawayBinding {
  readonly packet: HeroLevelUpPresentationPacket;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly glow: Container;
  readonly ring: Graphics;
  readonly oldLevel: Text;
  readonly newLevel: Text;
  readonly source: Container;
  readonly threshold: Container;
  readonly mechanics: Container;
  readonly tableau: Container;
  readonly hallSeal: Container | null;
  readonly heroBaseX: number;
  readonly heroBaseY: number;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: HeroLevelUpCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: HeroLevelUpCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface HeroGrowthAllocationMarker {
  readonly layer: Container;
  readonly label: Text;
}

interface HeroGrowthAllocationCutawayBinding {
  readonly packet: HeroGrowthAllocationPacketV1;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly glow: Container;
  readonly ring: Graphics;
  readonly candidatePanels: readonly (readonly Container[])[];
  readonly attributeCells: readonly Container[];
  readonly markers: readonly [HeroGrowthAllocationMarker, HeroGrowthAllocationMarker];
  readonly mechanics: Container;
  readonly resources: Container;
  readonly tableau: Container;
  readonly heroBaseX: number;
  readonly heroBaseY: number;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: HeroGrowthAllocationCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: HeroGrowthAllocationCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface AbilityResonanceCutawayBinding {
  readonly packet: AbilityResonancePacketV1;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly glow: Container;
  readonly glyph: Container;
  readonly sourceCue: Container;
  readonly experienceFill: Graphics;
  readonly oldLevel: Text;
  readonly newLevel: Text;
  readonly source: Container;
  readonly experience: Container;
  readonly mastery: Container;
  readonly nextUse: Container;
  readonly heroBaseX: number;
  readonly heroBaseY: number;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: AbilityResonanceCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: AbilityResonanceCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface WeaponMemoryCutawayBinding {
  readonly packet: WeaponMemoryCeremonyPacketV1;
  readonly weapon: Container;
  readonly marks: readonly Graphics[];
  readonly first: Container;
  readonly strongest: Container;
  readonly familiarForm: Container;
  readonly final: Container;
  readonly tableau: Container;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: WeaponMemoryCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: WeaponMemoryCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface BattleSpoilsCutawayBinding {
  readonly packet: BattleSpoilsComparisonPacketV1;
  readonly oldItem: Container;
  readonly newItem: Container;
  readonly arrow: Container;
  readonly comparison: Container;
  readonly resources: Container;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: BattleSpoilsCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: BattleSpoilsCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

interface TownItineraryCutawayBinding {
  readonly packet: TownItineraryPacketV1;
  readonly hero: Container;
  readonly heroRig: HeroRigBinding;
  readonly resident: Container;
  readonly district: Container;
  readonly route: Container;
  readonly buildingHighlight: Container;
  readonly consequence: Container;
  readonly startedAt: number;
  readonly staticPresentation: boolean;
  readonly onPhase: (phase: TownItineraryCutawayPhase) => void;
  readonly onComplete: () => void;
  phase: TownItineraryCutawayPhase | null;
  forceOutcome: boolean;
  completed: boolean;
}

export interface TrapCutawayPresentationOptions {
  readonly fast: boolean;
  readonly staging: TrapCutawayStaging;
  readonly onPhase: (phase: TrapCutawayPhase) => void;
  readonly onComplete: () => void;
}

export interface FarewellCutawayPresentationOptions {
  readonly fast: boolean;
  readonly onPhase: (phase: FarewellCutawayPhase) => void;
  readonly onComplete: () => void;
}

export interface HeroLevelUpCutawayPresentationOptions {
  readonly fast: boolean;
  readonly onPhase: (phase: HeroLevelUpCutawayPhase) => void;
  readonly onComplete: () => void;
}

export interface HeroGrowthAllocationCutawayPresentationOptions {
  readonly fast: boolean;
  readonly onPhase: (phase: HeroGrowthAllocationCutawayPhase) => void;
  readonly onComplete: () => void;
}

export interface CutawayPresentationOptions {
  readonly fast: boolean;
  readonly staging: TrapCutawayStaging | null;
  readonly onPhase: (phase: string) => void;
  readonly onComplete: () => void;
}

export class GameRenderer {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly lightLayer = new Container();
  private elapsed = 0;
  private paused = false;
  private lightBaseY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private reducedMotion = false;
  private battleBinding: BattleAnimationBinding | null = null;
  private battleCueId: string | null = null;
  private battleCueStartedAt = 0;
  private counterDuelBinding: CounterDuelAnimationBinding | null = null;
  private counterDuelCueId: string | null = null;
  private counterDuelCueStartedAt = 0;
  private animateCounterDuelTransition = false;
  private travelRoadBinding: TravelRoadAnimationBinding | null = null;
  private atlasStaticLayer: Container | null = null;
  private atlasStaticSignature: string | null = null;
  private viewMode: RendererViewMode = "live";
  private lastState: WorldState | null = null;
  private readonly heroRigs: HeroRigBinding[] = [];
  private readonly scaleSensitiveTexts: Text[] = [];
  private readonly dungeonAlertTexts: Text[] = [];
  private trapCutawayBinding: TrapCutawayBinding | null = null;
  private farewellCutawayBinding: FarewellCutawayBinding | null = null;
  private heroLevelUpCutawayBinding: HeroLevelUpCutawayBinding | null = null;
  private heroGrowthAllocationCutawayBinding: HeroGrowthAllocationCutawayBinding | null = null;
  private abilityResonanceCutawayBinding: AbilityResonanceCutawayBinding | null = null;
  private weaponMemoryCutawayBinding: WeaponMemoryCutawayBinding | null = null;
  private battleSpoilsCutawayBinding: BattleSpoilsCutawayBinding | null = null;
  private townItineraryCutawayBinding: TownItineraryCutawayBinding | null = null;
  private activeCutawayRecipeKey: ProductionCutawayRecipeKey | null = null;
  private reducedMotionQuery: MediaQueryList | null = null;
  private disposed = false;
  private readonly handleResize = (): void => this.resizeToHost();
  private readonly handleReducedMotion = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    this.host.dataset.reducedMotion = String(this.reducedMotion);
    this.updateCounterDuelAnimation();
    this.updateTravelRoadAnimation();
    if (event.matches && this.activeCutawayRecipeKey !== null) this.settleCutaway();
  };
  private readonly handleTick = (ticker: Ticker): void => {
    if (this.paused || this.disposed) return;
    this.elapsed += ticker.deltaMS / 1000;
    this.updateBattleAnimation();
    this.updateCounterDuelAnimation();
    this.updateTravelRoadAnimation();
    this.updateHeroRigs();
    this.updateTrapCutawayAnimation();
    this.updateFarewellCutawayAnimation();
    this.updateHeroLevelUpCutawayAnimation();
    this.updateHeroGrowthAllocationCutawayAnimation();
    this.updateAbilityResonanceCutawayAnimation();
    this.updateWeaponMemoryCutawayAnimation();
    this.updateBattleSpoilsCutawayAnimation();
    this.updateTownItineraryCutawayAnimation();
    this.lightLayer.alpha = this.reducedMotion
      ? 1
      : 0.88 + Math.sin(this.elapsed * 1.7) * 0.08;
    this.lightLayer.y = this.reducedMotion
      ? this.lightBaseY
      : animatedLayerY(this.lightBaseY, this.elapsed);
  };

  private constructor(private readonly host: HTMLElement) {}

  static async mount(host: HTMLElement): Promise<GameRenderer> {
    const renderer = new GameRenderer(host);
    await renderer.app.init({
      antialias: true,
      autoDensity: true,
      backgroundColor: 0x111827,
      height: Math.max(1, host.clientHeight),
      powerPreference: "low-power",
      preference: "webgl",
      resolution: Math.min(window.devicePixelRatio, 2),
      width: Math.max(1, host.clientWidth),
    });
    renderer.app.ticker.maxFPS = 30;
    renderer.app.stage.addChild(renderer.worldLayer, renderer.lightLayer);
    renderer.host.append(renderer.app.canvas);
    renderer.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    renderer.reducedMotion = renderer.reducedMotionQuery.matches;
    renderer.host.dataset.reducedMotion = String(renderer.reducedMotion);
    renderer.host.dataset.rendererLifecycle = "mounted";
    renderer.host.dataset.rendererListenerCount = "3";
    renderer.resizeToHost();
    renderer.resizeObserver = new ResizeObserver(() => renderer.resizeToHost());
    renderer.resizeObserver.observe(host);
    window.addEventListener("resize", renderer.handleResize);
    renderer.reducedMotionQuery.addEventListener("change", renderer.handleReducedMotion);
    renderer.app.ticker.add(renderer.handleTick);
    return renderer;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener("resize", this.handleResize);
    this.reducedMotionQuery?.removeEventListener("change", this.handleReducedMotion);
    this.reducedMotionQuery = null;
    this.app.ticker.remove(this.handleTick);
    this.atlasStaticLayer?.destroy({ children: true });
    this.atlasStaticLayer = null;
    this.app.destroy({ removeView: true }, { children: true });
    this.host.dataset.rendererLifecycle = "disposed";
    this.host.dataset.rendererListenerCount = "0";
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  startCutaway(candidate: ProductionCutawayCandidate, options: CutawayPresentationOptions): boolean {
    if (this.activeCutawayRecipeKey !== null) return false;
    const complete = (): void => {
      if (this.activeCutawayRecipeKey !== candidate.recipeKey) return;
      this.activeCutawayRecipeKey = null;
      options.onComplete();
    };
    const starters: Record<ProductionCutawayRecipeKey, () => boolean> = {
      "trap-resolution@1": () => this.startTrapCutaway(
        candidate.packet as TrapResolutionPacket,
        {
          fast: options.fast,
          staging: options.staging ?? { shot: "static-tableau", flavor: "none" },
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "companion-farewell@1": () => this.startFarewellCutaway(
        candidate.packet as CompanionFarewellPacket,
        {
          fast: options.fast,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "hero-level-up@1": () => this.startHeroLevelUpCutaway(
        candidate.packet as HeroLevelUpPacketV1,
        {
          fast: options.fast,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "hero-level-up@2": () => this.startHeroLevelUpCutaway(
        candidate.packet as HeroLevelUpPacketV2,
        {
          fast: options.fast,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "hero-growth-allocation@1": () => this.startHeroGrowthAllocationCutaway(
        candidate.packet as HeroGrowthAllocationPacketV1,
        {
          fast: options.fast,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "ability-resonance@1": () => this.startAbilityResonanceCutaway(
        candidate.packet as AbilityResonancePacketV1,
        {
          fast: options.fast,
          staging: null,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "weapon-memory@1": () => this.startWeaponMemoryCutaway(
        candidate.packet as WeaponMemoryCeremonyPacketV1,
        {
          fast: options.fast,
          staging: null,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "battle-spoils@1": () => this.startBattleSpoilsCutaway(
        candidate.packet as BattleSpoilsComparisonPacketV1,
        {
          fast: options.fast,
          staging: null,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
      "town-itinerary@1": () => this.startTownItineraryCutaway(
        candidate.packet as TownItineraryPacketV1,
        {
          fast: options.fast,
          staging: null,
          onPhase: options.onPhase,
          onComplete: complete,
        },
      ),
    };
    this.activeCutawayRecipeKey = candidate.recipeKey;
    const started = starters[candidate.recipeKey]();
    if (!started && this.activeCutawayRecipeKey === candidate.recipeKey) this.activeCutawayRecipeKey = null;
    return started;
  }

  showCutawayOutcome(): boolean {
    if (this.activeCutawayRecipeKey === null) return false;
    const presenters: Record<ProductionCutawayRecipeKey, () => boolean> = {
      "trap-resolution@1": () => this.showTrapCutawayOutcome(),
      "companion-farewell@1": () => this.showFarewellCutawayOutcome(),
      "hero-level-up@1": () => this.showHeroLevelUpCutawayOutcome(),
      "hero-level-up@2": () => this.showHeroLevelUpCutawayOutcome(),
      "hero-growth-allocation@1": () => this.showHeroGrowthAllocationCutawayOutcome(),
      "ability-resonance@1": () => this.showAbilityResonanceCutawayOutcome(),
      "weapon-memory@1": () => this.showWeaponMemoryCutawayOutcome(),
      "battle-spoils@1": () => this.showBattleSpoilsCutawayOutcome(),
      "town-itinerary@1": () => this.showTownItineraryCutawayOutcome(),
    };
    return presenters[this.activeCutawayRecipeKey]();
  }

  settleCutaway(): boolean {
    if (this.activeCutawayRecipeKey === null) return false;
    const settlers: Record<ProductionCutawayRecipeKey, () => boolean> = {
      "trap-resolution@1": () => this.settleTrapCutaway(),
      "companion-farewell@1": () => this.settleFarewellCutaway(),
      "hero-level-up@1": () => this.settleHeroLevelUpCutaway(),
      "hero-level-up@2": () => this.settleHeroLevelUpCutaway(),
      "hero-growth-allocation@1": () => this.settleHeroGrowthAllocationCutaway(),
      "ability-resonance@1": () => this.settleAbilityResonanceCutaway(),
      "weapon-memory@1": () => this.settleWeaponMemoryCutaway(),
      "battle-spoils@1": () => this.settleBattleSpoilsCutaway(),
      "town-itinerary@1": () => this.settleTownItineraryCutaway(),
    };
    return settlers[this.activeCutawayRecipeKey]();
  }

  cancelCutaway(): void {
    this.activeCutawayRecipeKey = null;
    this.cancelTrapCutaway();
    this.cancelFarewellCutaway();
    this.cancelHeroLevelUpCutaway();
    this.cancelHeroGrowthAllocationCutaway();
    this.cancelAbilityResonanceCutaway();
    this.cancelWeaponMemoryCutaway();
    this.cancelBattleSpoilsCutaway();
    this.cancelTownItineraryCutaway();
  }

  private hasActiveCutawayBinding(): boolean {
    return this.trapCutawayBinding !== null
      || this.farewellCutawayBinding !== null
      || this.heroLevelUpCutawayBinding !== null
      || this.heroGrowthAllocationCutawayBinding !== null
      || this.abilityResonanceCutawayBinding !== null
      || this.weaponMemoryCutawayBinding !== null
      || this.battleSpoilsCutawayBinding !== null
      || this.townItineraryCutawayBinding !== null;
  }

  private clearAllCutawayAttributes(): void {
    this.clearTrapCutawayAttributes();
    this.clearFarewellCutawayAttributes();
    this.clearHeroLevelUpCutawayAttributes();
    this.clearHeroGrowthAllocationCutawayAttributes();
    this.clearAbilityResonanceCutawayAttributes();
    this.clearWeaponMemoryCutawayAttributes();
    this.clearBattleSpoilsCutawayAttributes();
    this.clearTownItineraryCutawayAttributes();
  }

  private startTrapCutaway(packet: TrapResolutionPacket, options: TrapCutawayPresentationOptions): boolean {
    if (this.trapCutawayBinding?.completed === true) this.trapCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawTrapCutaway(this.lastState, packet, options);
    this.updateTrapCutawayAnimation();
    return true;
  }

  private showTrapCutawayOutcome(): boolean {
    const binding = this.trapCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateTrapCutawayAnimation();
    this.completeTrapCutawayPresentation(binding);
    return true;
  }

  private settleTrapCutaway(): boolean {
    const binding = this.trapCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateTrapCutawayAnimation();
    this.completeTrapCutawayPresentation(binding);
    return true;
  }

  private cancelTrapCutaway(): void {
    this.trapCutawayBinding = null;
    this.clearTrapCutawayAttributes();
  }

  private startFarewellCutaway(packet: CompanionFarewellPacket, options: FarewellCutawayPresentationOptions): boolean {
    if (this.farewellCutawayBinding?.completed === true) this.farewellCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawFarewellCutaway(this.lastState, packet, options);
    this.updateFarewellCutawayAnimation();
    return true;
  }

  private showFarewellCutawayOutcome(): boolean {
    const binding = this.farewellCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateFarewellCutawayAnimation();
    this.completeFarewellCutawayPresentation(binding);
    return true;
  }

  private settleFarewellCutaway(): boolean {
    const binding = this.farewellCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateFarewellCutawayAnimation();
    this.completeFarewellCutawayPresentation(binding);
    return true;
  }

  private cancelFarewellCutaway(): void {
    this.farewellCutawayBinding = null;
    this.clearFarewellCutawayAttributes();
  }

  private startHeroLevelUpCutaway(packet: HeroLevelUpPresentationPacket, options: HeroLevelUpCutawayPresentationOptions): boolean {
    if (this.heroLevelUpCutawayBinding?.completed === true) this.heroLevelUpCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawHeroLevelUpCutaway(this.lastState, packet, options);
    this.updateHeroLevelUpCutawayAnimation();
    return true;
  }

  private showHeroLevelUpCutawayOutcome(): boolean {
    const binding = this.heroLevelUpCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateHeroLevelUpCutawayAnimation();
    this.completeHeroLevelUpCutawayPresentation(binding);
    return true;
  }

  private settleHeroLevelUpCutaway(): boolean {
    const binding = this.heroLevelUpCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateHeroLevelUpCutawayAnimation();
    this.completeHeroLevelUpCutawayPresentation(binding);
    return true;
  }

  private cancelHeroLevelUpCutaway(): void {
    this.heroLevelUpCutawayBinding = null;
    this.clearHeroLevelUpCutawayAttributes();
  }

  private startHeroGrowthAllocationCutaway(packet: HeroGrowthAllocationPacketV1, options: HeroGrowthAllocationCutawayPresentationOptions): boolean {
    if (this.heroGrowthAllocationCutawayBinding?.completed === true) this.heroGrowthAllocationCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawHeroGrowthAllocationCutaway(this.lastState, packet, options);
    this.updateHeroGrowthAllocationCutawayAnimation();
    return true;
  }

  private showHeroGrowthAllocationCutawayOutcome(): boolean {
    const binding = this.heroGrowthAllocationCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateHeroGrowthAllocationCutawayAnimation();
    this.completeHeroGrowthAllocationCutawayPresentation(binding);
    return true;
  }

  private settleHeroGrowthAllocationCutaway(): boolean {
    const binding = this.heroGrowthAllocationCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateHeroGrowthAllocationCutawayAnimation();
    this.completeHeroGrowthAllocationCutawayPresentation(binding);
    return true;
  }

  private cancelHeroGrowthAllocationCutaway(): void {
    this.heroGrowthAllocationCutawayBinding = null;
    this.clearHeroGrowthAllocationCutawayAttributes();
  }

  private startAbilityResonanceCutaway(packet: AbilityResonancePacketV1, options: CutawayPresentationOptions): boolean {
    if (this.abilityResonanceCutawayBinding?.completed === true) this.abilityResonanceCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawAbilityResonanceCutaway(this.lastState, packet, options);
    this.updateAbilityResonanceCutawayAnimation();
    return true;
  }

  private showAbilityResonanceCutawayOutcome(): boolean {
    const binding = this.abilityResonanceCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateAbilityResonanceCutawayAnimation();
    this.completeAbilityResonanceCutawayPresentation(binding);
    return true;
  }

  private settleAbilityResonanceCutaway(): boolean {
    const binding = this.abilityResonanceCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateAbilityResonanceCutawayAnimation();
    this.completeAbilityResonanceCutawayPresentation(binding);
    return true;
  }

  private cancelAbilityResonanceCutaway(): void {
    this.abilityResonanceCutawayBinding = null;
    this.clearAbilityResonanceCutawayAttributes();
  }

  private startWeaponMemoryCutaway(packet: WeaponMemoryCeremonyPacketV1, options: CutawayPresentationOptions): boolean {
    if (this.weaponMemoryCutawayBinding?.completed === true) this.weaponMemoryCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawWeaponMemoryCutaway(this.lastState, packet, options);
    this.updateWeaponMemoryCutawayAnimation();
    return true;
  }

  private showWeaponMemoryCutawayOutcome(): boolean {
    const binding = this.weaponMemoryCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateWeaponMemoryCutawayAnimation();
    this.completeWeaponMemoryCutawayPresentation(binding);
    return true;
  }

  private settleWeaponMemoryCutaway(): boolean {
    const binding = this.weaponMemoryCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateWeaponMemoryCutawayAnimation();
    this.completeWeaponMemoryCutawayPresentation(binding);
    return true;
  }

  private cancelWeaponMemoryCutaway(): void {
    this.weaponMemoryCutawayBinding = null;
    this.clearWeaponMemoryCutawayAttributes();
  }

  private startBattleSpoilsCutaway(packet: BattleSpoilsComparisonPacketV1, options: CutawayPresentationOptions): boolean {
    if (this.battleSpoilsCutawayBinding?.completed === true) this.battleSpoilsCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawBattleSpoilsCutaway(this.lastState, packet, options);
    this.updateBattleSpoilsCutawayAnimation();
    return true;
  }

  private showBattleSpoilsCutawayOutcome(): boolean {
    const binding = this.battleSpoilsCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateBattleSpoilsCutawayAnimation();
    this.completeBattleSpoilsCutawayPresentation(binding);
    return true;
  }

  private settleBattleSpoilsCutaway(): boolean {
    const binding = this.battleSpoilsCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateBattleSpoilsCutawayAnimation();
    this.completeBattleSpoilsCutawayPresentation(binding);
    return true;
  }

  private cancelBattleSpoilsCutaway(): void {
    this.battleSpoilsCutawayBinding = null;
    this.clearBattleSpoilsCutawayAttributes();
  }

  private startTownItineraryCutaway(packet: TownItineraryPacketV1, options: CutawayPresentationOptions): boolean {
    if (this.townItineraryCutawayBinding?.completed === true) this.townItineraryCutawayBinding = null;
    if (this.disposed || this.lastState === null || this.viewMode !== "live" || this.hasActiveCutawayBinding()) return false;
    this.clearAllCutawayAttributes();
    this.drawTownItineraryCutaway(this.lastState, packet, options);
    this.updateTownItineraryCutawayAnimation();
    return true;
  }

  private showTownItineraryCutawayOutcome(): boolean {
    const binding = this.townItineraryCutawayBinding;
    if (binding === null || binding.completed || binding.forceOutcome) return false;
    binding.forceOutcome = true;
    this.updateTownItineraryCutawayAnimation();
    this.completeTownItineraryCutawayPresentation(binding);
    return true;
  }

  private settleTownItineraryCutaway(): boolean {
    const binding = this.townItineraryCutawayBinding;
    if (binding === null || binding.completed) return false;
    binding.forceOutcome = true;
    this.updateTownItineraryCutawayAnimation();
    this.completeTownItineraryCutawayPresentation(binding);
    return true;
  }

  private cancelTownItineraryCutaway(): void {
    this.townItineraryCutawayBinding = null;
    this.clearTownItineraryCutawayAttributes();
  }

  setViewMode(viewMode: RendererViewMode): void {
    if (this.viewMode === viewMode) return;
    this.viewMode = viewMode;
    if (this.lastState !== null) this.render(this.lastState);
  }

  render(state: WorldState): void {
    const previousState = this.lastState;
    this.animateCounterDuelTransition = previousState !== null &&
      state.tick === previousState.tick + 1 &&
      state.chronicle.at(-1)?.commandType === "counter-duel-action" &&
      previousState.depth.counterDuel !== null;
    this.lastState = state;
    this.activeCutawayRecipeKey = null;
    this.trapCutawayBinding = null;
    this.farewellCutawayBinding = null;
    this.heroLevelUpCutawayBinding = null;
    this.heroGrowthAllocationCutawayBinding = null;
    this.abilityResonanceCutawayBinding = null;
    this.weaponMemoryCutawayBinding = null;
    this.battleSpoilsCutawayBinding = null;
    this.townItineraryCutawayBinding = null;
    this.clearTrapCutawayAttributes();
    this.clearFarewellCutawayAttributes();
    this.clearHeroLevelUpCutawayAttributes();
    this.clearHeroGrowthAllocationCutawayAttributes();
    this.clearAbilityResonanceCutawayAttributes();
    this.clearWeaponMemoryCutawayAttributes();
    this.clearBattleSpoilsCutawayAttributes();
    this.clearTownItineraryCutawayAttributes();
    const presentedMode: SceneMode = this.viewMode === "map" ? "atlas" : state.scene.mode;
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.host.dataset.sceneMode = presentedMode;
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.viewMode = this.viewMode;
    delete this.host.dataset.travelEdge;
    delete this.host.dataset.travelDirection;
    delete this.host.dataset.travelBiome;
    delete this.host.dataset.travelTerrain;
    delete this.host.dataset.travelSlope;
    delete this.host.dataset.travelCrossing;
    delete this.host.dataset.travelProgress;
    delete this.host.dataset.travelRoadTopology;
    delete this.host.dataset.travelRoadFlow;
    delete this.host.dataset.campRecovery;
    delete this.host.dataset.campResources;
    delete this.host.dataset.campHeroPosition;
    delete this.host.dataset.campCompanionPosition;
    delete this.host.dataset.tonicRestockActive;
    delete this.host.dataset.tonicRestockReceipt;
    delete this.host.dataset.tonicRestockHeroPosition;
    delete this.host.dataset.tonicRestockVisual;
    delete this.host.dataset.dungeonTrap;
    delete this.host.dataset.dungeonTrapCell;
    delete this.host.dataset.dungeonTrapResult;
    delete this.host.dataset.dungeonArmedTraps;
    delete this.host.dataset.dungeonSpentTraps;
    delete this.host.dataset.dungeonDisarmedTraps;
    delete this.host.dataset.dungeonTriggeredTraps;
    delete this.host.dataset.dungeonTrapKind;
    delete this.host.dataset.dungeonAlertLabel;
    delete this.host.dataset.dungeonAlertBannerResolution;
    delete this.host.dataset.dungeonAlertDetailResolution;
    delete this.host.dataset.dungeonAlertTextResolution;
    delete this.host.dataset.dungeonTraversalMode;
    delete this.host.dataset.dungeonBreadcrumbLength;
    delete this.host.dataset.dungeonFrontierCell;
    delete this.host.dataset.dungeonNextDirections;
    delete this.host.dataset.dungeonHeroCell;
    delete this.host.dataset.dungeonKeyStatus;
    delete this.host.dataset.dungeonGateStatus;
    delete this.host.dataset.dungeonLandmark;
    delete this.host.dataset.dungeonLandmarkStatus;
    delete this.host.dataset.dungeonLandmarkCell;
    delete this.host.dataset.dungeonVisibleObjective;
    delete this.host.dataset.dungeonVisibleObjectiveDirection;
    delete this.host.dataset.dungeonShrineState;
    delete this.host.dataset.dungeonShrineCell;
    delete this.host.dataset.dungeonShrineHealth;
    delete this.host.dataset.dungeonShrineMana;
    delete this.host.dataset.encounterEngine;
    delete this.host.dataset.counterDuelId;
    delete this.host.dataset.counterDuelRound;
    delete this.host.dataset.counterDuelTell;
    delete this.host.dataset.counterDuelPrediction;
    delete this.host.dataset.counterDuelHeroStance;
    delete this.host.dataset.counterDuelOpponentStance;
    delete this.host.dataset.counterDuelResult;
    delete this.host.dataset.counterDuelOutcome;
    delete this.host.dataset.counterDuelScore;
    delete this.host.dataset.counterDuelPhase;
    delete this.host.dataset.counterDuelHabit;
    delete this.host.dataset.counterDuelHabitProgress;
    delete this.host.dataset.counterDuelRules;
    delete this.host.dataset.counterDuelOpening;
    delete this.host.dataset.counterDuelOpeningStatus;
    delete this.host.dataset.counterDuelOpeningEvent;
    delete this.host.dataset.counterDuelOpeningEvidence;
    delete this.host.dataset.counterDuelSignatureVersion;
    delete this.host.dataset.counterDuelSignatureId;
    delete this.host.dataset.counterDuelSignatureSpecies;
    delete this.host.dataset.counterDuelSignatureMotif;
    delete this.host.dataset.counterDuelWitnessVersion;
    delete this.host.dataset.counterDuelWitnessId;
    delete this.host.dataset.counterDuelWitnessCompanion;
    delete this.host.dataset.counterDuelWitnessRole;
    delete this.host.dataset.counterDuelWitnessGesture;
    delete this.host.dataset.counterDuelWitnessMotion;
    delete this.host.dataset.counterDuelWitnessMechanicalEffect;
    delete this.host.dataset.counterDuelTextResolution;
    delete this.host.dataset.counterDuelTextCount;
    delete this.host.dataset.combatId;
    delete this.host.dataset.combatTurn;
    delete this.host.dataset.combatEvent;
    delete this.host.dataset.combatActor;
    delete this.host.dataset.combatTarget;
    delete this.host.dataset.combatAction;
    delete this.host.dataset.combatInterrupted;
    delete this.host.dataset.combatAbility;
    delete this.host.dataset.combatCompanionAction;
    delete this.host.dataset.combatCompanionActionReadyRound;
    delete this.host.dataset.combatRoadcraftImpact;
    delete this.host.dataset.combatRoadcraftSourceEvent;
    delete this.host.dataset.combatRoadcraftPreventedDamage;
    delete this.host.dataset.combatManaDelta;
    delete this.host.dataset.combatHealthDelta;
    delete this.host.dataset.combatItem;
    delete this.host.dataset.combatQuantityDelta;
    delete this.host.dataset.combatHealingDelta;
    delete this.host.dataset.combatStatuses;
    delete this.host.dataset.combatStatusDurations;
    delete this.host.dataset.combatDefeated;
    delete this.host.dataset.combatOutcome;
    delete this.host.dataset.combatPhase;
    delete this.host.dataset.weaponFormId;
    delete this.host.dataset.weaponFormWeapon;
    delete this.host.dataset.weaponFormSilhouette;
    delete this.host.dataset.weaponFormLevel;
    delete this.host.dataset.weaponFormUnlockReceipt;
    delete this.host.dataset.weaponFormSourceCombat;
    delete this.host.dataset.weaponFormTerminal;
    delete this.host.dataset.weaponFormBonus;
    delete this.host.dataset.weaponFormCopy;
    delete this.host.dataset.combatRoster;
    delete this.host.dataset.combatRosterStatuses;
    delete this.host.dataset.combatUpcoming;
    delete this.host.dataset.combatActiveUnit;
    delete this.host.dataset.combatFocusTarget;
    delete this.host.dataset.combatFocusKind;
    delete this.host.dataset.combatThreatRating;
    delete this.host.dataset.combatThreatScore;
    delete this.host.dataset.combatThreatBand;
    delete this.host.dataset.combatThreatEquation;
    delete this.host.dataset.travelPlaceDanger;
    delete this.host.dataset.travelThreatBand;
    delete this.host.dataset.atlasNextDanger;
    delete this.host.dataset.atlasNextThreatBand;
    delete this.host.dataset.companionId;
    delete this.host.dataset.companionStatus;
    delete this.host.dataset.companionHealth;
    delete this.host.dataset.questRewardId;
    delete this.host.dataset.questRewardExperience;
    delete this.host.dataset.questRewardGold;
    delete this.host.dataset.questRewardItem;
    delete this.host.dataset.questRewardDisposition;
    delete this.host.dataset.questRewardConversion;
    delete this.host.dataset.questRewardLevel;
    delete this.host.dataset.questAdmissionId;
    delete this.host.dataset.questAdmissionPredecessor;
    delete this.host.dataset.questAdmissionOrdinal;
    delete this.host.dataset.questAdmissionTick;
    delete this.host.dataset.questAdmissionObjectives;
    delete this.host.dataset.questLeadId;
    delete this.host.dataset.questLeadLocation;
    delete this.host.dataset.questLeadPhase;
    delete this.host.dataset.legacyManifestationId;
    delete this.host.dataset.legacyManifestationKind;
    delete this.host.dataset.legacyLegendId;
    delete this.host.dataset.legacyMeetingId;
    delete this.host.dataset.legacyRecognitionId;
    delete this.host.dataset.legacyBelief;
    delete this.host.dataset.legacyLessonId;
    delete this.host.dataset.legacyLessonAbility;
    delete this.host.dataset.legacyImportedPower;
    delete this.host.dataset.legacyHeroPosition;
    delete this.host.dataset.legacyMentorPosition;
    delete this.host.dataset.legacyRelationshipPhase;
    delete this.host.dataset.legacyRelationshipFactId;
    delete this.host.dataset.legacyRelationshipPromiseId;
    delete this.host.dataset.legacyRelationshipReturnId;
    delete this.host.dataset.legacyRelationshipFarewellId;
    delete this.host.dataset.legacyRelationshipMemoryId;
    delete this.host.dataset.legacyRelationshipQuestProgress;
    delete this.host.dataset.legacyRelationshipSchedule;
    delete this.host.dataset.legacyRelationshipTruth;
    const questLead = projectSuccessorQuestLead(state.seed, state.depth.atlas, state.depth.quest);
    if (questLead !== null) {
      this.host.dataset.questLeadId = questLead.id;
      this.host.dataset.questLeadLocation = questLead.locationId;
      this.host.dataset.questLeadPhase = questLead.phase;
    }
    const party = projectParty(state.depth);
    if (party.active !== null) {
      this.host.dataset.companionId = party.active.id;
      this.host.dataset.companionStatus = party.active.status;
      this.host.dataset.companionHealth = `${party.active.health}/${party.active.maxHealth}`;
    }
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const palette = palettes[presentedMode];
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, palette[0]));
    this.drawHorizon(palette);

    switch (presentedMode) {
      case "town":
        this.drawTown(state, palette);
        break;
      case "atlas":
        this.drawAtlas(state, palette);
        break;
      case "travel":
        this.drawTravel(state, palette);
        break;
      case "dungeon":
        this.drawDungeon(state, palette);
        break;
      case "battle":
        this.drawBattle(state, palette);
        break;
      case "training":
        this.drawTraining(state, palette);
        break;
      case "discovery":
        this.drawDiscovery(state, palette);
        break;
      case "camp":
        this.drawCamp(state, palette);
        break;
      case "chronicle":
        this.drawChronicle(state, palette);
        break;
    }

    this.layout();
  }

  private clear(layer: Container): void {
    for (const child of layer.removeChildren()) {
      if (child !== this.atlasStaticLayer) child.destroy({ children: true });
    }
  }

  private clearTrapCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayStage;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayCheck;
    delete this.host.dataset.cutawayHealth;
    delete this.host.dataset.cutawayExit;
    delete this.host.dataset.cutawayQuestDelta;
    delete this.host.dataset.cutawayFlavor;
    delete this.host.dataset.cutawayShot;
    delete this.host.dataset.cutawayFlourish;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
  }

  private clearFarewellCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.farewellActive;
    delete this.host.dataset.farewellCompanion;
    delete this.host.dataset.farewellProfession;
    delete this.host.dataset.farewellOrigin;
    delete this.host.dataset.farewellDestination;
    delete this.host.dataset.farewellInjury;
    delete this.host.dataset.farewellHealth;
    delete this.host.dataset.farewellVictories;
    delete this.host.dataset.farewellBond;
    delete this.host.dataset.farewellDepartureTick;
    delete this.host.dataset.farewellProp;
    delete this.host.dataset.farewellNoItemTransfer;
    delete this.host.dataset.farewellCompanionPose;
  }

  private clearHeroLevelUpCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.levelUpActive;
    delete this.host.dataset.levelUpHero;
    delete this.host.dataset.levelUpLevel;
    delete this.host.dataset.levelUpExperience;
    delete this.host.dataset.levelUpThresholds;
    delete this.host.dataset.levelUpMechanical;
    delete this.host.dataset.levelUpLevelEffect;
    delete this.host.dataset.levelUpConcurrentEffect;
    delete this.host.dataset.levelUpBand;
    delete this.host.dataset.levelUpEmphasis;
    delete this.host.dataset.levelUpSource;
    delete this.host.dataset.levelUpNextRequirement;
    delete this.host.dataset.levelUpEquipment;
    delete this.host.dataset.levelUpTextResolution;
    delete this.host.dataset.hallChampionId;
    delete this.host.dataset.hallChampionHash;
    delete this.host.dataset.hallRecordedTick;
    delete this.host.dataset.hallQualification;
    delete this.host.dataset.hallSourceCommandId;
    delete this.host.dataset.hallSourceCommandType;
    delete this.host.dataset.hallCompletedQuests;
    delete this.host.dataset.hallEquipmentCount;
    delete this.host.dataset.hallAbilityCount;
    delete this.host.dataset.hallMechanicalEffect;
    delete this.host.dataset.hallCampaignContinues;
  }

  private clearHeroGrowthAllocationCutawayAttributes(): void {
    this.clearHeroLevelUpCutawayAttributes();
    delete this.host.dataset.growthAllocationActive;
    delete this.host.dataset.growthAllocationId;
    delete this.host.dataset.growthAllocationHero;
    delete this.host.dataset.growthAllocationTiming;
    delete this.host.dataset.growthAllocationRecords;
    delete this.host.dataset.growthAllocationCheckpoints;
    delete this.host.dataset.growthAllocationCandidates;
    delete this.host.dataset.growthAllocationSelected;
    delete this.host.dataset.growthAllocationRationale;
    delete this.host.dataset.growthAllocationAttributes;
    delete this.host.dataset.growthAllocationDerivedTotal;
    delete this.host.dataset.growthAllocationDerivedLevel;
    delete this.host.dataset.growthAllocationDerivedGrowth;
    delete this.host.dataset.growthAllocationDerivedOther;
    delete this.host.dataset.growthAllocationResources;
    delete this.host.dataset.growthAllocationEquipment;
    delete this.host.dataset.growthAllocationActiveRecord;
    delete this.host.dataset.growthAllocationMarkerLabels;
    delete this.host.dataset.growthAllocationHeroBounds;
  }

  private clearAbilityResonanceCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.abilityResonanceActive;
    delete this.host.dataset.abilityResonanceHero;
    delete this.host.dataset.abilityResonanceAbility;
    delete this.host.dataset.abilityResonanceKind;
    delete this.host.dataset.abilityResonanceEffect;
    delete this.host.dataset.abilityResonanceSource;
    delete this.host.dataset.abilityResonanceExperience;
    delete this.host.dataset.abilityResonanceUses;
    delete this.host.dataset.abilityResonanceTiming;
    delete this.host.dataset.abilityResonanceDamageContribution;
    delete this.host.dataset.abilityResonanceStatusPotency;
    delete this.host.dataset.abilityResonanceProvenance;
    delete this.host.dataset.abilityResonanceMonster;
    delete this.host.dataset.abilityResonanceNewAbility;
    delete this.host.dataset.abilityResonanceBranch;
    delete this.host.dataset.abilityResonanceTextResolution;
    delete this.host.dataset.abilityResonancePortraitStage;
    delete this.host.dataset.abilityResonanceWideStage;
    delete this.host.dataset.abilityResonancePose;
    delete this.host.dataset.abilityResonanceSourceCue;
    delete this.host.dataset.abilityResonanceHeroBounds;
    delete this.host.dataset.abilityResonanceGlyphBounds;
    delete this.host.dataset.abilityResonanceFactBounds;
    delete this.host.dataset.abilityResonanceEquipment;
    delete this.host.dataset.abilityResonanceGearSilhouettes;
    delete this.host.dataset.abilityResonanceSemanticRail;
  }

  private clearWeaponMemoryCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.weaponMemoryActive;
    delete this.host.dataset.weaponMemoryWeapon;
    delete this.host.dataset.weaponMemorySilhouette;
    delete this.host.dataset.weaponMemoryExperience;
    delete this.host.dataset.weaponMemoryLevel;
    delete this.host.dataset.weaponMemoryReceipts;
    delete this.host.dataset.weaponMemoryOutcomes;
    delete this.host.dataset.weaponMemoryContribution;
    delete this.host.dataset.weaponMemoryFirstReceipt;
    delete this.host.dataset.weaponMemoryStrongestReceipt;
    delete this.host.dataset.weaponMemoryFinalReceipt;
    delete this.host.dataset.weaponMemoryForm;
    delete this.host.dataset.weaponMemoryFormReceipt;
    delete this.host.dataset.weaponMemoryEquippedAfter;
    delete this.host.dataset.weaponMemoryEquippedWeaponAfter;
    delete this.host.dataset.weaponMemoryBonus;
    delete this.host.dataset.weaponMemoryTextResolution;
    delete this.host.dataset.weaponMemoryPortraitStage;
    delete this.host.dataset.weaponMemoryWideStage;
  }

  private clearBattleSpoilsCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.battleSpoilsActive;
    delete this.host.dataset.battleSpoilsCombat;
    delete this.host.dataset.battleSpoilsSlot;
    delete this.host.dataset.battleSpoilsOldItem;
    delete this.host.dataset.battleSpoilsNewItem;
    delete this.host.dataset.battleSpoilsOldSilhouette;
    delete this.host.dataset.battleSpoilsNewSilhouette;
    delete this.host.dataset.battleSpoilsDerived;
    delete this.host.dataset.battleSpoilsResources;
    delete this.host.dataset.battleSpoilsDisposition;
    delete this.host.dataset.battleSpoilsTextResolution;
    delete this.host.dataset.battleSpoilsPortraitStage;
    delete this.host.dataset.battleSpoilsWideStage;
  }

  private clearTownItineraryCutawayAttributes(): void {
    delete this.host.dataset.cutawayActive;
    delete this.host.dataset.cutawayEvent;
    delete this.host.dataset.cutawayPhase;
    delete this.host.dataset.cutawayKind;
    delete this.host.dataset.cutawayOutcome;
    delete this.host.dataset.cutawayHeroPose;
    delete this.host.dataset.cutawayObjectCount;
    delete this.host.dataset.townItineraryActive;
    delete this.host.dataset.townItineraryTown;
    delete this.host.dataset.townItineraryLocation;
    delete this.host.dataset.townItineraryDistrict;
    delete this.host.dataset.townItineraryBuilding;
    delete this.host.dataset.townItineraryResident;
    delete this.host.dataset.townItineraryRoute;
    delete this.host.dataset.townItineraryVisit;
    delete this.host.dataset.townItineraryReputation;
    delete this.host.dataset.townItineraryExperience;
    delete this.host.dataset.townItinerarySelection;
    delete this.host.dataset.townItineraryEffect;
    delete this.host.dataset.townItineraryRouteProgress;
    delete this.host.dataset.townItineraryTextResolution;
    delete this.host.dataset.townItineraryPortraitStage;
    delete this.host.dataset.townItineraryWideStage;
  }

  private drawTownItineraryBuilding(
    building: TownItineraryPacketV1["routeStops"][number],
    home: boolean,
  ): Container {
    const layer = new Container();
    const dimensions = {
      inn: [32, 35], smithy: [36, 31], market: [38, 28],
      shrine: [28, 38], hall: [40, 40], home: [30, 30],
    } as const;
    const colors = {
      inn: 0xb9774e, smithy: 0x80695c, market: 0xc18e55,
      shrine: 0x668784, hall: 0x8c7154, home: 0x9d6754,
    } as const;
    const [width, height] = dimensions[building.kind];
    const color = colors[building.kind];
    layer.addChild(rect(-width / 2, -height, width, height, color));
    layer.addChild(new Graphics()
      .poly([-width / 2 - 4, -height, 0, -height - 15, width / 2 + 4, -height])
      .fill(home ? 0x6f3f48 : 0x563f45));
    layer.addChild(rect(-4, -13, 8, 13, 0x3b2f31));
    layer.addChild(rect(-width / 2 + 5, -height + 8, 6, 7, 0xf1cf86, 0.78));
    layer.addChild(rect(width / 2 - 11, -height + 8, 6, 7, 0xf1cf86, 0.78));
    const sign = new Graphics();
    if (building.kind === "inn") sign.moveTo(-4, 0).lineTo(0, -7).lineTo(4, 0);
    else if (building.kind === "smithy") sign.moveTo(-5, -4).lineTo(5, -4).moveTo(0, -9).lineTo(0, 1);
    else if (building.kind === "market") sign.arc(0, -3, 5, Math.PI, Math.PI * 2);
    else if (building.kind === "shrine") sign.circle(0, -4, 5);
    else if (building.kind === "hall") sign.rect(-5, -9, 10, 9);
    else sign.moveTo(-5, -2).lineTo(0, -7).lineTo(5, -2);
    sign.stroke({ color: home ? 0xffe29b : 0xc9d7cf, width: 1.1, alpha: 0.92 });
    sign.position.set(0, -height - 2);
    layer.addChild(sign);
    const label = this.createScaleSensitiveText(building.name.toUpperCase(), {
      fontFamily: "ui-monospace, monospace", fontSize: 3.45, fill: home ? 0xffe29b : 0xd7e4dc,
      fontWeight: "800", align: "center", wordWrap: true, wordWrapWidth: 58, lineHeight: 4.2,
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 4);
    layer.addChild(label);
    return layer;
  }

  private drawBattleSpoilsItem(appearance: GearAppearance | null): Container {
    const layer = new Container();
    if (appearance === null) {
      layer.addChild(new Graphics().circle(0, 0, 22).stroke({ color: 0x82929c, width: 1.2, alpha: 0.7 }));
      const empty = this.createScaleSensitiveText("EMPTY", {
        fontFamily: "ui-monospace, monospace", fontSize: 4.2, fill: 0x9dabb3, fontWeight: "800", letterSpacing: 0.35,
      });
      empty.anchor.set(0.5);
      layer.addChild(empty);
      return layer;
    }
    if (appearance.slot === "weapon") return this.drawWeaponMemorySilhouette(appearance);
    const color = appearance.color;
    const accent = appearance.accent;
    if (appearance.slot === "offhand") {
      if (appearance.silhouette === "book") {
        layer.addChild(rect(-16, -20, 32, 40, color));
        layer.addChild(rect(-1.2, -20, 2.4, 40, accent));
        layer.addChild(new Graphics().rect(-12, -15, 24, 30).stroke({ color: accent, width: 1.2 }));
      } else if (appearance.silhouette === "lantern") {
        layer.addChild(new Graphics().roundRect(-13, -15, 26, 31, 4).fill({ color, alpha: 0.9 }));
        layer.addChild(circle(0, 1, 7, 0xffd978, 0.9));
        layer.addChild(new Graphics().arc(0, -15, 10, Math.PI, Math.PI * 2).stroke({ color: accent, width: 2 }));
      } else {
        layer.addChild(new Graphics().poly([0, -24, 19, -15, 15, 12, 0, 24, -15, 12, -19, -15]).fill(color));
        layer.addChild(new Graphics().moveTo(0, -19).lineTo(0, 18).stroke({ color: accent, width: 2 }));
      }
    } else if (appearance.slot === "head") {
      if (appearance.silhouette === "crown") {
        layer.addChild(new Graphics().poly([-22, 15, -18, -15, -7, 1, 0, -21, 8, 1, 19, -15, 22, 15]).fill(color));
        layer.addChild(rect(-22, 12, 44, 8, accent));
      } else {
        layer.addChild(new Graphics().arc(0, 8, 22, Math.PI, Math.PI * 2).fill(color));
        layer.addChild(rect(-22, 7, 44, 12, color));
        if (appearance.silhouette === "helm") layer.addChild(rect(-3, 0, 6, 23, accent));
      }
    } else if (appearance.slot === "body") {
      layer.addChild(new Graphics().poly([-19, -22, 19, -22, 24, 23, -24, 23]).fill(color));
      layer.addChild(new Graphics().moveTo(0, -19).lineTo(0, 21).stroke({ color: accent, width: 2 }));
      if (appearance.silhouette !== "coat") {
        for (let y = -11; y <= 13; y += 8) layer.addChild(new Graphics().moveTo(-16, y).lineTo(16, y).stroke({ color: accent, width: 1, alpha: 0.7 }));
      }
    } else if (appearance.slot === "feet") {
      layer.addChild(new Graphics().poly([-20, -21, -3, -21, -5, 13, -25, 18]).fill(color));
      layer.addChild(new Graphics().poly([3, -21, 20, -21, 25, 18, 5, 13]).fill(color));
      layer.addChild(new Graphics().moveTo(-20, 4).lineTo(-6, 4).moveTo(6, 4).lineTo(20, 4).stroke({ color: accent, width: 2 }));
    } else {
      layer.addChild(circle(0, 0, appearance.silhouette === "halo" ? 20 : 16, color, appearance.silhouette === "halo" ? 0.15 : 0.92));
      layer.addChild(new Graphics().circle(0, 0, 20).stroke({ color, width: 2 }));
      if (appearance.silhouette === "sigil") layer.addChild(new Graphics().poly([0, -14, 12, 9, -12, 9]).stroke({ color: accent, width: 2 }));
      else layer.addChild(circle(0, 0, 6, accent));
    }
    return layer;
  }

  private drawWeaponMemorySilhouette(appearance: GearAppearance): Container {
    const layer = new Container();
    if (appearance.silhouette === "sword") {
      layer.addChild(new Graphics().moveTo(0, 18).lineTo(0, -18).stroke({ color: appearance.color, width: 3.4 }));
      layer.addChild(new Graphics().poly([0, -24, 4, -16, -4, -16]).fill(appearance.color));
      layer.addChild(new Graphics().moveTo(-7, 12).lineTo(7, 12).stroke({ color: appearance.accent, width: 3 }));
      layer.addChild(rect(-1.8, 12, 3.6, 11, appearance.accent));
    } else if (appearance.silhouette === "spear") {
      layer.addChild(new Graphics().moveTo(0, 25).lineTo(0, -21).stroke({ color: appearance.accent, width: 2.4 }));
      layer.addChild(new Graphics().poly([0, -29, 5.5, -18, -5.5, -18]).fill(appearance.color));
      layer.addChild(rect(-1.4, 14, 2.8, 8, appearance.color));
    } else {
      layer.addChild(new Graphics().moveTo(-2, 23).lineTo(2, -12).stroke({ color: appearance.accent, width: 3.2 }));
      layer.addChild(circle(2.5, -18, 10, appearance.color, 0.14), circle(2.5, -18, 4.5, appearance.color));
      layer.addChild(new Graphics().circle(2.5, -18, 7).stroke({ color: appearance.color, width: 1, alpha: 0.65 }));
    }
    for (let index = 0; index < 3; index += 1) {
      layer.addChild(new Graphics()
        .moveTo(-4.5, 5 - index * 5)
        .lineTo(4.5, 3.5 - index * 5)
        .stroke({ color: 0xffefba, width: 1.2, alpha: 0.95 }));
    }
    return layer;
  }

  private drawWeaponMemoryCutaway(
    state: WorldState,
    packet: WeaponMemoryCeremonyPacketV1,
    options: CutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const item = state.depth.hero.inventory.find((candidate) => candidate.id === packet.weaponId);
    const appearance = item === undefined ? null : projectGearAppearance(item);
    if (appearance === null || appearance.slot !== "weapon" || appearance.silhouette !== packet.silhouette) {
      throw new Error("Weapon-memory cutaway cannot resolve its mastered weapon appearance");
    }
    const firstReceipt = packet.receipts.find((receipt) => receipt.id === packet.firstReceiptId);
    const finalReceipt = packet.receipts.at(-1);
    if (firstReceipt === undefined || finalReceipt === undefined) throw new Error("Weapon-memory cutaway has no receipt history");
    const strongestReceipt = packet.receipts.find((receipt) => receipt.id === packet.highestDamageReceiptId);
    if (strongestReceipt === undefined) throw new Error("Weapon-memory cutaway has no strongest recorded contribution");
    const outcome = finalReceipt.outcome;
    const accent = outcome === "victory" ? 0x7dddc7 : outcome === "stalemate" ? 0xe4c879 : 0xdf8b75;
    const palette = palettes.chronicle;
    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "weapon-memory";
    this.host.dataset.cutawayOutcome = outcome;
    this.host.dataset.weaponMemoryActive = "true";
    this.host.dataset.weaponMemoryWeapon = packet.weaponId;
    this.host.dataset.weaponMemorySilhouette = packet.silhouette;
    this.host.dataset.weaponMemoryExperience = `${packet.experienceBefore}:${packet.experienceAfter}:${packet.maximumExperience}`;
    this.host.dataset.weaponMemoryLevel = `${packet.levelBefore}:${packet.levelAfter}:${packet.maximumLevel}`;
    this.host.dataset.weaponMemoryReceipts = String(packet.receipts.length);
    this.host.dataset.weaponMemoryOutcomes = `${packet.outcomeCounts.victories}:${packet.outcomeCounts.defeats}:${packet.outcomeCounts.stalemates}`;
    this.host.dataset.weaponMemoryContribution = `${packet.totalBasicStrikes}:${packet.totalDamage}`;
    this.host.dataset.weaponMemoryFirstReceipt = firstReceipt.id;
    this.host.dataset.weaponMemoryStrongestReceipt = strongestReceipt.id;
    this.host.dataset.weaponMemoryFinalReceipt = packet.finalReceiptId;
    this.host.dataset.weaponMemoryForm = packet.familiarFormId;
    this.host.dataset.weaponMemoryFormReceipt = packet.familiarFormUnlockReceiptId;
    this.host.dataset.weaponMemoryEquippedAfter = String(packet.equippedAfter);
    this.host.dataset.weaponMemoryEquippedWeaponAfter = packet.equippedWeaponIdAfter ?? "none";
    this.host.dataset.weaponMemoryBonus = String(packet.mechanicalBonus);

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x0d1c23));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 132)
      .bezierCurveTo(56, 93, 106, 139, 161, 89)
      .bezierCurveTo(218, 39, 267, 95, 320, 52)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: 0x334b4d, alpha: 0.5 }));
    this.worldLayer.addChild(rect(0, 151, designWidth, 29, 0x1d2c32));
    const kicker = this.createScaleSensitiveText("THE FORTY-FIFTH MARK", {
      fontFamily: "Inter, sans-serif", fontSize: 5, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.95,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(packet.weaponName.toUpperCase(), {
      fontFamily: "Georgia, serif", fontSize: 10.5, fill: 0xeafffa, fontWeight: "800", letterSpacing: 0.45,
    });
    title.position.set(9, 18);
    const byline = this.createScaleSensitiveText(`${packet.heroName.toUpperCase()} · USE MASTERY 10 / 10`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4.3, fill: 0xb9d4d0, fontWeight: "700", letterSpacing: 0.24,
    });
    byline.position.set(10, 34);
    this.worldLayer.addChild(kicker, title, byline);

    const marks: Graphics[] = [];
    const strongestId = strongestReceipt.id;
    for (let index = 0; index < packet.receipts.length; index += 1) {
      const receipt = packet.receipts[index];
      if (receipt === undefined) continue;
      const angle = Math.PI * (0.8 + index * 1.4 / Math.max(1, packet.receipts.length - 1));
      const representative = receipt.id === packet.firstReceiptId || receipt.id === strongestId || receipt.id === packet.finalReceiptId;
      const mark = new Graphics()
        .moveTo(104 + Math.cos(angle) * 42, 90 + Math.sin(angle) * 42)
        .lineTo(104 + Math.cos(angle) * (representative ? 49 : 46), 90 + Math.sin(angle) * (representative ? 49 : 46))
        .stroke({ color: representative ? accent : 0x7da39e, width: representative ? 1.7 : 0.8, alpha: representative ? 0.98 : 0.64 });
      mark.alpha = 0;
      marks.push(mark);
      this.worldLayer.addChild(mark);
    }

    const weapon = this.drawWeaponMemorySilhouette(appearance);
    this.worldLayer.addChild(weapon);
    const familiarForm = new Container();
    familiarForm.position.set(104, 89);
    if (packet.silhouette === "sword") {
      familiarForm.addChild(new Graphics().arc(0, 0, 35, -1.1, 0.35).stroke({ color: accent, width: 2, alpha: 0.85 }));
    } else if (packet.silhouette === "spear") {
      familiarForm.addChild(new Graphics().moveTo(-34, 13).lineTo(34, -13).stroke({ color: accent, width: 2, alpha: 0.85 }));
    } else {
      familiarForm.addChild(new Graphics().circle(0, 0, 32).stroke({ color: accent, width: 1.8, alpha: 0.85 }));
    }
    familiarForm.alpha = 0;
    this.worldLayer.addChild(familiarForm);

    const makeFactPanel = (y: number, label: string, value: string): Container => {
      const panel = new Container();
      panel.position.set(160, y);
      panel.addChild(rect(0, 0, 150, 25, 0x091218, 0.94));
      const labelText = this.createScaleSensitiveText(label, {
        fontFamily: "Inter, sans-serif", fontSize: 4, fill: accent, fontWeight: "900", letterSpacing: 0.65,
      });
      labelText.position.set(6, 4);
      const valueText = this.createScaleSensitiveText(value, {
        fontFamily: "ui-monospace, monospace", fontSize: 4.35, fill: 0xe8f4f2, fontWeight: "700", letterSpacing: 0.04,
      });
      valueText.position.set(6, 13);
      panel.addChild(labelText, valueText);
      panel.alpha = 0;
      this.worldLayer.addChild(panel);
      return panel;
    };
    const basicHitCopy = (count: number): string => `${count} BASIC ${count === 1 ? "HIT" : "HITS"}`;
    const first = makeFactPanel(43, "FIRST MARK", `T${firstReceipt.resolvedTick} · ${firstReceipt.outcome.toUpperCase()} · ${basicHitCopy(firstReceipt.basicStrikes)} · ${firstReceipt.damage} DMG`);
    const strongest = makeFactPanel(71, "STRONGEST RECORDED CONTRIBUTION", `T${strongestReceipt.resolvedTick} · ${basicHitCopy(strongestReceipt.basicStrikes)} · ${strongestReceipt.damage} DMG`);
    const final = makeFactPanel(99, "FINAL MARK · XP 44→45 · USE L9→10", `T${finalReceipt.resolvedTick} · ${finalReceipt.outcome.toUpperCase()} · ${basicHitCopy(finalReceipt.basicStrikes)} · ${finalReceipt.damage} DMG`);
    const tableau = makeFactPanel(127, "45 RECORDED ENCOUNTERS · NO COMBAT BONUS", `${packet.outcomeCounts.victories}V ${packet.outcomeCounts.defeats}D ${packet.outcomeCounts.stalemates}S · ${basicHitCopy(packet.totalBasicStrikes)} · ${packet.totalDamage} DMG`);

    const hero = this.drawHero(state, 104, 149, palette, 1.08, packet.heroId, true, appearance);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Weapon-memory cutaway hero rig is missing");
    heroRig.mode = "chronicle";
    hero.alpha = 0;
    this.weaponMemoryCutawayBinding = {
      packet,
      weapon,
      marks,
      first,
      strongest,
      familiarForm,
      final,
      tableau,
      hero,
      heroRig,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateWeaponMemoryCutawayAnimation(): void {
    const binding = this.weaponMemoryCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectWeaponMemoryCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.weapon.position.set(frame.weaponX, frame.weaponY);
    binding.weapon.rotation = frame.weaponRotation;
    binding.weapon.scale.set(frame.weaponScale);
    binding.weapon.alpha = frame.weaponAlpha * (1 - frame.heroAlpha * 0.7);
    const visibleMarks = Math.round(frame.marksProgress * binding.marks.length);
    for (let index = 0; index < binding.marks.length; index += 1) {
      const mark = binding.marks[index];
      if (mark !== undefined) mark.alpha = index < visibleMarks ? 1 : 0;
    }
    binding.first.alpha = frame.firstAlpha;
    binding.strongest.alpha = frame.strongestAlpha;
    binding.familiarForm.alpha = frame.formAlpha;
    binding.final.alpha = frame.finalAlpha;
    binding.tableau.alpha = frame.tableauAlpha;
    binding.hero.alpha = frame.heroAlpha;
    const outcome = binding.packet.receipts.at(-1)?.outcome;
    if (outcome === "defeat") {
      binding.heroRig.puppet.y = 4;
      binding.heroRig.puppet.rotation = -0.12;
      binding.heroRig.frontArm.rotation = 0.32;
      binding.heroRig.rearArm.rotation = -0.38;
      this.host.dataset.cutawayHeroPose = "recovering";
    } else if (outcome === "stalemate") {
      binding.heroRig.puppet.y = 1;
      binding.heroRig.puppet.rotation = -0.035;
      binding.heroRig.frontArm.rotation = -0.22;
      binding.heroRig.rearArm.rotation = 0.28;
      this.host.dataset.cutawayHeroPose = "braced";
    } else {
      binding.heroRig.puppet.y = -1;
      binding.heroRig.puppet.rotation = 0.025;
      binding.heroRig.frontArm.rotation = -0.48;
      binding.heroRig.rearArm.rotation = 0.42;
      this.host.dataset.cutawayHeroPose = "upright";
    }
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= weaponMemoryStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeWeaponMemoryCutawayPresentation(binding);
  }

  private completeWeaponMemoryCutawayPresentation(binding: WeaponMemoryCutawayBinding): void {
    if (this.weaponMemoryCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.weaponMemoryActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.weaponMemoryCutawayBinding = null;
    binding.onComplete();
  }

  private drawBattleSpoilsCutaway(
    state: WorldState,
    packet: BattleSpoilsComparisonPacketV1,
    options: CutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const newItemState = state.depth.hero.inventory.find((item) => item.id === packet.newItem.id);
    const oldItemState = packet.oldItem === null
      ? null
      : state.depth.hero.inventory.find((item) => item.id === packet.oldItem?.id) ?? null;
    const newAppearance = newItemState === undefined ? null : projectGearAppearance(newItemState);
    const oldAppearance = oldItemState === null ? null : projectGearAppearance(oldItemState);
    if (newAppearance === null
      || newAppearance.slot !== packet.slot
      || newAppearance.silhouette !== packet.newItem.silhouette
      || (packet.oldItem !== null && (oldAppearance === null
        || oldAppearance.slot !== packet.slot
        || oldAppearance.silhouette !== packet.oldItem.silhouette))) {
      throw new Error("Battle-spoils cutaway cannot resolve exact equipment appearances");
    }

    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "battle-spoils";
    this.host.dataset.cutawayOutcome = "auto-equipped";
    this.host.dataset.battleSpoilsActive = "true";
    this.host.dataset.battleSpoilsCombat = packet.combatId;
    this.host.dataset.battleSpoilsSlot = packet.slot;
    this.host.dataset.battleSpoilsOldItem = packet.oldItem?.id ?? "empty";
    this.host.dataset.battleSpoilsNewItem = packet.newItem.id;
    this.host.dataset.battleSpoilsOldSilhouette = packet.oldItem?.silhouette ?? "empty";
    this.host.dataset.battleSpoilsNewSilhouette = packet.newItem.silhouette;
    this.host.dataset.battleSpoilsDerived = [
      packet.derivedDelta.power,
      packet.derivedDelta.armor,
      packet.derivedDelta.initiative,
      packet.derivedDelta.maxHealth,
      packet.derivedDelta.maxMana,
    ].join(":");
    this.host.dataset.battleSpoilsResources = `${packet.resourcesBefore.health}:${packet.resourcesBefore.maxHealth}:${packet.resourcesBefore.mana}:${packet.resourcesBefore.maxMana}:${packet.resourcesAfter.health}:${packet.resourcesAfter.maxHealth}:${packet.resourcesAfter.mana}:${packet.resourcesAfter.maxMana}`;
    this.host.dataset.battleSpoilsDisposition = packet.oldItemDisposition;

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x0b1820));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 135)
      .bezierCurveTo(52, 100, 104, 137, 165, 93)
      .bezierCurveTo(222, 51, 267, 100, 320, 67)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: 0x30484d, alpha: 0.58 }));
    this.worldLayer.addChild(rect(0, 151, designWidth, 29, 0x1b2a31));
    const kicker = this.createScaleSensitiveText("AUTO-EQUIPPED · COMPARISON", {
      fontFamily: "Inter, sans-serif", fontSize: 4.7, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.72,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(packet.newItem.name.toUpperCase(), {
      fontFamily: "Georgia, serif", fontSize: 9.2, fill: 0xeafffa, fontWeight: "800", letterSpacing: 0.38,
    });
    title.position.set(9, 18);
    const byline = this.createScaleSensitiveText(`${packet.heroName.toUpperCase()} · ${packet.slot.toUpperCase()} · T${packet.tick}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4, fill: 0xb9d4d0, fontWeight: "700", letterSpacing: 0.18,
    });
    byline.position.set(10, 31);
    this.worldLayer.addChild(kicker, title, byline);

    const oldItem = this.drawBattleSpoilsItem(oldAppearance);
    const newItem = this.drawBattleSpoilsItem(newAppearance);
    oldItem.alpha = 0;
    newItem.alpha = 0;
    this.worldLayer.addChild(oldItem, newItem);

    const oldLabel = this.createScaleSensitiveText(packet.oldItem?.name.toUpperCase() ?? "EMPTY SLOT", {
      fontFamily: "ui-monospace, monospace", fontSize: 3.6, fill: 0xb8c2c8, fontWeight: "800", letterSpacing: 0.12,
    });
    oldLabel.anchor.set(0.5);
    oldLabel.position.set(76, 119);
    const newLabel = this.createScaleSensitiveText(packet.newItem.name.toUpperCase(), {
      fontFamily: "ui-monospace, monospace", fontSize: 3.6, fill: 0x7dddc7, fontWeight: "900", letterSpacing: 0.12,
    });
    newLabel.anchor.set(0.5);
    newLabel.position.set(150, 119);
    this.worldLayer.addChild(oldLabel, newLabel);

    const arrow = new Container();
    arrow.position.set(113, 88);
    arrow.addChild(new Graphics().moveTo(-13, 0).lineTo(12, 0).stroke({ color: 0xe4c879, width: 2 }));
    arrow.addChild(new Graphics().poly([17, 0, 9, -5, 9, 5]).fill(0xe4c879));
    const auto = this.createScaleSensitiveText("AUTO", {
      fontFamily: "ui-monospace, monospace", fontSize: 3.2, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.3,
    });
    auto.anchor.set(0.5);
    auto.position.set(0, -8);
    arrow.addChild(auto);
    arrow.alpha = 0;
    this.worldLayer.addChild(arrow);

    const comparison = new Container();
    comparison.position.set(174, 39);
    comparison.addChild(rect(0, 0, 138, 88, 0x071118, 0.94));
    const compareHeading = this.createScaleSensitiveText("DERIVED CONSEQUENCES", {
      fontFamily: "Inter, sans-serif", fontSize: 3.8, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.55,
    });
    compareHeading.position.set(6, 5);
    comparison.addChild(compareHeading);
    const labels = { power: "POWER", armor: "ARMOR", initiative: "INIT", maxHealth: "MAX HP", maxMana: "MAX MP" } as const;
    (Object.keys(labels) as Array<keyof typeof labels>).forEach((key, index) => {
      const delta = packet.derivedDelta[key];
      const status = delta > 0 ? "IMPROVED" : delta < 0 ? "REDUCED" : "UNCHANGED";
      const symbol = delta > 0 ? "+" : delta < 0 ? "−" : "=";
      const color = delta > 0 ? 0x7dddc7 : delta < 0 ? 0xdf8b75 : 0xa7b4bb;
      const row = this.createScaleSensitiveText(`${symbol} ${labels[key]}  ${packet.derivedBefore[key]}→${packet.derivedAfter[key]}  ${status}`, {
        fontFamily: "ui-monospace, monospace", fontSize: 3.65, fill: color, fontWeight: "800", letterSpacing: 0.06,
      });
      row.position.set(6, 18 + index * 12.5);
      comparison.addChild(row);
    });
    comparison.alpha = 0;
    this.worldLayer.addChild(comparison);

    const resources = new Container();
    resources.position.set(174, 131);
    resources.addChild(rect(0, 0, 138, 42, 0x071118, 0.94));
    const resourceHeading = this.createScaleSensitiveText("RESOURCE TRUTH · NO REFILL CLAIMED", {
      fontFamily: "Inter, sans-serif", fontSize: 3.25, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.35,
    });
    resourceHeading.position.set(6, 5);
    const hp = this.createScaleSensitiveText(`HP ${packet.resourcesBefore.health}/${packet.resourcesBefore.maxHealth} → ${packet.resourcesAfter.health}/${packet.resourcesAfter.maxHealth}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 3.8, fill: 0xe8f4f2, fontWeight: "800",
    });
    hp.position.set(6, 17);
    const mp = this.createScaleSensitiveText(`MP ${packet.resourcesBefore.mana}/${packet.resourcesBefore.maxMana} → ${packet.resourcesAfter.mana}/${packet.resourcesAfter.maxMana}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 3.8, fill: 0xe8f4f2, fontWeight: "800",
    });
    mp.position.set(6, 29);
    resources.addChild(resourceHeading, hp, mp);
    resources.alpha = 0;
    this.worldLayer.addChild(resources);

    const hero = this.drawHero(state, 146, 151, palettes.chronicle, 0.88, packet.heroId, true);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Battle-spoils cutaway hero rig is missing");
    heroRig.mode = "chronicle";
    hero.alpha = 0;
    this.battleSpoilsCutawayBinding = {
      packet,
      oldItem,
      newItem,
      arrow,
      comparison,
      resources,
      hero,
      heroRig,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateBattleSpoilsCutawayAnimation(): void {
    const binding = this.battleSpoilsCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectBattleSpoilsCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.oldItem.position.set(frame.oldItemX, frame.oldItemY);
    binding.oldItem.rotation = frame.oldItemRotation;
    binding.oldItem.alpha = frame.oldItemAlpha;
    binding.newItem.position.set(frame.newItemX, frame.newItemY);
    binding.newItem.rotation = frame.newItemRotation;
    binding.newItem.alpha = frame.newItemAlpha;
    binding.arrow.alpha = frame.arrowAlpha;
    binding.comparison.alpha = frame.comparisonAlpha;
    binding.resources.alpha = frame.resourceAlpha;
    binding.hero.alpha = frame.heroAlpha;
    binding.heroRig.puppet.y = -1;
    binding.heroRig.puppet.rotation = 0.02;
    binding.heroRig.frontArm.rotation = -0.42;
    binding.heroRig.rearArm.rotation = 0.35;
    this.host.dataset.cutawayHeroPose = "new-loadout";
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= battleSpoilsStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeBattleSpoilsCutawayPresentation(binding);
  }

  private completeBattleSpoilsCutawayPresentation(binding: BattleSpoilsCutawayBinding): void {
    if (this.battleSpoilsCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.battleSpoilsActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.battleSpoilsCutawayBinding = null;
    binding.onComplete();
  }

  private drawTownItineraryCutaway(
    state: WorldState,
    packet: TownItineraryPacketV1,
    options: CutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);

    const location = state.depth.atlas.locations.find((candidate) => candidate.id === packet.location.id);
    const town = state.depth.towns[packet.location.id];
    const district = town?.districts.find((candidate) => candidate.id === packet.district.id);
    const building = town?.buildings.find((candidate) => candidate.id === packet.building.id);
    const resident = town?.residents.find((candidate) => candidate.id === packet.resident.id);
    const routeStops = town === undefined
      ? []
      : packet.routeStops.map((stop) => town.buildings.find((candidate) => candidate.id === stop.id));
    const exactRoute = routeStops.length === packet.routeStops.length
      && routeStops.every((stop, index) => {
        const fact = packet.routeStops[index];
        return stop !== undefined && fact !== undefined
          && stop.name === fact.name && stop.kind === fact.kind && stop.districtId === fact.districtId;
      });
    if (state.campaignId !== packet.campaignId
      || state.tick !== packet.tick
      || state.scene.mode !== "town"
      || state.depth.hero.id !== packet.hero.id
      || state.depth.hero.name !== packet.hero.name
      || state.depth.hero.className !== packet.hero.className
      || state.depth.hero.experience !== packet.experience.after
      || location?.kind !== "town"
      || location.name !== packet.location.name
      || town === undefined
      || town.id !== packet.town.id
      || town.locationId !== packet.location.id
      || town.name !== packet.town.name
      || town.specialty !== packet.town.specialty
      || town.foundedYear !== packet.town.foundedYear
      || town.visits !== packet.visit.after
      || town.reputation !== packet.reputation.after
      || district?.name !== packet.district.name
      || district.character !== packet.district.character
      || building?.name !== packet.building.name
      || building.kind !== packet.building.kind
      || building.districtId !== packet.district.id
      || resident?.name !== packet.resident.name
      || resident.role !== packet.resident.role
      || resident.disposition !== packet.resident.disposition
      || resident.homeBuildingId !== packet.building.id
      || !exactRoute) {
      throw new Error("Town-itinerary cutaway cannot resolve its exact town graph");
    }

    this.host.dataset.sceneMode = "town";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "town-itinerary";
    this.host.dataset.cutawayOutcome = "resident-met";
    this.host.dataset.townItineraryActive = "true";
    this.host.dataset.townItineraryTown = packet.town.id;
    this.host.dataset.townItineraryLocation = packet.location.id;
    this.host.dataset.townItineraryDistrict = packet.district.id;
    this.host.dataset.townItineraryBuilding = packet.building.id;
    this.host.dataset.townItineraryResident = packet.resident.id;
    this.host.dataset.townItineraryRoute = packet.routeStops.map((stop) => stop.id).join("|");
    this.host.dataset.townItineraryVisit = `${packet.visit.before}:${packet.visit.after}`;
    this.host.dataset.townItineraryReputation = `${packet.reputation.before}:${packet.reputation.after}`;
    this.host.dataset.townItineraryExperience = `${packet.experience.before}:${packet.experience.delta}:${packet.experience.after}`;
    this.host.dataset.townItinerarySelection = `${packet.selectionOrdinal}:${packet.selectionIndex}:${packet.residentCount}`;
    this.host.dataset.townItineraryEffect = packet.mechanicalEffect;

    const palette = palettes.town;
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x10242b));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 109)
      .bezierCurveTo(52, 82, 107, 103, 163, 69)
      .bezierCurveTo(218, 36, 267, 82, 320, 57)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: 0x294641, alpha: 0.72 }));
    this.worldLayer.addChild(rect(0, 132, designWidth, 48, 0x365746));

    const kicker = this.createScaleSensitiveText("ONE REAL STOP · TOWN VISIT", {
      fontFamily: "Inter, sans-serif", fontSize: 4.7, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.72,
    });
    kicker.position.set(10, 7);
    const title = this.createScaleSensitiveText(packet.town.name.toUpperCase(), {
      fontFamily: "Georgia, serif", fontSize: 9.2, fill: 0xf0fff7, fontWeight: "800", letterSpacing: 0.38,
    });
    title.position.set(9, 17);
    const byline = this.createScaleSensitiveText(`${packet.town.specialty.toUpperCase()} · FOUNDED ${packet.town.foundedYear} · T${packet.tick}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 3.8, fill: 0xbdd3c6, fontWeight: "700", letterSpacing: 0.12,
    });
    byline.position.set(10, 30);
    this.worldLayer.addChild(kicker, title, byline);

    const route = new Container();
    const routeInk = new Graphics();
    for (let index = 0; index <= 24; index += 1) {
      const progress = index / 24;
      const x = 33 + progress * 174;
      const y = 137 - Math.sin(progress * Math.PI) * 7;
      if (index === 0) routeInk.moveTo(x, y);
      else routeInk.lineTo(x, y);
    }
    routeInk.stroke({ color: 0xe4c879, width: 1.4, alpha: 0.82 });
    route.addChild(routeInk);
    packet.routeStops.forEach((_stop, index) => {
      const progress = (index + 1) / packet.routeStops.length;
      route.addChild(circle(33 + progress * 174, 137 - Math.sin(progress * Math.PI) * 7, 2.5, 0xe4c879));
    });
    route.alpha = 0;
    this.worldLayer.addChild(route);

    const districtLayer = new Container();
    const districtPanel = new Container();
    districtPanel.position.set(9, 39);
    districtPanel.addChild(rect(0, 0, 145, 31, 0x0b1717, 0.92));
    const districtName = this.createScaleSensitiveText(packet.district.name.toUpperCase(), {
      fontFamily: "Inter, sans-serif", fontSize: 4.2, fill: 0xffe29b, fontWeight: "900", letterSpacing: 0.48,
    });
    districtName.position.set(6, 5);
    const districtCharacter = this.createScaleSensitiveText(packet.district.character, {
      fontFamily: "Georgia, serif", fontSize: 4.2, fill: 0xd9e8de, wordWrap: true, wordWrapWidth: 133, lineHeight: 5.1,
    });
    districtCharacter.position.set(6, 15);
    districtPanel.addChild(districtName, districtCharacter);
    districtLayer.addChild(districtPanel);
    packet.routeStops.forEach((stop, index) => {
      const progress = (index + 1) / packet.routeStops.length;
      const stopLayer = this.drawTownItineraryBuilding(stop, stop.id === packet.building.id);
      stopLayer.position.set(33 + progress * 174, 129);
      districtLayer.addChild(stopLayer);
    });
    districtLayer.alpha = 0;
    this.worldLayer.addChild(districtLayer);

    const buildingHighlight = new Container();
    buildingHighlight.position.set(207, 108);
    buildingHighlight.addChild(circle(0, 0, 27, 0xe4c879, 0.1));
    buildingHighlight.addChild(new Graphics().circle(0, 0, 30).stroke({ color: 0xe4c879, width: 1.4, alpha: 0.9 }));
    buildingHighlight.alpha = 0;
    this.lightLayer.addChild(buildingHighlight);

    const residentLayer = new Container();
    residentLayer.position.set(244, 143);
    const residentActor = this.drawCompanion(state, packet.resident.id, packet.resident.role, 0, 0, palette, 0.76);
    const residentRig = this.heroRigs.at(-1);
    if (residentRig !== undefined) residentRig.mode = "chronicle";
    residentLayer.addChild(residentActor);
    const residentLabel = this.createScaleSensitiveText(`${packet.resident.name.toUpperCase()}\n${packet.resident.role.toUpperCase()} · ${packet.resident.disposition.toUpperCase()}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 3.7, fill: 0xf5ebc9, fontWeight: "800",
      align: "center", wordWrap: true, wordWrapWidth: 92, lineHeight: 4.8,
    });
    residentLabel.anchor.set(0.5, 1);
    residentLabel.position.set(0, -37);
    residentLayer.addChild(residentLabel);
    residentLayer.alpha = 0;
    this.lightLayer.addChild(residentLayer);

    const consequence = new Container();
    consequence.position.set(176, 8);
    consequence.addChild(rect(0, 0, 136, 50, 0x091616, 0.94));
    const consequenceHeading = this.createScaleSensitiveText("VISIT ALREADY RECORDED", {
      fontFamily: "Inter, sans-serif", fontSize: 3.7, fill: 0xe4c879, fontWeight: "900", letterSpacing: 0.42,
    });
    consequenceHeading.position.set(6, 5);
    const consequenceFacts = this.createScaleSensitiveText(
      `VISITS ${packet.visit.before}→${packet.visit.after}\nREPUTATION ${packet.reputation.before}→${packet.reputation.after}\nEXPERIENCE ${packet.experience.before}→${packet.experience.after} (+${packet.experience.delta})`,
      {
        fontFamily: "ui-monospace, monospace", fontSize: 4, fill: 0xe8f4ec, fontWeight: "800", lineHeight: 9.2,
      },
    );
    consequenceFacts.position.set(6, 17);
    consequence.addChild(consequenceHeading, consequenceFacts);
    consequence.alpha = 0;
    this.worldLayer.addChild(consequence);

    const hero = this.drawHero(state, 33, 137, palette, 0.9, packet.hero.id, true);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Town-itinerary cutaway hero rig is missing");
    heroRig.mode = "chronicle";
    this.townItineraryCutawayBinding = {
      packet,
      hero,
      heroRig,
      resident: residentLayer,
      district: districtLayer,
      route,
      buildingHighlight,
      consequence,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateTownItineraryCutawayAnimation(): void {
    const binding = this.townItineraryCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectTownItineraryCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.hero.position.set(frame.heroX, frame.heroY);
    binding.district.alpha = frame.districtAlpha;
    binding.route.alpha = frame.routeAlpha;
    binding.buildingHighlight.alpha = frame.buildingHighlightAlpha;
    binding.resident.alpha = frame.residentAlpha;
    binding.consequence.alpha = frame.consequenceAlpha;
    const walking = frame.routeProgress > 0 && frame.routeProgress < 1 && frame.phase === "route";
    const stride = walking ? Math.sin(frame.routeProgress * Math.PI * 8) * 0.34 : 0;
    binding.heroRig.puppet.y = walking ? Math.abs(Math.sin(frame.routeProgress * Math.PI * 8)) * -1.2 : -0.5;
    binding.heroRig.puppet.rotation = walking ? 0.025 : -0.018;
    binding.heroRig.frontLeg.rotation = stride;
    binding.heroRig.rearLeg.rotation = -stride;
    binding.heroRig.frontArm.rotation = walking ? -stride * 0.72 : -0.22;
    binding.heroRig.rearArm.rotation = walking ? stride * 0.72 : 0.18;
    this.host.dataset.cutawayHeroPose = walking ? "walking-route" : frame.residentAlpha > 0 ? "meeting-resident" : "arriving";
    this.host.dataset.cutawayPhase = frame.phase;
    this.host.dataset.townItineraryRouteProgress = frame.routeProgress.toFixed(3);
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= townItineraryStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeTownItineraryCutawayPresentation(binding);
  }

  private completeTownItineraryCutawayPresentation(binding: TownItineraryCutawayBinding): void {
    if (this.townItineraryCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.townItineraryActive = "false";
    this.host.dataset.cutawayPhase = "consequence";
    this.host.dataset.townItineraryRouteProgress = "1.000";
    if (binding.phase !== "consequence") {
      binding.phase = "consequence";
      binding.onPhase("consequence");
    }
    this.townItineraryCutawayBinding = null;
    binding.onComplete();
  }

  private drawFarewellCutaway(
    state: WorldState,
    packet: CompanionFarewellPacket,
    options: FarewellCutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const injured = packet.outcome === "injured";
    const palette = palettes.chronicle;
    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "companion-farewell";
    this.host.dataset.cutawayOutcome = packet.outcome;
    this.host.dataset.farewellActive = "true";
    this.host.dataset.farewellCompanion = packet.companionId;
    this.host.dataset.farewellProfession = packet.profession;
    this.host.dataset.farewellOrigin = packet.originLocationId;
    this.host.dataset.farewellDestination = packet.destinationId;
    this.host.dataset.farewellInjury = packet.injury;
    this.host.dataset.farewellHealth = `${packet.health}/${packet.maxHealth}`;
    this.host.dataset.farewellVictories = String(packet.victories);
    this.host.dataset.farewellBond = String(packet.bond);
    this.host.dataset.farewellDepartureTick = String(packet.departureTick);
    this.host.dataset.farewellProp = `${packet.profession}-tools`;
    this.host.dataset.farewellNoItemTransfer = "true";

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x151925));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 82)
      .bezierCurveTo(55, 55, 104, 85, 157, 54)
      .bezierCurveTo(216, 20, 264, 68, 320, 39)
      .lineTo(320, 132)
      .lineTo(0, 132)
      .closePath()
      .fill({ color: 0x465b55, alpha: 0.72 }));
    this.worldLayer.addChild(rect(0, 119, designWidth, 61, 0x3c4d3f));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 166)
      .bezierCurveTo(90, 148, 185, 151, 320, 124)
      .lineTo(320, 148)
      .bezierCurveTo(190, 164, 90, 164, 0, 176)
      .closePath()
      .fill({ color: 0xb08b5f, alpha: 0.78 }));

    for (const [x, width, height] of [[256, 20, 30], [278, 27, 42], [306, 17, 25]] as const) {
      this.worldLayer.addChild(rect(x, 119 - height, width, height, 0x735b50));
      this.worldLayer.addChild(new Graphics().poly([x - 3, 119 - height, x + width / 2, 109 - height, x + width + 3, 119 - height]).fill(0x493b45));
      this.worldLayer.addChild(rect(x + 5, 126 - height, 5, 6, 0xe1bd75, 0.78));
    }

    const kicker = this.createScaleSensitiveText("SHARED ROAD OATH", {
      fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0xd0b784, fontWeight: "900", letterSpacing: 1,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(
      injured ? "THE ROAD REMEMBERS" : "PROMISE KEPT",
      { fontFamily: "Georgia, serif", fontSize: 11, fill: injured ? 0xf0b49c : 0xf4dfad, fontWeight: "800", letterSpacing: 0.65 },
    );
    title.position.set(9, 18);
    const route = this.createScaleSensitiveText(`${packet.originName.toUpperCase()}  →  ${packet.destinationName.toUpperCase()}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4.5, fill: 0xd8e0d7, fontWeight: "700", letterSpacing: 0.25,
    });
    route.position.set(10, 35);
    this.worldLayer.addChild(kicker, title, route);

    const heroBaseX = 66;
    const heroBaseY = 146;
    const companionBaseX = 114;
    const companionBaseY = 146;
    const hero = this.drawHero(state, heroBaseX, heroBaseY, palette, 0.9);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Farewell cutaway hero rig is missing");
    const companion = this.drawCompanion(
      state,
      packet.companionId,
      packet.profession,
      companionBaseX,
      companionBaseY,
      palette,
      0.82,
      injured,
    );
    const companionRig = this.heroRigs.at(-1);
    if (companionRig === undefined || companionRig === heroRig) throw new Error("Farewell cutaway companion rig is missing");

    const makeFactPanel = (y: number, label: string, value: string, color: number): Container => {
      const panel = new Container();
      panel.position.set(168, y);
      panel.addChild(rect(0, 0, 141, 25, 0x10161e, 0.94));
      const labelText = this.createScaleSensitiveText(label, {
        fontFamily: "Inter, sans-serif", fontSize: 4.2, fill: color, fontWeight: "900", letterSpacing: 0.75,
      });
      labelText.position.set(7, 4);
      const valueText = this.createScaleSensitiveText(value, {
        fontFamily: "ui-monospace, monospace", fontSize: 5.1, fill: 0xf2ead9, fontWeight: "700", letterSpacing: 0.15,
      });
      valueText.position.set(7, 13);
      panel.addChild(labelText, valueText);
      this.worldLayer.addChild(panel);
      return panel;
    };
    const journey = makeFactPanel(31, "THE ROAD", `${packet.victories === 0 ? "QUIET ROAD" : `${packet.victories} VICTORIES`}  ·  BOND ${packet.bond}`, 0x99c7b6);
    const arrival = makeFactPanel(59, "ARRIVAL", injured ? `${packet.injury.toUpperCase()}  ·  HP ${packet.health}/${packet.maxHealth}` : `FULFILLED  ·  HP ${packet.health}/${packet.maxHealth}`, injured ? 0xf0aa91 : 0xc5deb5);
    const farewell = makeFactPanel(87, "FAREWELL", `${packet.companionName.toUpperCase()} LEAVES WITH ${packet.profession.toUpperCase()} TOOLS`, 0xe0bd82);
    const legacy = makeFactPanel(115, `CHRONICLE · T${packet.departureTick}`, "FORMER COMPANION  ·  NO ITEM TRANSFER", 0xb7a6cf);

    const binding: FarewellCutawayBinding = {
      packet,
      hero,
      heroRig,
      companion,
      companionRig,
      journey,
      arrival,
      farewell,
      legacy,
      heroBaseX,
      heroBaseY,
      companionBaseX,
      companionBaseY,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.farewellCutawayBinding = binding;
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateFarewellCutawayAnimation(): void {
    const binding = this.farewellCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectFarewellCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.hero.position.set(binding.heroBaseX + frame.heroOffsetX, binding.heroBaseY);
    binding.companion.position.set(
      binding.companionBaseX + frame.companionOffsetX,
      binding.companionBaseY + frame.companionOffsetY,
    );
    binding.companion.alpha = frame.companionAlpha;
    binding.companionRig.puppet.y += frame.companionKneel * 5.5;
    binding.companionRig.puppet.rotation += frame.companionKneel * 0.1;
    binding.companionRig.puppet.scale.set(1, 1 - frame.companionKneel * 0.25);
    binding.companionRig.frontArm.rotation += frame.companionKneel * 0.3;
    binding.companionRig.frontLeg.rotation += frame.companionKneel * 0.76;
    binding.companionRig.rearLeg.rotation -= frame.companionKneel * 0.68;
    binding.journey.alpha = frame.journeyAlpha;
    binding.arrival.alpha = frame.arrivalAlpha;
    binding.farewell.alpha = frame.farewellAlpha;
    binding.legacy.alpha = frame.legacyAlpha;
    this.host.dataset.cutawayPhase = frame.phase;
    this.host.dataset.cutawayHeroPose = "witnessing";
    this.host.dataset.farewellCompanionPose = frame.companionKneel >= 0.95
      ? "injured-rest"
      : frame.companionOffsetX > 20
        ? "departing"
        : "beside-hero";
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= farewellCutawayStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeFarewellCutawayPresentation(binding);
  }

  private completeFarewellCutawayPresentation(binding: FarewellCutawayBinding): void {
    if (this.farewellCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.farewellActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.farewellCutawayBinding = null;
    binding.onComplete();
  }

  private drawTrapCutaway(
    state: WorldState,
    packet: TrapResolutionPacket,
    options: TrapCutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const outcome = trapCutawayOutcome(packet);
    const staging = Object.freeze({
      shot: options.staging.shot,
      flavor: resolveTrapCutawayFlavor(packet, options.staging.flavor),
    });
    const shotLayout = trapCutawayShotLayout(staging.shot);
    const palette = palettes.dungeon;
    this.host.dataset.sceneMode = "dungeon";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = packet.trapKind;
    this.host.dataset.cutawayStage = packet.stage;
    this.host.dataset.cutawayOutcome = outcome;
    this.host.dataset.cutawayCheck = `${packet.attribute}:${packet.skill}+${packet.roll}=${packet.total}:${packet.difficulty}`;
    this.host.dataset.cutawayHealth = `${packet.healthBefore}:${packet.damage}:${packet.healthAfter}:${packet.maxHealth}`;
    this.host.dataset.cutawayExit = String(packet.completedExit);
    this.host.dataset.cutawayQuestDelta = String(packet.crossMazeDelta);

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x090e14));
    this.worldLayer.addChild(rect(0, 119, designWidth, 61, 0x202a2d));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 119)
      .lineTo(320, 119)
      .stroke({ color: 0x705e4a, width: 2, alpha: 0.88 }));
    for (let column = 0; column < 12; column += 1) {
      const x = 8 + column * 28 + (column % 2) * 5;
      this.worldLayer.addChild(new Graphics()
        .moveTo(x, 24)
        .lineTo(x + 19, 24)
        .lineTo(x + 19, 42)
        .stroke({ color: 0x29343a, width: 1, alpha: 0.46 }));
    }
    this.lightLayer.addChild(circle(shotLayout.lightX, 108, shotLayout.lightRadius, outcome === "sprung" ? 0xb44b4f : 0xd09b57, 0.08));

    const title = this.createScaleSensitiveText(
      packet.commandType === "enter-dungeon"
        ? "THRESHOLD CHECK"
        : packet.stage === "detect"
          ? "HAZARD CHECK"
          : "DISARM ATTEMPT",
      { fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0xd6bd8f, fontWeight: "900", letterSpacing: 0.9 },
    );
    title.position.set(11, 9);
    const mechanismName = this.createScaleSensitiveText(
      dungeonTrapKindLabel(packet.trapKind).toUpperCase(),
      { fontFamily: "Georgia, serif", fontSize: 11, fill: 0xffe4a6, fontWeight: "800", letterSpacing: 0.7 },
    );
    mechanismName.position.set(10, 19);
    this.worldLayer.addChild(title, mechanismName);

    const heroBaseX = shotLayout.heroX;
    const heroBaseY = shotLayout.heroY;
    const hero = this.drawHero(state, heroBaseX, heroBaseY, palette, shotLayout.heroScale);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Trap cutaway hero rig is missing");

    const mechanism = new Container();
    const resolvedMechanism = new Container();
    mechanism.position.set(shotLayout.mechanismX, shotLayout.mechanismY);
    mechanism.scale.set(shotLayout.mechanismScale);
    resolvedMechanism.position.copyFrom(mechanism.position);
    resolvedMechanism.scale.set(shotLayout.mechanismScale);
    if (packet.trapKind === "tripwire") {
      mechanism.addChild(
        rect(-34, -19, 5, 29, 0x6c5440),
        rect(29, -16, 5, 26, 0x6c5440),
        new Graphics().moveTo(-30, -7).bezierCurveTo(-13, -13, 9, -2, 30, -8).stroke({ color: 0xd5bd82, width: 1.2, alpha: 0.95 }),
        new Graphics().moveTo(-30, -5).bezierCurveTo(-9, -10, 11, 1, 30, -6).stroke({ color: 0x8d543f, width: 0.8, alpha: 0.9 }),
      );
      for (const markerX of [-19, -5, 11, 23]) {
        mechanism.addChild(new Graphics().moveTo(markerX, -10).lineTo(markerX + 2, -2).stroke({ color: 0xe8d69e, width: 0.7, alpha: 0.82 }));
      }
      if (outcome === "disarmed") {
        resolvedMechanism.addChild(new Graphics().moveTo(-30, -5).bezierCurveTo(-8, 19, 12, 18, 30, -4).stroke({ color: 0x91c6a5, width: 1.5, alpha: 0.98 }));
        resolvedMechanism.addChild(circle(1, 10, 2.2, 0xcce8c9));
      } else if (outcome === "sprung") {
        resolvedMechanism.addChild(new Graphics().moveTo(-30, -5).lineTo(-4, 3).moveTo(5, -10).lineTo(30, -6).stroke({ color: 0xe6a063, width: 1.6 }));
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = ray * Math.PI / 4;
          resolvedMechanism.addChild(new Graphics().moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5 - 5).lineTo(Math.cos(angle) * 18, Math.sin(angle) * 15 - 5).stroke({ color: 0xffc56b, width: 1.2, alpha: 0.9 }));
        }
      } else {
        resolvedMechanism.addChild(new Graphics().poly([0, -17, 7, -7, 0, 3, -7, -7]).stroke({ color: 0xffe19a, width: 1.4 }));
      }
    } else {
      mechanism.addChild(new Graphics()
        .ellipse(0, -4, 34, 13)
        .ellipse(2, -5, 24, 9)
        .ellipse(-2, -4, 14, 5)
        .stroke({ color: 0xb79ad4, width: 1.3, alpha: 0.94 }));
      mechanism.addChild(new Graphics().moveTo(-28, -13).lineTo(-19, -5).moveTo(23, 2).lineTo(32, 8).stroke({ color: 0xe2c9f0, width: 1 }));
      if (outcome === "disarmed") {
        resolvedMechanism.addChild(new Graphics()
          .ellipse(0, -4, 34, 13)
          .ellipse(2, -5, 24, 9)
          .stroke({ color: 0x91c6a5, width: 1.4, alpha: 0.95 }));
        resolvedMechanism.addChild(rect(14, -18, 12, 10, 0x202a2d));
        resolvedMechanism.addChild(new Graphics().moveTo(13, -10).lineTo(21, -17).stroke({ color: 0xcce8c9, width: 1.3 }));
      } else if (outcome === "sprung") {
        resolvedMechanism.addChild(new Graphics().moveTo(-27, -17).lineTo(28, 10).moveTo(-25, 11).lineTo(26, -18).stroke({ color: 0xffbd72, width: 2 }));
      } else {
        resolvedMechanism.addChild(new Graphics().poly([0, -22, 12, -5, 0, 12, -12, -5]).stroke({ color: 0xffe19a, width: 1.5 }));
      }
    }
    this.worldLayer.addChild(mechanism, resolvedMechanism);

    const flourish = new Container();
    flourish.alpha = 0;
    if (staging.flavor === "boot-stop") {
      flourish.position.set(heroBaseX + 13, heroBaseY + 8);
      flourish.addChild(
        new Graphics().moveTo(-3, 1).bezierCurveTo(0, -3, 4, -3, 7, 0).stroke({ color: 0xd5bd82, width: 0.8, alpha: 0.78 }),
        circle(9, -1, 1.2, 0xd5bd82, 0.68),
      );
    } else if (staging.flavor === "wire-curl") {
      flourish.position.copyFrom(mechanism.position);
      flourish.scale.set(shotLayout.mechanismScale);
      flourish.addChild(new Graphics()
        .moveTo(4, 7)
        .bezierCurveTo(17, 16, 23, 3, 13, 1)
        .bezierCurveTo(5, -1, 5, 8, 13, 8)
        .stroke({ color: 0xcce8c9, width: 1, alpha: 0.9 }));
    } else if (staging.flavor === "rune-wobble") {
      flourish.position.copyFrom(mechanism.position);
      flourish.scale.set(shotLayout.mechanismScale);
      flourish.addChild(new Graphics()
        .ellipse(0, -4, 40, 17)
        .ellipse(0, -4, 46, 21)
        .stroke({ color: 0xd9b9ef, width: 0.7, alpha: 0.58 }));
    }
    this.worldLayer.addChild(flourish);

    const check = new Container();
    check.position.set(108, 58);
    check.addChild(rect(0, 0, 184, 25, 0x141c23, 0.96));
    const checkLabel = this.createScaleSensitiveText(
      `${packet.attribute.toUpperCase()} · ${packet.skill} + ${packet.roll} = ${packet.total}  /  ${packet.difficulty}`,
      { fontFamily: "ui-monospace, monospace", fontSize: 7, fill: 0xf4ead5, fontWeight: "800", letterSpacing: 0.35 },
    );
    checkLabel.position.set(8, 8);
    check.addChild(checkLabel);
    this.worldLayer.addChild(check);

    const result = new Container();
    result.position.set(108, 86);
    result.addChild(rect(0, 0, 184, 25, outcome === "sprung" ? 0x5b2228 : outcome === "disarmed" ? 0x234a3a : 0x5b4820, 0.98));
    const resultLabel = this.createScaleSensitiveText(outcome.toUpperCase(), {
      fontFamily: "Inter, sans-serif", fontSize: 9, fill: outcome === "sprung" ? 0xffcc82 : outcome === "disarmed" ? 0xcce8c9 : 0xffe19a, fontWeight: "900", letterSpacing: 1.3,
    });
    resultLabel.position.set(8, 6);
    const phaseLabel = this.createScaleSensitiveText(`${packet.phaseBefore.toUpperCase()} → ${packet.phaseAfter.toUpperCase()}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4.7, fill: 0xf4ead5, fontWeight: "700", letterSpacing: 0.25,
    });
    phaseLabel.position.set(86, 9);
    result.addChild(resultLabel, phaseLabel);
    this.worldLayer.addChild(result);

    const consequence = new Container();
    consequence.position.set(108, 114);
    consequence.addChild(rect(0, 0, 184, 39, 0x10171d, 0.96));
    const hp = this.createScaleSensitiveText(
      `HP ${packet.healthBefore} → ${packet.healthAfter}${packet.damage > 0 ? `  (−${packet.damage})` : "  (NO DAMAGE)"}`,
      { fontFamily: "Inter, sans-serif", fontSize: 6.2, fill: packet.healthAfter === 0 ? 0xffa8aa : 0xe8edf2, fontWeight: "800" },
    );
    hp.position.set(8, 6);
    const progress = this.createScaleSensitiveText(
      `${packet.completedExit ? "EXIT REACHED" : "MAZE CONTINUES"} · QUEST ${packet.crossMazeDelta > 0 ? `+${packet.crossMazeDelta}` : "UNCHANGED"}`,
      { fontFamily: "ui-monospace, monospace", fontSize: 4.7, fill: 0xb8c8d2, fontWeight: "700", letterSpacing: 0.2 },
    );
    progress.position.set(8, 20);
    consequence.addChild(hp, progress);
    this.worldLayer.addChild(consequence);

    const binding: TrapCutawayBinding = {
      packet,
      staging,
      hero,
      heroRig,
      mechanism,
      resolvedMechanism,
      flourish,
      check,
      result,
      consequence,
      heroBaseX,
      heroBaseY,
      mechanismBaseScale: shotLayout.mechanismScale,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion || staging.shot === "static-tableau",
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.trapCutawayBinding = binding;
    this.host.dataset.cutawayFlavor = staging.flavor;
    this.host.dataset.cutawayShot = staging.shot;
    this.host.dataset.cutawayFlourish = staging.flavor === "none" ? "none" : "present";
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateTrapCutawayAnimation(): void {
    const binding = this.trapCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectTrapCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
      binding.staging.flavor,
    );
    binding.hero.position.set(binding.heroBaseX + frame.heroOffsetX, binding.heroBaseY + frame.heroOffsetY);
    binding.heroRig.puppet.y += frame.heroKneel * 5.5;
    binding.heroRig.puppet.rotation += frame.heroKneel * 0.08;
    binding.heroRig.puppet.scale.set(1, 1 - frame.heroKneel * 0.24);
    binding.heroRig.frontArm.rotation += frame.armRotation + frame.heroKneel * 0.34;
    binding.heroRig.rearArm.rotation -= frame.heroKneel * 0.22;
    binding.heroRig.frontLeg.rotation += frame.heroKneel * 0.78;
    binding.heroRig.rearLeg.rotation -= frame.heroKneel * 0.72;
    binding.mechanism.alpha = frame.mechanismAlpha * (frame.resultAlpha > 0 && frame.outcome !== "spotted" ? 0.2 : 1);
    binding.resolvedMechanism.alpha = frame.resultAlpha;
    binding.resolvedMechanism.scale.set(binding.mechanismBaseScale * frame.emphasis);
    binding.check.alpha = frame.checkAlpha;
    binding.result.alpha = frame.resultAlpha;
    binding.consequence.alpha = frame.consequenceAlpha;
    binding.flourish.alpha = frame.flavorAlpha;
    if (frame.flavor === "rune-wobble" && frame.phase === "consequence") {
      binding.resolvedMechanism.rotation = Math.sin(elapsed * 9) * 0.035;
      binding.flourish.rotation = binding.resolvedMechanism.rotation * -0.65;
    } else {
      binding.resolvedMechanism.rotation = 0;
      binding.flourish.rotation = 0;
    }
    this.host.dataset.cutawayHeroPose = frame.heroKneel >= 0.95
      ? "kneeling"
      : frame.heroKneel > 0
        ? "staggering"
        : "upright";
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= trapCutawayStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeTrapCutawayPresentation(binding);
  }

  private completeTrapCutawayPresentation(binding: TrapCutawayBinding): void {
    if (this.trapCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.trapCutawayBinding = null;
    binding.onComplete();
  }

  private drawHeroGrowthAllocationCutaway(
    state: WorldState,
    packet: HeroGrowthAllocationPacketV1,
    options: HeroGrowthAllocationCutawayPresentationOptions,
  ): void {
    const first = packet.selections[0];
    const last = packet.selections.at(-1);
    if (first === undefined || last === undefined) throw new Error("Growth allocation packet has no persisted selection");
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const accent = 0x7dddc7;
    const palette = palettes.chronicle;
    const attributeOrder = ["strength", "agility", "vitality", "intellect", "spirit", "luck"] as const;
    const attributeLabels = ["STR", "AGI", "VIT", "INT", "SPI", "LCK"] as const;
    const deltaValues = (delta: HeroGrowthAllocationPacketV1["growthDerivedDelta"]): string =>
      [delta.power, delta.armor, delta.initiative, delta.maxHealth, delta.maxMana].join(":");
    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "hero-growth-allocation";
    this.host.dataset.cutawayOutcome = packet.applicationTiming;
    this.host.dataset.growthAllocationActive = "true";
    this.host.dataset.growthAllocationId = packet.applicationId;
    this.host.dataset.growthAllocationHero = packet.heroId;
    this.host.dataset.growthAllocationTiming = packet.applicationTiming;
    this.host.dataset.growthAllocationRecords = packet.selections.map((selection) => selection.record.id).join("|");
    this.host.dataset.growthAllocationCheckpoints = packet.selections.map((selection) => selection.record.checkpointLevel).join(":");
    this.host.dataset.growthAllocationCandidates = packet.selections.map((selection) =>
      `L${selection.record.checkpointLevel}:${selection.record.candidates.map((candidate) => candidate.packageId).join(",")}`
    ).join("|");
    this.host.dataset.growthAllocationSelected = packet.selections.map((selection) =>
      `L${selection.record.checkpointLevel}:${selection.selectedCandidate.packageId}`
    ).join("|");
    this.host.dataset.growthAllocationRationale = packet.selections.map((selection) =>
      `${selection.record.id}:${selection.record.rationale}`
    ).join("|");
    this.host.dataset.growthAllocationAttributes = attributeOrder.map((attribute) =>
      `${attribute}:${first.attributesBefore[attribute]}:${last.attributesAfter[attribute]}`
    ).join("|");
    this.host.dataset.growthAllocationDerivedTotal = deltaValues(packet.totalDerivedDelta);
    this.host.dataset.growthAllocationDerivedLevel = deltaValues(packet.levelOnlyDerivedDelta);
    this.host.dataset.growthAllocationDerivedGrowth = deltaValues(packet.growthDerivedDelta);
    this.host.dataset.growthAllocationDerivedOther = deltaValues(packet.otherSameBeatDerivedDelta);
    this.host.dataset.growthAllocationResources = packet.selections.map((selection) =>
      `L${selection.record.checkpointLevel}:HP:${selection.resourcesBefore.health}:${selection.resourcesAfter.health}:${selection.resourcesBefore.maxHealth}:${selection.resourcesAfter.maxHealth}:MP:${selection.resourcesBefore.mana}:${selection.resourcesAfter.mana}:${selection.resourcesBefore.maxMana}:${selection.resourcesAfter.maxMana}`
    ).join("|");
    this.host.dataset.growthAllocationEquipment = packet.equipmentAfter.map((item) => `${item.slot}:${item.itemId}`).join("|") || "none";

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x0d1822));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 119)
      .bezierCurveTo(58, 84, 109, 129, 164, 78)
      .bezierCurveTo(214, 35, 267, 91, 320, 49)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: 0x314a4d, alpha: 0.42 }));
    this.worldLayer.addChild(rect(0, 151, designWidth, 29, 0x202f37));

    const kicker = this.createScaleSensitiveText(packet.selectionCount === 1 ? "AUTONOMOUS TURNING POINT" : `${packet.selectionCount} TURNING POINTS · ONE COMMITMENT`, {
      fontFamily: "Inter, sans-serif", fontSize: 5, fill: accent, fontWeight: "900", letterSpacing: 0.9,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(
      packet.selectionCount === 1 ? `LEVEL ${first.record.checkpointLevel} · TURNING POINT ${first.turningPointOrdinal} OF 3` : `LEVELS ${packet.selections.map((selection) => selection.record.checkpointLevel).join(" · ")} · TURNING POINTS ${first.turningPointOrdinal}–${last.turningPointOrdinal} OF 3`,
      { fontFamily: "Georgia, serif", fontSize: 10.5, fill: 0xeafffa, fontWeight: "800", letterSpacing: 0.55 },
    );
    title.position.set(9, 18);
    const rail = this.createScaleSensitiveText(packet.selections.map((selection) =>
      `L${selection.record.checkpointLevel} ${selection.selectedCandidate.label.toUpperCase()}${selection.settlementTiming === "deferred" ? ` · HELD T${selection.record.crossedTick}` : ""}`
    ).join("  →  "), {
      fontFamily: "ui-monospace, monospace", fontSize: 4.1, fill: 0xb9d8d2, fontWeight: "700", letterSpacing: 0.15,
    });
    rail.position.set(10, 34);
    this.worldLayer.addChild(kicker, title, rail);

    const heroBaseX = 67;
    const heroBaseY = 151;
    const glow = new Container();
    glow.position.set(heroBaseX, 114);
    glow.addChild(circle(0, 0, 38, accent, 0.1), circle(0, 0, 24, accent, 0.13));
    this.worldLayer.addChild(glow);
    const ring = new Graphics();
    ring.position.set(heroBaseX, 114);
    this.worldLayer.addChild(ring);
    const hero = this.drawHero(state, heroBaseX, heroBaseY, palette, 1.16);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Growth allocation hero rig is missing");
    heroRig.mode = "chronicle";

    const candidatePanels = packet.selections.map((selection, selectionIndex) => selection.record.candidates.map((candidate, candidateIndex) => {
      const chosen = candidate.packageId === selection.record.selectedPackageId;
      const panel = new Container();
      const width = selection.record.candidates.length === 2 ? 50 : 32;
      const gap = 4;
      panel.position.set(136 + candidateIndex * (width + gap), 44);
      panel.addChild(rect(0, 0, width, 34, chosen ? 0x214f49 : 0x111c28, 0.96));
      const motif = new Graphics();
      if (candidate.packageId === "growth-v1:field-temper") {
        motif.poly([3, 17, 7, 13, 11, 17, 7, 21]).fill({ color: 0xe3aa78, alpha: 0.94 });
      } else if (candidate.packageId === "growth-v1:road-rhythm") {
        motif.moveTo(3, 13).lineTo(8, 17).lineTo(3, 21).moveTo(7, 13).lineTo(12, 17).lineTo(7, 21).stroke({ color: 0x8fd3e3, width: 1.1 });
      } else {
        motif.circle(7, 17, 4).circle(7, 17, 1.5).stroke({ color: 0xc7a7f0, width: 0.9 });
      }
      const label = this.createScaleSensitiveText(candidate.label.toUpperCase(), {
        fontFamily: "Inter, sans-serif", fontSize: selection.record.candidates.length === 2 ? 2.8 : 2.25, fill: chosen ? 0xeafffa : 0xd2dce4, fontWeight: "900", letterSpacing: 0.08,
      });
      label.position.set(13, 14);
      const affected = attributeOrder.flatMap((attribute, index) => candidate.attributeDeltas[attribute] === 0 ? [] : [`${attributeLabels[index]}+${candidate.attributeDeltas[attribute]}`]).join(" ");
      const facts = this.createScaleSensitiveText(`${affected} · F${candidate.score}`, {
        fontFamily: "ui-monospace, monospace", fontSize: selection.record.candidates.length === 2 ? 2.35 : 1.9, fill: 0xaebcc7, fontWeight: "700",
      });
      facts.position.set(3, 25);
      const stateLabel = this.createScaleSensitiveText(chosen ? "CHOSEN" : "CONSIDERED", {
        fontFamily: "Inter, sans-serif", fontSize: 1.9, fill: chosen ? accent : 0x82919f, fontWeight: "900", letterSpacing: 0.25,
      });
      stateLabel.position.set(3, 3);
      panel.addChild(motif, label, facts, stateLabel);
      panel.visible = selectionIndex === 0;
      this.worldLayer.addChild(panel);
      return panel;
    }));

    const attributeCells = attributeOrder.map((attribute, index) => {
      const attributeLabel = attributeLabels[index];
      if (attributeLabel === undefined) throw new Error("Growth allocation attribute label is missing");
      const cell = new Container();
      cell.position.set(136 + index * 17.2, 82);
      cell.addChild(rect(0, 0, 16, 22, first.attributesBefore[attribute] === last.attributesAfter[attribute] ? 0x111a24 : 0x1d453f, 0.96));
      const label = this.createScaleSensitiveText(attributeLabel, {
        fontFamily: "Inter, sans-serif", fontSize: 2.6, fill: first.attributesBefore[attribute] === last.attributesAfter[attribute] ? 0x82919f : accent, fontWeight: "900", letterSpacing: 0.2,
      });
      label.position.set(2.5, 3);
      const value = this.createScaleSensitiveText(`${first.attributesBefore[attribute]}→${last.attributesAfter[attribute]}`, {
        fontFamily: "ui-monospace, monospace", fontSize: 2.7, fill: 0xf1f7f6, fontWeight: "800",
      });
      value.position.set(2.5, 12);
      cell.addChild(label, value);
      this.worldLayer.addChild(cell);
      return cell;
    });

    const makeMarker = (): HeroGrowthAllocationMarker => {
      const layer = new Container();
      layer.addChild(circle(0, 0, 5.2, accent, 0.95), circle(0, 0, 7.8, accent, 0.16));
      const label = this.createScaleSensitiveText("+1", {
        fontFamily: "ui-monospace, monospace", fontSize: 3.1, fill: 0x061411, fontWeight: "900",
      });
      label.anchor.set(0.5);
      layer.addChild(label);
      layer.alpha = 0;
      this.worldLayer.addChild(layer);
      return { layer, label };
    };
    const markers = [makeMarker(), makeMarker()] as const;

    const makeFactPanel = (y: number, label: string, value: string, color: number): Container => {
      const panel = new Container();
      panel.position.set(136, y);
      panel.addChild(rect(0, 0, 104, 20, 0x0b131c, 0.96));
      const heading = this.createScaleSensitiveText(label, {
        fontFamily: "Inter, sans-serif", fontSize: 2.35, fill: color, fontWeight: "900", letterSpacing: 0.25,
      });
      heading.position.set(3, 3);
      const facts = this.createScaleSensitiveText(value, {
        fontFamily: "ui-monospace, monospace", fontSize: 2.1, fill: 0xe9f0f2, fontWeight: "700",
      });
      facts.position.set(3, 12);
      panel.addChild(heading, facts);
      this.worldLayer.addChild(panel);
      return panel;
    };
    const mechanics = makeFactPanel(107, "DERIVED · G / L / O / TOTAL", [packet.growthDerivedDelta, packet.levelOnlyDerivedDelta, packet.otherSameBeatDerivedDelta, packet.totalDerivedDelta].map(deltaValues).join(" / "), 0x9bd8ca);
    const resources = makeFactPanel(129, "GROWTH RESOURCES · NO HEAL · NO REFILL", `HP ${first.resourcesBefore.health}→${last.resourcesAfter.health} STAYS · MAX ${first.resourcesBefore.maxHealth}→${last.resourcesAfter.maxHealth} · MP ${first.resourcesBefore.mana}→${last.resourcesAfter.mana} STAYS · MAX ${first.resourcesBefore.maxMana}→${last.resourcesAfter.maxMana}`, 0xf0ca83);
    const equipment = packet.equipmentAfter.length === 0 ? "NO EQUIPPED ITEMS" : packet.equipmentAfter.slice(0, 1).map((item) => item.itemName.toUpperCase()).join(" · ") + (packet.equipmentAfter.length > 1 ? ` · +${packet.equipmentAfter.length - 1}` : "");
    const tableau = makeFactPanel(151, `FINAL EQUIPPED BUILD · TURNING POINT ${last.turningPointOrdinal} OF 3`, `${last.selectedCandidate.label.toUpperCase()} · ${equipment}`, accent);

    this.heroGrowthAllocationCutawayBinding = {
      packet,
      hero,
      heroRig,
      glow,
      ring,
      candidatePanels,
      attributeCells,
      markers,
      mechanics,
      resources,
      tableau,
      heroBaseX,
      heroBaseY,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateHeroGrowthAllocationCutawayAnimation(): void {
    const binding = this.heroGrowthAllocationCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectHeroGrowthAllocationCutawayFrame(
      binding.packet.selectionCount,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    const selection = binding.packet.selections[frame.activeAllocationIndex];
    if (selection === undefined) throw new Error("Growth allocation animation lost its active persisted record");
    const selectedIndex = selection.record.candidates.findIndex((candidate) => candidate.packageId === selection.record.selectedPackageId);
    const changedAttributes = (["strength", "agility", "vitality", "intellect", "spirit", "luck"] as const)
      .flatMap((attribute, index) => selection.selectedCandidate.attributeDeltas[attribute] === 0 ? [] : [{ attribute, index }]);
    if (selectedIndex < 0 || changedAttributes.length !== 2) throw new Error("Growth allocation animation requires one selected path and two attributes");
    for (const [selectionIndex, panels] of binding.candidatePanels.entries()) {
      for (const [candidateIndex, panel] of panels.entries()) {
        panel.visible = selectionIndex === frame.activeAllocationIndex;
        panel.alpha = frame.optionsAlpha * (candidateIndex === selectedIndex ? 1 : frame.unselectedAlpha);
        panel.scale.set(candidateIndex === selectedIndex ? frame.selectedScale : 1);
      }
    }
    const selectedPanel = binding.candidatePanels[frame.activeAllocationIndex]?.[selectedIndex];
    if (selectedPanel === undefined) throw new Error("Growth allocation selected panel is missing");
    for (const [markerIndex, marker] of binding.markers.entries()) {
      const changed = changedAttributes[markerIndex];
      const target = changed === undefined ? undefined : binding.attributeCells[changed.index];
      if (changed === undefined || target === undefined) throw new Error("Growth allocation marker target is missing");
      const startX = selectedPanel.x + selectedPanel.width / 2;
      const startY = selectedPanel.y + selectedPanel.height - 2;
      const endX = target.x + target.width / 2;
      const endY = target.y + target.height / 2;
      marker.label.text = ["STR", "AGI", "VIT", "INT", "SPI", "LCK"][changed.index] ?? "+1";
      marker.layer.position.set(
        startX + (endX - startX) * frame.allocationProgress,
        startY + (endY - startY) * frame.allocationProgress,
      );
      marker.layer.alpha = frame.phase === "allocation" && !binding.staticPresentation ? 1 : 0;
    }
    binding.hero.position.set(binding.heroBaseX, binding.heroBaseY - frame.heroLift);
    binding.hero.scale.set(1.16 * frame.heroScale);
    binding.glow.alpha = frame.glowAlpha;
    binding.ring.clear().arc(0, 0, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.ringProgress)
      .stroke({ color: 0x7dddc7, width: 1.8, alpha: 0.88 });
    binding.mechanics.alpha = frame.mechanicsAlpha;
    binding.resources.alpha = frame.resourcesAlpha;
    binding.tableau.alpha = frame.tableauAlpha;
    this.host.dataset.growthAllocationActiveRecord = selection.record.id;
    this.host.dataset.growthAllocationMarkerLabels = changedAttributes.map((changed) => ["STR", "AGI", "VIT", "INT", "SPI", "LCK"][changed.index]).join(":");
    this.host.dataset.growthAllocationHeroBounds = [
      binding.heroBaseX - 24,
      binding.heroBaseY - 58 - frame.heroLift,
      48,
      76,
    ].map((value) => value.toFixed(2)).join(":");
    this.host.dataset.cutawayHeroPose = frame.heroLift > 5 ? "receiving" : frame.phase === "deed" ? "ready" : "resolved";
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= heroGrowthAllocationStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeHeroGrowthAllocationCutawayPresentation(binding);
  }

  private completeHeroGrowthAllocationCutawayPresentation(binding: HeroGrowthAllocationCutawayBinding): void {
    if (this.heroGrowthAllocationCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.growthAllocationActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.heroGrowthAllocationCutawayBinding = null;
    binding.onComplete();
  }

  private drawAbilityResonanceCutaway(
    state: WorldState,
    packet: AbilityResonancePacketV1,
    options: CutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const accent = abilityEffectColor(packet.effect);
    const palette = palettes.chronicle;
    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "ability-resonance";
    this.host.dataset.cutawayOutcome = "mastered";
    this.host.dataset.abilityResonanceActive = "true";
    this.host.dataset.abilityResonanceHero = packet.heroId;
    this.host.dataset.abilityResonanceAbility = packet.abilityId;
    this.host.dataset.abilityResonanceKind = packet.abilityKind;
    this.host.dataset.abilityResonanceEffect = packet.effect;
    this.host.dataset.abilityResonanceSource = packet.sourceKind;
    this.host.dataset.abilityResonanceExperience = `${packet.experienceBefore}:${packet.experienceDelta}:${packet.experienceAfter}`;
    this.host.dataset.abilityResonanceUses = `${packet.usesBefore}:${packet.usesAfter}`;
    this.host.dataset.abilityResonanceTiming = `${packet.crossingActionLevel ?? "none"}:${packet.nextUseLevel}`;
    this.host.dataset.abilityResonanceDamageContribution = `${packet.damageLevelContributionBefore}:${packet.damageLevelContributionAfter}`;
    this.host.dataset.abilityResonanceStatusPotency = `${packet.statusPotencyBefore ?? "none"}:${packet.statusPotencyAfter ?? "none"}`;
    this.host.dataset.abilityResonanceProvenance = packet.provenanceStatus;
    this.host.dataset.abilityResonanceMonster = packet.sourceMonsterId ?? "none";
    this.host.dataset.abilityResonanceNewAbility = String(packet.newAbilityGranted);
    this.host.dataset.abilityResonanceBranch = String(packet.branchSelected);
    const sourcePresentation = projectAbilityResonanceSourcePresentation(packet.sourceKind);
    const battleSource = packet.sourceKind === "battle-use";
    this.host.dataset.abilityResonancePose = sourcePresentation.pose;
    this.host.dataset.abilityResonanceSourceCue = sourcePresentation.cue;
    this.host.dataset.abilityResonanceHeroBounds = "44,88,50,69";
    this.host.dataset.abilityResonanceGlyphBounds = "94,67,44,52";
    this.host.dataset.abilityResonanceFactBounds = "151,43,159,131";
    const resonanceAppearance = projectHeroAppearance(state.depth.hero);
    const resonanceSlots = ["weapon", "offhand", "head", "body", "feet", "charm"] as const;
    this.host.dataset.abilityResonanceEquipment = resonanceSlots
      .map((slot) => `${slot}:${state.depth.hero.equipment[slot] ?? "none"}`)
      .join("|");
    this.host.dataset.abilityResonanceGearSilhouettes = resonanceSlots
      .map((slot) => `${slot}:${resonanceAppearance[slot]?.silhouette ?? "none"}`)
      .join("|");

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x111225));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 124)
      .bezierCurveTo(60, 87, 112, 126, 165, 75)
      .bezierCurveTo(218, 37, 271, 96, 320, 53)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: 0x42385f, alpha: 0.46 }));
    this.worldLayer.addChild(rect(0, 151, designWidth, 29, 0x24233b));
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = ray * Math.PI / 6;
      this.worldLayer.addChild(new Graphics()
        .moveTo(73 + Math.cos(angle) * 24, 108 + Math.sin(angle) * 24)
        .lineTo(73 + Math.cos(angle) * 47, 108 + Math.sin(angle) * 47)
        .stroke({ color: accent, width: ray % 2 === 0 ? 1.2 : 0.7, alpha: 0.2 }));
    }

    const kicker = this.createScaleSensitiveText("ABILITY MASTERY · FINAL THRESHOLD", {
      fontFamily: "Inter, sans-serif", fontSize: 5, fill: 0x8fe3d1, fontWeight: "900", letterSpacing: 0.85,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(packet.abilityName.toUpperCase(), {
      fontFamily: "Georgia, serif", fontSize: 11.5, fill: 0xeee8ff, fontWeight: "800", letterSpacing: 0.55,
    });
    title.position.set(9, 18);
    const byline = this.createScaleSensitiveText(`${packet.heroName.toUpperCase()} · ${packet.abilityKind.toUpperCase()} · ${packet.effect.toUpperCase()}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4.1, fill: 0xc7c0d6, fontWeight: "700", letterSpacing: 0.15,
    });
    byline.position.set(10, 34);
    this.worldLayer.addChild(kicker, title, byline);

    const heroBaseX = 69;
    const heroBaseY = 150;
    const glow = new Container();
    glow.position.set(heroBaseX, 111);
    glow.addChild(circle(0, 0, 38, accent, 0.1), circle(0, 0, 24, accent, 0.13));
    this.worldLayer.addChild(glow);
    const hero = this.drawHero(state, heroBaseX, heroBaseY, palette, 1.16);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Ability resonance hero rig is missing");
    heroRig.mode = sourcePresentation.rigMode;

    const sourceCue = new Container();
    sourceCue.position.set(battleSource ? 94 : heroBaseX, battleSource ? 112 : 151);
    if (battleSource) {
      const chevrons = new Graphics();
      for (let index = 0; index < 3; index += 1) {
        const x = index * 8;
        chevrons
          .moveTo(x - 5, -7)
          .lineTo(x + 2, 0)
          .lineTo(x - 5, 7)
          .stroke({ color: accent, width: 2.3 - index * 0.35, alpha: 0.9 - index * 0.17 });
      }
      const cueLabel = this.createScaleSensitiveText(sourcePresentation.label, {
        fontFamily: "Inter, sans-serif", fontSize: 3.1, fill: 0xf1ecff, fontWeight: "900", letterSpacing: 0.55,
      });
      cueLabel.anchor.set(0.5);
      cueLabel.position.set(7, 13);
      sourceCue.addChild(chevrons, cueLabel);
    } else {
      sourceCue.position.set(94, 143);
      const rings = new Graphics()
        .ellipse(0, 0, 27, 7)
        .ellipse(0, 0, 18, 4.5)
        .moveTo(-30, 0)
        .lineTo(30, 0)
        .stroke({ color: accent, width: 1.45, alpha: 0.95 });
      const trace = new Graphics()
        .moveTo(-14, -3)
        .quadraticCurveTo(-6, -13, 1, -4)
        .quadraticCurveTo(8, 5, 15, -5)
        .stroke({ color: 0xf1ecff, width: 0.9, alpha: 0.72 });
      const cueLabel = this.createScaleSensitiveText(sourcePresentation.label, {
        fontFamily: "Inter, sans-serif", fontSize: 3.1, fill: 0xf1ecff, fontWeight: "900", letterSpacing: 0.55,
      });
      cueLabel.anchor.set(0.5);
      cueLabel.position.set(0, 11);
      sourceCue.addChild(rings, trace, cueLabel);
    }
    this.worldLayer.addChild(sourceCue);

    const glyph = new Container();
    glyph.position.set(116, 91);
    const glyphShape = new Graphics();
    if (packet.effect === "arcane") {
      glyphShape.circle(0, 0, 11).circle(0, 0, 4).moveTo(-15, 0).lineTo(15, 0).moveTo(0, -15).lineTo(0, 15).stroke({ color: accent, width: 1.6 });
    } else if (packet.effect === "burning") {
      glyphShape.moveTo(0, -16).bezierCurveTo(11, -5, 8, 3, 3, 9).bezierCurveTo(11, 7, 9, 17, 0, 18).bezierCurveTo(-11, 15, -10, 5, -3, -2).bezierCurveTo(-5, -8, -2, -11, 0, -16).fill({ color: accent, alpha: 0.9 });
    } else if (packet.effect === "poison") {
      glyphShape.circle(-7, 3, 7).circle(5, -5, 9).circle(8, 10, 5).fill({ color: accent, alpha: 0.75 });
    } else if (packet.effect === "weaken") {
      glyphShape.moveTo(-15, -10).lineTo(-4, -3).lineTo(-10, 3).lineTo(2, 8).lineTo(-2, 15).moveTo(2, -15).lineTo(10, -7).lineTo(5, 1).lineTo(15, 8).stroke({ color: accent, width: 2.2 });
    } else {
      glyphShape.poly([0, -17, 7, -3, 4, 16, 0, 10, -4, 16, -7, -3]).fill({ color: accent, alpha: 0.9 });
    }
    const glyphLabel = this.createScaleSensitiveText(packet.effect.toUpperCase(), {
      fontFamily: "Inter, sans-serif", fontSize: 3.2, fill: 0xf1ecff, fontWeight: "900", letterSpacing: 0.5,
    });
    glyphLabel.anchor.set(0.5);
    glyphLabel.position.set(0, 24);
    glyph.addChild(glyphShape, glyphLabel);
    this.worldLayer.addChild(glyph);

    const oldLevel = this.createScaleSensitiveText("19", {
      fontFamily: "Georgia, serif", fontSize: 13, fill: 0x9289a5, fontWeight: "800",
    });
    oldLevel.anchor.set(0.5);
    oldLevel.position.set(104, 132);
    const arrow = this.createScaleSensitiveText("→", {
      fontFamily: "Inter, sans-serif", fontSize: 8, fill: 0x8fe3d1, fontWeight: "900",
    });
    arrow.anchor.set(0.5);
    arrow.position.set(118, 132);
    const newLevel = this.createScaleSensitiveText("20", {
      fontFamily: "Georgia, serif", fontSize: 17, fill: accent, fontWeight: "900",
    });
    newLevel.anchor.set(0.5);
    newLevel.position.set(135, 130);
    this.worldLayer.addChild(oldLevel, arrow, newLevel);

    const makeFactPanel = (y: number, label: string, value: string, color: number, height = 27): Container => {
      const panel = new Container();
      panel.position.set(151, y);
      panel.addChild(rect(0, 0, 159, height, 0x0d111b, 0.95));
      const heading = this.createScaleSensitiveText(label, {
        fontFamily: "Inter, sans-serif", fontSize: 3.5, fill: color, fontWeight: "900", letterSpacing: 0.45,
      });
      heading.position.set(6, 4);
      const facts = this.createScaleSensitiveText(value, {
        fontFamily: "ui-monospace, monospace", fontSize: 3.65, fill: 0xf1edf5, fontWeight: "700", letterSpacing: 0.05,
      });
      facts.position.set(6, 14);
      panel.addChild(heading, facts);
      this.worldLayer.addChild(panel);
      return panel;
    };
    const source = makeFactPanel(43, "EXACT SOURCE", packet.sourceKind === "battle-use" ? `BATTLE USE · USES ${packet.usesBefore}→${packet.usesAfter}` : `PRACTICE · USES REMAIN ${packet.usesAfter}`, 0xbba7ff);
    const experience = makeFactPanel(73, "ABILITY XP", `${packet.experienceBefore} + ${packet.experienceDelta} = ${packet.experienceAfter}/${packet.maximumExperience}`, 0x8fe3d1, 31);
    const experienceFill = new Graphics();
    experienceFill.position.set(6, 24);
    experience.addChild(rect(6, 24, 147, 3, 0x2e3448, 1), experienceFill);
    const statusPotency = packet.statusPotencyBefore === null
      ? "STATUS POTENCY —"
      : `STATUS POTENCY ${packet.statusPotencyBefore}→${packet.statusPotencyAfter}`;
    const mastery = makeFactPanel(
      107,
      `KNOWN EFFECT · ${packet.effect.toUpperCase()}`,
      `BASE ${packet.basePotency} · MANA ${packet.manaCost} · UNCHANGED\nLEVEL DAMAGE +${packet.damageLevelContributionBefore}→+${packet.damageLevelContributionAfter} · ${statusPotency}`,
      accent,
    );
    const timing = packet.crossingActionLevel === 19
      ? "CROSSING ACTION L19 · NEXT USE L20"
      : "NO CROSSING ACTION · NEXT USE L20";
    const nextUse = makeFactPanel(137, "ABILITY MASTERED · NO NEW ART · NO BRANCH", timing, 0xf0cf88, 37);

    this.abilityResonanceCutawayBinding = {
      packet,
      hero,
      heroRig,
      glow,
      glyph,
      sourceCue,
      experienceFill,
      oldLevel,
      newLevel,
      source,
      experience,
      mastery,
      nextUse,
      heroBaseX,
      heroBaseY,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: (phase) => options.onPhase(phase),
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateAbilityResonanceCutawayAnimation(): void {
    const binding = this.abilityResonanceCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectAbilityResonanceCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.hero.position.set(binding.heroBaseX, binding.heroBaseY - frame.heroLift);
    binding.hero.scale.set(1.16 * frame.heroScale);
    binding.glow.alpha = frame.glyphAlpha;
    binding.glow.scale.set(0.82 + frame.glyphAlpha * 0.18);
    binding.glyph.alpha = frame.glyphAlpha;
    binding.glyph.scale.set(frame.glyphScale);
    binding.sourceCue.alpha = frame.sourceAlpha;
    binding.sourceCue.scale.set(0.92 + frame.sourceAlpha * 0.08);
    if (frame.sourceCue === "impact-chevrons") {
      binding.sourceCue.x = 92 + frame.sourceMotion * 5;
    } else {
      binding.sourceCue.y = 151 - frame.sourceMotion * 1.5;
    }
    binding.oldLevel.alpha = frame.oldLevelAlpha;
    binding.newLevel.alpha = frame.newLevelAlpha;
    binding.newLevel.scale.set(frame.newLevelScale);
    binding.source.alpha = frame.sourceAlpha;
    binding.source.x = 151 + frame.sourceMotion * (binding.packet.sourceKind === "battle-use" ? 3 : 1.5);
    binding.experience.alpha = frame.experienceAlpha;
    binding.experienceFill.clear().rect(0, 0, 147 * frame.experienceFillProgress, 3).fill({ color: 0x8fe3d1, alpha: 0.95 });
    binding.mastery.alpha = frame.masteryAlpha;
    binding.nextUse.alpha = frame.nextUseAlpha;
    const phasePose = frame.heroLift > 4 ? "resonating" : frame.phase === "source" ? "ready" : "mastered";
    this.host.dataset.cutawayHeroPose = `${frame.sourcePose}-${phasePose}`;
    this.host.dataset.abilityResonancePose = frame.sourcePose;
    this.host.dataset.abilityResonanceSourceCue = frame.sourceCue;
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= abilityResonanceStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeAbilityResonanceCutawayPresentation(binding);
  }

  private completeAbilityResonanceCutawayPresentation(binding: AbilityResonanceCutawayBinding): void {
    if (this.abilityResonanceCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.abilityResonanceActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.abilityResonanceCutawayBinding = null;
    binding.onComplete();
  }

  private drawHeroLevelUpCutaway(
    state: WorldState,
    packet: HeroLevelUpPresentationPacket,
    options: HeroLevelUpCutawayPresentationOptions,
  ): void {
    this.battleBinding = null;
    this.counterDuelBinding = null;
    this.travelRoadBinding = null;
    this.heroRigs.length = 0;
    this.scaleSensitiveTexts.length = 0;
    this.dungeonAlertTexts.length = 0;
    this.clear(this.worldLayer);
    this.clear(this.lightLayer);
    const maximum = packet.emphasis === "maximum";
    const championSeal = packet.schemaVersion === 2 ? packet.championInductionSeal : null;
    const milestone = packet.emphasis !== "standard";
    const accent = maximum ? 0xffe8a3 : milestone ? 0xe2c17d : 0xc9a8ff;
    const palette = palettes.chronicle;
    this.host.dataset.sceneMode = "chronicle";
    this.host.dataset.liveSceneMode = state.scene.mode;
    this.host.dataset.cutawayActive = "true";
    this.host.dataset.cutawayEvent = packet.eventId;
    this.host.dataset.cutawayKind = "hero-level-up";
    this.host.dataset.cutawayOutcome = packet.emphasis;
    this.host.dataset.levelUpActive = "true";
    this.host.dataset.levelUpHero = packet.heroId;
    this.host.dataset.levelUpLevel = `${packet.levelBefore}:${packet.levelAfter}:${packet.levelDelta}`;
    this.host.dataset.levelUpExperience = `${packet.experienceBefore}:${packet.experienceDelta}:${packet.experienceAfter}`;
    this.host.dataset.levelUpThresholds = `${packet.thresholdSpan.firstLevel}:${packet.thresholdSpan.lastLevel}:${packet.thresholdSpan.count}`;
    this.host.dataset.levelUpMechanical = `${packet.mechanicalLevelBefore}:${packet.mechanicalLevelAfter}`;
    this.host.dataset.levelUpLevelEffect = Object.values(packet.levelOnlyDerivedDelta).join(":");
    this.host.dataset.levelUpConcurrentEffect = Object.values(packet.concurrentDerivedDelta).join(":");
    this.host.dataset.levelUpBand = packet.progressionBand;
    this.host.dataset.levelUpEmphasis = packet.emphasis;
    this.host.dataset.levelUpSource = packet.sourceKind;
    this.host.dataset.levelUpNextRequirement = packet.nextLevelRequirement === null ? "maximum" : String(packet.nextLevelRequirement);
    this.host.dataset.levelUpEquipment = packet.equipmentAfter.map((item) => `${item.slot}:${item.itemId}`).join("|") || "none";
    if (championSeal !== null) {
      const induction = championSeal.induction;
      this.host.dataset.hallChampionId = induction.id;
      this.host.dataset.hallChampionHash = induction.contentHash;
      this.host.dataset.hallRecordedTick = String(induction.recordedTick);
      this.host.dataset.hallQualification = induction.qualification;
      this.host.dataset.hallSourceCommandId = championSeal.commandId;
      this.host.dataset.hallSourceCommandType = championSeal.commandType;
      this.host.dataset.hallCompletedQuests = String(championSeal.totalCompletedQuests);
      this.host.dataset.hallEquipmentCount = String(championSeal.archivedEquipmentCount);
      this.host.dataset.hallAbilityCount = String(championSeal.archivedAbilityCount);
      this.host.dataset.hallMechanicalEffect = championSeal.mechanicalEffect;
      this.host.dataset.hallCampaignContinues = String(championSeal.campaignContinues);
    }

    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, maximum ? 0x211c25 : 0x111323));
    this.worldLayer.addChild(new Graphics()
      .moveTo(0, 122)
      .bezierCurveTo(52, 89, 104, 128, 157, 85)
      .bezierCurveTo(207, 44, 262, 93, 320, 51)
      .lineTo(320, 180)
      .lineTo(0, 180)
      .closePath()
      .fill({ color: maximum ? 0x5a4734 : 0x393252, alpha: 0.5 }));
    this.worldLayer.addChild(rect(0, 151, designWidth, 29, maximum ? 0x463927 : 0x26263d));
    for (let ray = 0; ray < 18; ray += 1) {
      const angle = ray * Math.PI / 9;
      const inner = 30;
      const outer = ray % 2 === 0 ? 70 : 55;
      this.worldLayer.addChild(new Graphics()
        .moveTo(80 + Math.cos(angle) * inner, 112 + Math.sin(angle) * inner)
        .lineTo(80 + Math.cos(angle) * outer, 112 + Math.sin(angle) * outer)
        .stroke({ color: accent, width: ray % 2 === 0 ? 1.1 : 0.6, alpha: 0.2 }));
    }

    const kicker = this.createScaleSensitiveText(maximum ? "ETERNAL PROGRESSION · MAXIMUM" : "EXPERIENCE THRESHOLD EARNED", {
      fontFamily: "Inter, sans-serif", fontSize: 5, fill: accent, fontWeight: "900", letterSpacing: 0.9,
    });
    kicker.position.set(10, 8);
    const title = this.createScaleSensitiveText(maximum ? "MAXIMUM REACHED" : `LEVEL ${packet.levelAfter}`, {
      fontFamily: "Georgia, serif", fontSize: 12, fill: maximum ? 0xfff0b8 : 0xf0e3ff, fontWeight: "800", letterSpacing: 0.65,
    });
    title.position.set(9, 18);
    const byline = this.createScaleSensitiveText(`${packet.heroName.toUpperCase()} · ${packet.className.toUpperCase()}`, {
      fontFamily: "ui-monospace, monospace", fontSize: 4.5, fill: 0xc7c0d6, fontWeight: "700", letterSpacing: 0.25,
    });
    byline.position.set(10, 35);
    this.worldLayer.addChild(kicker, title, byline);

    const heroBaseX = 80;
    const heroBaseY = 149;
    const glow = new Container();
    glow.position.set(heroBaseX, 112);
    glow.addChild(circle(0, 0, maximum ? 42 : 36, accent, 0.12), circle(0, 0, maximum ? 26 : 22, accent, 0.13));
    this.worldLayer.addChild(glow);
    const ring = new Graphics();
    ring.position.set(heroBaseX, 112);
    this.worldLayer.addChild(ring);
    const hero = this.drawHero(state, heroBaseX, heroBaseY, palette, 1.18);
    const heroRig = this.heroRigs.at(-1);
    if (heroRig === undefined) throw new Error("Level-up cutaway hero rig is missing");
    heroRig.mode = "chronicle";

    const oldLevel = this.createScaleSensitiveText(String(packet.levelBefore), {
      fontFamily: "Georgia, serif", fontSize: 15, fill: 0x9289a5, fontWeight: "800",
    });
    oldLevel.anchor.set(0.5);
    oldLevel.position.set(29, 75);
    const newLevel = this.createScaleSensitiveText(String(packet.levelAfter), {
      fontFamily: "Georgia, serif", fontSize: packet.levelAfter >= 1_000 ? 18 : 23, fill: accent, fontWeight: "900",
    });
    newLevel.anchor.set(0.5);
    newLevel.position.set(119, 70);
    this.worldLayer.addChild(oldLevel, newLevel);

    const deltaLabel = (values: HeroLevelUpPresentationPacket["levelOnlyDerivedDelta"]): string => {
      const facts = [
        ["PWR", values.power], ["ARM", values.armor], ["INIT", values.initiative],
        ["HP", values.maxHealth], ["MP", values.maxMana],
      ] as const;
      const changed = facts.filter(([, value]) => value !== 0);
      return changed.length === 0
        ? "MECHANICAL PLATEAU"
        : changed.map(([label, value]) => `${label} ${value > 0 ? "+" : ""}${value}`).join(" · ");
    };
    const equipmentLabel = packet.equipmentAfter.length === 0
      ? "NO EQUIPPED ITEMS"
      : packet.equipmentAfter.slice(0, 2).map((item) => item.itemName.toUpperCase()).join(" · ")
        + (packet.equipmentAfter.length > 2 ? ` · +${packet.equipmentAfter.length - 2}` : "");
    const makeFactPanel = (y: number, label: string, value: string, color: number): Container => {
      const panel = new Container();
      panel.position.set(155, y);
      panel.addChild(rect(0, 0, 155, 25, 0x0d111b, 0.94));
      const labelText = this.createScaleSensitiveText(label, {
        fontFamily: "Inter, sans-serif", fontSize: 4.1, fill: color, fontWeight: "900", letterSpacing: 0.72,
      });
      labelText.position.set(7, 4);
      const valueText = this.createScaleSensitiveText(value, {
        fontFamily: "ui-monospace, monospace", fontSize: 4.55, fill: 0xf1edf5, fontWeight: "700", letterSpacing: 0.08,
      });
      valueText.position.set(7, 13);
      panel.addChild(labelText, valueText);
      this.worldLayer.addChild(panel);
      return panel;
    };
    const source = makeFactPanel(43, "SOURCE", `${packet.sourceKind === "quest-reward" ? "QUEST" : packet.commandType.toUpperCase()} · +${packet.experienceDelta} XP`, 0xbaa6dd);
    const threshold = makeFactPanel(
      71,
      "THRESHOLD",
      packet.levelDelta === 1
        ? `${packet.experienceBefore} + ${packet.experienceDelta} = ${packet.experienceAfter} XP`
        : `L${packet.thresholdSpan.firstLevel}@${packet.thresholdSpan.firstRequiredExperience} → L${packet.thresholdSpan.lastLevel}@${packet.thresholdSpan.lastRequiredExperience} · ×${packet.levelDelta}`,
      0xe0c77f,
    );
    const concurrent = deltaLabel(packet.concurrentDerivedDelta);
    const mechanics = makeFactPanel(99, `LEVEL EFFECT · MECH ${packet.mechanicalLevelBefore}→${packet.mechanicalLevelAfter}`, `${deltaLabel(packet.levelOnlyDerivedDelta)}${concurrent === "MECHANICAL PLATEAU" ? "" : ` · SAME BEAT ${concurrent}`}`, 0xaad7c0);
    let hallSeal: Container | null = null;
    const tableau = championSeal === null
      ? makeFactPanel(127, `FINAL BUILD · MASTERY ${packet.masteryAfter}`, equipmentLabel, accent)
      : (() => {
          const induction = championSeal.induction;
          const panel = new Container();
          panel.position.set(155, 125);
          panel.addChild(rect(0, 0, 155, 52, 0x0d111b, 0.96));
          const facts = [
            [`HALL OF CHAMPIONS · EARNED · T${induction.recordedTick}`, 0xffe8a3, 3.75],
            [induction.contentHash, 0xfff3c4, 4.55],
            [`${championSeal.commandType} · Q${championSeal.totalCompletedQuests} · ${championSeal.archivedEquipmentCount} GEAR · ${championSeal.archivedAbilityCount} ARTS`, 0xd8cedc, 3.65],
            ["NO BONUS POWER", 0xffe8a3, 3.9],
            ["ETERNAL CAMPAIGN CONTINUES", 0xaad7c0, 3.7],
          ] as const;
          facts.forEach(([copy, color, size], index) => {
            const line = this.createScaleSensitiveText(copy, {
              fontFamily: index === 1 ? "ui-monospace, monospace" : "Inter, sans-serif",
              fontSize: size,
              fill: color,
              fontWeight: "900",
              letterSpacing: index === 1 ? 0.35 : 0.18,
            });
            line.position.set(7, 3 + index * 9.2);
            panel.addChild(line);
          });
          this.worldLayer.addChild(panel);
          hallSeal = new Container();
          hallSeal.position.set(137, 146);
          hallSeal.addChild(new Graphics()
            .moveTo(0, -14).lineTo(10, -10).lineTo(14, 0).lineTo(10, 10)
            .lineTo(0, 14).lineTo(-10, 10).lineTo(-14, 0).lineTo(-10, -10)
            .closePath().stroke({ color: 0xffe8a3, width: 1.4, alpha: 0.94 })
            .arc(0, 1, 7, Math.PI, 0).stroke({ color: 0xfff3c4, width: 1.15, alpha: 0.9 })
            .moveTo(-7, 1).lineTo(-7, 8).moveTo(7, 1).lineTo(7, 8)
            .stroke({ color: 0xfff3c4, width: 1.15, alpha: 0.9 })
            .moveTo(-5, 10).bezierCurveTo(-3, 5, 3, 5, 5, 10)
            .stroke({ color: 0xaad7c0, width: 1.35, alpha: 0.95 }));
          hallSeal.alpha = 0;
          this.worldLayer.addChild(hallSeal);
          return panel;
        })();

    this.heroLevelUpCutawayBinding = {
      packet,
      hero,
      heroRig,
      glow,
      ring,
      oldLevel,
      newLevel,
      source,
      threshold,
      mechanics,
      tableau,
      hallSeal,
      heroBaseX,
      heroBaseY,
      startedAt: this.elapsed,
      staticPresentation: options.fast || this.reducedMotion,
      onPhase: options.onPhase,
      onComplete: options.onComplete,
      phase: null,
      forceOutcome: false,
      completed: false,
    };
    this.host.dataset.cutawayObjectCount = String(this.worldLayer.children.length + this.lightLayer.children.length);
    this.layout();
  }

  private updateHeroLevelUpCutawayAnimation(): void {
    const binding = this.heroLevelUpCutawayBinding;
    if (binding === null || binding.completed) return;
    const elapsed = Math.max(0, this.elapsed - binding.startedAt);
    const frame = projectHeroLevelUpCutawayFrame(
      binding.packet,
      elapsed,
      binding.staticPresentation,
      binding.forceOutcome,
    );
    binding.hero.position.set(binding.heroBaseX, binding.heroBaseY - frame.heroLift);
    binding.hero.scale.set(1.18 * frame.heroScale);
    binding.glow.alpha = frame.glowAlpha;
    binding.glow.scale.set(0.78 + frame.ringProgress * 0.22);
    binding.ring.clear().arc(0, 0, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.ringProgress)
      .stroke({ color: binding.packet.emphasis === "maximum" ? 0xffe8a3 : 0xc9a8ff, width: 1.8, alpha: 0.9 });
    binding.oldLevel.alpha = frame.oldLevelAlpha;
    binding.newLevel.alpha = frame.newLevelAlpha;
    binding.newLevel.scale.set(frame.newLevelScale);
    binding.source.alpha = frame.sourceAlpha;
    binding.threshold.alpha = frame.thresholdAlpha;
    binding.mechanics.alpha = frame.mechanicsAlpha;
    binding.tableau.alpha = binding.packet.schemaVersion === 2 ? frame.sealAlpha : frame.tableauAlpha;
    if (binding.hallSeal !== null) binding.hallSeal.alpha = frame.sealAlpha;
    this.host.dataset.cutawayHeroPose = frame.heroLift > 5 ? "ascending" : frame.phase === "source" ? "ready" : "triumphant";
    this.host.dataset.cutawayPhase = frame.phase;
    if (binding.phase !== frame.phase) {
      binding.phase = frame.phase;
      binding.onPhase(frame.phase);
    }
    const staticComplete = binding.staticPresentation && elapsed >= heroLevelUpStaticHoldSeconds;
    if (frame.phase === "settled" || staticComplete) this.completeHeroLevelUpCutawayPresentation(binding);
  }

  private completeHeroLevelUpCutawayPresentation(binding: HeroLevelUpCutawayBinding): void {
    if (this.heroLevelUpCutawayBinding !== binding || binding.completed) return;
    binding.completed = true;
    this.host.dataset.cutawayActive = "false";
    this.host.dataset.levelUpActive = "false";
    this.host.dataset.cutawayPhase = "final";
    if (binding.phase !== "final") {
      binding.phase = "final";
      binding.onPhase("final");
    }
    this.heroLevelUpCutawayBinding = null;
    binding.onComplete();
  }

  private layout(): void {
    const baseLayout = calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight);
    const relationshipMobile = this.host.dataset.legacyRelationshipPhase !== undefined && this.app.screen.width <= 760;
    const weaponMemoryTableauVisible = this.weaponMemoryCutawayBinding !== null
      || this.host.dataset.cutawayKind === "weapon-memory";
    const battleSpoilsTableauVisible = this.battleSpoilsCutawayBinding !== null
      || this.host.dataset.cutawayKind === "battle-spoils";
    const townItineraryTableauVisible = this.townItineraryCutawayBinding !== null
      || this.host.dataset.cutawayKind === "town-itinerary";
    const abilityResonanceTableauVisible = this.abilityResonanceCutawayBinding !== null
      || this.host.dataset.cutawayKind === "ability-resonance";
    const reservedTableauVisible = weaponMemoryTableauVisible || battleSpoilsTableauVisible || townItineraryTableauVisible || abilityResonanceTableauVisible;
    const reservedTableauPortrait = reservedTableauVisible
      && this.app.screen.width <= 760
      && this.app.screen.height > 520;
    const reservedTableauWide = reservedTableauVisible && !reservedTableauPortrait;
    const relationshipScale = Math.min(baseLayout.scale, 0.52);
    const portraitStageTop = 72;
    const portraitStageHeight = this.app.screen.height * 0.48;
    const portraitStageY = portraitStageTop + Math.max(
      0,
      (portraitStageHeight - portraitStageTop - designHeight * baseLayout.scale) / 2,
    );
    const wideStageTop = 108;
    const abilityResonanceDesktopRail = abilityResonanceTableauVisible
      && this.app.screen.width > 760
      && this.app.screen.height > 520;
    const wideStageBottomReserve = abilityResonanceDesktopRail ? 170 : 0;
    const wideStageScale = Math.min(
      baseLayout.scale,
      Math.max(0.35, (this.app.screen.height - wideStageTop - wideStageBottomReserve) / designHeight),
    );
    const layout = relationshipMobile
      ? {
          scale: relationshipScale,
          x: (this.app.screen.width - designWidth * relationshipScale) / 2,
          y: 168,
        }
      : reservedTableauPortrait
        ? { ...baseLayout, y: portraitStageY }
      : reservedTableauWide
        ? {
            scale: wideStageScale,
            x: (this.app.screen.width - designWidth * wideStageScale) / 2,
            y: wideStageTop,
          }
      : this.host.dataset.sceneMode === "camp" && this.app.screen.width <= 760
        ? { ...baseLayout, y: 96 }
        : baseLayout;
    if (weaponMemoryTableauVisible && reservedTableauPortrait) this.host.dataset.weaponMemoryPortraitStage = "reserved";
    else delete this.host.dataset.weaponMemoryPortraitStage;
    if (weaponMemoryTableauVisible && reservedTableauWide) this.host.dataset.weaponMemoryWideStage = "below-chrome";
    else delete this.host.dataset.weaponMemoryWideStage;
    if (battleSpoilsTableauVisible && reservedTableauPortrait) this.host.dataset.battleSpoilsPortraitStage = "reserved";
    else delete this.host.dataset.battleSpoilsPortraitStage;
    if (battleSpoilsTableauVisible && reservedTableauWide) this.host.dataset.battleSpoilsWideStage = "below-chrome";
    else delete this.host.dataset.battleSpoilsWideStage;
    if (townItineraryTableauVisible && reservedTableauPortrait) this.host.dataset.townItineraryPortraitStage = "reserved";
    else delete this.host.dataset.townItineraryPortraitStage;
    if (townItineraryTableauVisible && reservedTableauWide) this.host.dataset.townItineraryWideStage = "below-chrome";
    else delete this.host.dataset.townItineraryWideStage;
    if (abilityResonanceTableauVisible && reservedTableauPortrait) this.host.dataset.abilityResonancePortraitStage = "reserved";
    else delete this.host.dataset.abilityResonancePortraitStage;
    if (abilityResonanceTableauVisible && reservedTableauWide) this.host.dataset.abilityResonanceWideStage = "below-chrome";
    else delete this.host.dataset.abilityResonanceWideStage;
    if (abilityResonanceDesktopRail) this.host.dataset.abilityResonanceSemanticRail = "reserved";
    else delete this.host.dataset.abilityResonanceSemanticRail;
    this.host.dataset.sceneLayout = [layout.scale, layout.x, layout.y]
      .map((value) => value.toFixed(4))
      .join(",");
    this.worldLayer.scale.set(layout.scale);
    this.worldLayer.position.set(layout.x, layout.y);
    this.lightLayer.scale.set(layout.scale);
    this.lightBaseY = layout.y;
    this.lightLayer.position.set(layout.x, animatedLayerY(this.lightBaseY, this.elapsed));
    const textResolution = projectedTextResolution(this.app.renderer.resolution, layout.scale);
    for (const text of this.scaleSensitiveTexts) {
      if (text.resolution !== textResolution) text.resolution = textResolution;
    }
    if ((this.heroLevelUpCutawayBinding !== null || this.heroGrowthAllocationCutawayBinding !== null || reservedTableauVisible) && this.scaleSensitiveTexts.length > 0) {
      if (this.heroLevelUpCutawayBinding !== null || this.heroGrowthAllocationCutawayBinding !== null) {
        this.host.dataset.levelUpTextResolution = textResolution.toFixed(4);
      }
      if (weaponMemoryTableauVisible) {
        this.host.dataset.weaponMemoryTextResolution = textResolution.toFixed(4);
      }
      if (battleSpoilsTableauVisible) this.host.dataset.battleSpoilsTextResolution = textResolution.toFixed(4);
      if (townItineraryTableauVisible) this.host.dataset.townItineraryTextResolution = textResolution.toFixed(4);
      if (abilityResonanceTableauVisible) this.host.dataset.abilityResonanceTextResolution = textResolution.toFixed(4);
    }
    if (this.host.dataset.encounterEngine === "counter-triangle" && this.scaleSensitiveTexts.length > 0) {
      this.host.dataset.counterDuelTextResolution = textResolution.toFixed(4);
    }
    if (this.dungeonAlertTexts.length > 0) {
      const bannerResolution = this.dungeonAlertTexts[0]?.resolution;
      const detailResolution = this.dungeonAlertTexts[1]?.resolution;
      if (bannerResolution !== undefined) {
        this.host.dataset.dungeonAlertBannerResolution = bannerResolution.toFixed(4);
        this.host.dataset.dungeonAlertTextResolution = bannerResolution.toFixed(4);
      }
      if (detailResolution !== undefined) {
        this.host.dataset.dungeonAlertDetailResolution = detailResolution.toFixed(4);
      }
    }
  }

  private resizeToHost(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const rendererResolution = Math.min(window.devicePixelRatio, 2);
    const resolutionChanged = this.app.renderer.resolution !== rendererResolution;
    if (resolutionChanged) {
      this.app.renderer.resolution = rendererResolution;
    }
    const dimensionsChanged = this.app.screen.width !== width || this.app.screen.height !== height;
    if (dimensionsChanged || resolutionChanged) {
      this.app.renderer.resize(width, height);
    }
    this.host.dataset.rendererResolution = this.app.renderer.resolution.toFixed(4);
    if (dimensionsChanged && this.lastState?.scene.mode === "camp" && this.viewMode === "live") {
      this.render(this.lastState);
      return;
    }
    this.layout();
  }

  private drawHorizon(palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 110, designWidth, 70, palette[1], 0.32));
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(0, 116)
        .bezierCurveTo(70, 83, 123, 121, 181, 91)
        .bezierCurveTo(224, 70, 270, 112, 320, 82)
        .lineTo(320, 180)
        .lineTo(0, 180)
        .closePath()
        .fill({ color: palette[1], alpha: 0.46 }),
    );
  }

  private updateHeroRigs(): void {
    for (const rig of this.heroRigs) {
      const pose = projectHeroRigPose(rig.mode, this.elapsed, this.reducedMotion);
      const weaponFormPose = this.battleBinding?.actor.heroRig === rig
        ? this.battleBinding.weaponFormPose
        : null;
      rig.puppet.y = pose.bodyY;
      rig.puppet.rotation = pose.bodyRotation + (weaponFormPose?.bodyRotationOffset ?? 0);
      rig.frontArm.rotation = pose.frontArmRotation + (weaponFormPose?.frontArmRotationOffset ?? 0);
      rig.rearArm.rotation = pose.rearArmRotation + (weaponFormPose?.rearArmRotationOffset ?? 0);
      rig.frontLeg.rotation = pose.frontLegRotation + (weaponFormPose?.frontLegRotationOffset ?? 0);
      rig.rearLeg.rotation = pose.rearLegRotation + (weaponFormPose?.rearLegRotationOffset ?? 0);
    }
  }

  private drawHero(
    state: WorldState,
    x: number,
    y: number,
    _palette: readonly [number, number, number],
    scale = 1,
    identityId = state.depth.hero.id,
    showHeroGear = true,
    weaponOverride?: GearAppearance,
  ): Container {
    let gear: HeroAppearance = showHeroGear && identityId === state.depth.hero.id
      ? projectHeroAppearance(state.depth.hero)
      : { weapon: null, offhand: null, head: null, body: null, feet: null, charm: null };
    if (weaponOverride !== undefined && showHeroGear && identityId === state.depth.hero.id) {
      gear = { ...gear, weapon: weaponOverride };
    }
    const identity = projectHeroIdentityAppearance({ id: identityId });
    const heroLayer = new Container();
    heroLayer.position.set(x, y);
    heroLayer.scale.set(scale);
    heroLayer.addChild(new Graphics().ellipse(0, 14, 9, 2.2).fill({ color: 0x080d18, alpha: 0.42 }));

    const puppet = new Container();
    heroLayer.addChild(puppet);

    if (gear.charm?.silhouette === "halo") {
      puppet.addChild(new Graphics().ellipse(-0.5, -27, 8, 2.8).stroke({ color: gear.charm.color, width: 1.2, alpha: 0.88 }));
    } else if (gear.charm?.silhouette === "orb") {
      puppet.addChild(circle(-10, -5, 5, gear.charm.color, 0.16), circle(-10, -5, 2.2, gear.charm.color, 0.92));
    } else if (gear.charm?.silhouette === "sigil") {
      puppet.addChild(new Graphics().poly([-12, -8, -9, -5, -12, -2, -15, -5]).fill({ color: gear.charm.color, alpha: 0.9 }));
    }

    puppet.addChild(new Graphics()
      .poly([-6.5, -12, 3.5, -13, 7.5, 5, 1, 10, -8.5, 6])
      .fill({ color: identity.cloak, alpha: 0.96 })
      .stroke({ color: 0x17212e, width: 0.8, alpha: 0.9 }));

    const createLeg = (front: boolean): Container => {
      const leg = new Container();
      leg.position.set(front ? 3 : -3, 3.5);
      const legColor = front ? 0x263544 : 0x18232f;
      leg.addChild(new Graphics().poly([-2, -1, 2, -1, 2.5, 8, 0.6, 11.5, -3, 11]).fill(legColor));
      const footColor = gear.feet?.color ?? identity.belt;
      const footAccent = gear.feet?.accent ?? 0x241d1b;
      if (gear.feet?.silhouette === "greaves") {
        leg.addChild(new Graphics().poly([-2.4, 3, 2.8, 3, 2.5, 10.6, -2.8, 10.6]).fill(footColor));
        leg.addChild(rect(-2.5, 6, 5.2, 1, footAccent));
      } else {
        leg.addChild(new Graphics().poly([-3, 9, 2.5, 9, 4.2, 12.2, -3.4, 12.2]).fill(footColor));
        if (gear.feet?.silhouette === "sandals") leg.addChild(rect(-3.2, 10.5, 7.2, 1, footAccent));
      }
      return leg;
    };
    const rearLeg = createLeg(false);
    const frontLeg = createLeg(true);
    puppet.addChild(rearLeg, frontLeg);

    const rearArm = new Container();
    rearArm.position.set(-5.5, -10.5);
    rearArm.addChild(new Graphics().moveTo(0, 0).lineTo(-3.5, 5).lineTo(-1.5, 11).stroke({ color: identity.cloak, width: 3.2 }));
    rearArm.addChild(circle(-1.4, 11.2, 1.8, identity.skin));
    if (gear.offhand?.silhouette === "shield") {
      rearArm.addChild(new Graphics().poly([-8, 5, -1, 6, 0, 14, -4.5, 17, -9, 13]).fill(gear.offhand.color).stroke({ color: gear.offhand.accent, width: 0.9 }));
      rearArm.addChild(circle(-4.5, 10.5, 1.8, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "book") {
      rearArm.addChild(rect(-8, 7, 7, 9, gear.offhand.color), rect(-5, 8, 1, 7, gear.offhand.accent));
    } else if (gear.offhand?.silhouette === "lantern") {
      rearArm.addChild(rect(-7, 9, 6, 7, gear.offhand.accent), circle(-4, 12.5, 5, gear.offhand.color, 0.2));
      rearArm.addChild(new Graphics().moveTo(-6, 9).quadraticCurveTo(-4, 5, -2, 9).stroke({ color: gear.offhand.color, width: 0.8 }));
    }
    puppet.addChild(rearArm);

    const torsoColor = gear.body?.color ?? identity.tunic;
    const torsoAccent = gear.body?.accent ?? identity.cloak;
    puppet.addChild(new Graphics().poly([-7.5, -13, 6.5, -13, 5, 4.5, 0, 7, -6.5, 4.5]).fill(0x17212e));
    const torso = new Graphics().poly([-6.4, -12.2, 5.4, -12.2, 4.2, 3.7, -0.2, 5.6, -5.5, 3.7]).fill(torsoColor);
    if (gear.body?.silhouette === "mail") {
      for (let row = 0; row < 4; row += 1) torso.moveTo(-5 + row % 2, -8 + row * 3.2).lineTo(4, -8 + row * 3.2);
      torso.stroke({ color: torsoAccent, width: 0.7, alpha: 0.9 });
    }
    puppet.addChild(torso);
    if (gear.body?.silhouette === "plate") {
      puppet.addChild(new Graphics().poly([-5.3, -10, 4.5, -10, 3.4, 1.8, -0.2, 3.5, -4.7, 1.8]).stroke({ color: torsoAccent, width: 1.2 }));
      puppet.addChild(circle(-6.2, -10.5, 2.1, torsoAccent), circle(5.2, -10.5, 2.1, torsoAccent));
    } else if (gear.body?.silhouette === "coat") {
      puppet.addChild(rect(-0.9, -11.7, 1.4, 15.8, torsoAccent));
    }
    puppet.addChild(rect(-5.6, 0.2, 10.3, 1.8, identity.belt), circle(-0.4, 1.1, 1.2, 0xc89a4b));
    puppet.addChild(rect(-2.2, -16, 4.2, 4, identity.skin));

    puppet.addChild(new Graphics().ellipse(-1.8, -20.2, 5.8, 6.5).fill(identity.hair));
    puppet.addChild(new Graphics().ellipse(0.2, -19.3, 5.2, 5.7).fill(identity.skin));
    puppet.addChild(new Graphics().poly([4.4, -20.6, 7.2, -18.8, 4.4, -17.9]).fill(identity.skin));
    puppet.addChild(circle(3.1, -20.8, 0.65, 0x17212e));
    puppet.addChild(new Graphics().moveTo(3.2, -16.5).quadraticCurveTo(0.8, -14.5, -2, -15.8).stroke({ color: identity.hair, width: 1.2 }));
    puppet.addChild(new Graphics().moveTo(-5.3, -22).quadraticCurveTo(-0.5, -28, 4.5, -23.2).lineTo(2.5, -22).quadraticCurveTo(-0.5, -25, -4.8, -20.2).fill(identity.hair));

    if (gear.head?.silhouette === "cap") {
      puppet.addChild(new Graphics().moveTo(-5.8, -22).quadraticCurveTo(-1, -29, 5, -23).lineTo(7, -22).lineTo(-5.8, -21.5).closePath().fill(gear.head.color));
    } else if (gear.head?.silhouette === "crown") {
      puppet.addChild(new Graphics().poly([-5, -23, -4.5, -29, -1.5, -26, 1, -30, 3.3, -26, 5.7, -29, 5.2, -23]).fill(gear.head.color));
    } else if (gear.head?.silhouette === "helm") {
      puppet.addChild(new Graphics().moveTo(-5.7, -21).quadraticCurveTo(-1, -30, 5.5, -23).lineTo(5.2, -17).lineTo(2.4, -17).lineTo(2.5, -21).lineTo(-5.7, -21).closePath().fill(gear.head.color));
      puppet.addChild(rect(-2.5, -21.5, 7.5, 1, gear.head.accent));
    }

    const frontArm = new Container();
    frontArm.position.set(5, -10.5);
    frontArm.addChild(new Graphics().moveTo(0, 0).lineTo(4, 5).lineTo(2.2, 11).stroke({ color: identity.tunic, width: 3.3 }));
    frontArm.addChild(circle(2.2, 11.2, 1.8, identity.skin));
    if (gear.weapon?.silhouette === "sword") {
      frontArm.addChild(new Graphics().moveTo(2.3, 11).lineTo(4.5, -10).stroke({ color: gear.weapon.color, width: 1.7 }));
      frontArm.addChild(new Graphics().moveTo(-0.5, 7.5).lineTo(5.3, 8.2).stroke({ color: gear.weapon.accent, width: 1.7 }));
    } else if (gear.weapon?.silhouette === "spear") {
      frontArm.addChild(new Graphics().moveTo(2.2, 15).lineTo(5.2, -15).stroke({ color: gear.weapon.accent, width: 1.3 }));
      frontArm.addChild(new Graphics().poly([5.2, -18.5, 8, -12.8, 3.2, -13.4]).fill(gear.weapon.color));
    } else if (gear.weapon?.silhouette === "wand") {
      frontArm.addChild(new Graphics().moveTo(2.2, 11).lineTo(6.5, -7).stroke({ color: gear.weapon.accent, width: 1.8 }));
      frontArm.addChild(circle(6.8, -9.5, 5.5, gear.weapon.color, 0.16), circle(6.8, -9.5, 2.4, gear.weapon.color));
    }
    if (gear.weapon !== null && gear.weapon.useMasteryStage > 0) {
      const etch = new Graphics();
      for (let index = 0; index < gear.weapon.useMasteryStage; index += 1) {
        const y = 5.5 - index * 3;
        etch.moveTo(1.1, y).lineTo(4.4, y - 0.8).stroke({ color: 0xf4e6b8, width: 0.75, alpha: 0.95 });
      }
      frontArm.addChild(etch);
    }
    puppet.addChild(frontArm);

    const mode: SceneMode = this.viewMode === "map" ? "atlas" : state.scene.mode;
    this.heroRigs.push({ puppet, frontArm, rearArm, frontLeg, rearLeg, mode });
    this.updateHeroRigs();
    this.lightLayer.addChild(heroLayer);
    return heroLayer;
  }

  private drawCompanion(
    state: WorldState,
    id: string,
    role: string,
    x: number,
    y: number,
    palette: readonly [number, number, number],
    scale = 0.9,
    injured = false,
  ): Container {
    const layer = this.drawHero(state, x, y, palette, scale, id, false);
    const cue = new Graphics();
    const color = injured ? 0xdf8b75 : 0x91d2c6;
    if (role === "guard") cue.moveTo(-10, 8).lineTo(-7, -19).stroke({ color, width: 1.6 });
    else if (role === "healer") cue.rect(-13, -7, 7, 10).stroke({ color, width: 1.1 }).moveTo(-12, -2).lineTo(-7, -2).moveTo(-9.5, -5).lineTo(-9.5, 1).stroke({ color, width: 1 });
    else if (role === "smith") cue.moveTo(-12, -8).lineTo(-6, 7).stroke({ color, width: 2 }).rect(-16, -12, 9, 5).fill(color);
    else if (role === "cartographer" || role === "scholar") cue.roundRect(-15, -10, 9, 14, 1.5).fill({ color, alpha: 0.88 }).moveTo(-13, -7).lineTo(-8, -7).moveTo(-13, -3).lineTo(-9, -3).stroke({ color: 0x29484d, width: 0.8 });
    else if (role === "miller") cue.circle(-10, -3, 5).stroke({ color, width: 1.2 }).moveTo(-10, -9).lineTo(-10, 3).moveTo(-16, -3).lineTo(-4, -3).stroke({ color, width: 1 });
    else if (role === "baker") cue.ellipse(-10, -3, 6, 4).fill({ color, alpha: 0.9 }).moveTo(-13, -4).lineTo(-7, -2).stroke({ color: 0x6d5946, width: 0.8 });
    else cue.roundRect(-15, -5, 9, 10, 1.4).fill({ color, alpha: 0.9 });
    layer.addChild(cue);
    if (injured) {
      layer.alpha = 0.72;
      layer.rotation = -0.08;
    }
    return layer;
  }

  private drawTown(state: WorldState, palette: readonly [number, number, number]): void {
    const town = state.depth.towns[state.depth.atlas.currentLocationId];
    const latestChronicle = state.chronicle.at(-1);
    const restocking = latestChronicle?.tick === state.tick && latestChronicle.commandType === "restock-tonic";
    this.worldLayer.addChild(rect(0, 132, designWidth, 48, 0x345446));
    if (town === undefined) {
      this.drawHero(state, 160, 146, palette);
      return;
    }
    const buildingColors = [0xc98055, 0x9f6650, 0xc49b63, 0x7f765b, 0xb46f58] as const;
    const visibleBuildings = town.buildings.slice(0, 18);
    for (let index = 0; index < visibleBuildings.length; index += 1) {
      const building = visibleBuildings[index];
      if (building === undefined) continue;
      const districtIndex = Math.max(
        0,
        town.districts.findIndex((district) => district.id === building.districtId),
      );
      const column = index % 9;
      const row = Math.floor(index / 9);
      const width = 22 + randomInt(15, state.seed, "town-visual", building.id, 0, "width");
      const height = 22 + randomInt(25, state.seed, "town-visual", building.id, 0, "height");
      const x = 8 + column * 35 + (row % 2) * 8;
      const y = 132 - height - row * 30;
      const color = buildingColors[districtIndex % buildingColors.length] ?? 0xc98055;
      this.worldLayer.addChild(rect(x, y, width, height, color));
      this.worldLayer.addChild(
        new Graphics()
          .poly([x - 4, y, x + width / 2, y - 18, x + width + 4, y])
          .fill(0x613f4b),
      );
      this.worldLayer.addChild(rect(x + 6, y + 9, 6, 7, palette[2], 0.78));
      for (let residentIndex = 0; residentIndex < Math.min(3, building.residentIds.length); residentIndex += 1) {
        this.worldLayer.addChild(
          circle(x + 6 + residentIndex * 6, 137 + row * 8, 2, 0xe7c9a0),
        );
      }
    }
    this.worldLayer.addChild(
      new Graphics()
        .moveTo(128, 180)
        .bezierCurveTo(137, 159, 156, 143, 176, 132)
        .lineTo(202, 132)
        .bezierCurveTo(177, 149, 167, 165, 164, 180)
        .closePath()
        .fill(0xb6956a),
    );
    if (!restocking) {
      this.drawHero(state, 172, 146, palette);
      return;
    }

    this.host.dataset.tonicRestockActive = "true";
    this.host.dataset.tonicRestockReceipt = state.scene.consequence;
    this.host.dataset.tonicRestockHeroPosition = "150,146";
    this.host.dataset.tonicRestockVisual = "equipped-hero|vial|three-coins|exact-receipt";
    this.drawHero(state, 150, 146, palette);

    const exchange = new Container();
    exchange.position.set(169, 126);
    exchange.addChild(new Graphics()
      .roundRect(-4, -7, 8, 12, 1.5).fill({ color: 0xc95e49, alpha: 0.94 })
      .rect(-2.5, -10, 5, 3).fill(0xe5d7ad)
      .moveTo(-3, -2).lineTo(3, -2).stroke({ color: 0xffd9a3, width: 0.8, alpha: 0.9 }));
    for (let index = 0; index < 3; index += 1) {
      const coinX = 16 + index * 7;
      const coinY = 3 - index * 3;
      exchange.addChild(new Graphics()
        .circle(coinX, coinY, 3).fill({ color: 0xe0ad4f, alpha: 0.96 })
        .circle(coinX, coinY, 1.45).stroke({ color: 0xffe29a, width: 0.65, alpha: 0.95 }));
    }
    exchange.addChild(new Graphics()
      .moveTo(7, 1).bezierCurveTo(14, -4, 23, -6, 31, -8)
      .stroke({ color: 0xffd166, width: 1.1, alpha: 0.75 }));
    this.worldLayer.addChild(exchange);
    this.lightLayer.addChild(circle(169, 122, 14, 0xffb65c, 0.13));

    const receiptSegments = state.scene.consequence.split(" · ");
    const quantityLines = (receiptSegments[0] ?? "Ember Tonic").replace(" (+", "\n(+");
    const receiptLines = [quantityLines, ...receiptSegments.slice(1)];
    const receipt = new Container();
    receipt.position.set(192, 80);
    receipt.addChild(new Graphics()
      .roundRect(0, 0, 122, 47, 3).fill({ color: 0x17232b, alpha: 0.92 })
      .roundRect(0, 0, 122, 47, 3).stroke({ color: 0xffd166, width: 0.8, alpha: 0.78 }));
    const heading = this.createScaleSensitiveText("ROAD SUPPLIES", {
      fontFamily: "ui-monospace, monospace",
      fontSize: 4.5,
      fill: 0xffd166,
      fontWeight: "900",
      letterSpacing: 0.7,
    });
    heading.position.set(7, 5);
    receipt.addChild(heading);
    const facts = this.createScaleSensitiveText(receiptLines.join("\n"), {
      fontFamily: "ui-monospace, monospace",
      fontSize: 3.8,
      fill: 0xfff1d1,
      fontWeight: "700",
      lineHeight: 6.2,
    });
    facts.position.set(7, 13);
    receipt.addChild(facts);
    this.worldLayer.addChild(receipt);
  }

  private atlasPoint(point: Pick<AtlasTerrainPoint, "x" | "y">): readonly [number, number] {
    return [50 + point.x * 0.22, 35 + point.y * 0.12];
  }

  private buildAtlasStaticLayer(atlas: AtlasState): Container {
    const layer = new Container();
    layer.addChild(rect(44, 29, 232, 132, 0xb99d69));
    layer.addChild(rect(48, 33, 224, 124, 0xaeb7a1));
    const biomeColors: Record<AtlasTerrainPoint["biome"], number> = {
      ocean: 0xaeb7a1,
      coast: 0xd7c58f,
      grassland: 0xc6b77f,
      forest: 0x93a16f,
      rainforest: 0x788d65,
      desert: 0xd4bb7c,
      tundra: 0xbab79b,
      mountain: 0xa79679,
      snow: 0xd8d0b7,
      marsh: 0x8f9d78,
    };
    const terrainInk = new Graphics();
    for (const triangle of atlas.terrain.triangles) {
      const first = atlas.terrain.points[triangle.a];
      const second = atlas.terrain.points[triangle.b];
      const third = atlas.terrain.points[triangle.c];
      if (first === undefined || second === undefined || third === undefined) continue;
      const [x1, y1] = this.atlasPoint(first);
      const [x2, y2] = this.atlasPoint(second);
      const [x3, y3] = this.atlasPoint(third);
      const landPoints = [first, second, third].filter((point) => point.biome !== "ocean");
      const color = landPoints.length === 0
        ? biomeColors.ocean
        : biomeColors[landPoints.sort((left, right) => right.elevation - left.elevation)[0]?.biome ?? "grassland"];
      terrainInk.poly([x1, y1, x2, y2, x3, y3]).fill({ color, alpha: 0.86 });
    }
    layer.addChild(terrainInk);

    const reliefInk = new Graphics();
    for (let index = 0; index < atlas.terrain.points.length; index += 1) {
      const point = atlas.terrain.points[index];
      if (point === undefined || index % 4 !== 0) continue;
      const [x, y] = this.atlasPoint(point);
      if (point.biome === "mountain" || point.biome === "snow") {
        const height = point.biome === "snow" ? 4.2 : 3.2;
        reliefInk.moveTo(x - 3, y + 2).lineTo(x, y - height).lineTo(x + 3, y + 2).stroke({ color: 0x5d5146, width: 0.7, alpha: 0.72 });
        if (point.biome === "snow") reliefInk.moveTo(x - 1.2, y - 1.2).lineTo(x, y - height).lineTo(x + 1.2, y - 1.2).stroke({ color: 0xf1e8cf, width: 0.65, alpha: 0.9 });
      } else if (point.biome === "forest" || point.biome === "rainforest") {
        reliefInk.moveTo(x, y - 2.3).lineTo(x - 1.8, y + 1).lineTo(x + 1.8, y + 1).closePath().fill({ color: 0x405a43, alpha: 0.56 });
        reliefInk.moveTo(x, y + 0.5).lineTo(x, y + 2.2).stroke({ color: 0x405a43, width: 0.55, alpha: 0.62 });
      } else if (point.biome === "marsh") {
        reliefInk.moveTo(x - 2, y).quadraticCurveTo(x, y - 1, x + 2, y).stroke({ color: 0x526654, width: 0.55, alpha: 0.64 });
      }
    }
    layer.addChild(reliefInk);

    const waterInk = new Graphics();
    for (const segment of atlas.terrain.coastline) {
      const [x1, y1] = this.atlasPoint({ x: segment.x1, y: segment.y1 });
      const [x2, y2] = this.atlasPoint({ x: segment.x2, y: segment.y2 });
      waterInk.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x4e665f, width: 1.15, alpha: 0.94 });
    }
    for (const river of atlas.terrain.rivers) {
      const first = atlas.terrain.points[river.pointIndices[0] ?? -1];
      if (first === undefined) continue;
      const [startX, startY] = this.atlasPoint(first);
      waterInk.moveTo(startX, startY);
      for (const pointIndex of river.pointIndices.slice(1)) {
        const point = atlas.terrain.points[pointIndex];
        if (point === undefined) continue;
        const [x, y] = this.atlasPoint(point);
        waterInk.lineTo(x, y);
      }
      waterInk.stroke({ color: 0x4f7380, width: Math.min(1.7, 0.55 + river.flux / 42), alpha: 0.92 });
    }
    waterInk.rect(48, 33, 224, 124).stroke({ color: 0x5f503d, width: 1.1, alpha: 0.92 });
    waterInk.rect(46, 31, 228, 128).stroke({ color: 0xd5c292, width: 0.7, alpha: 0.55 });
    layer.addChild(waterInk);
    return layer;
  }

  private atlasRoad(edge: AtlasEdge, atlas: AtlasState, ink: Graphics, selected: boolean): void {
    const first = atlas.terrain.points[edge.pathPointIndices[0] ?? -1];
    if (first === undefined) return;
    const [startX, startY] = this.atlasPoint(first);
    ink.moveTo(startX, startY);
    for (const pointIndex of edge.pathPointIndices.slice(1)) {
      const point = atlas.terrain.points[pointIndex];
      if (point === undefined) continue;
      const [x, y] = this.atlasPoint(point);
      ink.lineTo(x, y);
    }
    ink.stroke({
      color: selected ? 0x803d42 : edge.terrain === "pass" ? 0x625b52 : 0x786750,
      width: selected ? 2.2 : edge.terrain === "road" ? 1.15 : 0.75,
      alpha: selected ? 1 : 0.72,
    });
    for (const crossingPointIndex of edge.crossingPointIndices) {
      const crossing = atlas.terrain.points[crossingPointIndex];
      if (crossing === undefined) continue;
      const [x, y] = this.atlasPoint(crossing);
      ink.moveTo(x - 1.6, y - 1).lineTo(x + 1.6, y + 1).stroke({ color: 0xe5d3a5, width: 1.4, alpha: 0.95 });
    }
  }

  private drawAtlas(state: WorldState, palette: readonly [number, number, number]): void {
    const atlas = state.depth.atlas;
    const nextLocationId = atlas.route?.path[(atlas.route?.legIndex ?? -1) + 1];
    const nextLocation = atlas.locations.find((location) => location.id === nextLocationId);
    if (nextLocation !== undefined && atlas.discoveredLocationIds.includes(nextLocation.id)) {
      this.host.dataset.atlasNextDanger = String(nextLocation.danger);
      this.host.dataset.atlasNextThreatBand = encounterThreatBand(nextLocation.danger);
    }
    const questLead = projectSuccessorQuestLead(state.seed, atlas, state.depth.quest);
    if (this.atlasStaticLayer === null || this.atlasStaticSignature !== atlas.terrain.signature) {
      this.atlasStaticLayer?.destroy({ children: true });
      this.atlasStaticLayer = this.buildAtlasStaticLayer(atlas);
      this.atlasStaticSignature = atlas.terrain.signature;
    }
    this.worldLayer.addChild(this.atlasStaticLayer);
    const point = (locationId: string): readonly [number, number] => {
      const location = atlas.locations.find((candidate) => candidate.id === locationId);
      return location === undefined ? [160, 90] : this.atlasPoint(location);
    };
    const routeEdges = new Set<string>();
    if (atlas.route !== null) {
      for (let index = 0; index < atlas.route.path.length - 1; index += 1) {
        const left = atlas.route.path[index];
        const right = atlas.route.path[index + 1];
        if (left !== undefined && right !== undefined) {
          routeEdges.add(left < right ? `${left}~${right}` : `${right}~${left}`);
        }
      }
    }
    const roadInk = new Graphics();
    for (const edge of atlas.edges) {
      const selected = routeEdges.has(edge.id);
      const known = atlas.discoveredLocationIds.includes(edge.from) && atlas.discoveredLocationIds.includes(edge.to);
      if (known || selected) this.atlasRoad(edge, atlas, roadInk, selected);
    }
    this.worldLayer.addChild(roadInk);
    const labelBounds: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const location of atlas.locations) {
      if (
        !atlas.discoveredLocationIds.includes(location.id) &&
        location.id !== atlas.route?.destinationId &&
        location.id !== questLead?.locationId
      ) continue;
      const [x, y] = point(location.id);
      const discovered = atlas.discoveredLocationIds.includes(location.id);
      if (!discovered) {
        this.worldLayer.addChild(new Graphics().poly([x, y - 3.5, x + 3.5, y, x, y + 3.5, x - 3.5, y]).fill({ color: 0x756e62, alpha: 0.72 }));
        this.worldLayer.addChild(circle(x, y, 1.1, 0xe4d5ac, 0.92));
      }
      const color =
        location.kind === "town"
          ? 0x8b4b46
          : location.kind === "dungeon"
            ? 0x433d57
            : location.kind === "landmark"
              ? 0xb58a46
              : palette[1];
      if (!discovered) {
        // Mapped waypoints reveal a route and name, but not the unvisited site's type.
      } else if (location.kind === "town") {
        this.worldLayer.addChild(rect(x - 2.5, y - 1.5, 5, 4, color, discovered ? 1 : 0.4));
        this.worldLayer.addChild(new Graphics().poly([x - 3.5, y - 1.5, x, y - 5, x + 3.5, y - 1.5]).fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else if (location.kind === "dungeon") {
        this.worldLayer.addChild(new Graphics().moveTo(x - 3, y + 3).lineTo(x - 3, y).quadraticCurveTo(x, y - 5, x + 3, y).lineTo(x + 3, y + 3).closePath().fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else if (location.kind === "landmark") {
        this.worldLayer.addChild(new Graphics().poly([x, y - 4, x + 1.2, y - 1.2, x + 4, y, x + 1.2, y + 1.2, x, y + 4, x - 1.2, y + 1.2, x - 4, y, x - 1.2, y - 1.2]).fill({ color, alpha: discovered ? 1 : 0.4 }));
      } else {
        this.worldLayer.addChild(circle(x, y, 2.2, color, discovered ? 1 : 0.4));
      }
      if (location.id === questLead?.locationId) {
        const leadSigil = new Graphics()
          .circle(x, y, 5.7)
          .stroke({ color: 0xffcf68, width: 1.35, alpha: 1 })
          .poly([x, y - 4.3, x + 4.3, y, x, y + 4.3, x - 4.3, y])
          .stroke({ color: 0x7e4d91, width: 1.05, alpha: 0.96 });
        this.worldLayer.addChild(leadSigil);
      }
      const labelText = discovered ? `${location.name} · D${location.danger}` : location.name;
      const labelWidth = Math.min(48, Math.max(16, labelText.length * 3.15));
      const placements = location.id === atlas.currentLocationId
        ? [{ x: x + 6, y: y - 3, anchorX: 0 }, { x, y: y + 5, anchorX: 0.5 }]
        : [{ x, y: y + 4.5, anchorX: 0.5 }, { x, y: y - 10, anchorX: 0.5 }, { x: x + 5, y: y - 3, anchorX: 0 }];
      const placement = placements.find((candidate) => {
        const left = candidate.x - labelWidth * candidate.anchorX;
        const bounds = { left, right: left + labelWidth, top: candidate.y, bottom: candidate.y + 6.5 };
        return left >= 49 && bounds.right <= 271 && bounds.top >= 34 && bounds.bottom <= 157 &&
          !labelBounds.some((existing) => bounds.left < existing.right && bounds.right > existing.left && bounds.top < existing.bottom && bounds.bottom > existing.top);
      });
      if (placement !== undefined) {
        const label = new Text({ text: labelText, style: { fontFamily: "Georgia, serif", fontSize: discovered ? 6 : 5.5, fill: discovered ? 0x3c3329 : 0x625c51, fontStyle: discovered ? "normal" : "italic", fontWeight: "600" } });
        label.anchor.set(placement.anchorX, 0);
        label.position.set(placement.x, placement.y);
        this.worldLayer.addChild(label);
        const left = placement.x - labelWidth * placement.anchorX;
        labelBounds.push({ left, right: left + labelWidth, top: placement.y, bottom: placement.y + 6.5 });
      }
    }
    let [partyX, partyY] = point(atlas.currentLocationId);
    const projection = projectRoute(atlas);
    if (projection !== null) {
      [partyX, partyY] = this.atlasPoint({ x: projection.terrainX, y: projection.terrainY });
    }
    this.lightLayer.addChild(circle(partyX, partyY, 3.6, palette[2]));
    this.lightLayer.addChild(circle(partyX, partyY, 7.5, palette[2], 0.2));
    this.lightLayer.addChild(new Graphics().circle(partyX, partyY, 5.2).stroke({ color: 0x5d3038, width: 1, alpha: 0.95 }));
  }

  private drawTravelSilhouette(corridor: TravelCorridor, visual: TravelBiomeVisual): void {
    const density = Math.round(3 + Math.max(0, Math.min(1, corridor.moisture)) * 7);
    const horizon = new Graphics();
    switch (visual.silhouette) {
      case "waves":
        for (let index = 0; index < 8; index += 1) horizon.moveTo(index * 46 - 15, 112 + index % 2 * 5).quadraticCurveTo(index * 46 + 7, 105, index * 46 + 29, 112);
        horizon.stroke({ color: visual.accent, width: 2, alpha: 0.62 });
        break;
      case "cliffs":
        horizon.poly([0, 123, 0, 87, 35, 91, 48, 108, 88, 113, 102, 123]).fill(visual.groundDark);
        horizon.poly([224, 123, 244, 106, 267, 101, 279, 82, 320, 89, 320, 123]).fill(visual.groundDark);
        break;
      case "grass":
        for (let index = 0; index < density * 3; index += 1) {
          const x = 8 + (index * 37) % 310;
          const height = 3 + (index % 4);
          horizon.moveTo(x, 124).lineTo(x - 1, 124 - height);
        }
        horizon.stroke({ color: visual.accent, width: 1, alpha: 0.8 });
        break;
      case "trees":
      case "jungle":
        for (let index = 0; index < density; index += 1) {
          const x = 8 + (index * 53) % 304;
          const height = visual.silhouette === "jungle" ? 19 + index % 10 : 13 + index % 8;
          horizon.rect(x, 116 - height, 3, height + 8).fill(visual.groundDark);
          horizon.circle(x + 1.5, 114 - height, visual.silhouette === "jungle" ? 9 : 7).fill(visual.horizon);
          if (visual.silhouette === "jungle") horizon.circle(x + 8, 118 - height, 6).fill(visual.horizon);
        }
        break;
      case "dunes":
        horizon.moveTo(0, 123).bezierCurveTo(48, 78, 99, 119, 151, 103).bezierCurveTo(210, 84, 256, 119, 320, 91).lineTo(320, 126).lineTo(0, 126).closePath().fill(visual.horizon);
        break;
      case "scrub":
        for (let index = 0; index < density; index += 1) {
          const x = 13 + (index * 61) % 296;
          horizon.moveTo(x, 124).lineTo(x + 3, 116).moveTo(x, 120).lineTo(x - 4, 117).moveTo(x + 1, 121).lineTo(x + 6, 118);
        }
        horizon.stroke({ color: visual.accent, width: 1.5, alpha: 0.72 });
        break;
      case "peaks":
      case "snow":
        horizon.poly([0, 124, 31, 91, 52, 110, 86, 72, 123, 113, 158, 79, 191, 110, 232, 66, 275, 109, 302, 83, 320, 103, 320, 124]).fill(visual.horizon);
        if (visual.silhouette === "snow") {
          horizon.poly([68, 91, 86, 72, 101, 89, 91, 86, 85, 94, 79, 85]).fill(visual.accent);
          horizon.poly([215, 82, 232, 66, 249, 84, 238, 79, 231, 87, 225, 78]).fill(visual.accent);
        }
        break;
      case "reeds":
        for (let index = 0; index < density * 2; index += 1) {
          const x = 5 + (index * 43) % 314;
          horizon.moveTo(x, 127).lineTo(x + index % 3 - 1, 107 + index % 9);
          horizon.circle(x + index % 3 - 1, 106 + index % 9, 1.4);
        }
        horizon.stroke({ color: visual.accent, width: 1.2, alpha: 0.78 });
        break;
    }
    this.worldLayer.addChild(horizon);
  }

  private travelRoadStroke(
    points: readonly TravelRoadPoint[],
    color: number,
    width: number,
    alpha: number,
  ): Graphics {
    const line = new Graphics();
    const first = points[0];
    if (first === undefined) return line;
    line.moveTo(first.x, first.y);
    for (const point of points.slice(1)) line.lineTo(point.x, point.y);
    return line.stroke({ color, width, alpha });
  }

  private updateTravelRoadAnimation(): void {
    const binding = this.travelRoadBinding;
    if (binding === null) return;
    const flow = projectTravelRoadFlow(
      binding.geometry,
      this.reducedMotion ? 0 : this.elapsed,
      binding.markers.length,
    );
    for (let index = 0; index < binding.markers.length; index += 1) {
      const marker = binding.markers[index];
      const point = flow[index];
      if (marker !== undefined && point !== undefined) marker.position.set(point.x, point.y);
    }
    this.host.dataset.travelRoadFlow = this.reducedMotion ? "static" : "animated";
  }

  private drawTravel(state: WorldState, palette: readonly [number, number, number]): void {
    const latestLeg = state.forwardMotion.recentLegs.at(-1) ?? null;
    const arrival = latestLeg?.arrivedTick === state.tick ? latestLeg : null;
    const corridor = projectTravelCorridor(state.depth.atlas, arrival);
    if (corridor === null) {
      this.worldLayer.addChild(rect(0, 118, designWidth, 62, 0x304c3f));
      this.drawHero(state, 160, 142, palette);
      return;
    }

    this.host.dataset.travelEdge = corridor.projection.edgeId;
    this.host.dataset.travelDirection = corridor.direction;
    this.host.dataset.travelBiome = corridor.biome;
    this.host.dataset.travelTerrain = corridor.edgeTerrain;
    this.host.dataset.travelSlope = corridor.slope;
    this.host.dataset.travelCrossing = corridor.crossing?.phase ?? "none";
    this.host.dataset.travelProgress = corridor.projection.legRatio.toFixed(4);

    const visual = travelBiomeVisuals[corridor.biome];
    const lookaheadVisual = travelBiomeVisuals[corridor.lookaheadBiome];
    this.worldLayer.addChild(rect(0, 0, designWidth, 105, visual.sky));
    this.worldLayer.addChild(rect(0, 83, designWidth, 43, visual.horizon));
    if (corridor.lookaheadBiome !== corridor.biome) {
      this.worldLayer.addChild(new Graphics().poly([244, 83, 320, 83, 320, 130, 276, 125]).fill({ color: lookaheadVisual.horizon, alpha: 0.72 }));
    }
    this.worldLayer.addChild(rect(0, 121, designWidth, 59, visual.ground));
    this.drawTravelSilhouette(corridor, visual);

    const roadColor = { road: 0x9c7a55, trail: 0x756049, pass: 0x6c6961, river: 0x735f4e }[corridor.edgeTerrain];
    const roadDark = { road: 0x6d533d, trail: 0x514336, pass: 0x4c4c49, river: 0x4d443c }[corridor.edgeTerrain];
    const road = projectTravelRoadGeometry(corridor.edgeTerrain, corridor.signedSlope, corridor.curve);
    this.host.dataset.travelRoadTopology = road.topology;
    this.worldLayer.addChild(
      new Graphics().poly(road.polygon.flatMap((point) => [point.x, point.y])).fill(roadColor),
      this.travelRoadStroke(road.upperEdge, roadDark, 1.3, 0.68),
      this.travelRoadStroke(road.lowerEdge, roadDark, 1.3, 0.68),
    );

    if (corridor.edgeTerrain === "road") {
      this.worldLayer.addChild(
        this.travelRoadStroke(road.centerline.map((point) => ({ x: point.x, y: point.y - 3.3 })), roadDark, 1.1, 0.7),
        this.travelRoadStroke(road.centerline.map((point) => ({ x: point.x, y: point.y + 3.3 })), roadDark, 1.1, 0.7),
      );
    } else if (corridor.edgeTerrain === "pass") {
      for (let index = 0; index < 10; index += 1) {
        const x = 31 + index * 29;
        const y = projectTravelRoadY(road, x) + (index % 2 === 0 ? -road.halfWidth + 1 : road.halfWidth - 1);
        this.worldLayer.addChild(new Graphics().poly([x - 4, y + 3, x - 2, y - 2, x + 3, y - 4, x + 5, y + 3]).fill(roadDark));
      }
    }

    const flowMarkers = Array.from({ length: 10 }, (_, index) => {
      const marker = new Container();
      if (corridor.edgeTerrain === "road") {
        marker.addChild(new Graphics().ellipse(0, 0, 2.8, 0.65).fill({ color: 0xc09b6a, alpha: 0.34 }));
      } else if (corridor.edgeTerrain === "trail") {
        marker.addChild(new Graphics().roundRect(-4.5, -0.7, 9, 1.4, 0.6).fill({ color: roadDark, alpha: 0.68 }));
      } else if (corridor.edgeTerrain === "pass") {
        marker.addChild(circle(0, 0, 1.1 + index % 2 * 0.6, 0x8a877d, 0.62));
      } else {
        marker.addChild(new Graphics().ellipse(0, 0, 6.5, 1.3).stroke({ color: 0x8bb1b4, width: 0.8, alpha: 0.58 }));
      }
      this.worldLayer.addChild(marker);
      return marker;
    });
    this.travelRoadBinding = { geometry: road, markers: flowMarkers };
    this.updateTravelRoadAnimation();

    const legRatio = corridor.projection.legRatio;
    const heroX = projectTravelHeroX(legRatio);
    const heroSurfaceY = projectTravelRoadY(road, heroX);
    if (corridor.crossing !== null) {
      const visibleExtent = Math.max(1, ...corridor.nearby.map((sample) => Math.abs(sample.offset)));
      const crossingX = Math.max(31, Math.min(289, heroX + (corridor.crossing.offset / visibleExtent) * 92));
      const crossingSurfaceY = projectTravelRoadY(road, crossingX);
      const waterWidth = 8 + Math.max(0, Math.min(10, Math.log2(Math.max(1, corridor.crossing.flux + 1)) * 1.5));
      this.worldLayer.addChild(new Graphics().poly([
        crossingX - waterWidth, crossingSurfaceY - road.halfWidth - 2,
        crossingX + waterWidth, crossingSurfaceY - road.halfWidth - 2,
        crossingX + waterWidth + 5, crossingSurfaceY + road.halfWidth + 2,
        crossingX - waterWidth - 5, crossingSurfaceY + road.halfWidth + 2,
      ]).fill({ color: 0x4e8292, alpha: 0.86 }));
      this.worldLayer.addChild(new Graphics().moveTo(crossingX - waterWidth, crossingSurfaceY - 4).lineTo(crossingX + waterWidth, crossingSurfaceY - 4).stroke({ color: 0x9dc1c1, width: 1, alpha: 0.7 }));
    }

    for (let step = 0; step < 3; step += 1) {
      const trailX = Math.max(28, heroX - 13 - step * 12);
      const trailY = projectTravelRoadY(road, trailX);
      this.worldLayer.addChild(circle(trailX, trailY - 1, 1.2, visual.accent, 0.2 + step * 0.08));
    }
    const travelCompanion = projectParty(state.depth).active;
    if (travelCompanion !== null) {
      const companionX = heroX - 18;
      const companionSurfaceY = projectTravelRoadY(road, companionX);
      this.drawCompanion(
        state,
        travelCompanion.id,
        travelCompanion.role,
        companionX,
        companionSurfaceY - 13,
        palette,
        0.82,
        isInjuredPartyStatus(travelCompanion.status),
      );
    }
    this.drawHero(state, heroX, heroSurfaceY - 15, palette);

    const route = state.depth.atlas.route;
    const routeRatio = corridor.projection.routeRatio;
    this.worldLayer.addChild(rect(56, 169, 208, 3, visual.groundDark, 0.78));
    this.worldLayer.addChild(rect(56, 169, 208 * routeRatio, 3, palette[2], 0.9));
    for (let index = 0; index < (route?.path.length ?? 2); index += 1) {
      const x = 56 + (208 * index) / Math.max(1, (route?.path.length ?? 2) - 1);
      this.worldLayer.addChild(circle(x, 170.5, 3, index <= (route?.legIndex ?? 1) ? palette[2] : 0x5a655f));
    }
    const nextLocationId = route?.path[(route?.legIndex ?? -1) + 1];
    const nextLocation = state.depth.atlas.locations.find((location) => location.id === nextLocationId);
    const knownDanger = nextLocation !== undefined && state.depth.atlas.discoveredLocationIds.includes(nextLocation.id)
      ? { score: nextLocation.danger, band: encounterThreatBand(nextLocation.danger) }
      : null;
    if (knownDanger !== null) {
      this.host.dataset.travelPlaceDanger = String(knownDanger.score);
      this.host.dataset.travelThreatBand = knownDanger.band;
    }
    const sceneLabel = this.createScaleSensitiveText(
      `${corridor.biome.toUpperCase()} · ${corridor.edgeTerrain.toUpperCase()} · ${corridor.slope.toUpperCase()}${knownDanger === null ? "" : ` · DANGER ${knownDanger.score} ${encounterThreatBandLabel(knownDanger.band).toUpperCase()}`}`,
      {
        fontFamily: "ui-monospace, monospace", fontSize: 5.2, fill: 0xf4ead5, fontWeight: "700", letterSpacing: 0.5,
      },
    );
    sceneLabel.position.set(9, 9);
    this.worldLayer.addChild(rect(6, 6, sceneLabel.width + 8, 12, 0x17212e, 0.68));
    this.worldLayer.addChild(sceneLabel);
  }

  private drawDungeon(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(34, 19, 252, 142, 0x0b1117));
    const dungeon = state.depth.dungeon;
    if (dungeon === null) {
      this.lightLayer.addChild(circle(160, 92, 42, palette[2], 0.08));
      this.drawHero(state, 160, 103, palette);
      return;
    }
    const areaX = 44;
    const areaY = 24;
    const cellSize = Math.min(232 / dungeon.width, 132 / dungeon.height);
    const offsetX = areaX + (232 - dungeon.width * cellSize) / 2;
    const offsetY = areaY + (132 - dungeon.height * cellSize) / 2;
    const discovered = new Set(dungeon.discoveredCellIds);
    const visited = new Set(dungeon.visitedCellIds);
    const cellsById = new Map(dungeon.cells.map((cell) => [cell.id, cell]));
    const traps = projectDungeonTraps(dungeon);
    const trapsByCell = new Map(traps.map((trap) => [trap.cellId, trap]));
    const currentKnownTrap = traps.find((trap) => trap.current);
    const triggeredTrap = currentKnownTrap?.status === "triggered" && state.scene.sensoryIntensity >= 3 ? currentKnownTrap : undefined;
    const detectedTrap = currentKnownTrap?.status === "armed" && state.scene.sensoryIntensity >= 2 ? currentKnownTrap : undefined;
    const disarmedTrap = currentKnownTrap?.status === "disarmed" && state.scene.sensoryIntensity >= 2 ? currentKnownTrap : undefined;
    const hazardBeat = triggeredTrap ?? detectedTrap ?? disarmedTrap;
    const wayfinding = projectDungeonWayfinding(dungeon);
    const keyGate = projectDungeonKeyGate(dungeon);
    const landmark = projectDungeonLandmark(dungeon);
    const sightedKeyMove = projectDungeonMoveKnowledge(dungeon).find((move) => move.sightedWayfinderKey);
    const shrineUse = projectLatestShrineUse(dungeon, state.depth.tick);
    const shrineSummary = shrineUse === null ? null : describeDungeonShrineUse(shrineUse);
    this.host.dataset.dungeonArmedTraps = String(traps.filter((trap) => trap.status === "armed").length);
    this.host.dataset.dungeonDisarmedTraps = String(traps.filter((trap) => trap.status === "disarmed").length);
    this.host.dataset.dungeonTriggeredTraps = String(traps.filter((trap) => trap.status === "triggered").length);
    this.host.dataset.dungeonSpentTraps = String(traps.filter((trap) => trap.status !== "armed").length);
    this.host.dataset.dungeonTraversalMode = wayfinding.mode;
    this.host.dataset.dungeonBreadcrumbLength = String(Math.max(0, wayfinding.routeCellIds.length - 1));
    this.host.dataset.dungeonNextDirections = wayfinding.nextPassageDirections.join(",");
    if (keyGate?.key !== null && keyGate?.key !== undefined) this.host.dataset.dungeonKeyStatus = keyGate.key.status;
    if (keyGate?.gate !== null && keyGate?.gate !== undefined) this.host.dataset.dungeonGateStatus = keyGate.gate.status;
    if (landmark !== null) {
      this.host.dataset.dungeonLandmark = landmark.kind;
      this.host.dataset.dungeonLandmarkStatus = landmark.status;
      if (landmark.cellId !== null) this.host.dataset.dungeonLandmarkCell = landmark.cellId;
      const landmarkCopy = landmark.status === "promised"
        ? "LANDMARK · FAR-STAIR SHRINE"
        : landmark.status === "mapped"
          ? "SHRINE MAPPED · FAR STAIR"
          : "SHRINE AWAKENED · FAR STAIR";
      const landmarkResolution = projectedTextResolution(
        this.app.renderer.resolution,
        calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight).scale,
      );
      const landmarkLabel = new Text({
        text: landmarkCopy,
        style: { fontFamily: "ui-monospace, monospace", fontSize: 4.4, fill: 0xd6f2e9, fontWeight: "700", letterSpacing: 0.35 },
        resolution: landmarkResolution,
        roundPixels: true,
      });
      this.scaleSensitiveTexts.push(landmarkLabel);
      landmarkLabel.position.set(236 - landmarkLabel.width, 8);
      this.worldLayer.addChild(rect(landmarkLabel.x - 5, 5, landmarkLabel.width + 10, 11, 0x111820, 0.88));
      this.worldLayer.addChild(landmarkLabel);
    }
    if (sightedKeyMove !== undefined) {
      this.host.dataset.dungeonVisibleObjective = "wayfinder-key";
      this.host.dataset.dungeonVisibleObjectiveDirection = sightedKeyMove.direction;
    }
    if (shrineUse !== null) {
      this.host.dataset.dungeonShrineState = shrineSummary === "RESOURCES FULL" ? "full" : "restored";
      this.host.dataset.dungeonShrineCell = shrineUse.cellId;
      this.host.dataset.dungeonShrineHealth = `${shrineUse.healthBefore}/${shrineUse.healthRestored}/${shrineUse.healthAfter}`;
      this.host.dataset.dungeonShrineMana = `${shrineUse.manaBefore}/${shrineUse.manaRestored}/${shrineUse.manaAfter}`;
    }
    if (wayfinding.frontierCellId !== null) this.host.dataset.dungeonFrontierCell = wayfinding.frontierCellId;
    this.host.dataset.dungeonTrap = triggeredTrap === undefined
      ? currentKnownTrap !== undefined
        ? currentKnownTrap.status
        : traps.some((trap) => trap.status === "armed")
          ? "armed"
          : "none"
      : "triggered";
    if (hazardBeat !== undefined) {
      this.host.dataset.dungeonTrapCell = hazardBeat.cellId;
      this.host.dataset.dungeonTrapKind = hazardBeat.kind;
      this.host.dataset.dungeonTrapResult = state.scene.consequence;
    }
    const discoveredCells = dungeon.cells.filter((cell) => discovered.has(cell.id));
    for (const cell of discoveredCells) {
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      this.worldLayer.addChild(
        rect(x + 1, y + 1, cellSize - 2, cellSize - 2, visited.has(cell.id) ? 0x37444a : 0x202a31),
      );
    }

    const routeCells = wayfinding.routeCellIds.flatMap((cellId) => {
      const cell = cellsById.get(cellId);
      return cell === undefined ? [] : [{ x: offsetX + (cell.x + 0.5) * cellSize, y: offsetY + (cell.y + 0.5) * cellSize }];
    });
    if (routeCells.length > 1) {
      const routeLine = new Graphics();
      const first = routeCells[0];
      if (first !== undefined) routeLine.moveTo(first.x, first.y);
      for (const point of routeCells.slice(1)) routeLine.lineTo(point.x, point.y);
      const routeColor = wayfinding.mode === "return-to-gate" ? 0xf0b84b : 0x78b7a4;
      routeLine.stroke({ color: routeColor, width: Math.max(0.9, cellSize * 0.1), alpha: hazardBeat === undefined ? 0.74 : 0.22 });
      this.worldLayer.addChild(routeLine);
      const beacons = new Graphics();
      for (let index = 0; index < routeCells.length - 1; index += 1) {
        const from = routeCells[index];
        const to = routeCells[index + 1];
        if (from === undefined || to === undefined) continue;
        for (const ratio of [0.28, 0.52, 0.76]) {
          beacons.circle(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio, Math.max(0.65, cellSize * 0.055));
        }
      }
      beacons.fill({ color: wayfinding.mode === "return-to-gate" ? 0xffd166 : 0xd8e2b7, alpha: hazardBeat === undefined ? 0.88 : 0.3 });
      this.worldLayer.addChild(beacons);
    }

    if (sightedKeyMove !== undefined) {
      const currentCell = cellsById.get(dungeon.currentCellId);
      const keyCell = cellsById.get(sightedKeyMove.destinationCellId);
      if (currentCell !== undefined && keyCell !== undefined) {
        const fromX = offsetX + (currentCell.x + 0.5) * cellSize;
        const fromY = offsetY + (currentCell.y + 0.5) * cellSize;
        const toX = offsetX + (keyCell.x + 0.5) * cellSize;
        const toY = offsetY + (keyCell.y + 0.5) * cellSize;
        const vectorX = toX - fromX;
        const vectorY = toY - fromY;
        const startX = fromX + vectorX * 0.22;
        const startY = fromY + vectorY * 0.22;
        const endX = fromX + vectorX * 0.76;
        const endY = fromY + vectorY * 0.76;
        const length = Math.max(1, Math.hypot(vectorX, vectorY));
        const unitX = vectorX / length;
        const unitY = vectorY / length;
        const wing = Math.max(1.4, cellSize * 0.18);
        const passageCue = new Graphics()
          .moveTo(startX, startY)
          .lineTo(endX, endY)
          .moveTo(endX, endY)
          .lineTo(endX - unitX * wing - unitY * wing * 0.62, endY - unitY * wing + unitX * wing * 0.62)
          .moveTo(endX, endY)
          .lineTo(endX - unitX * wing + unitY * wing * 0.62, endY - unitY * wing - unitX * wing * 0.62)
          .stroke({ color: 0xffd166, width: Math.max(1.2, cellSize * 0.12), alpha: 0.98 });
        this.lightLayer.addChild(circle(endX, endY, Math.max(2.2, cellSize * 0.24), 0xf0b84b, 0.16));
        this.worldLayer.addChild(passageCue);
      }
    }

    if (discovered.has(dungeon.exitCellId)) {
      const exit = cellsById.get(dungeon.exitCellId);
      if (exit !== undefined) {
        const x = offsetX + (exit.x + 0.24) * cellSize;
        const y = offsetY + (exit.y + 0.24) * cellSize;
        const size = cellSize * 0.52;
        const stair = new Graphics().rect(x, y, size, size).stroke({
          color: 0x8fc9e6,
          width: Math.max(1, cellSize * 0.09),
          alpha: 0.96,
        });
        stair.rect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64).stroke({
          color: 0x426d84,
          width: Math.max(0.7, cellSize * 0.055),
          alpha: 0.9,
        });
        this.worldLayer.addChild(stair);
      }
    }

    const maze = new Graphics();
    for (const cell of discoveredCells) {
      const x = offsetX + cell.x * cellSize;
      const y = offsetY + cell.y * cellSize;
      const trap = trapsByCell.get(cell.id);
      if (trap !== undefined) {
        const centerX = x + cellSize / 2;
        const centerY = y + cellSize / 2;
        const radius = Math.max(1.5, cellSize * 0.17);
        if (triggeredTrap?.cellId === cell.id) {
          const burst = new Graphics();
          for (let ray = 0; ray < 8; ray += 1) {
            const angle = ray * Math.PI / 4;
            burst.moveTo(centerX + Math.cos(angle) * radius * 0.7, centerY + Math.sin(angle) * radius * 0.7);
            burst.lineTo(centerX + Math.cos(angle) * radius * 2.3, centerY + Math.sin(angle) * radius * 2.3);
          }
          burst.stroke({ color: 0xffc857, width: Math.max(1, cellSize * 0.11), alpha: 0.96 });
          this.worldLayer.addChild(burst);
          this.worldLayer.addChild(circle(centerX, centerY, radius * 1.2, 0xb93f46, 0.95));
          this.worldLayer.addChild(new Graphics().poly([
            centerX, centerY - radius,
            centerX + radius, centerY,
            centerX, centerY + radius,
            centerX - radius, centerY,
          ]).stroke({ color: 0xffe19a, width: Math.max(1, cellSize * 0.08) }));
        } else if (trap.status === "armed") {
          const glyph = new Graphics();
          if (trap.kind === "tripwire") {
            glyph.poly([
              centerX, centerY - radius,
              centerX + radius, centerY,
              centerX, centerY + radius,
              centerX - radius, centerY,
            ]).fill({ color: 0xa64b4b, alpha: 0.96 });
            glyph.moveTo(centerX - radius * 0.75, centerY - radius * 0.35).lineTo(centerX + radius * 0.75, centerY + radius * 0.35);
            glyph.moveTo(centerX - radius * 0.75, centerY + radius * 0.35).lineTo(centerX + radius * 0.75, centerY - radius * 0.35);
          } else {
            glyph.circle(centerX, centerY, radius).fill({ color: 0x714c82, alpha: 0.96 });
            glyph.poly([
              centerX, centerY - radius * 0.72,
              centerX + radius * 0.62, centerY + radius * 0.36,
              centerX - radius * 0.62, centerY + radius * 0.36,
            ]);
            glyph.moveTo(centerX, centerY - radius * 0.72).lineTo(centerX, centerY + radius * 0.65);
          }
          glyph.stroke({ color: 0xffd39a, width: Math.max(0.8, cellSize * 0.07) });
          this.worldLayer.addChild(glyph);
        } else if (trap.status === "disarmed") {
          const safe = new Graphics().rect(centerX - radius, centerY - radius, radius * 2, radius * 2).stroke({ color: 0x83b99a, width: Math.max(0.8, cellSize * 0.075), alpha: 0.86 });
          safe.moveTo(centerX - radius * 0.7, centerY).lineTo(centerX - radius * 0.18, centerY + radius * 0.52).lineTo(centerX + radius * 0.78, centerY - radius * 0.58);
          safe.stroke({ color: 0xcce8c9, width: Math.max(0.9, cellSize * 0.08), alpha: 0.9 });
          this.worldLayer.addChild(safe);
        } else {
          const sprung = new Graphics().circle(centerX, centerY, radius).stroke({ color: 0x765b5d, width: Math.max(0.8, cellSize * 0.07), alpha: 0.62 });
          sprung.moveTo(centerX - radius, centerY + radius * 0.65).lineTo(centerX - radius * 0.1, centerY - radius * 0.08);
          sprung.moveTo(centerX + radius * 0.15, centerY + radius * 0.12).lineTo(centerX + radius, centerY - radius * 0.65);
          sprung.stroke({ color: 0x9c7772, width: Math.max(0.8, cellSize * 0.08), alpha: 0.65 });
          this.worldLayer.addChild(sprung);
        }
      } else if (cell.feature === "shrine") {
        const centerX = x + cellSize / 2;
        const centerY = y + cellSize / 2;
        const radius = Math.max(1.5, cellSize * 0.16);
        const spent = visited.has(cell.id);
        const rune = new Graphics().poly([
          centerX, centerY - radius,
          centerX + radius, centerY,
          centerX, centerY + radius,
          centerX - radius, centerY,
        ]);
        if (spent) rune.stroke({ color: 0x6ba3b8, width: Math.max(0.8, cellSize * 0.07), alpha: 0.76 });
        else rune.fill({ color: 0x6ba3b8, alpha: 0.96 }).stroke({ color: 0xbcebf0, width: Math.max(0.7, cellSize * 0.055) });
        rune.circle(centerX, centerY, Math.max(0.7, radius * 0.28)).fill({ color: spent ? 0x243039 : 0xd7fbf7, alpha: 0.95 });
        this.worldLayer.addChild(rune);
      } else if (cell.feature !== "empty" && cell.feature !== "trap") {
        const featureColor =
          cell.feature === "treasure"
            ? 0xd7b35c
            : 0x765083;
        this.worldLayer.addChild(circle(x + cellSize / 2, y + cellSize / 2, Math.max(1.2, cellSize * 0.12), featureColor));
      }
      if (!cell.exits.includes("north")) maze.moveTo(x, y).lineTo(x + cellSize, y);
      if (!cell.exits.includes("west")) maze.moveTo(x, y).lineTo(x, y + cellSize);
      if (!cell.exits.includes("east")) maze.moveTo(x + cellSize, y).lineTo(x + cellSize, y + cellSize);
      if (!cell.exits.includes("south")) maze.moveTo(x, y + cellSize).lineTo(x + cellSize, y + cellSize);
    }
    maze.stroke({ color: palette[1], width: Math.max(1, cellSize * 0.12) });
    this.worldLayer.addChild(maze);

    if (keyGate?.key !== null && keyGate?.key !== undefined) {
      const keyCell = cellsById.get(keyGate.key.cellId);
      if (keyCell !== undefined && keyGate.key.status === "sighted") {
        const centerX = offsetX + (keyCell.x + 0.5) * cellSize;
        const centerY = offsetY + (keyCell.y + 0.5) * cellSize;
        const radius = Math.max(1.3, cellSize * 0.12);
        const key = new Graphics().circle(centerX - radius * 0.65, centerY, radius).stroke({ color: 0xffd166, width: Math.max(0.9, cellSize * 0.08) });
        key.moveTo(centerX + radius * 0.3, centerY).lineTo(centerX + radius * 2.3, centerY);
        key.lineTo(centerX + radius * 2.3, centerY + radius * 0.8);
        key.moveTo(centerX + radius * 1.45, centerY).lineTo(centerX + radius * 1.45, centerY + radius * 0.65);
        key.stroke({ color: 0xffd166, width: Math.max(0.9, cellSize * 0.08) });
        this.worldLayer.addChild(circle(centerX, centerY, radius * 2.7, 0xf0b84b, 0.12));
        this.worldLayer.addChild(key);
      }
    }

    if (keyGate?.gate !== null && keyGate?.gate !== undefined) {
      const gateCell = cellsById.get(keyGate.gate.unlockCellId);
      if (gateCell !== undefined) {
        const vector = mazeDirectionVector[keyGate.gate.direction];
        const perpendicularX = -vector[1];
        const perpendicularY = vector[0];
        const centerX = offsetX + (gateCell.x + 0.5) * cellSize + vector[0] * cellSize * 0.5;
        const centerY = offsetY + (gateCell.y + 0.5) * cellSize + vector[1] * cellSize * 0.5;
        const half = cellSize * 0.39;
        const gate = new Graphics();
        if (keyGate.gate.status === "locked") {
          gate.moveTo(centerX - perpendicularX * half, centerY - perpendicularY * half)
            .lineTo(centerX + perpendicularX * half, centerY + perpendicularY * half);
          for (const offset of [-0.22, 0, 0.22]) {
            const barX = centerX + perpendicularX * cellSize * offset;
            const barY = centerY + perpendicularY * cellSize * offset;
            gate.moveTo(barX - vector[0] * cellSize * 0.17, barY - vector[1] * cellSize * 0.17)
              .lineTo(barX + vector[0] * cellSize * 0.17, barY + vector[1] * cellSize * 0.17);
          }
          gate.stroke({ color: 0xd39b48, width: Math.max(1.1, cellSize * 0.11), alpha: 0.98 });
        } else {
          for (const side of [-1, 1]) {
            const outerX = centerX + perpendicularX * half * side;
            const outerY = centerY + perpendicularY * half * side;
            const innerX = centerX + perpendicularX * half * 0.52 * side;
            const innerY = centerY + perpendicularY * half * 0.52 * side;
            gate.moveTo(outerX, outerY).lineTo(innerX, innerY);
          }
          gate.stroke({ color: 0x8fd1aa, width: Math.max(1, cellSize * 0.09), alpha: 0.92 });
          this.lightLayer.addChild(circle(centerX, centerY, Math.max(2.4, cellSize * 0.28), 0x8fd1aa, 0.14));
        }
        this.worldLayer.addChild(gate);
      }
    }

    if (wayfinding.frontierCellId !== null) {
      const frontier = cellsById.get(wayfinding.frontierCellId);
      if (frontier !== undefined) {
        const x = offsetX + frontier.x * cellSize;
        const y = offsetY + frontier.y * cellSize;
        const inset = Math.max(1.6, cellSize * 0.12);
        const corner = Math.max(2, Math.min(6, cellSize * 0.26));
        const brackets = new Graphics();
        brackets.moveTo(x + inset, y + inset + corner).lineTo(x + inset, y + inset).lineTo(x + inset + corner, y + inset);
        brackets.moveTo(x + cellSize - inset - corner, y + inset).lineTo(x + cellSize - inset, y + inset).lineTo(x + cellSize - inset, y + inset + corner);
        brackets.moveTo(x + inset, y + cellSize - inset - corner).lineTo(x + inset, y + cellSize - inset).lineTo(x + inset + corner, y + cellSize - inset);
        brackets.moveTo(x + cellSize - inset - corner, y + cellSize - inset).lineTo(x + cellSize - inset, y + cellSize - inset).lineTo(x + cellSize - inset, y + cellSize - inset - corner);
        brackets.stroke({ color: 0x9fd5bd, width: Math.max(0.9, cellSize * 0.075), alpha: hazardBeat === undefined ? 0.9 : 0.34 });
        this.worldLayer.addChild(brackets);
      }
    }

    const passageAnchorId = wayfinding.mode === "explore" ? wayfinding.frontierCellId : dungeon.currentCellId;
    const passageAnchor = passageAnchorId === null ? undefined : cellsById.get(passageAnchorId);
    const passageDirections = wayfinding.nextPassageDirections;
    if (passageAnchor !== undefined && passageDirections.length > 0) {
      const arrows = new Graphics();
      const centerX = offsetX + (passageAnchor.x + 0.5) * cellSize;
      const centerY = offsetY + (passageAnchor.y + 0.5) * cellSize;
      for (const direction of passageDirections) {
        const vector = mazeDirectionVector[direction];
        const perpendicularX = -vector[1];
        const perpendicularY = vector[0];
        const tipX = centerX + vector[0] * cellSize * 0.43;
        const tipY = centerY + vector[1] * cellSize * 0.43;
        const tailX = centerX + vector[0] * cellSize * 0.24;
        const tailY = centerY + vector[1] * cellSize * 0.24;
        arrows.moveTo(tailX + perpendicularX * cellSize * 0.1, tailY + perpendicularY * cellSize * 0.1)
          .lineTo(tipX, tipY)
          .lineTo(tailX - perpendicularX * cellSize * 0.1, tailY - perpendicularY * cellSize * 0.1);
      }
      arrows.stroke({ color: wayfinding.mode === "explore" ? 0xffd166 : 0xa8dbc7, width: Math.max(1, cellSize * 0.09), alpha: hazardBeat === undefined ? 0.96 : 0.38 });
      this.worldLayer.addChild(arrows);
    }

    const current = cellsById.get(dungeon.currentCellId);
    if (current !== undefined) {
      const x = offsetX + (current.x + 0.5) * cellSize;
      const y = offsetY + (current.y + 0.5) * cellSize;
      this.lightLayer.addChild(circle(x, y, Math.max(2.5, cellSize * 0.24), palette[2]));
      this.lightLayer.addChild(circle(x, y, Math.max(5, cellSize * 0.5), palette[2], 0.13));
      this.drawHero(state, x, y + cellSize * 0.05, palette, Math.max(0.13, Math.min(0.58, cellSize / 48)));
      this.host.dataset.dungeonHeroCell = current.id;
      if (keyGate?.key?.status === "carried") {
        const carriedX = x + Math.max(2.2, cellSize * 0.28);
        const carriedY = y - Math.max(2.2, cellSize * 0.28);
        this.lightLayer.addChild(circle(carriedX, carriedY, Math.max(1.2, cellSize * 0.1), 0xffd166));
        this.lightLayer.addChild(new Graphics().moveTo(carriedX + cellSize * 0.08, carriedY).lineTo(carriedX + cellSize * 0.22, carriedY).stroke({ color: 0xffd166, width: Math.max(0.8, cellSize * 0.06) }));
      }
    }
    if (shrineUse !== null) {
      const shrineCell = cellsById.get(shrineUse.cellId);
      if (shrineCell !== undefined) {
        const shrineX = offsetX + (shrineCell.x + 0.5) * cellSize;
        const shrineY = offsetY + (shrineCell.y + 0.5) * cellSize;
        const radiance = new Graphics()
          .circle(shrineX, shrineY, Math.max(3, cellSize * 0.3))
          .circle(shrineX, shrineY, Math.max(5, cellSize * 0.52))
          .circle(shrineX, shrineY, Math.max(7, cellSize * 0.74))
          .stroke({ color: 0x9ce2df, width: Math.max(0.8, cellSize * 0.06), alpha: 0.52 });
        this.lightLayer.addChild(circle(shrineX, shrineY, Math.max(7, cellSize * 0.72), 0x72d3c9, 0.16));
        this.worldLayer.addChild(radiance);
      }
    }
    const latestDungeonMessage = state.depth.log.at(-1)?.category === "dungeon" ? state.depth.log.at(-1)?.message ?? "" : "";
    const mechanismBeat = shrineUse !== null && shrineSummary !== null
      ? { title: shrineSummary === "RESOURCES FULL" ? "SHRINE FOUND" : "SHRINE AWAKENS", detail: shrineSummary, color: 0x275b59 }
      : latestDungeonMessage.includes("finds the Wayfinder Key")
        ? { title: "KEY FOUND", detail: "WAYFINDER KEY · RETURN TO THE SEALED GATE", color: 0x5b4820 }
      : latestDungeonMessage.includes("Wayfinder Gate is open")
        ? { title: "GATE OPEN", detail: "SHORTCUT UNSEALED · CROSSING NEXT", color: 0x274f3d }
        : latestDungeonMessage.includes("crosses the opened Wayfinder Gate")
          ? { title: "SHORTCUT CROSSED", detail: latestDungeonMessage.includes("far stair") ? "THE FAR STAIR IS REACHED" : "THE MAZE FOLDS BEHIND THE HERO", color: 0x315766 }
          : null;
    if (mechanismBeat !== null && hazardBeat === undefined) {
      const bannerTextResolution = projectedTextResolution(
        this.app.renderer.resolution,
        calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight).scale,
      );
      const title = new Text({ text: mechanismBeat.title, style: { fontFamily: "Inter, sans-serif", fontSize: 7, fill: 0xffe4a1, fontWeight: "800", letterSpacing: 1.1 }, resolution: bannerTextResolution, roundPixels: true });
      const detail = new Text({ text: mechanismBeat.detail, style: { fontFamily: "ui-monospace, monospace", fontSize: 4.5, fill: 0xf5ead5, fontWeight: "700", letterSpacing: 0.35 }, resolution: bannerTextResolution, roundPixels: true });
      this.scaleSensitiveTexts.push(title, detail);
      title.position.set(110, 5);
      detail.position.set(110, 15);
      this.worldLayer.addChild(rect(101, 2, 181, 23, 0x111820, 0.94));
      this.worldLayer.addChild(rect(101, 2, 4, 23, mechanismBeat.color));
      this.worldLayer.addChild(title, detail);
    }
    if (hazardBeat !== undefined) {
      const hazardCell = cellsById.get(hazardBeat.cellId);
      if (hazardCell !== undefined) {
        const focusX = offsetX + (hazardCell.x + 0.5) * cellSize;
        const focusY = offsetY + (hazardCell.y + 0.5) * cellSize;
        const focusRadius = Math.max(3.2, cellSize * 0.34);
        const focus = new Graphics();
        if (detectedTrap !== undefined) {
          focus.circle(focusX, focusY, focusRadius).stroke({ color: 0xffd166, width: Math.max(1, cellSize * 0.08), alpha: 0.9 });
          for (let ray = 0; ray < 4; ray += 1) {
            const angle = ray * Math.PI / 2;
            focus.moveTo(focusX + Math.cos(angle) * focusRadius * 1.15, focusY + Math.sin(angle) * focusRadius * 1.15);
            focus.lineTo(focusX + Math.cos(angle) * focusRadius * 1.65, focusY + Math.sin(angle) * focusRadius * 1.65);
          }
          focus.stroke({ color: 0xffe4a1, width: Math.max(0.8, cellSize * 0.065), alpha: 0.88 });
        } else if (disarmedTrap !== undefined) {
          focus.rect(focusX - focusRadius, focusY - focusRadius, focusRadius * 2, focusRadius * 2).stroke({ color: 0x9ed3aa, width: Math.max(1, cellSize * 0.08), alpha: 0.86 });
        }
        this.lightLayer.addChild(focus);
      }
      const currentY = current === undefined
        ? designHeight / 2
        : offsetY + (current.y + 0.5) * cellSize;
      const panelX = 124;
      const panelY = currentY < designHeight / 2 ? 130 : 24;
      const panelWidth = 120;
      const alertLabel = triggeredTrap !== undefined ? "TRAP SPRUNG" : detectedTrap !== undefined ? "TRAP DETECTED" : "TRAP DISARMED";
      const alertTextResolution = projectedTextResolution(
        this.app.renderer.resolution,
        calculateSceneLayout(this.app.screen.width, this.app.screen.height, designWidth, designHeight).scale,
      );
      const banner = new Text({
        text: alertLabel,
        style: { fontFamily: "Inter, sans-serif", fontSize: 7, fill: triggeredTrap !== undefined ? 0xffd37f : detectedTrap !== undefined ? 0xffe49b : 0xcce8c9, fontWeight: "800", letterSpacing: 1.1 },
        resolution: alertTextResolution,
        roundPixels: true,
      });
      const result = new Text({
        text: `${dungeonTrapKindLabel(hazardBeat.kind)} · ${state.scene.consequence}`,
        style: { fontFamily: "Georgia, serif", fontSize: 5.3, fill: 0xffedc2, wordWrap: true, wordWrapWidth: panelWidth - 12, lineHeight: 6.6 },
        resolution: alertTextResolution,
        roundPixels: true,
      });
      this.scaleSensitiveTexts.push(banner, result);
      this.dungeonAlertTexts.push(banner, result);
      this.host.dataset.dungeonAlertLabel = alertLabel;
      banner.position.set(panelX + 6, panelY + 4);
      result.position.set(panelX + 6, panelY + 15);
      this.worldLayer.addChild(rect(panelX, panelY, panelWidth, Math.max(29, result.height + 20), 0x171014));
      this.worldLayer.addChild(rect(panelX, panelY, panelWidth, 12, triggeredTrap !== undefined ? 0x521f28 : detectedTrap !== undefined ? 0x5b4820 : 0x274f3d));
      this.worldLayer.addChild(banner);
      this.worldLayer.addChild(result);
    }
  }

  private drawBattle(state: WorldState, palette: readonly [number, number, number]): void {
    const commandType = state.chronicle.at(-1)?.commandType;
    const isCounterDuelBeat = commandType === "start-counter-duel" || commandType === "counter-duel-action";
    const counterDuel = state.depth.counterDuel ?? (isCounterDuelBeat ? state.depth.completedCounterDuels.at(-1) : undefined);
    if (counterDuel !== undefined) {
      this.drawCounterDuel(state, counterDuel, palette);
      return;
    }
    this.worldLayer.addChild(rect(0, 128, designWidth, 52, 0x3b3034));
    const combat = state.depth.combat ?? state.depth.completedCombats.at(-1);
    if (combat === undefined) {
      this.drawHero(state, 91, 139, palette);
      return;
    }
    this.host.dataset.combatId = combat.id;
    this.host.dataset.combatTurn = String(combat.turn);
    this.host.dataset.combatPhase = "settled";
    this.host.dataset.encounterEngine = "rpg-combat";
    this.host.dataset.combatThreatRating = combat.threat.rating;
    const threatText = describeEncounterThreat(combat.threat);
    this.host.dataset.combatThreatEquation = threatText;
    if (combat.threat.rating === "place-bound") {
      this.host.dataset.combatThreatScore = String(combat.threat.encounterScore);
      this.host.dataset.combatThreatBand = combat.threat.band;
    }
    const latestTurn = projectLatestCombatTurn(combat);
    const battleParty = projectParty(state.depth);
    const roadcraftImpact = latestTurn === null
      ? null
      : [battleParty.active, ...battleParty.former]
          .flatMap((companion) => companion?.roadcraftEffectiveness?.latestImpact ?? [])
          .find((impact) => impact.combatId === combat.id && impact.turn === latestTurn.turn) ?? null;
    const cue = projectLatestCombatCue(combat, roadcraftImpact);
    const weaponForm = projectCombatFamiliarWeaponForm(state.depth.hero, combat, cue);
    const combatWeapon = weaponForm === null
      ? undefined
      : state.depth.hero.inventory.find((item) => item.id === weaponForm.weaponId);
    const combatWeaponAppearance = combatWeapon === undefined ? undefined : projectGearAppearance(combatWeapon) ?? undefined;
    if (weaponForm !== null) {
      const battleCopy = `${weaponForm.terminal ? `Resolved with ${weaponForm.weaponName}` : weaponForm.weaponName} · Use L${weaponForm.displayedMasteryLevel} · Familiar Form: ${weaponForm.formName} · no combat bonus`;
      this.host.dataset.weaponFormId = weaponForm.formId;
      this.host.dataset.weaponFormWeapon = weaponForm.weaponId;
      this.host.dataset.weaponFormSilhouette = weaponForm.silhouette;
      this.host.dataset.weaponFormLevel = String(weaponForm.displayedMasteryLevel);
      this.host.dataset.weaponFormUnlockReceipt = weaponForm.unlockReceiptId;
      this.host.dataset.weaponFormSourceCombat = weaponForm.sourceCombatId;
      this.host.dataset.weaponFormTerminal = String(weaponForm.terminal);
      this.host.dataset.weaponFormBonus = String(weaponForm.mechanicalBonus);
      this.host.dataset.weaponFormCopy = battleCopy;
    }
    const threatMarker = new Graphics();
    const band = combat.threat.rating === "place-bound" ? combat.threat.band : "legacy-unrated";
    if (band === "minor") threatMarker.circle(12, 8.5, 3.2).stroke({ color: 0xffdf8a, width: 1 });
    else if (band === "guarded") threatMarker.rect(8.8, 5.3, 6.4, 6.4).stroke({ color: 0xffdf8a, width: 1 });
    else if (band === "perilous") threatMarker.poly([12, 4.7, 15.8, 8.5, 12, 12.3, 8.2, 8.5]).stroke({ color: 0xffdf8a, width: 1 });
    else if (band === "dire") threatMarker.poly([12, 4.3, 16, 12.1, 8, 12.1]).stroke({ color: 0xffdf8a, width: 1 });
    else if (band === "extreme") threatMarker.poly([12, 4.1, 13.2, 7.1, 16.4, 7.3, 14, 9.4, 14.8, 12.6, 12, 10.8, 9.2, 12.6, 10, 9.4, 7.6, 7.3, 10.8, 7.1]).stroke({ color: 0xffdf8a, width: 1 });
    else threatMarker.moveTo(8.5, 8.5).lineTo(15.5, 8.5).stroke({ color: 0xb6a890, width: 1 });
    const battleOverlayTop = 28;
    const threatLabel = this.createScaleSensitiveText(threatText.toUpperCase(), {
      fontFamily: "ui-monospace, monospace", fontSize: 4.25, fill: 0xffefc2, fontWeight: "800", wordWrap: true, wordWrapWidth: 286, lineHeight: 5.1,
    });
    threatMarker.position.y = battleOverlayTop;
    threatLabel.position.set(20, battleOverlayTop + 2.4);
    this.worldLayer.addChild(rect(6, battleOverlayTop, 308, 11.5, 0x171014, 0.88), threatMarker, threatLabel);
    const rosterProjection = projectCombatRoster(combat);
    const summary = rosterProjection?.latestTurn ?? null;
    const battleHeaderY = battleOverlayTop + 15;
    let rosterTop = battleHeaderY;
    if (summary !== null) {
      this.host.dataset.combatEvent = summary.id;
      this.host.dataset.combatActor = summary.actorId;
      this.host.dataset.combatTarget = summary.targetId ?? "none";
      this.host.dataset.combatAction = summary.action;
      this.host.dataset.combatInterrupted = String(summary.intentInterrupted);
      if (summary.abilityId !== null) this.host.dataset.combatAbility = summary.abilityId;
      if (summary.companionAction !== null) {
        this.host.dataset.combatCompanionAction = summary.companionAction.companionActionId;
        this.host.dataset.combatCompanionActionReadyRound = String(summary.companionAction.readyRoundAfter);
      }
      if (roadcraftImpact !== null) {
        this.host.dataset.combatRoadcraftImpact = roadcraftImpact.kind;
        this.host.dataset.combatRoadcraftSourceEvent = roadcraftImpact.sourceEventId;
        this.host.dataset.combatRoadcraftPreventedDamage = String(roadcraftImpact.preventedDamage);
      }
      if (summary.mana !== null) {
        this.host.dataset.combatManaDelta = `${summary.mana.manaBefore}:${summary.mana.amount}:${summary.mana.manaAfter}`;
      }
      if (summary.restorative !== null) {
        this.host.dataset.combatItem = summary.restorative.itemId;
        this.host.dataset.combatQuantityDelta = `${summary.restorative.quantityBefore}:${summary.restorative.quantityAfter}`;
        this.host.dataset.combatHealingDelta = `${summary.restorative.healthBefore}:${summary.restorative.amount}:${summary.restorative.healthAfter}`;
      }
      if (summary.damage !== null) {
        this.host.dataset.combatHealthDelta = `${summary.damage.healthBefore}:${summary.damage.amount}:${summary.damage.healthAfter}`;
      }
      if (summary.statusEvents.length > 0) {
        this.host.dataset.combatStatuses = summary.statusEvents.map((event) => `${event.kind}:${event.status}`).join(",");
        this.host.dataset.combatStatusDurations = summary.statusEvents.map((event) =>
          `${event.status}:${event.kind === "status-applied" ? event.durationBefore ?? 0 : event.durationBefore}->${event.durationAfter}`
        ).join(",");
      }
      if (summary.defeatedIds.length > 0) this.host.dataset.combatDefeated = summary.defeatedIds.join(",");
      if (summary.outcome !== null) this.host.dataset.combatOutcome = summary.outcome;
      const turnLabel = this.createScaleSensitiveText(`TURN ${summary.turn}`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.6, fill: 0xffc857, fontWeight: "900", letterSpacing: 0.7,
      });
      turnLabel.position.set(11, battleHeaderY + 3);
      const formLine = weaponForm === null
        ? ""
        : `\n${weaponForm.terminal ? `RESOLVED WITH ${weaponForm.weaponName.toUpperCase()} · ` : ""}USE L${weaponForm.displayedMasteryLevel} · FAMILIAR FORM · ${weaponForm.formName.toUpperCase()} · NO COMBAT BONUS`;
      const roadcraftImpactLine = roadcraftImpact === null
        ? ""
        : roadcraftImpact.kind === "flour-veil"
          ? `\nFLOUR VEIL · ${roadcraftImpact.preventedDamage} HP PREVENTED`
          : "\nMILLSTONE DRAG · ATTACK WEAKENED";
      const strip = this.createScaleSensitiveText(`${summary.text}${roadcraftImpactLine}${formLine}`, {
        fontFamily: "ui-monospace, monospace", fontSize: 5.05, fill: 0xfff1d1, fontWeight: "700", wordWrap: true, wordWrapWidth: 186, lineHeight: 6.3,
      });
      strip.position.set(50, battleHeaderY + 2);
      const stripHeight = Math.max(18, strip.height + 8);
      rosterTop = battleHeaderY + stripHeight + 3;
      this.worldLayer.addChild(rect(6, battleHeaderY, 308, stripHeight, 0x171014, 0.92));
      this.worldLayer.addChild(rect(6, battleHeaderY, 39, stripHeight, 0x4b252b, 0.96));
      this.worldLayer.addChild(turnLabel, strip);
    }
    const activeId = rosterProjection?.activeUnitId ?? undefined;
    const rosterOverlayBottom = rosterProjection === null
      ? battleHeaderY
      : projectCombatRosterLayout(rosterProjection.units.length, rosterTop).bottom;
    const heroes = combat.combatants.filter((unit) => unit.side === "heroes");
    const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
    const unitVisuals = new Map<string, BattleUnitVisual>();
    for (let index = 0; index < heroes.length; index += 1) {
      const unit = heroes[index];
      if (unit === undefined) continue;
      const x = 74 + index * 34;
      const y = 139 - index * 14;
      const companion = state.depth.companions.active.find((entry) => entry.identity.residentId === unit.id);
      const isCanonicalHero = unit.id === state.depth.hero.id;
      const layer = isCanonicalHero
        ? this.drawHero(state, x, y, palette, 1, state.depth.hero.id, true, combatWeaponAppearance)
        : this.drawCompanion(state, unit.id, companion?.identity.role ?? "traveler", x, y, palette, 0.94, unit.health === 0);
      const heroRig = isCanonicalHero ? this.heroRigs.at(-1) ?? null : null;
      layer.alpha = unit.health > 0 ? 1 : 0.36;
      unitVisuals.set(unit.id, { layer, x, y, heroRig });
      this.drawHealthBar(x - 12, y + 17, 24, unit.health, unit.maxHealth, unit.id === activeId);
      this.drawStatusMarkers(unit, x, projectCombatCueVerticalLayout(y, rosterOverlayBottom).statusCenterY);
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const unit = enemies[index];
      if (unit === undefined) continue;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 210 + column * 34;
      const y = 117 + row * 39;
      const layer = this.drawMonster(unit, x, y, palette);
      layer.alpha = unit.health > 0 ? 1 : 0.36;
      unitVisuals.set(unit.id, { layer, x, y, heroRig: null });
      this.drawHealthBar(x - 13, y + 13, 26, unit.health, unit.maxHealth, unit.id === activeId);
      this.drawStatusMarkers(unit, x, projectCombatCueVerticalLayout(y, rosterOverlayBottom).statusCenterY);
    }

    if (rosterProjection !== null) {
      this.host.dataset.combatRoster = JSON.stringify(rosterProjection.units.map((unit) => ({
        id: unit.id,
        side: unit.side,
        alive: unit.alive,
        health: unit.health,
        maxHealth: unit.maxHealth,
        mana: unit.mana,
        maxMana: unit.maxMana,
      })));
      this.host.dataset.combatRosterStatuses = JSON.stringify(rosterProjection.units.map((unit) => ({
        id: unit.id,
        statuses: unit.statuses,
      })));
      this.host.dataset.combatUpcoming = JSON.stringify(rosterProjection.upcomingTurns.map((turn) => turn.unitId));
      this.host.dataset.combatActiveUnit = rosterProjection.activeUnitId ?? "none";
      this.host.dataset.combatFocusTarget = rosterProjection.focusTargetId ?? "none";
      this.host.dataset.combatFocusKind = rosterProjection.focusKind;
      this.drawCombatRoster(rosterProjection, rosterTop, unitVisuals);
    }

    const actor = cue === null ? undefined : unitVisuals.get(cue.actorId);
    const target = cue === null ? undefined : unitVisuals.get(cue.targetId);
    if (cue !== null && actor !== undefined && target !== undefined) {
      if (this.battleCueId !== cue.id) {
        this.battleCueId = cue.id;
        this.battleCueStartedAt = this.elapsed;
      }
      const effectLayer = this.drawCombatEffect(cue, target.x, target.y - 12);
      const weaponFormGlyph = weaponForm === null
        ? null
        : this.drawFamiliarWeaponFormGlyph(weaponForm, actor.x + (cue.actorSide === "heroes" ? 31 : -31), actor.y - 13);
      this.battleBinding = { cue, actor, target, effectLayer, weaponForm, weaponFormGlyph, weaponFormPose: null };
      this.updateBattleAnimation();
      this.updateHeroRigs();
    }
  }

  private createScaleSensitiveText(text: string, style: TextStyleOptions): Text {
    const sceneScale = calculateSceneLayout(
      this.app.screen.width,
      this.app.screen.height,
      designWidth,
      designHeight,
    ).scale;
    const label = new Text({
      text,
      style,
      resolution: projectedTextResolution(this.app.renderer.resolution, sceneScale),
      roundPixels: true,
    });
    this.scaleSensitiveTexts.push(label);
    return label;
  }

  private drawCombatRosterStatus(status: CombatRosterStatus, x: number, y: number): void {
    const color = status.kind === "guarding"
      ? 0x7ab6d9
      : status.kind === "poisoned"
        ? 0x8fcf64
        : status.kind === "weakened"
          ? 0xb88ad4
          : 0xff8d4d;
    const icon = new Graphics();
    if (status.kind === "guarding") icon.rect(x - 2.2, y - 2.2, 4.4, 4.4).stroke({ color, width: 1 });
    else if (status.kind === "poisoned") icon.circle(x, y, 2.2).fill(color);
    else if (status.kind === "weakened") icon.poly([x, y - 2.8, x + 2.8, y, x, y + 2.8, x - 2.8, y]).stroke({ color, width: 1 });
    else icon.poly([x, y - 3, x + 2.7, y + 2.4, x - 2.7, y + 2.4]).fill(color);
    this.worldLayer.addChild(icon);
    const duration = this.createScaleSensitiveText(`${status.kind[0]?.toUpperCase() ?? "?"}${status.duration}`, {
      fontFamily: "ui-monospace, monospace",
      fontSize: 3.2,
      fill: 0xfff1d1,
      fontWeight: "800",
    });
    duration.position.set(x + 3.4, y - 2.2);
    this.worldLayer.addChild(duration);
  }

  private drawCombatRoster(
    projection: CombatRosterProjection,
    top: number,
    unitVisuals: ReadonlyMap<string, BattleUnitVisual>,
  ): void {
    const layout = projectCombatRosterLayout(projection.units.length, top);
    for (let index = 0; index < layout.plates.length; index += 1) {
      const bounds = layout.plates[index];
      const unit = projection.units[index];
      if (bounds === undefined || unit === undefined) continue;
      const sideColor = unit.side === "heroes" ? 0x315c73 : 0x6e3437;
      const borderColor = unit.isFocused ? 0xffe7a3 : unit.isActive ? 0xffc857 : unit.alive ? 0x87909a : 0x777b80;
      const plate = new Graphics()
        .rect(bounds.x, bounds.y, bounds.width, bounds.height)
        .fill({ color: unit.alive ? 0x14171d : 0x202126, alpha: 0.94 })
        .stroke({ color: borderColor, width: unit.isFocused || unit.isActive ? 1.2 : 0.55, alpha: 0.9 });
      plate.rect(bounds.x, bounds.y, 3, bounds.height).fill({ color: sideColor, alpha: 0.95 });
      if (!unit.alive) {
        plate.moveTo(bounds.x + 3, bounds.y + 1).lineTo(bounds.x + bounds.width - 1, bounds.y + bounds.height - 1)
          .moveTo(bounds.x + bounds.width - 1, bounds.y + 1).lineTo(bounds.x + 3, bounds.y + bounds.height - 1)
          .stroke({ color: 0xe0848a, width: 0.65, alpha: 0.55 });
      }
      this.worldLayer.addChild(plate);

      const compactName = unit.name.length > 12 ? `${unit.name.slice(0, 11)}…` : unit.name;
      const name = this.createScaleSensitiveText(compactName, {
        fontFamily: "Georgia, serif",
        fontSize: 3.8,
        fill: unit.alive ? 0xfff1d1 : 0xa7abb1,
        fontWeight: "800",
      });
      name.position.set(bounds.x + 5, bounds.y + 1.1);
      const resources = this.createScaleSensitiveText(`HP ${unit.health}/${unit.maxHealth}  MP ${unit.mana}/${unit.maxMana}`, {
        fontFamily: "ui-monospace, monospace",
        fontSize: 3.05,
        fill: 0xcbd5df,
        fontWeight: "700",
      });
      resources.anchor.set(1, 0);
      resources.position.set(bounds.x + bounds.width - 2, bounds.y + 1.6);
      this.worldLayer.addChild(name, resources);

      for (let statusIndex = 0; statusIndex < Math.min(4, unit.statuses.length); statusIndex += 1) {
        const status = unit.statuses[statusIndex];
        if (status !== undefined) this.drawCombatRosterStatus(status, bounds.x + 7 + statusIndex * 17, bounds.y + 10.3);
      }
      const badgeText = !unit.alive
        ? "DEAD"
        : unit.isFocused
          ? projection.focusKind === "self-effect" ? "SELF FX" : "TARGET"
          : unit.isActive
            ? "NEXT"
            : unit.actedLast
              ? "ACTED"
              : "";
      if (badgeText !== "") {
        const badge = this.createScaleSensitiveText(badgeText, {
          fontFamily: "Inter, sans-serif",
          fontSize: 3.1,
          fill: unit.isFocused ? 0xffe7a3 : unit.isActive ? 0xffc857 : unit.alive ? 0xb9c2ca : 0xff9ca3,
          fontWeight: "900",
          letterSpacing: 0.25,
        });
        badge.anchor.set(1, 0);
        badge.position.set(bounds.x + bounds.width - 2, bounds.y + 9);
        this.worldLayer.addChild(badge);
      }
    }

    this.worldLayer.addChild(rect(layout.upcoming.x, layout.upcoming.y, layout.upcoming.width, layout.upcoming.height, 0x171014, 0.94));
    const nextLabel = this.createScaleSensitiveText(projection.upcomingTurns.length === 0 ? projection.outcome.toUpperCase() : "NEXT", {
      fontFamily: "Inter, sans-serif",
      fontSize: 3.5,
      fill: projection.upcomingTurns.length === 0 ? 0xcbd5df : 0xffc857,
      fontWeight: "900",
      letterSpacing: 0.45,
    });
    nextLabel.position.set(layout.upcoming.x + 4, layout.upcoming.y + 2.3);
    this.worldLayer.addChild(nextLabel);
    for (let index = 0; index < projection.upcomingTurns.length; index += 1) {
      const turn = projection.upcomingTurns[index];
      if (turn === undefined) continue;
      const slotX = layout.upcoming.x + 43 + index * 86;
      this.worldLayer.addChild(circle(slotX, layout.upcoming.y + 4.5, 3.1, index === 0 ? 0xffc857 : 0x755157));
      const slot = this.createScaleSensitiveText(String(turn.slot), {
        fontFamily: "ui-monospace, monospace",
        fontSize: 3.2,
        fill: index === 0 ? 0x24181c : 0xfff1d1,
        fontWeight: "900",
      });
      slot.anchor.set(0.5);
      slot.position.set(slotX, layout.upcoming.y + 4.3);
      const compactName = turn.unitName.length > 15 ? `${turn.unitName.slice(0, 14)}…` : turn.unitName;
      const turnName = this.createScaleSensitiveText(compactName, {
        fontFamily: "Inter, sans-serif",
        fontSize: 3.4,
        fill: 0xffedc2,
        fontWeight: "800",
      });
      turnName.position.set(slotX + 5, layout.upcoming.y + 2.2);
      this.worldLayer.addChild(slot, turnName);
    }

    if (projection.focusTargetId !== null) {
      const target = unitVisuals.get(projection.focusTargetId);
      if (target !== undefined) {
        const left = target.x - 22;
        const right = target.x + 22;
        const cueLayout = projectCombatCueVerticalLayout(target.y, layout.bottom);
        const topY = cueLayout.reticleTop;
        const bottom = cueLayout.reticleBottom;
        const reticle = new Graphics()
          .moveTo(left + 7, topY).lineTo(left, topY).lineTo(left, topY + 7)
          .moveTo(right - 7, topY).lineTo(right, topY).lineTo(right, topY + 7)
          .moveTo(left, bottom - 7).lineTo(left, bottom).lineTo(left + 7, bottom)
          .moveTo(right - 7, bottom).lineTo(right, bottom).lineTo(right, bottom - 7)
          .stroke({ color: 0xffe7a3, width: 1.2, alpha: 0.92 });
        const reticleLabel = this.createScaleSensitiveText(projection.focusKind === "self-effect" ? "SELF EFFECT" : "TARGET", {
          fontFamily: "Inter, sans-serif",
          fontSize: 3.4,
          fill: 0xffe7a3,
          fontWeight: "900",
          letterSpacing: 0.35,
        });
        reticleLabel.anchor.set(0.5, 0);
        reticleLabel.position.set(target.x, topY + 2);
        this.lightLayer.addChild(reticle, reticleLabel);
      }
    }

    for (const unit of projection.units) {
      const visual = unitVisuals.get(unit.id);
      if (visual === undefined) continue;
      if (!unit.alive) {
        const defeated = new Graphics()
          .moveTo(visual.x - 13, visual.y - 31).lineTo(visual.x + 13, visual.y + 8)
          .moveTo(visual.x + 13, visual.y - 31).lineTo(visual.x - 13, visual.y + 8)
          .stroke({ color: 0xff9ca3, width: 1.5, alpha: 0.82 });
        const defeatedLabel = this.createScaleSensitiveText("DEFEATED", { fontFamily: "Inter, sans-serif", fontSize: 3.4, fill: 0xffb2b8, fontWeight: "900" });
        defeatedLabel.anchor.set(0.5, 0);
        defeatedLabel.position.set(visual.x, visual.y + 9);
        this.lightLayer.addChild(defeated, defeatedLabel);
      }
    }
  }

  private drawCounterDuelGlyph(stance: CounterDuelStance, x: number, y: number, color: number): Container {
    const glyph = new Container();
    glyph.position.set(x, y);
    glyph.addChild(circle(0, 0, 11, color, 0.12));
    if (stance === "rush") {
      glyph.addChild(new Graphics().poly([-9, -7, 9, 0, -9, 7, -4, 0]).fill(color));
    } else if (stance === "ward") {
      glyph.addChild(new Graphics().poly([0, -9, 8, -5, 7, 5, 0, 10, -7, 5, -8, -5]).stroke({ color, width: 2 }));
      glyph.addChild(new Graphics().moveTo(0, -7).lineTo(0, 7).stroke({ color, width: 1 }));
    } else {
      glyph.addChild(new Graphics().moveTo(-8, -7).bezierCurveTo(9, -10, 8, 2, -2, 2).bezierCurveTo(-9, 2, -7, 10, 7, 8).stroke({ color, width: 2 }));
      glyph.addChild(circle(7, 8, 2, color));
    }
    return glyph;
  }

  private drawPatternBreakSignature(signature: PatternBreakSignatureV1): Container {
    const layer = new Container();
    const { primary, accent, highlight } = signature.colors;
    layer.addChild(new Graphics().ellipse(0, 1, 55, 18).stroke({ color: primary, width: 1.2, alpha: 0.72 }));
    const motif = new Graphics();
    if (signature.motif === "broken-crescents") {
      motif.moveTo(-7, -11).bezierCurveTo(-27, -9, -27, 9, -7, 11);
      motif.moveTo(7, -11).bezierCurveTo(27, -9, 27, 9, 7, 11);
      motif.stroke({ color: accent, width: 2.2, alpha: 0.96 });
      motif.moveTo(-17, 14).lineTo(-12, 10).lineTo(-7, 14).moveTo(7, 14).lineTo(12, 10).lineTo(17, 14);
      motif.stroke({ color: highlight, width: 1.2, alpha: 0.9 });
    } else if (signature.motif === "stepped-lattice") {
      motif.moveTo(-30, -12).lineTo(-18, -12).lineTo(-18, -5).lineTo(-7, -5).lineTo(-7, 8).lineTo(-20, 8).lineTo(-20, 14);
      motif.moveTo(30, -12).lineTo(18, -12).lineTo(18, -5).lineTo(7, -5).lineTo(7, 8).lineTo(20, 8).lineTo(20, 14);
      motif.stroke({ color: accent, width: 2.1, alpha: 0.96 });
      motif.moveTo(-4, -14).lineTo(-4, 14).moveTo(4, -14).lineTo(4, 14);
      motif.stroke({ color: highlight, width: 1.1, alpha: 0.88 });
    } else if (signature.motif === "ripple-ribbons") {
      for (const offset of [-7, 0, 7]) {
        motif.moveTo(-33, offset).bezierCurveTo(-17, offset - 12, 15, offset + 12, 33, offset);
      }
      motif.stroke({ color: accent, width: 1.8, alpha: 0.94 });
      motif.moveTo(-4, -14).bezierCurveTo(4, -8, -4, 8, 4, 14);
      motif.stroke({ color: highlight, width: 1.2, alpha: 0.9 });
    } else if (signature.motif === "shutter-frames") {
      motif.rect(-30, -13, 22, 26).rect(8, -10, 22, 20);
      motif.stroke({ color: accent, width: 2, alpha: 0.96 });
      motif.poly([-18, -8, -4, 0, -18, 8, -26, 0]).stroke({ color: highlight, width: 1.3, alpha: 0.9 });
      motif.poly([18, -7, 27, 0, 18, 7, 10, 0]).stroke({ color: highlight, width: 1.3, alpha: 0.9 });
    } else {
      motif.moveTo(-34, 10).bezierCurveTo(-27, -14, -11, -14, -5, 3);
      motif.moveTo(34, 10).bezierCurveTo(27, -14, 11, -14, 5, 3);
      motif.stroke({ color: accent, width: 2.2, alpha: 0.96 });
      motif.poly([-12, 13, 0, 4, 12, 13]).stroke({ color: highlight, width: 1.5, alpha: 0.92 });
    }
    layer.addChild(motif);
    const breakLabel = this.createScaleSensitiveText("PATTERN BREAK", { fontFamily: "Georgia, serif", fontSize: 7.8, fill: highlight, fontWeight: "900", letterSpacing: 1.05 });
    breakLabel.anchor.set(0.5); breakLabel.position.set(0, -29);
    const speciesLabel = this.createScaleSensitiveText(`SIGNATURE · ${signature.speciesName.toUpperCase()}`, { fontFamily: "Inter, sans-serif", fontSize: 4.2, fill: highlight, fontWeight: "900", letterSpacing: 0.4 });
    speciesLabel.anchor.set(0.5); speciesLabel.position.set(0, -19);
    layer.addChild(rect(-55, -37, 110, 25, 0x241820, 0.94), breakLabel, speciesLabel);
    return layer;
  }

  private drawPatternBreakObserverReaction(reaction: PatternBreakObserverReactionV1): Container {
    const layer = new Container();
    layer.position.set(counterDuelWitnessLayout.centerX, counterDuelWitnessLayout.centerY);
    const color = reaction.motionMode === "restrained" ? 0xdf8b75 : 0x91d2c6;
    const panel = new Graphics()
      .roundRect(
        -counterDuelWitnessLayout.width / 2,
        -counterDuelWitnessLayout.height / 2 + 1,
        counterDuelWitnessLayout.width,
        counterDuelWitnessLayout.height,
        2,
      )
      .fill({ color: 0x17232b, alpha: 0.94 })
      .stroke({ color, width: 0.8, alpha: 0.82 });
    const witness = this.createScaleSensitiveText(`WITNESS · ${reaction.companion.name.toUpperCase()}`, {
      fontFamily: "Inter, sans-serif", fontSize: 3.6, fill: color, fontWeight: "900", letterSpacing: 0.2,
    });
    witness.anchor.set(0.5, 0); witness.position.set(0, -6.5);
    const action = this.createScaleSensitiveText(`${reaction.companion.role.toUpperCase()} · ${reaction.gesture.label}`, {
      fontFamily: "Inter, sans-serif", fontSize: 3.2, fill: 0xd7e8e2, fontWeight: "800", letterSpacing: 0.12,
    });
    action.anchor.set(0.5, 0); action.position.set(0, 0.7);

    const cue = new Graphics();
    cue.position.set(counterDuelWitnessLayout.cueX, counterDuelWitnessLayout.cueY);
    switch (reaction.gesture.cue) {
      case "loaf":
        cue.ellipse(0, 0, 6, 3.5).stroke({ color, width: 1.2 }).moveTo(-3, -1).lineTo(3, 1).stroke({ color, width: 0.8 });
        break;
      case "map":
        cue.poly([-6, -4, -2, -5, 2, -3, 6, -4, 6, 4, 2, 3, -2, 5, -6, 4]).stroke({ color, width: 1 });
        break;
      case "staff":
        cue.moveTo(0, -7).lineTo(0, 6).moveTo(-4, 6).lineTo(4, 6).stroke({ color, width: 1.4 });
        break;
      case "kit":
        cue.roundRect(-6, -4, 12, 9, 1.5).stroke({ color, width: 1 }).moveTo(-3, 0).lineTo(3, 0).moveTo(0, -3).lineTo(0, 3).stroke({ color, width: 0.9 });
        break;
      case "satchel":
        cue.roundRect(-6, -3, 12, 8, 2).stroke({ color, width: 1 }).moveTo(-4, -3).bezierCurveTo(-3, -7, 3, -7, 4, -3).stroke({ color, width: 0.9 });
        break;
      case "wheel":
        cue.circle(0, 0, 5).stroke({ color, width: 1 }).moveTo(-5, 0).lineTo(5, 0).moveTo(0, -5).lineTo(0, 5).stroke({ color, width: 0.8 });
        break;
      case "folio":
        cue.moveTo(0, -4).lineTo(-6, -5).lineTo(-6, 4).lineTo(0, 5).lineTo(6, 4).lineTo(6, -5).lineTo(0, -4).lineTo(0, 5).stroke({ color, width: 1 });
        break;
      case "hammer":
        cue.moveTo(-3, 6).lineTo(2, -3).stroke({ color, width: 1.4 }).rect(-2, -6, 9, 4).fill(color);
        break;
      case "hand":
        cue.moveTo(-4, 5).lineTo(-1, -3).lineTo(1, 3).lineTo(3, -4).moveTo(1, 3).lineTo(5, -2).stroke({ color, width: 1.1 });
        break;
    }
    layer.addChild(panel, witness, action, cue);
    return layer;
  }

  private drawCounterDuel(
    state: WorldState,
    duel: CounterDuelState,
    palette: readonly [number, number, number],
  ): void {
    this.host.dataset.encounterEngine = "counter-triangle";
    this.host.dataset.counterDuelId = duel.id;
    this.host.dataset.counterDuelRound = String(duel.round);
    this.host.dataset.counterDuelOutcome = duel.outcome;
    this.host.dataset.counterDuelScore = `${duel.heroScore}-${duel.opponentScore}`;
    this.host.dataset.counterDuelRules = duel.rulesVersion ?? "schema-one";
    this.host.dataset.counterDuelOpening = duel.patternBreak === undefined ? "legacy" : `${duel.patternBreak.opening}/2`;
    this.host.dataset.counterDuelOpeningStatus = duel.patternBreak?.status ?? "legacy-inert";
    const textStartIndex = this.scaleSensitiveTexts.length;
    this.worldLayer.addChild(rect(0, 0, designWidth, designHeight, 0x17141f));
    this.worldLayer.addChild(rect(0, 124, designWidth, 56, 0x302631));
    this.worldLayer.addChild(new Graphics().ellipse(160, 143, 112, 30).stroke({ color: 0x8d718c, width: 1.5, alpha: 0.7 }));

    const title = this.createScaleSensitiveText("PATTERN DUEL", { fontFamily: "Inter, sans-serif", fontSize: 8, fill: 0xffd37f, fontWeight: "800", letterSpacing: 1.5 });
    title.position.set(9, 7);
    const rule = this.createScaleSensitiveText("RUSH › FEINT › WARD › RUSH", { fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0xe5d7bd, fontWeight: "700", letterSpacing: 0.5 });
    rule.position.set(9, 20);
    const score = this.createScaleSensitiveText(`${state.hero.name.toUpperCase()}  ${duel.heroScore}  ·  ${duel.opponentScore}  ${duel.opponentName.toUpperCase()}`, { fontFamily: "Inter, sans-serif", fontSize: 6.2, fill: 0xf5ead5, fontWeight: "800" });
    score.anchor.set(0.5, 0);
    score.position.set(160, 8);
    const stakes = this.createScaleSensitiveText(`FIRST TO 2 · AFTER 5, LEADER WINS / EQUAL DRAWS · WIN +8 XP/+5 GOLD · LOSS −${duel.stakes.defeatDamage} HP`, { fontFamily: "Inter, sans-serif", fontSize: 3.85, fill: 0xb8ad9e, fontWeight: "700" });
    stakes.anchor.set(0.5, 0);
    stakes.position.set(160, 29);
    this.worldLayer.addChild(title, rule, score, stakes);

    const heroLayer = this.drawHero(state, 72, 148, palette);
    const observer = projectParty(state.depth).active;
    const observerReaction = projectPatternBreakObserverReaction(state);
    let observerBinding: CounterDuelAnimationBinding["observer"] = null;
    if (observer !== null) {
      const injured = isInjuredPartyStatus(observer.status);
      const observerLayer = this.drawCompanion(state, observer.id, observer.role, 43, 151, palette, 0.72, injured);
      const observerLabel = this.createScaleSensitiveText("OBSERVER", { fontFamily: "Inter, sans-serif", fontSize: 3.2, fill: 0x91d2c6, fontWeight: "900", letterSpacing: 0.35 });
      observerLabel.anchor.set(0.5, 0);
      observerLabel.position.set(43, 158);
      this.lightLayer.addChild(observerLabel);
      if (observerReaction !== null && observerReaction.companion.id === observer.id) {
        const reactionLayer = this.drawPatternBreakObserverReaction(observerReaction);
        this.lightLayer.addChild(reactionLayer);
        this.host.dataset.counterDuelWitnessVersion = observerReaction.registryVersion;
        this.host.dataset.counterDuelWitnessId = observerReaction.reactionId;
        this.host.dataset.counterDuelWitnessCompanion = observerReaction.companion.id;
        this.host.dataset.counterDuelWitnessRole = observerReaction.companion.role;
        this.host.dataset.counterDuelWitnessGesture = observerReaction.gesture.id;
        this.host.dataset.counterDuelWitnessMotion = observerReaction.motionMode;
        this.host.dataset.counterDuelWitnessMechanicalEffect = String(observerReaction.mechanicalEffect);
        observerBinding = {
          layer: observerLayer,
          reactionLayer,
          x: 43,
          y: 151,
          baseRotation: injured ? -0.08 : 0,
          reaction: observerReaction,
        };
      }
    }
    const opponentUnit: CombatantState = {
      id: duel.opponentId,
      name: duel.opponentName,
      side: "enemies",
      health: 1,
      maxHealth: 1,
      mana: 0,
      maxMana: 0,
      power: 1,
      armor: 0,
      initiative: 1,
      statuses: [],
      speciesId: duel.opponentSpeciesId,
      abilities: [],
    };
    const opponentLayer = this.drawMonster(opponentUnit, 248, 148, palette);
    const heroVisual: BattleUnitVisual = { layer: heroLayer, x: 72, y: 148, heroRig: null };
    const opponentVisual: BattleUnitVisual = { layer: opponentLayer, x: 248, y: 148, heroRig: null };
    const latest = duel.history.at(-1);
    const shownTell = latest?.tell ?? duel.tell;
    const habit = projectCounterDuelHabit(duel, state.depth.hero.monsterLore);
    this.host.dataset.counterDuelTell = shownTell.suggestedStance;
    this.host.dataset.counterDuelHabit = habit.status === "established" ? habit.preferredStance : "unconfirmed";
    this.host.dataset.counterDuelHabitProgress = `${habit.encounters}/${habit.requiredEncounters}`;

    const tell = new Container();
    const tellText = this.createScaleSensitiveText(`TELL · ${counterDuelTellText(shownTell)}`, { fontFamily: "Georgia, serif", fontSize: 6.4, fill: 0xffe4a6, fontWeight: "700" });
    tellText.anchor.set(0.5, 0);
    tellText.position.set(160, 44);
    tell.addChild(tellText);
    this.worldLayer.addChild(tell);

    const habitGlyph = habit.status === "established"
      ? this.drawCounterDuelGlyph(habit.preferredStance, 69, 56, 0x8fd0c2)
      : new Container();
    if (habit.status === "established") {
      habitGlyph.scale.set(0.48);
    } else {
      habitGlyph.position.set(69, 56);
      habitGlyph.addChild(new Graphics().poly([0, -5, 5, 0, 0, 5, -5, 0]).stroke({ color: 0x71828a, width: 1.2 }));
      const unknown = this.createScaleSensitiveText("?", { fontFamily: "Inter, sans-serif", fontSize: 5, fill: 0xa5b4bc, fontWeight: "900" });
      unknown.anchor.set(0.5); unknown.position.set(0, -0.5);
      habitGlyph.addChild(unknown);
    }
    const habitLine = this.createScaleSensitiveText(
      habit.status === "established"
        ? `FIELD NOTE · OFTEN FAVORS ${counterDuelStanceLabel(habit.preferredStance).toUpperCase()}`
        : `HABIT UNCONFIRMED · ${habit.encounters}/${habit.requiredEncounters}`,
      { fontFamily: "Inter, sans-serif", fontSize: 4.8, fill: habit.status === "established" ? 0x9ed8ca : 0x94a3ab, fontWeight: "800", letterSpacing: 0.45 },
    );
    habitLine.anchor.set(0.5, 0); habitLine.position.set(164, 53);
    this.worldLayer.addChild(habitGlyph, habitLine);

    const prediction = new Container();
    const reveal = new Container();
    const patternBreakLayer = new Container();
    let patternBreakSignature: PatternBreakSignatureV1 | null = null;
    const consequence = new Container();
    const opening = duel.patternBreak;
    const openingColor = opening?.status === "spent"
      ? 0xffd37f
      : opening?.status === "armed"
        ? 0x9fc9ff
        : 0x7f7280;
    const openingLabelText = opening === undefined || opening.status === "legacy-inert"
      ? "LEGACY DUEL · PATTERN BREAK INERT"
      : opening.status === "expired"
          ? `OPENING EXPIRED · ${opening.opening}/2`
          : opening.status === "armed"
            ? "OPENING ARMED · 1/2"
            : "OPENING · 0/2 CONFIRMED READS";
    if (opening?.status !== "spent") {
      const openingLabel = this.createScaleSensitiveText(openingLabelText, { fontFamily: "Inter, sans-serif", fontSize: 4.4, fill: openingColor, fontWeight: "900", letterSpacing: 0.4 });
      openingLabel.anchor.set(0.5, 0); openingLabel.position.set(160, 119);
      this.worldLayer.addChild(openingLabel);
    }
    for (let notch = 0; notch < 2; notch += 1) {
      const notchX = 151 + notch * 18;
      const filled = (opening?.opening ?? 0) > notch;
      const shape = new Graphics().poly([notchX, 130, notchX + 5, 134, notchX, 138, notchX - 5, 134]);
      if (filled) shape.fill(openingColor);
      else shape.stroke({ color: openingColor, width: 1.2, alpha: 0.8 });
      this.worldLayer.addChild(shape);
    }
    if (latest !== undefined) {
      this.host.dataset.counterDuelPrediction = latest.prediction;
      this.host.dataset.counterDuelHeroStance = latest.heroStance;
      this.host.dataset.counterDuelOpponentStance = latest.opponentStance;
      this.host.dataset.counterDuelResult = latest.result;
      this.host.dataset.counterDuelOpeningEvent = latest.patternBreak?.triggered === true
        ? "pattern-break"
        : latest.patternBreak?.openingGain === 1
          ? "confirmed-read"
          : latest.patternBreak?.reset === true
            ? "reset"
            : "none";
      this.host.dataset.counterDuelOpeningEvidence = latest.patternBreak?.evidence ?? "none";
      const predictionText = this.createScaleSensitiveText(`READ ${counterDuelStanceLabel(latest.prediction).toUpperCase()}  →  ${counterDuelStanceLabel(latest.heroStance).toUpperCase()}`, { fontFamily: "Inter, sans-serif", fontSize: 6, fill: 0x9fc9ff, fontWeight: "800" });
      predictionText.anchor.set(0.5, 0);
      predictionText.position.set(88, 64);
      prediction.addChild(predictionText);
      const heroGlyph = this.drawCounterDuelGlyph(latest.heroStance, 83, 89, 0x9fc9ff);
      const opponentGlyph = this.drawCounterDuelGlyph(latest.opponentStance, 237, 89, 0xffaa8b);
      reveal.addChild(heroGlyph, opponentGlyph);
      const heroReveal = this.createScaleSensitiveText(counterDuelStanceLabel(latest.heroStance).toUpperCase(), { fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0x9fc9ff, fontWeight: "800" });
      const opponentReveal = this.createScaleSensitiveText(counterDuelStanceLabel(latest.opponentStance).toUpperCase(), { fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0xffaa8b, fontWeight: "800" });
      heroReveal.anchor.set(0.5, 0); heroReveal.position.set(83, 103);
      opponentReveal.anchor.set(0.5, 0); opponentReveal.position.set(237, 103);
      reveal.addChild(heroReveal, opponentReveal);
      const resultText = latest.patternBreak?.triggered === true
        ? "2/2 CONFIRMED · HERO +1 · STANDARD REWARD ONLY"
        : latest.result === "hero"
        ? `${counterDuelStanceLabel(latest.heroStance).toUpperCase()} COUNTERS ${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} · HERO +1`
        : latest.result === "opponent"
          ? `${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} COUNTERS ${counterDuelStanceLabel(latest.heroStance).toUpperCase()} · RIVAL +1`
          : `${counterDuelStanceLabel(latest.heroStance).toUpperCase()} MEETS ${counterDuelStanceLabel(latest.opponentStance).toUpperCase()} · TIE`;
      const result = this.createScaleSensitiveText(resultText, { fontFamily: "Inter, sans-serif", fontSize: latest.patternBreak?.triggered === true ? 5.4 : 6.2, fill: 0xffd37f, fontWeight: "900", letterSpacing: 0.3 });
      result.anchor.set(0.5, 0); result.position.set(160, 115);
      consequence.addChild(result);
      if (latest.patternBreak?.triggered === true) {
        patternBreakSignature = projectCounterDuelPatternBreakSignature(duel);
        if (patternBreakSignature === null) throw new TypeError("Triggered Pattern Break lacks a species signature");
        this.host.dataset.counterDuelSignatureVersion = patternBreakSignature.registryVersion;
        this.host.dataset.counterDuelSignatureId = patternBreakSignature.signatureId;
        this.host.dataset.counterDuelSignatureSpecies = patternBreakSignature.speciesId;
        this.host.dataset.counterDuelSignatureMotif = patternBreakSignature.motif;
        patternBreakLayer.position.set(160, 95);
        patternBreakLayer.addChild(this.drawPatternBreakSignature(patternBreakSignature));
      }
      this.worldLayer.addChild(prediction, reveal, patternBreakLayer, consequence);
      const cueId = `${duel.id}:round:${latest.round}`;
      if (this.counterDuelCueId !== cueId) {
        this.counterDuelCueId = cueId;
        this.counterDuelCueStartedAt = this.animateCounterDuelTransition
          ? this.elapsed
          : this.elapsed - counterDuelCueDurationSeconds;
      }
      this.counterDuelBinding = {
        tell,
        prediction,
        reveal,
        patternBreak: patternBreakLayer,
        patternBreakTriggered: latest.patternBreak?.triggered === true,
        patternBreakSignature,
        consequence,
        hero: heroVisual,
        opponent: opponentVisual,
        observer: observerBinding,
      };
      this.updateCounterDuelAnimation();
    } else {
      this.host.dataset.counterDuelPhase = "tell";
      const waiting = this.createScaleSensitiveText("THREE LEGAL READS · ONE COMMITTED ANSWER", { fontFamily: "Inter, sans-serif", fontSize: 6, fill: 0xb8ad9e, fontWeight: "700" });
      waiting.anchor.set(0.5, 0); waiting.position.set(160, 76);
      this.worldLayer.addChild(waiting);
    }
    this.host.dataset.counterDuelTextCount = String(this.scaleSensitiveTexts.length - textStartIndex);
  }

  private drawMonster(
    unit: CombatantState,
    x: number,
    y: number,
    palette: readonly [number, number, number],
  ): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.alpha = unit.health > 0 ? 1 : 0.38;
    const definition = unit.speciesId === null ? undefined : monsterDefinition(unit.speciesId);
    const bodyColor = unit.health <= 0 ? 0x343a37 : definition?.color ?? 0x4b7754;
    layer.addChild(circle(0, -18, 10, bodyColor));
    layer.addChild(rect(-9, -9, 18, 19, bodyColor));
    layer.addChild(circle(-4, -20, 1.5, palette[2]));
    layer.addChild(circle(4, -20, 1.5, palette[2]));

    if (unit.speciesId === "lantern-wolf") {
      layer.addChild(new Graphics().poly([-9, -24, -5, -35, -1, -25]).fill(bodyColor));
      layer.addChild(new Graphics().poly([1, -25, 5, -35, 9, -24]).fill(bodyColor));
      layer.addChild(circle(0, -15, 5, palette[2], 0.18));
    } else if (unit.speciesId === "mossback-brute") {
      layer.addChild(circle(-10, -7, 6, bodyColor));
      layer.addChild(circle(10, -7, 6, bodyColor));
      layer.addChild(rect(-7, -31, 14, 4, 0x78905c));
    } else if (unit.speciesId === "river-wyrmling") {
      layer.addChild(new Graphics().poly([-7, -12, -18, -22, -13, -3]).fill({ color: 0x6ca1aa, alpha: 0.8 }));
      layer.addChild(new Graphics().poly([7, -12, 18, -22, 13, -3]).fill({ color: 0x6ca1aa, alpha: 0.8 }));
      layer.addChild(new Graphics().moveTo(8, 5).bezierCurveTo(18, 7, 20, 0, 24, -2).stroke({ color: bodyColor, width: 3 }));
    } else if (unit.speciesId === "inkcap-mimic") {
      layer.addChild(rect(-11, -9, 22, 6, 0x5b3c4f));
      for (let tooth = 0; tooth < 4; tooth += 1) {
        layer.addChild(new Graphics().poly([-8 + tooth * 5, -3, -6 + tooth * 5, 2, -4 + tooth * 5, -3]).fill(0xe9dfbd));
      }
    } else if (unit.speciesId === "copperhorn") {
      layer.addChild(new Graphics().poly([-8, -23, -18, -31, -11, -18]).fill(0xc08c52));
      layer.addChild(new Graphics().poly([8, -23, 18, -31, 11, -18]).fill(0xc08c52));
      layer.addChild(rect(-2, -12, 4, 10, 0xc08c52));
    }

    this.worldLayer.addChild(layer);
    return layer;
  }

  private drawStatusMarkers(unit: CombatantState, x: number, y: number): void {
    const colors = {
      guarding: 0x7ab6d9,
      poisoned: 0x8fcf64,
      weakened: 0xb88ad4,
      burning: 0xff8d4d,
    } as const;
    for (let statusIndex = 0; statusIndex < unit.statuses.length; statusIndex += 1) {
      const status = unit.statuses[statusIndex];
      if (status === undefined) continue;
      const markerX = x - 7 + statusIndex * 8;
      this.lightLayer.addChild(circle(markerX, y, 2.6, colors[status.kind]));
      for (let pip = 0; pip < Math.min(3, status.duration); pip += 1) {
        this.lightLayer.addChild(rect(markerX - 2 + pip * 2, y + 4, 1.2, 1.5, colors[status.kind]));
      }
    }
  }

  private drawCombatEffect(cue: CombatVisualCue, x: number, y: number): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.alpha = 0;
    const color = combatEffectColor(cue);
    if (cue.action === "guard") {
      layer.addChild(new Graphics().poly([0, -15, 11, -10, 8, 7, 0, 14, -8, 7, -11, -10]).stroke({ color, width: 2 }));
    } else if (cue.action === "item") {
      layer.addChild(new Graphics().rect(-5, -8, 10, 14).roundRect(-7, -4, 14, 13, 3).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().moveTo(-4, 1).lineTo(4, 1).moveTo(0, -3).lineTo(0, 5).stroke({ color: 0xfff1d1, width: 1.5 }));
    } else if (cue.companionActionId === "flour-veil") {
      layer.addChild(new Graphics().moveTo(0, -15).lineTo(0, 14).stroke({ color: 0xf4e9c9, width: 2.3, alpha: 0.88 }));
      for (const [dustX, dustY, radius] of [[-9, -10, 2.4], [8, -7, 3], [-12, 2, 3.3], [9, 6, 2.5], [-3, 10, 2]] as const) {
        layer.addChild(circle(dustX, dustY, radius, 0xf4e9c9, 0.58));
      }
    } else if (cue.companionActionId === "millstone-drag") {
      const stone = new Graphics().circle(0, 0, 10).stroke({ color: 0xc7b18a, width: 2.4 });
      stone.circle(0, 0, 3).stroke({ color: 0xf3e6bc, width: 1.3 });
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        stone.moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3).lineTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
      }
      stone.stroke({ color: 0xc7b18a, width: 1 });
      stone.moveTo(-21, 11).lineTo(17, 11).stroke({ color: 0x8d7654, width: 1.5, alpha: 0.8 });
      layer.addChild(stone);
    } else if (cue.effect === "arcane") {
      layer.addChild(new Graphics().circle(0, 0, 7).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().circle(0, 0, 13).stroke({ color, width: 1, alpha: 0.65 }));
    } else if (cue.effect === "burning") {
      layer.addChild(new Graphics().poly([-7, 10, 0, -15, 4, -3, 9, -10, 8, 10]).fill({ color, alpha: 0.9 }));
    } else if (cue.effect === "poison") {
      layer.addChild(circle(0, 2, 6, color, 0.85));
      layer.addChild(circle(-7, -7, 3, color, 0.72));
      layer.addChild(circle(7, -10, 2, color, 0.62));
    } else if (cue.effect === "weaken") {
      layer.addChild(new Graphics().moveTo(-11, -8).lineTo(0, 3).lineTo(11, -8).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().moveTo(-8, 1).lineTo(0, 9).lineTo(8, 1).stroke({ color, width: 2 }));
    } else if (cue.effect === "piercing") {
      layer.addChild(new Graphics().moveTo(-20, 8).lineTo(20, -10).stroke({ color, width: 3 }));
      layer.addChild(new Graphics().poly([20, -10, 13, -12, 16, -5]).fill(color));
    } else {
      layer.addChild(new Graphics().moveTo(-13, 11).lineTo(13, -11).stroke({ color, width: 3 }));
      layer.addChild(new Graphics().moveTo(-6, -13).lineTo(8, 12).stroke({ color, width: 1.5, alpha: 0.7 }));
    }
    if (cue.roadcraftImpact?.kind === "flour-veil") {
      layer.addChild(new Graphics().moveTo(-14, -18).quadraticCurveTo(-23, 0, -14, 18).stroke({ color: 0xf4e9c9, width: 2.1, alpha: 0.92 }));
      for (const [dustX, dustY, radius] of [[-22, -10, 2], [-25, 0, 2.6], [-21, 10, 1.8]] as const) {
        layer.addChild(circle(dustX, dustY, radius, 0xf4e9c9, 0.62));
      }
    } else if (cue.roadcraftImpact?.kind === "millstone-drag") {
      const drag = new Graphics().circle(-18, 12, 6).stroke({ color: 0xc7b18a, width: 1.8, alpha: 0.92 });
      drag.circle(-18, 12, 1.8).stroke({ color: 0xf3e6bc, width: 1 });
      drag.moveTo(-12, 12).quadraticCurveTo(-2, 16, 8, 9).stroke({ color: 0x8d7654, width: 1.4, alpha: 0.86 });
      layer.addChild(drag);
    }
    const particleCount = Math.min(8, Math.max(3, Math.ceil(cue.amount / 6)));
    for (let particle = 0; particle < particleCount; particle += 1) {
      const angle = (Math.PI * 2 * particle) / particleCount;
      layer.addChild(circle(Math.cos(angle) * 17, Math.sin(angle) * 13, 1.3, color, 0.72));
    }
    this.lightLayer.addChild(layer);
    return layer;
  }

  private drawFamiliarWeaponFormGlyph(
    form: CombatFamiliarWeaponFormFact,
    x: number,
    y: number,
  ): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.alpha = 0;
    const glyph = new Graphics();
    if (form.silhouette === "sword") {
      glyph.moveTo(-13, 10).quadraticCurveTo(2, -15, 15, -7).stroke({ color: 0xffe4a1, width: 2.1, alpha: 0.94 });
      glyph.moveTo(-9, 13).quadraticCurveTo(3, -8, 12, -4).stroke({ color: 0xbfd8d2, width: 0.9, alpha: 0.8 });
      glyph.poly([15, -7, 10, -9, 12, -3]).fill({ color: 0xffe4a1, alpha: 0.94 });
    } else if (form.silhouette === "spear") {
      glyph.moveTo(-17, 1).lineTo(17, 1).stroke({ color: 0xffe4a1, width: 2, alpha: 0.94 });
      glyph.moveTo(-11, -4).lineTo(-4, 1).lineTo(-11, 6).stroke({ color: 0xbfd8d2, width: 1, alpha: 0.82 });
      glyph.poly([18, 1, 10, -4, 11, 6]).fill({ color: 0xffe4a1, alpha: 0.94 });
    } else {
      glyph.circle(0, 0, 7).stroke({ color: 0xffe4a1, width: 1.8, alpha: 0.94 });
      glyph.circle(0, 0, 13).stroke({ color: 0xbfd8d2, width: 0.9, alpha: 0.78 });
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        glyph.moveTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
        glyph.lineTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
      }
      glyph.stroke({ color: 0xffe4a1, width: 1.1, alpha: 0.88 });
      glyph.poly([12, -7, 18, -5, 14, 0]).fill({ color: 0xffe4a1, alpha: 0.92 });
    }
    layer.addChild(glyph);
    this.lightLayer.addChild(layer);
    return layer;
  }

  private updateBattleAnimation(): void {
    const binding = this.battleBinding;
    if (binding === null) return;
    const elapsedSeconds = this.elapsed - this.battleCueStartedAt;
    const staticTableau = this.reducedMotion || binding.weaponForm?.terminal === true;
    const motion = projectCombatMotion(
      binding.cue,
      binding.weaponForm?.terminal === true ? combatCueDurationSeconds * 0.58 : elapsedSeconds,
      staticTableau,
    );
    binding.weaponFormPose = binding.weaponForm === null
      ? null
      : projectFamiliarWeaponFormPose(
          binding.weaponForm.silhouette,
          elapsedSeconds,
          combatCueDurationSeconds,
          staticTableau,
        );
    binding.actor.layer.position.set(
      binding.actor.x + motion.actorOffsetX,
      binding.actor.y + motion.actorOffsetY,
    );
    binding.target.layer.position.x = binding.target.x + motion.targetOffsetX;
    binding.effectLayer.alpha = motion.effectAlpha;
    binding.effectLayer.scale.set(motion.effectScale);
    if (binding.weaponFormGlyph !== null && binding.weaponFormPose !== null) {
      binding.weaponFormGlyph.alpha = binding.weaponFormPose.glyphAlpha;
      binding.weaponFormGlyph.scale.set(binding.weaponFormPose.glyphScale);
    }
    this.host.dataset.combatPhase = binding.weaponForm?.terminal === true ? "terminal-tableau" : motion.phase;
    if (binding.weaponForm?.terminal === true) return;
    if (motion.phase === "settled") {
      if (binding.weaponFormGlyph !== null) binding.weaponFormGlyph.alpha = 0;
      binding.weaponFormPose = null;
      this.battleBinding = null;
    }
  }

  private updateCounterDuelAnimation(): void {
    const binding = this.counterDuelBinding;
    if (binding === null) return;
    const motion = projectCounterDuelMotion(
      this.elapsed - this.counterDuelCueStartedAt,
      this.reducedMotion,
      binding.patternBreakTriggered,
    );
    binding.tell.alpha = motion.tellAlpha;
    binding.prediction.alpha = motion.predictionAlpha;
    binding.reveal.alpha = motion.revealAlpha;
    binding.patternBreak.alpha = motion.patternBreakAlpha;
    binding.patternBreak.scale.set(motion.patternBreakScale);
    binding.consequence.alpha = motion.consequenceAlpha;
    binding.hero.layer.position.x = binding.hero.x + motion.heroOffsetX;
    const signaturePose = binding.patternBreakSignature?.opponentPose;
    binding.opponent.layer.position.set(
      binding.opponent.x + motion.opponentOffsetX + (signaturePose?.recoilX ?? 0) * motion.patternBreakPulse,
      binding.opponent.y + (signaturePose?.liftY ?? 0) * motion.patternBreakPulse,
    );
    binding.opponent.layer.rotation = (signaturePose?.tilt ?? 0) * motion.patternBreakPulse;
    const observer = binding.observer;
    if (observer !== null) {
      observer.reactionLayer.alpha = motion.patternBreakAlpha;
      observer.layer.position.set(
        observer.x + observer.reaction.gesture.offsetX * motion.patternBreakPulse,
        observer.y + observer.reaction.gesture.liftY * motion.patternBreakPulse,
      );
      observer.layer.rotation = observer.baseRotation + observer.reaction.gesture.tilt * motion.patternBreakPulse;
    }
    this.host.dataset.counterDuelPhase = motion.phase;
    if (motion.phase === "settled" || motion.phase === "static") this.counterDuelBinding = null;
  }

  private drawAbilityGlyph(effect: AbilityEffect, x: number, y: number, scale = 1): Container {
    const layer = new Container();
    layer.position.set(x, y);
    layer.scale.set(scale);
    const color = abilityEffectColor(effect);
    layer.addChild(circle(0, 0, 10, color, 0.12));
    if (effect === "arcane") {
      layer.addChild(new Graphics().circle(0, 0, 6).stroke({ color, width: 1.5 }));
      layer.addChild(new Graphics().poly([0, -8, 3, -2, 8, 0, 3, 2, 0, 8, -3, 2, -8, 0, -3, -2]).stroke({ color, width: 1 }));
    } else if (effect === "burning") {
      layer.addChild(new Graphics().poly([-6, 7, -2, -8, 1, -2, 5, -10, 6, 7]).fill(color));
    } else if (effect === "poison") {
      layer.addChild(circle(0, 2, 5, color, 0.85));
      layer.addChild(circle(-5, -5, 2, color, 0.7));
      layer.addChild(circle(5, -7, 1.5, color, 0.65));
    } else if (effect === "weaken") {
      layer.addChild(new Graphics().moveTo(-7, -5).lineTo(0, 2).lineTo(7, -5).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().moveTo(-5, 2).lineTo(0, 7).lineTo(5, 2).stroke({ color, width: 2 }));
    } else {
      layer.addChild(new Graphics().moveTo(-8, 6).lineTo(8, -7).stroke({ color, width: 2 }));
      layer.addChild(new Graphics().poly([8, -7, 3, -8, 6, -3]).fill(color));
    }
    this.lightLayer.addChild(layer);
    return layer;
  }

  private drawTraining(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 129, designWidth, 51, 0x263c40));
    this.worldLayer.addChild(new Graphics().ellipse(160, 142, 76, 25).stroke({ color: palette[1], width: 2, alpha: 0.7 }));
    this.worldLayer.addChild(new Graphics().ellipse(160, 142, 52, 17).stroke({ color: palette[2], width: 1, alpha: 0.45 }));
    const abilities = state.depth.hero.abilities.slice(0, 8);
    const focus = [...abilities].sort(
      (left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )[0];
    for (let index = 0; index < abilities.length; index += 1) {
      const ability = abilities[index];
      if (ability === undefined) continue;
      const angle = -Math.PI + (Math.PI * 2 * index) / Math.max(1, abilities.length);
      const x = 160 + Math.cos(angle) * 66;
      const y = 91 + Math.sin(angle) * 25;
      const glyph = this.drawAbilityGlyph(ability.effect, x, y, ability.id === focus?.id ? 1.25 : 0.75);
      glyph.alpha = ability.id === focus?.id ? 1 : 0.58;
    }
    this.worldLayer.addChild(rect(222, 103, 6, 41, 0x80634e));
    this.worldLayer.addChild(circle(225, 99, 12, 0x9c7958));
    this.worldLayer.addChild(new Graphics().moveTo(213, 112).lineTo(237, 112).stroke({ color: 0x80634e, width: 5 }));
    const companion = projectParty(state.depth).active;
    if (companion !== null) {
      this.drawCompanion(state, companion.id, companion.role, 88, 153, palette, 0.78, isInjuredPartyStatus(companion.status));
    }
    this.drawHero(state, 139, 145, palette);
    if (focus !== undefined) {
      const color = abilityEffectColor(focus.effect);
      this.lightLayer.addChild(new Graphics().moveTo(153, 127).quadraticCurveTo(180, 99, 213, 112).stroke({ color, width: 2, alpha: 0.72 }));
    }
  }

  private drawDiscovery(state: WorldState, palette: readonly [number, number, number]): void {
    this.worldLayer.addChild(rect(0, 129, designWidth, 51, 0x322b3d));
    const discovery = state.depth.discoveries.at(-1);
    const ability = state.depth.hero.abilities.find((entry) => entry.id === discovery?.abilityId);
    const source = state.depth.completedCombats
      .at(-1)
      ?.combatants.find((entry) => entry.speciesId === discovery?.monsterId);
    const sourceVisual: CombatantState | undefined = source ?? (discovery === undefined ? undefined : {
      id: `discovery:${discovery.monsterId}`,
      name: discovery.monsterName,
      side: "enemies",
      health: 1,
      maxHealth: 1,
      mana: 0,
      maxMana: 0,
      power: 0,
      armor: 0,
      initiative: 0,
      statuses: [],
      speciesId: discovery.monsterId,
      abilities: [],
    });
    const companion = projectParty(state.depth).active;
    if (companion !== null) {
      this.drawCompanion(state, companion.id, companion.role, 53, 154, palette, 0.7, isInjuredPartyStatus(companion.status));
    }
    this.drawHero(state, 102, 145, palette);
    if (sourceVisual !== undefined) {
      this.drawMonster(sourceVisual, 224, 139, palette);
    } else {
      this.worldLayer.addChild(circle(224, 121, 13, 0x5d5270));
      this.worldLayer.addChild(rect(213, 130, 22, 22, 0x5d5270));
    }
    const effect = ability?.effect ?? "arcane";
    const color = abilityEffectColor(effect);
    this.drawAbilityGlyph(effect, 163, 96, 1.45);
    this.lightLayer.addChild(new Graphics().moveTo(211, 116).bezierCurveTo(198, 86, 182, 87, 171, 96).stroke({ color, width: 2, alpha: 0.74 }));
    this.lightLayer.addChild(new Graphics().moveTo(154, 101).bezierCurveTo(142, 109, 128, 119, 113, 126).stroke({ color, width: 2, alpha: 0.74 }));
    for (let mote = 0; mote < 6; mote += 1) {
      const x = 127 + mote * 14;
      const y = 109 - Math.sin((Math.PI * mote) / 5) * 21;
      this.lightLayer.addChild(circle(x, y, 1.4 + (mote % 2), color, 0.75));
    }
    this.lightLayer.addChild(circle(102, 126, 23, color, 0.08));
  }

  private drawHealthBar(
    x: number,
    y: number,
    width: number,
    health: number,
    maximum: number,
    active: boolean,
  ): void {
    this.worldLayer.addChild(rect(x, y, width, 3, 0x1b2026));
    this.worldLayer.addChild(
      rect(x, y, width * (health / Math.max(1, maximum)), 3, health > 0 ? 0xd45d62 : 0x555b61),
    );
    if (active) this.lightLayer.addChild(rect(x - 1, y - 1, width + 2, 5, 0xffd166, 0.22));
  }

  private drawCamp(state: WorldState, palette: readonly [number, number, number]): void {
    const shortLandscape = this.app.screen.width > 760 && this.app.screen.height <= 560;
    const groundTop = shortLandscape ? 80 : 127;
    const fireX = shortLandscape ? 132 : 160;
    const fireY = shortLandscape ? 105 : 139;
    const heroX = shortLandscape ? 164 : 224;
    const heroY = shortLandscape ? 105 : 151;
    const companionX = 190;
    const companionY = shortLandscape ? 105 : 153;
    const textX = shortLandscape ? 106 : 160;
    const textWidth = shortLandscape ? 176 : 224;
    for (let index = 0; index < 42; index += 1) {
      const x = randomInt(320, state.seed, "visual", "camp", state.tick, "star-x", index);
      const y = randomInt(Math.max(1, groundTop - 20), state.seed, "visual", "camp", state.tick, "star-y", index);
      this.worldLayer.addChild(circle(x, y, index % 7 === 0 ? 1.4 : 0.7, 0xe9e7cf, 0.72));
    }
    this.worldLayer.addChild(rect(0, groundTop, designWidth, designHeight - groundTop, 0x1e3435));
    this.lightLayer.addChild(circle(fireX, fireY, 38, palette[2], 0.09));
    this.lightLayer.addChild(
      new Graphics().poly([fireX - 9, fireY + 7, fireX, fireY - 17, fireX + 9, fireY + 7]).fill(palette[2]),
    );
    this.lightLayer.addChild(
      new Graphics().poly([fireX - 4, fireY + 5, fireX + 1, fireY - 10, fireX + 5, fireY + 5]).fill(0xffe3a1),
    );
    const companion = projectParty(state.depth).active;
    if (companion !== null) this.drawCompanion(state, companion.id, companion.role, companionX, companionY, palette, 0.82, isInjuredPartyStatus(companion.status));
    this.drawHero(state, heroX, heroY, palette);
    const recoveryProjection = projectCriticalRoadsideRecovery(state);
    const fullyRested = recoveryProjection !== null;
    this.host.dataset.campRecovery = fullyRested ? "ready-for-road" : "ordinary";
    this.host.dataset.campResources = `${state.depth.hero.resources.health}/${state.depth.hero.resources.maxHealth}/${state.depth.hero.resources.mana}/${state.depth.hero.resources.maxMana}`;
    this.host.dataset.campHeroPosition = `${heroX}/${heroY}`;
    if (companion !== null) this.host.dataset.campCompanionPosition = `${companionX}/${companionY}`;
    const title = this.createScaleSensitiveText(fullyRested ? "ROADSIDE RECOVERY" : "CAMP", {
      fontFamily: "Georgia, serif",
      fontSize: fullyRested ? 8.5 : 9,
      fill: 0xffe3a1,
      fontWeight: "800",
      letterSpacing: 0.7,
    });
    title.anchor.set(0.5, 0);
    title.position.set(textX, 20);
    const recoveryCopy = (recoveryProjection?.recoveryText ?? state.scene.action).replace(". Fully rested;", ".\nFully rested;");
    const recovery = this.createScaleSensitiveText(recoveryCopy, {
      fontFamily: "Inter, sans-serif",
      fontSize: 5,
      fill: 0xe9e7cf,
      fontWeight: "700",
      align: "center",
      wordWrap: true,
      wordWrapWidth: textWidth,
    });
    recovery.anchor.set(0.5, 0);
    recovery.position.set(textX, 38);
    const readinessCopy = fullyRested
      ? "FULLY RESTED · READY FOR THE ROAD\nSAME ENCOUNTER STILL WAITS"
      : state.scene.consequence.toUpperCase();
    const readiness = this.createScaleSensitiveText(readinessCopy, {
      fontFamily: "Inter, sans-serif",
      fontSize: 4.5,
      fill: fullyRested ? 0x9de0c3 : 0xb9cad3,
      fontWeight: "800",
      align: "center",
      wordWrap: true,
      wordWrapWidth: textWidth + 4,
    });
    readiness.anchor.set(0.5, 0);
    readiness.position.set(textX, 60);
    this.worldLayer.addChild(title, recovery, readiness);
  }

  private drawLegacyMentorFigure(sourceHeroId: string, x: number, y: number, scale = 0.44, alpha = 1): void {
    const identity = projectHeroIdentityAppearance({ id: sourceHeroId });
    const figure = new Container();
    figure.position.set(x, y);
    figure.addChild(
      new Graphics().poly([-13, -39, 13, -39, 18, 5, -18, 5]).fill(identity.cloak),
      rect(-10, -35, 20, 31, identity.tunic),
      new Graphics().moveTo(-8, -25).lineTo(-19, -8).stroke({ color: identity.skin, width: 4.2 }).moveTo(8, -25).lineTo(19, -13).stroke({ color: identity.skin, width: 4.2 }),
      new Graphics().moveTo(-6, -4).lineTo(-8, 13).stroke({ color: identity.belt, width: 5 }).moveTo(6, -4).lineTo(8, 13).stroke({ color: identity.belt, width: 5 }),
      circle(0, -48, 10, identity.skin),
      new Graphics().arc(0, -49, 10, Math.PI, Math.PI * 2).stroke({ color: identity.hair, width: 5 }),
      new Graphics().moveTo(-9, -38).lineTo(9, -38).stroke({ color: identity.belt, width: 2 }),
    );
    figure.scale.set(scale);
    figure.alpha = alpha;
    this.worldLayer.addChild(figure);
  }

  private drawChronicle(state: WorldState, palette: readonly [number, number, number]): void {
    const mentorArc = state.legacyManifestations.mentorArc;
    const mentorPromise = mentorArc?.promiseFact?.tick === state.tick ? mentorArc.promiseFact : null;
    const mentorReturn = mentorArc?.returnFact?.tick === state.tick ? mentorArc.returnFact : null;
    const mentorFarewell = mentorArc?.farewellFact?.tick === state.tick ? mentorArc.farewellFact : null;
    const mentorRelationshipPhase = mentorFarewell !== null
      ? "farewell"
      : mentorReturn !== null
        ? "return"
        : mentorPromise !== null
          ? "promise"
          : null;
    const mentorRelationshipFact = mentorFarewell ?? mentorReturn ?? mentorPromise;
    const mentorLegend = mentorArc === null
      ? undefined
      : state.legacy.cards.find((candidate) => candidate.id === mentorArc.legendId);
    if (mentorArc !== null && mentorLegend !== undefined && mentorRelationshipPhase !== null && mentorRelationshipFact !== null) {
      const heroX = mentorRelationshipPhase === "promise" ? 88 : mentorRelationshipPhase === "return" ? 105 : 126;
      const mentorX = mentorRelationshipPhase === "promise" ? 232 : mentorRelationshipPhase === "return" ? 214 : 228;
      const mentorScale = mentorRelationshipPhase === "promise" ? 0.52 : mentorRelationshipPhase === "return" ? 0.42 : 0.29;
      const mentorAlpha = mentorRelationshipPhase === "farewell" ? 0.72 : 1;
      const relationshipTruthCopy = mentorRelationshipPhase === "promise"
        ? "PROMISE ONLY · NO REWARD · NO POWER TRANSFERRED"
        : mentorRelationshipPhase === "return"
          ? "RETURN ONLY · NO REWARD · NO POWER TRANSFERRED"
          : "MEMORY KEPT · NO REWARD · NO POWER TRANSFERRED";
      this.host.dataset.legacyManifestationId = mentorArc.appearanceId;
      this.host.dataset.legacyManifestationKind = "mortal-mentor";
      this.host.dataset.legacyLegendId = mentorLegend.id;
      this.host.dataset.legacyMeetingId = mentorArc.meetingId;
      this.host.dataset.legacyRelationshipPhase = mentorRelationshipPhase;
      this.host.dataset.legacyRelationshipFactId = mentorRelationshipFact.id;
      if (mentorArc.promiseFact !== null) this.host.dataset.legacyRelationshipPromiseId = mentorArc.promiseFact.id;
      if (mentorArc.returnFact !== null) this.host.dataset.legacyRelationshipReturnId = mentorArc.returnFact.id;
      if (mentorArc.farewellFact !== null) this.host.dataset.legacyRelationshipFarewellId = mentorArc.farewellFact.id;
      if (mentorArc.memoryFact !== null) this.host.dataset.legacyRelationshipMemoryId = mentorArc.memoryFact.id;
      if (mentorReturn !== null) this.host.dataset.legacyRelationshipQuestProgress = `${mentorReturn.completedQuestBaseline}/${mentorReturn.completedQuestCount}`;
      this.host.dataset.legacyRelationshipSchedule = `${mentorRelationshipFact.townVisitOrdinal}/${mentorRelationshipFact.scheduledTownVisit}`;
      this.host.dataset.legacyRelationshipTruth = relationshipTruthCopy;
      this.host.dataset.legacyImportedPower = "false";
      this.host.dataset.legacyHeroPosition = `${heroX}/150`;
      this.host.dataset.legacyMentorPosition = `${mentorX}/150`;

      const groundColor = mentorRelationshipPhase === "farewell" ? 0x3f413b : 0x334c43;
      const roadColor = mentorRelationshipPhase === "farewell" ? 0xd8b46f : 0xb99a69;
      this.worldLayer.addChild(rect(0, 124, designWidth, 56, groundColor));
      this.worldLayer.addChild(
        new Graphics().moveTo(0, 154).bezierCurveTo(83, 137, 224, 171, 320, 144).stroke({ color: roadColor, width: 8, alpha: 0.64 }),
      );
      if (mentorRelationshipPhase === "promise") {
        for (let step = 0; step < 7; step += 1) {
          const x = 119 + step * 14;
          const y = 111 - Math.sin((step / 6) * Math.PI) * 15;
          this.lightLayer.addChild(circle(x, y, 2.2, 0xcaa8e8, 0.7));
        }
        this.lightLayer.addChild(circle(160, 98, 24, 0xcaa8e8, 0.08));
      } else if (mentorRelationshipPhase === "return") {
        this.lightLayer.addChild(
          new Graphics().moveTo(126, 120).bezierCurveTo(148, 84, 178, 84, 200, 120).stroke({ color: 0x9de0c3, width: 2.2, alpha: 0.72 }),
          circle(163, 98, 23, 0x9de0c3, 0.1),
        );
      } else {
        for (let step = 0; step < 6; step += 1) {
          this.lightLayer.addChild(circle(184 + step * 12, 116 - step * 4, Math.max(0.8, 2.3 - step * 0.25), 0xffd98a, 0.58 - step * 0.06));
        }
        this.lightLayer.addChild(circle(228, 97, 30, 0xffd98a, 0.08));
      }
      this.drawHero(state, heroX, 150, palette, 1.12);
      this.drawLegacyMentorFigure(mentorLegend.sourceHeroId, mentorX, 150, mentorScale, mentorAlpha);

      const titleCopy = mentorRelationshipPhase === "promise"
        ? "A ROAD PROMISED"
        : mentorRelationshipPhase === "return"
          ? "PROMISE KEPT"
          : "ROADS PART";
      const title = this.createScaleSensitiveText(titleCopy, {
        fontFamily: "Georgia, serif", fontSize: 9.5, fill: 0xffe4a6, fontWeight: "800", letterSpacing: 0.9,
      });
      title.anchor.set(0.5, 0);
      title.position.set(160, 14);
      const names = this.createScaleSensitiveText(`${state.hero.name.toUpperCase()}  ·  ${mentorLegend.heroName.toUpperCase()}`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.7, fill: 0xc4d9d5, fontWeight: "800", letterSpacing: 0.38,
      });
      names.anchor.set(0.5, 0);
      names.position.set(160, 30);
      const relationshipCopy = mentorRelationshipPhase === "promise"
        ? "MEET AGAIN · AFTER THE NEXT COMPLETED CHAPTER"
        : mentorRelationshipPhase === "return"
          ? `CHAPTERS ${mentorReturn?.completedQuestBaseline ?? 0} → ${mentorReturn?.completedQuestCount ?? 0} · THE ROAD ANSWERED`
          : "KEPT-ROAD-PROMISE · REMEMBERED";
      const relationship = this.createScaleSensitiveText(relationshipCopy, {
        fontFamily: "Inter, sans-serif", fontSize: 4.6, fill: mentorRelationshipPhase === "return" ? 0x9de0c3 : 0xdac6f2, fontWeight: "900", align: "center", wordWrap: true, wordWrapWidth: 240,
      });
      relationship.anchor.set(0.5, 0);
      relationship.position.set(160, 46);
      const truth = this.createScaleSensitiveText(relationshipTruthCopy, {
        fontFamily: "Inter, sans-serif", fontSize: 4, fill: 0x9de0c3, fontWeight: "900", letterSpacing: 0.25,
      });
      truth.anchor.set(0.5, 0);
      truth.position.set(160, 61);
      this.worldLayer.addChild(title, names, relationship, truth);
      return;
    }
    const manifestationIndex = state.legacyManifestations.appearances.findIndex((fact) => fact.tick === state.tick);
    const appearance = state.legacyManifestations.appearances[manifestationIndex];
    const meeting = state.legacyManifestations.meetings[manifestationIndex];
    const recognition = state.legacyManifestations.recognitions[manifestationIndex];
    const lesson = state.legacyManifestations.lessons[manifestationIndex];
    const legend = appearance === undefined ? undefined : state.legacy.cards.find((card) => card.id === appearance.legendId);
    if (appearance !== undefined && meeting !== undefined && recognition !== undefined && lesson !== undefined && legend !== undefined) {
      const ability = state.depth.hero.abilities.find((candidate) => candidate.id === lesson.abilityId);
      if (ability === undefined) throw new Error("A legacy lesson references no current hero ability");
      this.host.dataset.legacyManifestationId = appearance.id;
      this.host.dataset.legacyManifestationKind = appearance.kind;
      this.host.dataset.legacyLegendId = legend.id;
      this.host.dataset.legacyMeetingId = meeting.id;
      this.host.dataset.legacyRecognitionId = recognition.id;
      this.host.dataset.legacyBelief = recognition.belief;
      this.host.dataset.legacyLessonId = lesson.id;
      this.host.dataset.legacyLessonAbility = lesson.abilityId;
      this.host.dataset.legacyImportedPower = String(lesson.importedPower);
      this.host.dataset.legacyHeroPosition = "88/150";
      this.host.dataset.legacyMentorPosition = "232/150";

      this.worldLayer.addChild(rect(0, 125, designWidth, 55, 0x334c43));
      this.worldLayer.addChild(new Graphics().moveTo(0, 153).bezierCurveTo(96, 137, 222, 170, 320, 145).stroke({ color: 0xb99a69, width: 8, alpha: 0.67 }));
      this.drawHero(state, 88, 150, palette, 1.12);
      this.drawLegacyMentorFigure(legend.sourceHeroId, 232, 150);
      const effectColor = abilityEffectColor(ability.effect);
      this.drawAbilityGlyph(ability.effect, 160, 101, 1.3);
      this.lightLayer.addChild(
        new Graphics().moveTo(105, 129).quadraticCurveTo(132, 94, 151, 101).stroke({ color: effectColor, width: 1.8, alpha: 0.72 }),
        new Graphics().moveTo(169, 101).quadraticCurveTo(192, 91, 217, 127).stroke({ color: effectColor, width: 1.4, alpha: 0.5 }),
        circle(160, 101, 22, effectColor, 0.08),
      );
      const title = this.createScaleSensitiveText("MORTAL MENTOR", {
        fontFamily: "Georgia, serif", fontSize: 9.5, fill: 0xffe4a6, fontWeight: "800", letterSpacing: 0.9,
      });
      title.anchor.set(0.5, 0);
      title.position.set(160, 15);
      const names = this.createScaleSensitiveText(`${state.hero.name.toUpperCase()}  ·  ${legend.heroName.toUpperCase()}`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.7, fill: 0xc4d9d5, fontWeight: "800", letterSpacing: 0.38,
      });
      names.anchor.set(0.5, 0);
      names.position.set(160, 31);
      const practice = this.createScaleSensitiveText(`PRACTICE · ${lesson.abilityName.toUpperCase()} · EXISTING L${lesson.abilityLevelAtLesson} ART`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.6, fill: 0xdac6f2, fontWeight: "900", align: "center", wordWrap: true, wordWrapWidth: 220,
      });
      practice.anchor.set(0.5, 0);
      practice.position.set(160, 48);
      const truth = this.createScaleSensitiveText("APPEARED · MET · INTRODUCED BY NAME · NO POWER TRANSFERRED", {
        fontFamily: "Inter, sans-serif", fontSize: 4, fill: 0x9de0c3, fontWeight: "900", letterSpacing: 0.28,
      });
      truth.anchor.set(0.5, 0);
      truth.position.set(160, 63);
      this.worldLayer.addChild(title, names, practice, truth);
      return;
    }
    const commandType = state.chronicle.at(-1)?.commandType;
    const rewardedQuest = commandType === "apply-quest-reward" ? state.depth.completedQuests.at(-1) : undefined;
    const appliedReward = rewardedQuest?.reward.status === "applied" ? rewardedQuest.reward : undefined;
    if (appliedReward !== undefined) {
      const { grant, receipt } = appliedReward;
      this.host.dataset.questRewardId = grant.id;
      this.host.dataset.questRewardExperience = `${receipt.experienceBefore}/${receipt.experienceDelta}/${receipt.experienceAfter}`;
      this.host.dataset.questRewardGold = `${receipt.goldBefore}/${receipt.goldDelta}/${receipt.goldAfter}`;
      this.host.dataset.questRewardItem = `${grant.item.id}/${grant.item.name}`;
      this.host.dataset.questRewardDisposition = receipt.itemDisposition;
      this.host.dataset.questRewardConversion = `${receipt.itemConversionGold}/${grant.itemConversionGold}`;
      this.host.dataset.questRewardLevel = `${receipt.levelBefore}/${receipt.levelAfter}`;

      this.worldLayer.addChild(rect(0, 116, designWidth, 64, 0x273c38));
      this.worldLayer.addChild(new Graphics().moveTo(0, 151).bezierCurveTo(84, 135, 227, 169, 320, 142).stroke({ color: 0xc9a568, width: 8, alpha: 0.68 }));
      this.drawHero(state, 55, 151, palette);

      const title = this.createScaleSensitiveText("QUEST REWARDS", {
        fontFamily: "Georgia, serif", fontSize: 10, fill: 0xffe4a6, fontWeight: "800", letterSpacing: 1,
      });
      title.anchor.set(0.5, 0);
      title.position.set(160, 16);
      const questTitle = this.createScaleSensitiveText(rewardedQuest?.title.toUpperCase() ?? "THE CHRONICLE", {
        fontFamily: "Inter, sans-serif", fontSize: 4.5, fill: 0xc4d9d5, fontWeight: "800", letterSpacing: 0.35,
      });
      questTitle.anchor.set(0.5, 0);
      questTitle.position.set(160, 31);

      const experienceCard = rect(84, 50, 64, 48, 0x3b3348, 0.94);
      const goldCard = rect(154, 50, 64, 48, 0x3b3348, 0.94);
      const itemCard = rect(224, 50, 78, 48, 0x3b3348, 0.94);
      this.worldLayer.addChild(experienceCard, goldCard, itemCard);
      const xp = this.createScaleSensitiveText(`+${receipt.experienceDelta} XP\n${receipt.experienceAfter} TOTAL`, {
        fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0xb8e4ff, fontWeight: "900", align: "center", lineHeight: 8,
      });
      xp.anchor.set(0.5, 0.5);
      xp.position.set(116, 74);
      const gold = this.createScaleSensitiveText(`+${receipt.goldDelta} GOLD\n${receipt.goldAfter} TOTAL`, {
        fontFamily: "Inter, sans-serif", fontSize: 5.5, fill: 0xffd36f, fontWeight: "900", align: "center", lineHeight: 8,
      });
      gold.anchor.set(0.5, 0.5);
      gold.position.set(186, 74);
      const destination = receipt.itemDisposition === "inventory"
        ? "→ INVENTORY"
        : receipt.itemConversionGold === grant.itemConversionGold
          ? `→ +${receipt.itemConversionGold} GOLD`
          : `→ +${receipt.itemConversionGold}/${grant.itemConversionGold} GOLD · CAP`;
      const item = this.createScaleSensitiveText(`${grant.item.name.toUpperCase()}\n${destination}`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.5, fill: 0xe8d5ff, fontWeight: "900", align: "center", lineHeight: 7, wordWrap: true, wordWrapWidth: 70,
      });
      item.anchor.set(0.5, 0.5);
      item.position.set(263, 74);
      this.worldLayer.addChild(title, questTitle, xp, gold, item);

      this.worldLayer.addChild(circle(263, 126, 14, palette[2], 0.85), circle(263, 126, 8, palette[1], 0.9));
      const itemGlyph = this.createScaleSensitiveText(grant.item.slot === "weapon" ? "⚔" : grant.item.slot === "head" ? "⌃" : grant.item.slot === "body" ? "◇" : grant.item.slot === "feet" ? "⌄" : grant.item.slot === "offhand" ? "◈" : "✦", {
        fontFamily: "Georgia, serif", fontSize: 11, fill: 0x231d2d, fontWeight: "900",
      });
      itemGlyph.anchor.set(0.5);
      itemGlyph.position.set(263, 126);
      this.worldLayer.addChild(itemGlyph);
      if (receipt.levelAfter > receipt.levelBefore) {
        const level = this.createScaleSensitiveText(`LEVEL ${receipt.levelBefore} → ${receipt.levelAfter}`, {
          fontFamily: "Inter, sans-serif", fontSize: 6, fill: 0xffef9a, fontWeight: "900", letterSpacing: 0.8,
        });
        level.anchor.set(0.5, 0);
        level.position.set(152, 107);
        this.worldLayer.addChild(level);
      }
      return;
    }
    const predecessor = commandType === "admit-successor-quest" ? state.depth.completedQuests.at(-1) : undefined;
    if (predecessor !== undefined) {
      const quest = state.depth.quest;
      const questLead = projectSuccessorQuestLead(state.seed, state.depth.atlas, quest);
      if (questLead === null) throw new Error("A successor quest admission has no canonical lead");
      const objectiveCount = quest.objectives.length + quest.subquests.flatMap((subquest) => subquest.objectives).length;
      this.host.dataset.questAdmissionId = quest.instanceId;
      this.host.dataset.questAdmissionPredecessor = predecessor.id;
      this.host.dataset.questAdmissionOrdinal = String(quest.ordinal);
      this.host.dataset.questAdmissionTick = String(quest.admittedTick);
      this.host.dataset.questAdmissionObjectives = `${quest.objectives.length}/${quest.subquests.length}/${objectiveCount}`;

      this.worldLayer.addChild(rect(0, 133, designWidth, 47, 0x243c38));
      this.worldLayer.addChild(new Graphics().moveTo(0, 155).bezierCurveTo(86, 144, 220, 169, 320, 149).stroke({ color: 0xc2a56e, width: 7, alpha: 0.62 }));
      this.worldLayer.addChild(rect(8, 22, 96, 108, 0x9b865c, 0.32));
      this.worldLayer.addChild(rect(12, 18, 92, 108, 0xd6c79c, 0.94));
      this.worldLayer.addChild(rect(110, 18, 100, 108, 0xf0dfad, 0.98));
      this.worldLayer.addChild(new Graphics().moveTo(107, 19).lineTo(107, 126).stroke({ color: 0x766345, width: 3, alpha: 0.7 }));
      this.worldLayer.addChild(new Graphics().moveTo(96, 77).bezierCurveTo(101, 68, 111, 68, 117, 77).stroke({ color: 0x75513f, width: 2, alpha: 0.75 }));
      this.worldLayer.addChild(new Graphics().poly([115, 73, 123, 77, 115, 81]).fill(0x75513f));

      const closed = this.createScaleSensitiveText("CHAPTER CLOSED", {
        fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0x6c493e, fontWeight: "900", letterSpacing: 0.55,
      });
      closed.anchor.set(0.5, 0);
      closed.position.set(58, 31);
      const previousTitle = this.createScaleSensitiveText(predecessor.title.toUpperCase(), {
        fontFamily: "Georgia, serif", fontSize: 6, fill: 0x493c32, fontWeight: "800", align: "center", wordWrap: true, wordWrapWidth: 78,
      });
      previousTitle.anchor.set(0.5, 0);
      previousTitle.position.set(58, 48);
      const settled = this.createScaleSensitiveText(`FULFILLED T${predecessor.fulfilledTick}\nREWARD SETTLED`, {
        fontFamily: "Inter, sans-serif", fontSize: 4.2, fill: 0x6d6652, fontWeight: "800", align: "center", lineHeight: 6.5,
      });
      settled.anchor.set(0.5, 0);
      settled.position.set(58, 88);

      const opening = this.createScaleSensitiveText(`NEW QUEST · CHAPTER ${quest.ordinal + 1}`, {
        fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0x315f66, fontWeight: "900", letterSpacing: 0.5,
      });
      opening.anchor.set(0.5, 0);
      opening.position.set(160, 31);
      const nextTitle = this.createScaleSensitiveText(quest.title.toUpperCase(), {
        fontFamily: "Georgia, serif", fontSize: 6.4, fill: 0x263d42, fontWeight: "800", align: "center", wordWrap: true, wordWrapWidth: 86,
      });
      nextTitle.anchor.set(0.5, 0);
      nextTitle.position.set(160, 48);
      const objectives = this.createScaleSensitiveText(`${objectiveCount} OBJECTIVES · ACTIVE\nADMITTED T${quest.admittedTick}\nLEAD · ${questLead.locationName.toUpperCase()} · ${questLeadAdmissionStatus(questLead).toUpperCase()}`, {
        fontFamily: "Inter, sans-serif", fontSize: 3.8, fill: 0x486d69, fontWeight: "800", align: "center", lineHeight: 5.8, wordWrap: true, wordWrapWidth: 90,
      });
      objectives.anchor.set(0.5, 0);
      objectives.position.set(160, 82);
      this.worldLayer.addChild(closed, previousTitle, settled, opening, nextTitle, objectives);
      this.drawHero(state, 107, 116, palette, 0.68);
      return;
    }
    const party = projectParty(state.depth);
    const departed = state.depth.companions.former.at(-1)?.departure.tick === state.depth.tick
      ? state.depth.companions.former.at(-1)
      : undefined;
    if ((commandType === "recruit-companion" && party.active !== null) || (commandType === "farewell-companion" && departed !== undefined)) {
      const companion = party.active ?? (departed === undefined ? null : {
        id: departed.identity.residentId,
        name: departed.identity.name,
        role: departed.identity.role,
        status: departed.departure.outcome === "injured" ? "injured" as const : "arrived" as const,
        destination: departed.destination,
      });
      this.worldLayer.addChild(rect(0, 126, designWidth, 54, 0x365448));
      this.worldLayer.addChild(new Graphics().moveTo(0, 153).bezierCurveTo(92, 136, 216, 171, 320, 143).stroke({ color: 0xc7a979, width: 9, alpha: 0.72 }));
      this.drawHero(state, 118, 151, palette);
      if (companion !== null) this.drawCompanion(state, companion.id, companion.role, 202, 151, palette, 0.94, isInjuredPartyStatus(companion.status));
      const title = this.createScaleSensitiveText(commandType === "recruit-companion" ? "SHARED ROAD OATH" : "OATH FULFILLED", { fontFamily: "Georgia, serif", fontSize: 10, fill: 0xffe4a6, fontWeight: "800", letterSpacing: 0.8 });
      title.anchor.set(0.5, 0);
      title.position.set(160, 25);
      const detail = this.createScaleSensitiveText(companion === null ? "The road remembers." : `${companion.name.toUpperCase()} · ${companion.role.toUpperCase()} · ${companion.destination.name.toUpperCase()}`, { fontFamily: "Inter, sans-serif", fontSize: 5.2, fill: 0xc4d9d5, fontWeight: "800", letterSpacing: 0.4 });
      detail.anchor.set(0.5, 0);
      detail.position.set(160, 42);
      this.worldLayer.addChild(title, detail);
      return;
    }
    this.worldLayer.addChild(rect(66, 22, 188, 138, 0xdec993));
    this.worldLayer.addChild(rect(72, 28, 176, 126, 0x9b865c, 0.19));
    for (let line = 0; line < 6; line += 1) {
      const width = 72 + randomInt(80, state.seed, "visual", "chronicle", state.tick, "line", line);
      this.worldLayer.addChild(rect(92, 49 + line * 14, width, 2, 0x6d5b48, 0.64));
    }
    this.worldLayer.addChild(circle(213, 127, 17, palette[1]));
    this.worldLayer.addChild(circle(213, 127, 11, palette[2], 0.65));
  }
}
