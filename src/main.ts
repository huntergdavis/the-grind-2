import "./style.css";
import { CampaignRepository } from "./core/persistence";
import { describeForwardMotionReason, forwardMotionLabel } from "./core/forward-motion";
import { createWorld } from "./core/simulation";
import type { ChampionInduction, WorldState } from "./core/types";
import { createCampaignLegacyState, legendQualificationLabel } from "./core/legends";
import { abilityExperienceCeiling, abilityExperienceFloor, counterDuelHabitText, counterDuelStanceLabel, counterDuelTellText, derivedStats, describeCompletedQuestReward, describeDungeonShrineUse, describeEncounterThreat, dungeonTrapCheckAttribute, dungeonTrapKindLabel, projectCombatRoster, projectCounterDuelHabit, projectDungeonKeyGate, projectDungeonMoveKnowledge, projectDungeonTraps, projectDungeonWayfinding, projectLatestShrineUse, projectSuccessorQuestLead, questObjectiveRuleLabel } from "./depth";
import type { CombatRosterProjection, CombatRosterStatus, CombatState, EquipmentSlot } from "./depth";
import { GameRenderer } from "./render/game-renderer";
import { projectGearAppearance, projectHeroIdentityAppearance } from "./render/hero-appearance";
import { projectLatestCombatTurn } from "./render/combat-choreography";
import type { FarewellCutawayPhase } from "./render/farewell-cutaway";
import type { HeroLevelUpCutawayPhase } from "./render/hero-level-up-cutaway";
import {
  cutawayRepetitionFingerprint,
  cutawayRegistry,
  projectCutawayCandidates,
  validateCutawayAdapterManifest,
  type FarewellCutawayCandidate,
  type HeroLevelUpCutawayCandidate,
  type ProductionCutawayCandidate,
  type ProductionCutawayRecipeKey,
  type TrapCutawayCandidate,
} from "./render/cutaway-registry";
import {
  activeCutawayMaximumMs,
  cancelCutawayController,
  completeActiveCutaway,
  createCutawayController,
  discardPendingCutawayPresentation,
  isCutawayBusy,
  offerCommittedCutaway,
  type CutawayControllerState,
} from "./render/cutaway-controller";
import {
  createTrapCutawayFatigueMemory,
  selectTrapCutawayStaging,
  trapCutawayOutcome,
  type TrapCutawayFatigueMemory,
  type TrapCutawayPhase,
  type TrapCutawayStaging,
} from "./render/trap-cutaway";
import { describeTravelCorridor, projectTravelCorridor } from "./render/travel-corridor";
import { randomId } from "./random-id";
import { shouldRecoverRuntime } from "./runtime/liveness";
import {
  projectViewHero,
  type HeroInspectionActivity,
  type HeroInspectionView,
} from "./ui/hero-inspection-activity";
import { projectMiniMap, type MiniMapLine } from "./ui/mini-map";
import { isInjuredPartyStatus, projectParty } from "./ui/party-projection";
import type { CompanionFarewellPacket } from "./ui/companion-farewell";
import { projectCriticalRoadsideRecovery } from "./ui/critical-roadside-recovery";
import type { HeroLevelUpDerivedDelta, HeroLevelUpPacketV1 } from "./ui/hero-level-up";
import { projectHeroExperience } from "./ui/hero-progression";
import { projectHallOfChampions } from "./ui/hall-of-champions";
import type { TrapResolutionPacket } from "./ui/trap-resolution";
import {
  inspectionViews,
  projectCodexView,
  projectInventoryView,
  projectJournalView,
  projectMapView,
  projectSpellbookView,
  type InspectionView,
} from "./ui/view-projection";
import {
  beginSpectatorAbsence,
  createSpectatorInbox,
  markSpectatorInboxRead,
  observeSpectatorInbox,
} from "./ui/spectator-inbox";
import {
  AutomaticUpdateMonitor,
  isNewerVersion,
  updateIntervalMs,
} from "./update/automatic-update";
import { SimulationClient } from "./worker/simulation-client";

const fastMode = new URLSearchParams(window.location.search).has("fast");
const beatDurationMs = fastMode
  ? 250
  : 4_800;
const checkpointPrefix = "the-grind-2:last-active:";
const updateAttemptKey = "the-grind-2:update-attempt";

interface UpdateAttempt {
  fromVersion: string;
  targetVersion: string;
  attemptedAt: number;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const elements = {
  app: requiredElement<HTMLElement>("#app"),
  stage: requiredElement<HTMLDivElement>("#stage"),
  heroName: requiredElement<HTMLSpanElement>("#hero-name"),
  heroLevel: requiredElement<HTMLSpanElement>("#hero-level"),
  campaignSelect: requiredElement<HTMLSelectElement>("#campaign-select"),
  pauseButton: requiredElement<HTMLButtonElement>("#pause-button"),
  newButton: requiredElement<HTMLButtonElement>("#new-button"),
  location: requiredElement<HTMLSpanElement>("#scene-location"),
  headline: requiredElement<HTMLHeadingElement>("#scene-headline"),
  action: requiredElement<HTMLParagraphElement>("#scene-action"),
  goal: requiredElement<HTMLElement>("#scene-goal"),
  consequence: requiredElement<HTMLElement>("#scene-consequence"),
  decision: requiredElement<HTMLElement>("#scene-decision"),
  healthText: requiredElement<HTMLElement>("#hero-health-text"),
  healthBar: requiredElement<HTMLProgressElement>("#hero-health-bar"),
  experienceText: requiredElement<HTMLElement>("#hero-xp-text"),
  experienceBar: requiredElement<HTMLProgressElement>("#hero-xp-bar"),
  might: requiredElement<HTMLElement>("#stat-might"),
  agility: requiredElement<HTMLElement>("#stat-agility"),
  wits: requiredElement<HTMLElement>("#stat-wits"),
  spirit: requiredElement<HTMLElement>("#stat-spirit"),
  armor: requiredElement<HTMLElement>("#stat-armor"),
  power: requiredElement<HTMLElement>("#stat-power"),
  gearSummary: requiredElement<HTMLElement>("#gear-summary"),
  abilitySummary: requiredElement<HTMLElement>("#ability-summary"),
  questTitle: requiredElement<HTMLElement>("#quest-title"),
  questSummary: requiredElement<HTMLElement>("#quest-summary"),
  questLead: requiredElement<HTMLElement>("#quest-lead"),
  questObjectives: requiredElement<HTMLUListElement>("#quest-objectives"),
  traversalLabel: requiredElement<HTMLElement>("#traversal-label"),
  traversalText: requiredElement<HTMLElement>("#traversal-progress-text"),
  traversalProgress: requiredElement<HTMLProgressElement>("#traversal-progress"),
  traversalDirective: requiredElement<HTMLElement>("#traversal-directive"),
  battleTurnStrip: requiredElement<HTMLElement>("#battle-turn-strip"),
  battleOverview: requiredElement<HTMLElement>("#battle-overview"),
  battleThreat: requiredElement<HTMLElement>("#battle-threat"),
  battleRoster: requiredElement<HTMLOListElement>("#battle-roster"),
  battleUpcoming: requiredElement<HTMLOListElement>("#battle-upcoming"),
  companionCard: requiredElement<HTMLElement>("#companion-card"),
  companionName: requiredElement<HTMLElement>("#companion-name"),
  companionStatus: requiredElement<HTMLElement>("#companion-status"),
  companionRole: requiredElement<HTMLElement>("#companion-role"),
  companionHealthText: requiredElement<HTMLElement>("#companion-health-text"),
  companionHealthBar: requiredElement<HTMLProgressElement>("#companion-health-bar"),
  companionPurpose: requiredElement<HTMLElement>("#companion-purpose"),
  companionOrigin: requiredElement<HTMLElement>("#companion-origin"),
  companionDestination: requiredElement<HTMLElement>("#companion-destination"),
  companionVictories: requiredElement<HTMLElement>("#companion-victories"),
  companionBond: requiredElement<HTMLElement>("#companion-bond"),
  equipmentList: requiredElement<HTMLUListElement>("#equipment-list"),
  abilityList: requiredElement<HTMLUListElement>("#ability-list"),
  eventLog: requiredElement<HTMLOListElement>("#event-log"),
  viewToolbar: requiredElement<HTMLElement>("#view-toolbar"),
  miniMap: requiredElement<HTMLButtonElement>("#mini-map"),
  miniMapPlace: requiredElement<HTMLElement>("#mini-map-place"),
  miniMapGraphic: requiredElement<SVGSVGElement>("#mini-map-graphic"),
  miniMapRoute: requiredElement<HTMLElement>("#mini-map-route"),
  mapInspector: requiredElement<HTMLElement>("#map-inspector"),
  mapTitle: requiredElement<HTMLElement>("#map-view-title"),
  mapCurrentPlace: requiredElement<HTMLElement>("#map-current-place"),
  mapQuestLead: requiredElement<HTMLElement>("#map-quest-lead"),
  mapRoute: requiredElement<HTMLElement>("#map-route"),
  mapDiscovery: requiredElement<HTMLElement>("#map-discovery"),
  mapHeroActivity: requiredElement<HTMLElement>("#map-hero-activity"),
  inspectionScreen: requiredElement<HTMLElement>("#inspection-screen"),
  inspectionTitle: requiredElement<HTMLElement>("#inspection-title"),
  inspectionSubtitle: requiredElement<HTMLElement>("#inspection-subtitle"),
  screenHeroActivity: requiredElement<HTMLElement>("#screen-hero-activity"),
  inventoryView: requiredElement<HTMLElement>("#inventory-view"),
  inventoryTitle: requiredElement<HTMLElement>("#inventory-title"),
  inventoryClass: requiredElement<HTMLElement>("#inventory-class"),
  inventoryGold: requiredElement<HTMLElement>("#inventory-gold"),
  inventoryStacks: requiredElement<HTMLElement>("#inventory-stacks"),
  inventoryItems: requiredElement<HTMLElement>("#inventory-items"),
  inventoryEquipped: requiredElement<HTMLElement>("#inventory-equipped"),
  inventoryGrid: requiredElement<HTMLUListElement>("#inventory-grid"),
  journalView: requiredElement<HTMLElement>("#journal-view"),
  journalSummary: requiredElement<HTMLElement>("#journal-summary"),
  journalQuestLead: requiredElement<HTMLElement>("#journal-quest-lead"),
  journalQuestList: requiredElement<HTMLElement>("#journal-quest-list"),
  journalCompletedList: requiredElement<HTMLOListElement>("#journal-completed-list"),
  journalCompanionSummary: requiredElement<HTMLElement>("#journal-companion-summary"),
  journalCompanionActive: requiredElement<HTMLElement>("#journal-companion-active"),
  journalCompanionFormer: requiredElement<HTMLOListElement>("#journal-companion-former"),
  journalMentorSummary: requiredElement<HTMLElement>("#journal-mentor-summary"),
  journalMentorList: requiredElement<HTMLOListElement>("#journal-mentor-list"),
  journalEntryList: requiredElement<HTMLOListElement>("#journal-entry-list"),
  codexView: requiredElement<HTMLElement>("#codex-view"),
  codexSummary: requiredElement<HTMLElement>("#codex-summary"),
  codexRecorded: requiredElement<HTMLElement>("#codex-recorded"),
  codexLearned: requiredElement<HTMLElement>("#codex-learned"),
  codexUnverified: requiredElement<HTMLElement>("#codex-unverified"),
  codexGrid: requiredElement<HTMLOListElement>("#codex-grid"),
  codexOverflow: requiredElement<HTMLElement>("#codex-overflow"),
  spellbookView: requiredElement<HTMLElement>("#spellbook-view"),
  spellbookSummary: requiredElement<HTMLElement>("#spellbook-summary"),
  spellbookOwned: requiredElement<HTMLElement>("#spellbook-owned"),
  spellbookSpells: requiredElement<HTMLElement>("#spellbook-spells"),
  spellbookTechniques: requiredElement<HTMLElement>("#spellbook-techniques"),
  spellbookSecrets: requiredElement<HTMLElement>("#spellbook-secrets"),
  spellbookUses: requiredElement<HTMLElement>("#spellbook-uses"),
  spellbookBreakthrough: requiredElement<HTMLElement>("#spellbook-breakthrough"),
  spellbookBreakthroughName: requiredElement<HTMLElement>("#spellbook-breakthrough-name"),
  spellbookBreakthroughDetail: requiredElement<HTMLElement>("#spellbook-breakthrough-detail"),
  spellbookGrid: requiredElement<HTMLOListElement>("#spellbook-grid"),
  spellbookOverflow: requiredElement<HTMLElement>("#spellbook-overflow"),
  hallView: requiredElement<HTMLElement>("#hall-view"),
  hallSummary: requiredElement<HTMLElement>("#hall-summary"),
  hallTotal: requiredElement<HTMLElement>("#hall-total"),
  hallEarned: requiredElement<HTMLElement>("#hall-earned"),
  hallAdopted: requiredElement<HTMLElement>("#hall-adopted"),
  hallAdmitted: requiredElement<HTMLElement>("#hall-admitted"),
  hallLegacySummary: requiredElement<HTMLElement>("#hall-legacy-summary"),
  hallLegacyGrid: requiredElement<HTMLOListElement>("#hall-legacy-grid"),
  hallGrid: requiredElement<HTMLOListElement>("#hall-grid"),
  hallOverflow: requiredElement<HTMLElement>("#hall-overflow"),
  viewAnnouncement: requiredElement<HTMLElement>("#view-announcement"),
  watchBadge: requiredElement<HTMLElement>("#watch-badge"),
  spectatorInbox: requiredElement<HTMLElement>("#spectator-inbox"),
  spectatorInboxSummary: requiredElement<HTMLElement>("#spectator-inbox-summary"),
  spectatorInboxDropped: requiredElement<HTMLElement>("#spectator-inbox-dropped"),
  spectatorInboxList: requiredElement<HTMLOListElement>("#spectator-inbox-list"),
  spectatorInboxClose: requiredElement<HTMLButtonElement>("#spectator-inbox-close"),
  updateStatus: requiredElement<HTMLElement>("#update-status"),
  trapCutaway: requiredElement<HTMLElement>("#trap-cutaway"),
  trapCutawayTitle: requiredElement<HTMLElement>("#trap-cutaway-title"),
  trapCutawayEvent: requiredElement<HTMLElement>("#trap-cutaway-event"),
  trapCutawayCommand: requiredElement<HTMLElement>("#trap-cutaway-command"),
  trapCutawayInspection: requiredElement<HTMLElement>("#trap-cutaway-inspection"),
  trapCutawayCheck: requiredElement<HTMLElement>("#trap-cutaway-check"),
  trapCutawayResult: requiredElement<HTMLElement>("#trap-cutaway-result"),
  trapCutawayConsequence: requiredElement<HTMLElement>("#trap-cutaway-consequence"),
  trapCutawayProgress: requiredElement<HTMLElement>("#trap-cutaway-progress"),
  trapCutawayOutcome: requiredElement<HTMLButtonElement>("#trap-cutaway-outcome"),
  trapCutawayAnnouncement: requiredElement<HTMLElement>("#trap-cutaway-announcement"),
  farewellCutaway: requiredElement<HTMLElement>("#farewell-cutaway"),
  farewellCutawayTitle: requiredElement<HTMLElement>("#farewell-cutaway-title"),
  farewellCutawayEvent: requiredElement<HTMLElement>("#farewell-cutaway-event"),
  farewellCutawayPromise: requiredElement<HTMLElement>("#farewell-cutaway-promise"),
  farewellCutawayJourney: requiredElement<HTMLElement>("#farewell-cutaway-journey"),
  farewellCutawayArrival: requiredElement<HTMLElement>("#farewell-cutaway-arrival"),
  farewellCutawayDeparture: requiredElement<HTMLElement>("#farewell-cutaway-departure"),
  farewellCutawayLegacy: requiredElement<HTMLElement>("#farewell-cutaway-legacy"),
  farewellCutawayProgress: requiredElement<HTMLElement>("#farewell-cutaway-progress"),
  farewellCutawayOutcome: requiredElement<HTMLButtonElement>("#farewell-cutaway-outcome"),
  farewellCutawayAnnouncement: requiredElement<HTMLElement>("#farewell-cutaway-announcement"),
  levelUpCutaway: requiredElement<HTMLElement>("#level-up-cutaway"),
  levelUpCutawayTitle: requiredElement<HTMLElement>("#level-up-cutaway-title"),
  levelUpCutawayEvent: requiredElement<HTMLElement>("#level-up-cutaway-event"),
  levelUpCutawaySource: requiredElement<HTMLElement>("#level-up-cutaway-source"),
  levelUpCutawayThreshold: requiredElement<HTMLElement>("#level-up-cutaway-threshold"),
  levelUpCutawayLevel: requiredElement<HTMLElement>("#level-up-cutaway-level"),
  levelUpCutawayMechanics: requiredElement<HTMLElement>("#level-up-cutaway-mechanics"),
  levelUpCutawayTableau: requiredElement<HTMLElement>("#level-up-cutaway-tableau"),
  levelUpCutawayProgress: requiredElement<HTMLElement>("#level-up-cutaway-progress"),
  levelUpCutawayOutcome: requiredElement<HTMLButtonElement>("#level-up-cutaway-outcome"),
  levelUpCutawayAnnouncement: requiredElement<HTMLElement>("#level-up-cutaway-announcement"),
};

const trapCutawaySteps = Array.from(elements.trapCutaway.querySelectorAll<HTMLElement>("[data-cutaway-step]"));
const farewellCutawaySteps = Array.from(elements.farewellCutaway.querySelectorAll<HTMLElement>("[data-farewell-step]"));
const levelUpCutawaySteps = Array.from(elements.levelUpCutaway.querySelectorAll<HTMLElement>("[data-level-step]"));

const viewButtons = Array.from(elements.viewToolbar.querySelectorAll<HTMLButtonElement>("[data-view]"));
if (viewButtons.length !== inspectionViews.length) throw new Error("View toolbar is incomplete");

const equipmentSlots: readonly EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "body",
  "feet",
  "charm",
];

const repository = new CampaignRepository();
const renderer = await GameRenderer.mount(elements.stage);
let champions: readonly ChampionInduction[] = await repository.listChampions();
let state = (await repository.loadActive()) ?? createNewWorld();
let durableState = state;
const simulation = new SimulationClient();
let paused = false;
let stepping = false;
let pendingInteractions = 0;
let loop: number | undefined;
let runtimeWatchdog: number | undefined;
let activeView: InspectionView = "watch";
let observedPresentationState = state;
let spectatorInbox = createSpectatorInbox(state);
let spectatorRecapOpen = false;
let automaticUpdateMonitor: AutomaticUpdateMonitor | null = null;
let presentationSuspended = document.hidden;
let lastAdvanceAtMs = Date.now();
let runtimeRecovering = false;
let cutawayController: CutawayControllerState = createCutawayController();
let trapCutawayFatigueMemory: TrapCutawayFatigueMemory = createTrapCutawayFatigueMemory();
let presentationBusy = false;
let cutawayStartedAtMs = 0;
let cutawayPausedAtMs: number | null = null;
let catchUpAfterPresentation = false;
const activityFocusByView: Partial<Record<HeroInspectionView, string>> = {};

document.documentElement.dataset.appVersion = __APP_VERSION__;

function isInspectionView(value: string | undefined): value is InspectionView {
  return value !== undefined && inspectionViews.some((view) => view === value);
}

type ScreenInspectionView = Exclude<InspectionView, "watch" | "map">;

const inspectionCopy = {
  inventory: {
    title: "Inventory",
    subtitle: "Every carried stack, modifier, rarity, quantity, and equipped slot.",
  },
  journal: {
    title: "Journal",
    subtitle: "Exact quests, companions, and the twelve most recent Chronicle beats.",
  },
  codex: {
    title: "Monster Codex",
    subtitle: "Encountered species, studied victories, and only verified secret techniques.",
  },
  spellbook: {
    title: "Spellbook & Mastery",
    subtitle: "Every owned spell, technique, monster secret, and exact current-tier mastery band.",
  },
  hall: {
    title: "Hall of Champions",
    subtitle: "Immutable Level 1000 records saved by this browser; every Eternal adventure continues.",
  },
} satisfies Record<ScreenInspectionView, { title: string; subtitle: string }>;

function isScreenInspectionView(view: InspectionView): view is ScreenInspectionView {
  return view !== "watch" && view !== "map";
}

function modifierLabel(name: string, value: number): string {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return `${value >= 0 ? "+" : ""}${value} ${spaced}`;
}

interface HeroActivityHost {
  root: HTMLElement;
  kicker: HTMLElement;
  label: HTMLElement;
  subject: HTMLElement;
  detail: HTMLElement;
  scene: HTMLElement;
  notice: HTMLElement;
}

function activityHost(root: HTMLElement): HeroActivityHost {
  const field = (name: string): HTMLElement => {
    const element = root.querySelector<HTMLElement>(`[data-activity-field="${name}"]`);
    if (element === null) throw new Error(`Hero activity host is missing ${name}`);
    return element;
  };
  return {
    root,
    kicker: field("kicker"),
    label: field("label"),
    subject: field("subject"),
    detail: field("detail"),
    scene: field("scene"),
    notice: field("notice"),
  };
}

const heroActivityHosts = {
  map: activityHost(elements.mapHeroActivity),
  screen: activityHost(elements.screenHeroActivity),
};

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function presentHeroActivityHost(host: HeroActivityHost, activity: HeroInspectionActivity): void {
  host.root.dataset.view = activity.view;
  host.root.dataset.activityTick = String(activity.tick);
  host.root.dataset.liveSceneMode = activity.sceneMode;
  host.root.dataset.attention = activity.attention;
  host.root.dataset.pose = activity.pose;
  host.root.dataset.prop = activity.prop;
  if (activity.subjectId === null) delete host.root.dataset.subjectId;
  else host.root.dataset.subjectId = activity.subjectId;
  host.kicker.textContent = `Storybook margin · T${activity.tick}`;
  host.label.textContent = `${activity.heroName} · ${activity.activityLabel}`;
  host.subject.textContent = activity.subjectLabel;
  host.detail.textContent = activity.subjectDetail;
  host.scene.textContent = `${activity.location} · ${activity.sceneHeadline} · ${activity.sceneAction}`;
  host.notice.hidden = activity.liveNotice === null;
  host.notice.textContent = activity.liveNotice ?? "";
  host.root.style.setProperty("--hero-skin-color", cssColor(activity.identity.skin));
  host.root.style.setProperty("--hero-hair-color", cssColor(activity.identity.hair));
  host.root.style.setProperty("--hero-tunic-color", cssColor(activity.identity.tunic));
  host.root.style.setProperty("--hero-cloak-color", cssColor(activity.identity.cloak));
  host.root.style.setProperty("--hero-belt-color", cssColor(activity.identity.belt));
  for (const [slot, gear] of Object.entries(activity.appearance)) {
    host.root.dataset[`${slot}Silhouette`] = gear?.silhouette ?? "none";
    host.root.style.setProperty(`--hero-${slot}-color`, gear === null ? "#52606d" : cssColor(gear.color));
    host.root.style.setProperty(`--hero-${slot}-accent`, gear === null ? "#2b3540" : cssColor(gear.accent));
  }
}

function presentHeroInspectionActivity(): void {
  if (activeView === "watch") return;
  const preferredSubjectId = activityFocusByView[activeView];
  const activity = projectViewHero(state, activeView, preferredSubjectId);
  if (activity.subjectId === null) delete activityFocusByView[activeView];
  else activityFocusByView[activeView] = activity.subjectId;
  presentHeroActivityHost(activeView === "map" ? heroActivityHosts.map : heroActivityHosts.screen, activity);
}

function syncPresentationPaused(): void {
  const presentationPaused = paused || presentationSuspended;
  const now = Date.now();
  if (presentationBusy && presentationPaused && cutawayPausedAtMs === null) {
    cutawayPausedAtMs = now;
  } else if (!presentationPaused && cutawayPausedAtMs !== null) {
    cutawayStartedAtMs += now - cutawayPausedAtMs;
    cutawayPausedAtMs = null;
  }
  elements.app.dataset.presentationPaused = String(presentationPaused);
  renderer.setPaused(presentationPaused);
}

const trapCutawayPhaseOrder: readonly TrapCutawayPhase[] = [
  "command",
  "inspection",
  "attempt",
  "reveal",
  "consequence",
  "final",
];

function trapCutawayPhaseIndex(phase: TrapCutawayPhase): number {
  if (phase === "static" || phase === "settled") return trapCutawayPhaseOrder.length - 1;
  return trapCutawayPhaseOrder.indexOf(phase);
}

function presentTrapCutawayPhase(phase: TrapCutawayPhase): void {
  const currentIndex = trapCutawayPhaseIndex(phase);
  elements.trapCutaway.dataset.phase = phase;
  for (const step of trapCutawaySteps) {
    const stepPhase = step.dataset.cutawayStep as TrapCutawayPhase | undefined;
    const stepIndex = stepPhase === undefined ? -1 : trapCutawayPhaseIndex(stepPhase);
    step.dataset.reached = String(stepIndex >= 0 && stepIndex <= currentIndex);
    step.dataset.current = String(stepIndex === currentIndex || (currentIndex >= 5 && stepPhase === "consequence"));
  }
}

function presentTrapCutawayPacket(packet: TrapResolutionPacket, staging: TrapCutawayStaging): void {
  const outcome = trapCutawayOutcome(packet);
  const mechanism = dungeonTrapKindLabel(packet.trapKind);
  elements.trapCutaway.hidden = false;
  elements.farewellCutaway.hidden = true;
  elements.levelUpCutaway.hidden = true;
  elements.trapCutaway.dataset.active = "true";
  elements.trapCutaway.dataset.eventId = packet.eventId;
  elements.trapCutaway.dataset.outcome = outcome;
  elements.trapCutaway.dataset.stage = packet.stage;
  elements.trapCutaway.dataset.shot = staging.shot;
  elements.trapCutaway.dataset.flavor = staging.flavor;
  elements.trapCutawayTitle.textContent = `${state.depth.hero.name} · ${mechanism}`;
  elements.trapCutawayEvent.textContent = `T${packet.tick} · ${packet.eventId}`;
  elements.trapCutawayCommand.textContent = packet.commandType === "enter-dungeon"
    ? "Cross the dungeon threshold"
    : packet.stage === "detect"
      ? "Enter the marked chamber"
      : "Disarm the detected mechanism";
  elements.trapCutawayInspection.textContent = `${mechanism} · ${packet.phaseBefore}`;
  elements.trapCutawayCheck.textContent = `${packet.attribute} · ${packet.skill} + ${packet.roll} = ${packet.total} vs ${packet.difficulty}`;
  elements.trapCutawayResult.textContent = `${outcome.toUpperCase()} · ${packet.phaseBefore} → ${packet.phaseAfter}`;
  elements.trapCutawayConsequence.textContent = `HP ${packet.healthBefore} → ${packet.healthAfter}${packet.damage > 0 ? ` (−${packet.damage})` : " (no damage)"}`;
  elements.trapCutawayProgress.textContent = `${packet.completedExit ? "Exit reached" : "Maze continues"} · Cross-maze quest ${packet.crossMazeDelta > 0 ? `+${packet.crossMazeDelta}` : "unchanged"} · the viewer cannot alter this resolved result.`;
  elements.trapCutawayOutcome.hidden = false;
  elements.trapCutawayOutcome.disabled = false;
  presentTrapCutawayPhase(fastMode ? "static" : "command");
}

const farewellCutawayPhaseOrder: readonly FarewellCutawayPhase[] = [
  "promise",
  "journey",
  "arrival",
  "farewell",
  "legacy",
  "final",
];

function farewellCutawayPhaseIndex(phase: FarewellCutawayPhase): number {
  if (phase === "static" || phase === "settled") return farewellCutawayPhaseOrder.length - 1;
  return farewellCutawayPhaseOrder.indexOf(phase);
}

function presentFarewellCutawayPhase(phase: FarewellCutawayPhase): void {
  const currentIndex = farewellCutawayPhaseIndex(phase);
  elements.farewellCutaway.dataset.phase = phase;
  for (const step of farewellCutawaySteps) {
    const stepPhase = step.dataset.farewellStep as FarewellCutawayPhase | undefined;
    const stepIndex = stepPhase === undefined ? -1 : farewellCutawayPhaseIndex(stepPhase);
    step.dataset.reached = String(stepIndex >= 0 && stepIndex <= currentIndex);
    step.dataset.current = String(stepIndex === currentIndex || (currentIndex >= 5 && stepPhase === "legacy"));
  }
}

function presentFarewellCutawayPacket(packet: CompanionFarewellPacket): void {
  elements.trapCutaway.hidden = true;
  elements.farewellCutaway.hidden = false;
  elements.levelUpCutaway.hidden = true;
  elements.farewellCutaway.dataset.active = "true";
  elements.farewellCutaway.dataset.eventId = packet.eventId;
  elements.farewellCutaway.dataset.outcome = packet.outcome;
  elements.farewellCutaway.dataset.companionId = packet.companionId;
  elements.farewellCutaway.dataset.profession = packet.profession;
  elements.farewellCutawayTitle.textContent = `${packet.companionName} · ${packet.profession}`;
  elements.farewellCutawayEvent.textContent = `T${packet.tick} · ${packet.eventId}`;
  elements.farewellCutawayPromise.textContent = `${packet.originName} → ${packet.destinationName}`;
  elements.farewellCutawayJourney.textContent = `${packet.victories === 0 ? "Quiet road" : `${packet.victories} victories`} · bond ${packet.bond}`;
  elements.farewellCutawayArrival.textContent = packet.outcome === "injured"
    ? `${packet.injury} · HP ${packet.health}/${packet.maxHealth}`
    : `Promise fulfilled · HP ${packet.health}/${packet.maxHealth}`;
  elements.farewellCutawayDeparture.textContent = `${packet.companionName} leaves with ${packet.profession} tools`;
  elements.farewellCutawayLegacy.textContent = `Former companion recorded · T${packet.departureTick}`;
  elements.farewellCutawayProgress.textContent = "No item changes hands · this resolved departure cannot be altered by the viewer.";
  elements.farewellCutawayOutcome.hidden = false;
  elements.farewellCutawayOutcome.disabled = false;
  presentFarewellCutawayPhase(fastMode ? "static" : "promise");
}

const heroLevelUpCutawayPhaseOrder: readonly HeroLevelUpCutawayPhase[] = [
  "source",
  "threshold",
  "ascent",
  "mechanics",
  "tableau",
  "final",
];

function heroLevelUpPhaseIndex(phase: HeroLevelUpCutawayPhase): number {
  if (phase === "static" || phase === "settled") return heroLevelUpCutawayPhaseOrder.length - 1;
  return heroLevelUpCutawayPhaseOrder.indexOf(phase);
}

function presentHeroLevelUpPhase(phase: HeroLevelUpCutawayPhase): void {
  const currentIndex = heroLevelUpPhaseIndex(phase);
  elements.levelUpCutaway.dataset.phase = phase;
  for (const step of levelUpCutawaySteps) {
    const stepPhase = step.dataset.levelStep as HeroLevelUpCutawayPhase | undefined;
    const stepIndex = stepPhase === undefined ? -1 : heroLevelUpPhaseIndex(stepPhase);
    step.dataset.reached = String(stepIndex >= 0 && stepIndex <= currentIndex);
    step.dataset.current = String(stepIndex === currentIndex || (currentIndex >= 5 && stepPhase === "tableau"));
  }
}

function derivedDeltaLabel(delta: HeroLevelUpDerivedDelta): string {
  const labels = [
    ["Power", delta.power],
    ["Armor", delta.armor],
    ["Initiative", delta.initiative],
    ["Max HP", delta.maxHealth],
    ["Max MP", delta.maxMana],
  ] as const;
  const changed = labels.filter(([, value]) => value !== 0);
  return changed.length === 0
    ? "none"
    : changed.map(([label, value]) => `${label} ${value > 0 ? "+" : ""}${value}`).join(" · ");
}

function presentHeroLevelUpPacket(packet: HeroLevelUpPacketV1): void {
  elements.trapCutaway.hidden = true;
  elements.farewellCutaway.hidden = true;
  elements.levelUpCutaway.hidden = false;
  elements.levelUpCutaway.dataset.active = "true";
  elements.levelUpCutaway.dataset.eventId = packet.eventId;
  elements.levelUpCutaway.dataset.emphasis = packet.emphasis;
  elements.levelUpCutaway.dataset.progressionBand = packet.progressionBand;
  elements.levelUpCutawayTitle.textContent = packet.emphasis === "maximum"
    ? `${packet.heroName} · Maximum reached`
    : `${packet.heroName} · Level ${packet.levelAfter}`;
  elements.levelUpCutawayEvent.textContent = `T${packet.tick} · ${packet.eventId}`;
  elements.levelUpCutawaySource.textContent = packet.sourceKind === "quest-reward"
    ? `${packet.questTitle ?? "Quest reward"} · +${packet.experienceDelta} XP`
    : `${packet.sourceHeadline} · +${packet.experienceDelta} XP`;
  elements.levelUpCutawayThreshold.textContent = packet.levelDelta === 1
    ? `${packet.experienceBefore} + ${packet.experienceDelta} = ${packet.experienceAfter} XP · threshold ${packet.thresholdSpan.firstRequiredExperience}`
    : `${packet.experienceBefore} + ${packet.experienceDelta} = ${packet.experienceAfter} XP · L${packet.thresholdSpan.firstLevel} @ ${packet.thresholdSpan.firstRequiredExperience} → L${packet.thresholdSpan.lastLevel} @ ${packet.thresholdSpan.lastRequiredExperience} · ${packet.levelDelta} thresholds`;
  elements.levelUpCutawayLevel.textContent = `LEVEL ${packet.levelBefore} → ${packet.levelAfter}`;
  const levelEffect = derivedDeltaLabel(packet.levelOnlyDerivedDelta);
  const sameBeatEffect = derivedDeltaLabel(packet.concurrentDerivedDelta);
  elements.levelUpCutawayMechanics.textContent = levelEffect === "none"
    ? `Level effect: mechanical plateau at ${packet.mechanicalLevelAfter}${sameBeatEffect === "none" ? "" : ` · Same beat: ${sameBeatEffect}`}`
    : `Level effect: ${levelEffect}${sameBeatEffect === "none" ? "" : ` · Same beat: ${sameBeatEffect}`}`;
  const equipment = packet.equipmentAfter.length === 0
    ? "No equipped items"
    : packet.equipmentAfter.map((item) => item.itemName).join(" · ");
  elements.levelUpCutawayTableau.textContent = `${packet.className} · Mastery ${packet.masteryAfter} · ${equipment}`;
  elements.levelUpCutawayProgress.textContent = packet.nextLevelRequirement === null
    ? "Level 1000 maximum reached · the Eternal adventure continues."
    : `Next: Level ${packet.levelAfter + 1} at ${packet.nextLevelRequirement} XP · this earned transition cannot be altered by the viewer.`;
  elements.levelUpCutawayOutcome.hidden = false;
  elements.levelUpCutawayOutcome.disabled = false;
  presentHeroLevelUpPhase(fastMode ? "static" : "source");
}

interface CutawayRecipeAdapter {
  readonly root: HTMLElement;
  readonly outcomeButton: HTMLButtonElement;
  readonly prepare: (candidate: ProductionCutawayCandidate) => TrapCutawayStaging | null;
  readonly present: (candidate: ProductionCutawayCandidate, staging: TrapCutawayStaging | null) => void;
  readonly presentPhase: (phase: string) => void;
  readonly finish: (candidate: ProductionCutawayCandidate) => void;
}

const cutawayAdapters: Record<ProductionCutawayRecipeKey, CutawayRecipeAdapter> = {
  "trap-resolution@1": {
    root: elements.trapCutaway,
    outcomeButton: elements.trapCutawayOutcome,
    prepare: (candidate) => {
      const packet = (candidate as TrapCutawayCandidate).packet;
      const selection = selectTrapCutawayStaging(trapCutawayFatigueMemory, packet, {
        allowMotionFlavor: !fastMode && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        semanticFingerprint: cutawayRepetitionFingerprint(cutawayRegistry, candidate),
      });
      trapCutawayFatigueMemory = selection.memory;
      return selection.staging;
    },
    present: (candidate, staging) => presentTrapCutawayPacket(
      (candidate as TrapCutawayCandidate).packet,
      staging ?? { shot: "static-tableau", flavor: "none" },
    ),
    presentPhase: (phase) => presentTrapCutawayPhase(phase as TrapCutawayPhase),
    finish: (candidate) => {
      const packet = (candidate as TrapCutawayCandidate).packet;
      elements.trapCutaway.dataset.active = "false";
      elements.trapCutawayOutcome.hidden = true;
      elements.trapCutawayOutcome.disabled = true;
      presentTrapCutawayPhase("final");
      const outcome = trapCutawayOutcome(packet).toUpperCase();
      elements.trapCutawayAnnouncement.textContent = `${outcome}. HP ${packet.healthBefore} to ${packet.healthAfter}. ${packet.completedExit ? "Dungeon exit reached." : "The maze continues."}`;
    },
  },
  "companion-farewell@1": {
    root: elements.farewellCutaway,
    outcomeButton: elements.farewellCutawayOutcome,
    prepare: () => null,
    present: (candidate) => presentFarewellCutawayPacket((candidate as FarewellCutawayCandidate).packet),
    presentPhase: (phase) => presentFarewellCutawayPhase(phase as FarewellCutawayPhase),
    finish: (candidate) => {
      const packet = (candidate as FarewellCutawayCandidate).packet;
      elements.farewellCutaway.dataset.active = "false";
      elements.farewellCutawayOutcome.hidden = true;
      elements.farewellCutawayOutcome.disabled = true;
      presentFarewellCutawayPhase("final");
      elements.farewellCutawayAnnouncement.textContent = `${packet.companionName} reached ${packet.destinationName} and left the party. Former companion recorded at tick ${packet.departureTick}.`;
    },
  },
  "hero-level-up@1": {
    root: elements.levelUpCutaway,
    outcomeButton: elements.levelUpCutawayOutcome,
    prepare: () => null,
    present: (candidate) => presentHeroLevelUpPacket((candidate as HeroLevelUpCutawayCandidate).packet),
    presentPhase: (phase) => presentHeroLevelUpPhase(phase as HeroLevelUpCutawayPhase),
    finish: (candidate) => {
      const packet = (candidate as HeroLevelUpCutawayCandidate).packet;
      elements.levelUpCutaway.dataset.active = "false";
      elements.levelUpCutawayOutcome.hidden = true;
      elements.levelUpCutawayOutcome.disabled = true;
      presentHeroLevelUpPhase("final");
      elements.levelUpCutawayAnnouncement.textContent = packet.levelAfter === 1_000
        ? `${packet.heroName} reached the maximum, Level 1000.`
        : `${packet.heroName} earned Level ${packet.levelAfter} with ${packet.experienceAfter} experience.`;
    },
  },
};

const cutawayAdapterManifest = cutawayRegistry.recipes.map((recipe) => {
  const adapter = cutawayAdapters[recipe.key as ProductionCutawayRecipeKey];
  return {
    recipeKey: recipe.key,
    domEquivalentId: adapter.root.id,
    truthCueIds: recipe.truthCueIds.filter((id) => adapter.root.querySelector(`#${id}`) !== null),
  };
});
if (!validateCutawayAdapterManifest(cutawayRegistry, cutawayAdapterManifest)) {
  throw new Error("Cutaway DOM adapters do not match the production registry");
}

function syncCutawayBusy(): void {
  presentationBusy = isCutawayBusy(cutawayController);
  elements.app.dataset.presentationBusy = String(presentationBusy);
}

function finishCutaway(candidate: ProductionCutawayCandidate, generation: number): void {
  const completed = completeActiveCutaway(cutawayController, candidate, generation);
  if (completed.action === "stale") return;
  const adapter = cutawayAdapters[candidate.recipeKey];
  const restoreOutcomeFocus = document.activeElement === adapter.outcomeButton;
  adapter.finish(candidate);
  cutawayController = completed.state;
  syncCutawayBusy();
  if (restoreOutcomeFocus) viewButtons.find((button) => button.dataset.view === "watch")?.focus();
  lastAdvanceAtMs = Date.now();
  cutawayPausedAtMs = null;
  const next = cutawayController.queue.active as ProductionCutawayCandidate | null;
  if (next !== null) {
    beginCutaway(next);
  } else if (catchUpAfterPresentation) {
    void resumeDeferredCatchUp();
  }
}

function beginCutaway(candidate: ProductionCutawayCandidate): void {
  const adapter = cutawayAdapters[candidate.recipeKey];
  const staging = adapter.prepare(candidate);
  const generation = cutawayController.generation;
  syncCutawayBusy();
  cutawayStartedAtMs = Date.now();
  cutawayPausedAtMs = paused || presentationSuspended ? cutawayStartedAtMs : null;
  delete elements.stage.dataset.cutawayFallback;
  delete elements.stage.dataset.cutawayFallbackEvent;
  adapter.present(candidate, staging);
  const started = renderer.startCutaway(candidate, {
    fast: fastMode,
    staging,
    onPhase: (phase) => {
      if (generation === cutawayController.generation) adapter.presentPhase(phase);
    },
    onComplete: () => finishCutaway(candidate, generation),
  });
  if (!started) finishCutaway(candidate, generation);
}

function enqueueCutaway(candidate: ProductionCutawayCandidate): void {
  if (activeView !== "watch") return;
  const offered = offerCommittedCutaway(cutawayRegistry, cutawayController, candidate);
  cutawayController = offered.state;
  if (offered.action === "fallback") {
    const fallback = offered.resolution.staticEnvelope;
    if (fallback !== null) {
      elements.stage.dataset.cutawayFallback = "static-chronicle";
      elements.stage.dataset.cutawayFallbackEvent = fallback.eventId;
      elements.viewAnnouncement.textContent = `${fallback.headline}. ${fallback.action} ${fallback.consequence}`;
    }
    syncCutawayBusy();
    return;
  }
  if (offered.action === "start") beginCutaway(candidate);
}

function settleActiveCutaway(promotePending = true): void {
  if (!promotePending) cutawayController = discardPendingCutawayPresentation(cutawayController);
  const active = cutawayController.queue.active as ProductionCutawayCandidate | null;
  if (active === null) {
    syncCutawayBusy();
    return;
  }
  const generation = cutawayController.generation;
  if (!renderer.settleCutaway()) finishCutaway(active, generation);
}

function cancelCutawayPresentation(): void {
  cutawayController = cancelCutawayController(cutawayController);
  trapCutawayFatigueMemory = createTrapCutawayFatigueMemory();
  syncCutawayBusy();
  cutawayStartedAtMs = 0;
  cutawayPausedAtMs = null;
  catchUpAfterPresentation = false;
  delete elements.stage.dataset.cutawayFallback;
  delete elements.stage.dataset.cutawayFallbackEvent;
  elements.trapCutaway.hidden = true;
  elements.trapCutaway.dataset.active = "false";
  delete elements.trapCutaway.dataset.shot;
  delete elements.trapCutaway.dataset.flavor;
  elements.trapCutawayAnnouncement.textContent = "";
  elements.farewellCutaway.hidden = true;
  elements.farewellCutaway.dataset.active = "false";
  delete elements.farewellCutaway.dataset.eventId;
  delete elements.farewellCutaway.dataset.outcome;
  delete elements.farewellCutaway.dataset.companionId;
  delete elements.farewellCutaway.dataset.profession;
  delete elements.farewellCutaway.dataset.phase;
  elements.farewellCutawayAnnouncement.textContent = "";
  elements.farewellCutawayOutcome.hidden = true;
  elements.farewellCutawayOutcome.disabled = true;
  elements.levelUpCutaway.hidden = true;
  elements.levelUpCutaway.dataset.active = "false";
  delete elements.levelUpCutaway.dataset.eventId;
  delete elements.levelUpCutaway.dataset.emphasis;
  delete elements.levelUpCutaway.dataset.progressionBand;
  delete elements.levelUpCutaway.dataset.phase;
  elements.levelUpCutawayAnnouncement.textContent = "";
  elements.levelUpCutawayOutcome.hidden = true;
  elements.levelUpCutawayOutcome.disabled = true;
  renderer.cancelCutaway();
}

const svgNamespace = "http://www.w3.org/2000/svg";

function miniMapPolyline(line: MiniMapLine, className: string): SVGPolylineElement {
  const polyline = document.createElementNS(svgNamespace, "polyline");
  polyline.classList.add(className);
  polyline.dataset.mapId = line.id;
  polyline.setAttribute("points", line.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "));
  return polyline;
}

function questLeadPhaseLabel(phase: "revealed" | "routed" | "at-lead" | "resolved"): string {
  return phase === "at-lead" ? "At lead" : phase === "routed" ? "Route planned" : phase === "resolved" ? "Resolved" : "Unrouted";
}

function presentMiniMap(): void {
  const questLead = projectSuccessorQuestLead(state.seed, state.depth.atlas, state.depth.quest);
  const miniMap = projectMiniMap(state.depth.atlas, questLead);
  elements.miniMap.setAttribute("aria-label", miniMap.ariaLabel);
  elements.miniMapPlace.textContent = miniMap.currentPlace;
  elements.miniMapRoute.textContent = miniMap.routeSummary;
  const coastLayer = document.createElementNS(svgNamespace, "g");
  coastLayer.classList.add("mini-map-coasts");
  coastLayer.append(...miniMap.coastlines.map((coastline) => miniMapPolyline(coastline, "mini-map-coast")));
  const riverLayer = document.createElementNS(svgNamespace, "g");
  riverLayer.classList.add("mini-map-rivers");
  riverLayer.append(...miniMap.rivers.map((river) => miniMapPolyline(river, "mini-map-river")));
  const roadLayer = document.createElementNS(svgNamespace, "g");
  roadLayer.classList.add("mini-map-roads");
  roadLayer.append(...miniMap.roads.map((road) => {
    const polyline = miniMapPolyline(road, "mini-map-road");
    polyline.dataset.selected = String(road.selected);
    polyline.dataset.terrain = road.terrain;
    return polyline;
  }));
  const siteLayer = document.createElementNS(svgNamespace, "g");
  siteLayer.classList.add("mini-map-sites");
  siteLayer.append(...miniMap.sites.map((site) => {
    const marker = document.createElementNS(svgNamespace, site.kind === "unknown" ? "polygon" : "circle");
    marker.classList.add("mini-map-site");
    marker.dataset.siteId = site.id;
    marker.dataset.kind = site.kind;
    marker.dataset.current = String(site.current);
    marker.dataset.destination = String(site.destination);
    marker.dataset.lead = String(site.lead);
    marker.setAttribute("aria-label", site.name);
    if (marker instanceof SVGPolygonElement) {
      marker.setAttribute("points", `${site.x},${site.y - 3.3} ${site.x + 3.3},${site.y} ${site.x},${site.y + 3.3} ${site.x - 3.3},${site.y}`);
    } else {
      marker.setAttribute("cx", String(site.x));
      marker.setAttribute("cy", String(site.y));
      marker.setAttribute("r", site.current || site.destination ? "3" : "2.2");
    }
    return marker;
  }));
  const partyHalo = document.createElementNS(svgNamespace, "circle");
  partyHalo.classList.add("mini-map-party-halo");
  partyHalo.setAttribute("cx", String(miniMap.party.x));
  partyHalo.setAttribute("cy", String(miniMap.party.y));
  partyHalo.setAttribute("r", "5.5");
  const party = document.createElementNS(svgNamespace, "circle");
  party.classList.add("mini-map-party");
  party.dataset.partyMarker = "true";
  party.setAttribute("cx", String(miniMap.party.x));
  party.setAttribute("cy", String(miniMap.party.y));
  party.setAttribute("r", "2.6");
  elements.miniMapGraphic.replaceChildren(coastLayer, riverLayer, roadLayer, siteLayer, partyHalo, party);
}

function championInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function presentHallOfChampions(): void {
  const hall = projectHallOfChampions(champions);
  const mentorArc = state.legacyManifestations.mentorArc;
  const admittedChampionIds = new Set(state.legacy.cards.map((card) => card.sourceChampionId));
  const appearedChampionIds = new Set(state.legacyManifestations.appearances.map((appearance) => appearance.sourceChampionId));
  const appearedCount = appearedChampionIds.size;
  const remainingCount = Math.max(0, state.legacy.cards.length - appearedCount);
  elements.hallTotal.textContent = String(hall.totalCount);
  elements.hallEarned.textContent = String(hall.earnedCount);
  elements.hallAdopted.textContent = String(hall.adoptedCount);
  elements.hallAdmitted.textContent = String(state.legacy.cards.length);
  elements.hallSummary.textContent = hall.totalCount === 0
    ? "No champion has reached Level 1000 in this browser. Eternal adventures keep their own pace."
    : `${hall.totalCount} immutable ${hall.totalCount === 1 ? "champion is" : "champions are"} remembered here; their source adventures continue.`;

  elements.hallLegacySummary.textContent = state.legacy.cards.length === 0
    ? "No prior Champion was admitted when this adventure began. No power is inherited."
    : `${state.legacy.cards.length} selected · ${appearedCount} appeared · ${remainingCount} still eligible · ${mentorArc === null ? "no recurring road" : mentorArc.memoryFact === null ? "1 mentor road unfolding" : "1 mentor memory kept"}. No stats, gear, gold, quests, or powers were imported.`;
  elements.hallLegacyGrid.replaceChildren(...state.legacy.cards.map((record) => {
    const appearance = state.legacyManifestations.appearances.find((fact) => fact.legendId === record.id);
    const meeting = appearance === undefined
      ? undefined
      : state.legacyManifestations.meetings.find((fact) => fact.appearanceId === appearance.id);
    const recognition = meeting === undefined
      ? undefined
      : state.legacyManifestations.recognitions.find((fact) => fact.meetingId === meeting.id);
    const lesson = meeting === undefined
      ? undefined
      : state.legacyManifestations.lessons.find((fact) => fact.meetingId === meeting.id);
    const relationship = mentorArc?.legendId === record.id ? mentorArc : null;
    const relationshipPhase = relationship === null
      ? "none"
      : relationship.farewellFact !== null
        ? "farewell"
        : relationship.returnFact !== null
          ? "return"
          : relationship.promiseFact !== null
            ? "promise"
            : "meeting";
    const card = document.createElement("li");
    card.className = "hall-legacy-card";
    card.dataset.legendId = record.id;
    card.dataset.sourceChampionId = record.sourceChampionId;
    card.dataset.selected = "true";
    card.dataset.appeared = String(appearance !== undefined);
    card.dataset.met = String(meeting !== undefined);
    card.dataset.recognized = String(recognition !== undefined);
    card.dataset.practiced = String(lesson !== undefined);
    card.dataset.mentorPhase = relationshipPhase;
    card.dataset.promised = String(relationship?.promiseFact !== null && relationship?.promiseFact !== undefined);
    card.dataset.returned = String(relationship?.returnFact !== null && relationship?.returnFact !== undefined);
    card.dataset.farewelled = String(relationship?.farewellFact !== null && relationship?.farewellFact !== undefined);
    card.dataset.memory = relationship?.memoryFact?.memory ?? "none";
    card.dataset.importedPower = String(lesson?.importedPower ?? false);
    const crest = document.createElement("span");
    crest.className = "hall-legacy-crest";
    crest.textContent = championInitials(record.heroName);
    const copy = document.createElement("div");
    const name = document.createElement("h4");
    name.textContent = record.heroName;
    const identity = document.createElement("p");
    identity.textContent = `${record.className} · Level ${record.level} · ${legendQualificationLabel(record.qualification)}`;
    const signature = document.createElement("small");
    const manifestationSummary = appearance === undefined
      ? record.signatureAbility === null
        ? "Candidate · not appeared · no signature art recorded · no power imported"
        : `Candidate · not appeared · archive remembers ${record.signatureAbility.abilityName} · no power imported`
      : `Appeared T${appearance.tick} · Met: ${meeting === undefined ? "no" : "witnessed demonstration"} · Recognition: ${recognition?.recognition ?? "none"} · Belief: ${recognition?.belief ?? "none"} · Practiced: ${lesson?.abilityName ?? "none"} · no power transferred`;
    const relationshipSummary = relationship === null
      ? ""
      : relationship.farewellFact !== null && relationship.memoryFact !== null
        ? ` · Roads parted T${relationship.farewellFact.tick} · Memory: kept-road-promise · no reward or power`
        : relationship.returnFact !== null
          ? ` · Promise kept T${relationship.returnFact.tick} after ${relationship.returnFact.completedQuestCount - relationship.returnFact.completedQuestBaseline} completed chapter · farewell still ahead`
          : relationship.promiseFact !== null
            ? ` · Promise T${relationship.promiseFact.tick}: return after the next completed chapter · road visit ${relationship.promiseFact.townVisitOrdinal}/${relationship.promiseFact.scheduledTownVisit}`
            : " · First meeting remembered · no future promise was fabricated";
    signature.textContent = manifestationSummary + relationshipSummary;
    copy.append(name, identity, signature);
    card.append(crest, copy);
    return card;
  }));

  const cards = hall.champions.map((record) => {
    const card = document.createElement("li");
    card.className = "hall-champion";
    card.dataset.championId = record.id;
    card.dataset.qualification = record.qualification;
    card.dataset.recordedTick = String(record.recordedTick);
    card.dataset.campaignLegacy = String(admittedChampionIds.has(record.id));

    const identity = projectHeroIdentityAppearance({ id: record.heroId });
    const portrait = document.createElement("div");
    portrait.className = "hall-portrait";
    portrait.setAttribute("aria-hidden", "true");
    portrait.style.setProperty("--champion-skin", cssColor(identity.skin));
    portrait.style.setProperty("--champion-hair", cssColor(identity.hair));
    portrait.style.setProperty("--champion-cloth", cssColor(identity.tunic));
    portrait.style.setProperty("--champion-cloak", cssColor(identity.cloak));
    const crest = document.createElement("span");
    crest.className = "hall-crest";
    crest.textContent = championInitials(record.heroName);
    const silhouette = document.createElement("span");
    silhouette.className = "hall-silhouette";
    const gear = document.createElement("span");
    gear.className = "hall-gear-marks";
    for (const archived of record.equipment) {
      const appearance = projectGearAppearance({
        id: archived.itemId,
        name: archived.itemName,
        kind: "equipment",
        slot: archived.slot,
        rarity: archived.rarity,
        quantity: 1,
        modifiers: {},
      });
      if (appearance === null) continue;
      const mark = document.createElement("i");
      mark.dataset.slot = archived.slot;
      mark.dataset.silhouette = appearance.silhouette;
      mark.style.setProperty("--gear-color", cssColor(appearance.color));
      mark.title = `${archived.itemName} · ${appearance.silhouette}`;
      gear.append(mark);
    }
    portrait.append(crest, silhouette, gear);

    const article = document.createElement("article");
    const heading = document.createElement("header");
    const title = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = record.heroName;
    const classAndLevel = document.createElement("p");
    classAndLevel.textContent = `${record.className} · Level ${record.level}`;
    title.append(name, classAndLevel);
    const qualification = document.createElement("span");
    qualification.className = "hall-qualification";
    qualification.textContent = appearedChampionIds.has(record.id)
      ? "Appeared in this tale"
      : admittedChampionIds.has(record.id)
        ? "Story candidate"
      : record.qualification === "earned" ? "Inducted" : "Recovered save";
    heading.append(title, qualification);

    const facts = document.createElement("dl");
    for (const [label, value] of [
      ["Recorded", `T${record.recordedTick}`],
      ["Experience", String(record.experience)],
      ["Chapters", String(record.totalCompletedQuests)],
    ] as const) {
      const fact = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      fact.append(term, description);
      facts.append(fact);
    }

    const equipment = document.createElement("p");
    equipment.className = "hall-equipment";
    equipment.textContent = record.equipment.length === 0
      ? "Archived gear · no equipped items"
      : `Archived gear · ${record.equipment.map((item) => item.itemName).join(" · ")}`;
    const abilities = document.createElement("ul");
    abilities.className = "hall-abilities";
    if (record.abilities.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No archived signature arts";
      abilities.append(item);
    } else {
      abilities.append(...record.abilities.map((ability) => {
        const item = document.createElement("li");
        item.dataset.abilityId = ability.abilityId;
        item.textContent = `${ability.abilityName} · ${ability.kind} · ${ability.effect} · L${ability.level}`;
        return item;
      }));
    }
    const note = document.createElement("small");
    const legacyPrefix = appearedChampionIds.has(record.id)
      ? "Appeared in this tale as a mortal mentor · no power imported · "
      : admittedChampionIds.has(record.id)
        ? "Selected once at this campaign's creation · no power imported · "
        : "";
    note.textContent = legacyPrefix + (record.qualification === "earned"
      ? `Earned by ${record.sourceCommandType} · deed ${record.sourceCommandId} · current-browser record · Eternal campaign not retired`
      : "Existing Level 1000 save adopted · source deed unavailable in released save · current-browser record · Eternal campaign not retired");
    article.append(heading, facts, equipment, abilities, note);
    card.append(portrait, article);
    return card;
  });
  if (cards.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hall-empty";
    empty.textContent = "The first name will be carved when a hero reaches Level 1000. No hero is retired or replaced.";
    cards.push(empty);
  }
  elements.hallGrid.replaceChildren(...cards);
  elements.hallOverflow.hidden = hall.hiddenCount === 0;
  elements.hallOverflow.textContent = hall.hiddenCount === 0
    ? ""
    : `${hall.hiddenCount} earlier ${hall.hiddenCount === 1 ? "champion remains" : "champions remain"} safely archived outside this bounded gallery.`;
}

function presentViewScreens(): void {
  const scrollTop = elements.inspectionScreen.scrollTop;
  presentMiniMap();
  const map = projectMapView(state);
  elements.mapTitle.textContent = map.destination === null ? "The known world" : `Road to ${map.destination}`;
  elements.mapCurrentPlace.textContent = map.currentLeg ?? map.currentPlace;
  elements.mapQuestLead.hidden = map.questLead === null;
  elements.mapQuestLead.textContent = map.questLead === null
    ? ""
    : `Quest lead · ${map.questLead.locationName} · ${questLeadPhaseLabel(map.questLead.phase)}${map.questLead.discovered ? "" : " · rumored site"}`;
  elements.mapQuestLead.title = map.questLead === null ? "" : `Quest lead at ${map.questLead.locationName}: ${questLeadPhaseLabel(map.questLead.phase)}`;
  elements.mapRoute.textContent = map.nextLegDanger === null
    ? map.progress
    : `${map.progress} · Known place danger ${map.nextLegDanger.score} ${map.nextLegDanger.label}`;
  if (map.nextLegDanger === null) {
    delete elements.mapRoute.dataset.danger;
    delete elements.mapRoute.dataset.threatBand;
  } else {
    elements.mapRoute.dataset.danger = String(map.nextLegDanger.score);
    elements.mapRoute.dataset.threatBand = map.nextLegDanger.band;
  }
  elements.mapDiscovery.textContent = `${map.discovered} · ${map.terrain}`;

  const inventory = projectInventoryView(state);
  elements.inventoryTitle.textContent = inventory.heroName;
  elements.inventoryClass.textContent = inventory.classAndLevel;
  elements.inventoryGold.textContent = String(inventory.gold);
  elements.inventoryStacks.textContent = String(inventory.stackCount);
  elements.inventoryItems.textContent = String(inventory.itemCount);
  elements.inventoryEquipped.textContent = String(inventory.equippedCount);
  elements.inventoryGrid.replaceChildren(
    ...inventory.items.map((projected) => {
      const item = document.createElement("li");
      item.className = "inventory-item";
      item.dataset.itemId = projected.id;
      item.dataset.rarity = projected.rarity;
      item.dataset.equipped = String(projected.equippedSlot !== null);
      const header = document.createElement("header");
      const name = document.createElement("h3");
      name.textContent = projected.name;
      const quantity = document.createElement("span");
      quantity.textContent = `×${projected.quantity}`;
      header.append(name, quantity);
      const kind = document.createElement("p");
      kind.className = "item-kind";
      kind.textContent = `${projected.rarity} · ${projected.slot ?? projected.kind}`;
      const equipped = document.createElement("p");
      equipped.className = "item-equipped";
      equipped.textContent = projected.equippedSlot === null ? "Carried" : `Equipped · ${projected.equippedSlot}`;
      const modifiers = document.createElement("p");
      modifiers.className = "item-modifiers";
      modifiers.textContent = projected.modifiers.length === 0
        ? "No stat modifiers"
        : projected.modifiers.map((modifier) => modifierLabel(modifier.name, modifier.value)).join(" · ");
      item.append(header, kind, equipped, modifiers);
      return item;
    }),
  );

  const journal = projectJournalView(state);
  const party = projectParty(state.depth);
  const activeCompanion = party.active;
  elements.companionCard.hidden = activeCompanion === null;
  delete elements.companionCard.dataset.companionId;
  delete elements.companionCard.dataset.status;
  delete elements.companionCard.dataset.injured;
  delete elements.companionCard.dataset.destination;
  delete elements.companionCard.dataset.health;
  if (activeCompanion !== null) {
    elements.companionCard.dataset.companionId = activeCompanion.id;
    elements.companionCard.dataset.status = activeCompanion.status;
    elements.companionCard.dataset.injured = String(isInjuredPartyStatus(activeCompanion.status));
    elements.companionCard.dataset.destination = activeCompanion.destination.locationId;
    elements.companionCard.dataset.health = `${activeCompanion.health}/${activeCompanion.maxHealth}`;
    elements.companionName.textContent = activeCompanion.name;
    elements.companionStatus.textContent = activeCompanion.status;
    elements.companionRole.textContent = activeCompanion.role;
    elements.companionHealthText.textContent = `${activeCompanion.health}/${activeCompanion.maxHealth}`;
    elements.companionHealthBar.max = activeCompanion.maxHealth;
    elements.companionHealthBar.value = activeCompanion.health;
    elements.companionHealthBar.setAttribute("aria-label", `${activeCompanion.name} health ${activeCompanion.health} of ${activeCompanion.maxHealth}`);
    elements.companionPurpose.textContent = activeCompanion.statusText;
    elements.companionOrigin.textContent = activeCompanion.origin.name;
    elements.companionDestination.textContent = activeCompanion.destination.name;
    elements.companionVictories.textContent = String(activeCompanion.victories);
    elements.companionBond.textContent = String(activeCompanion.bond);
  }
  elements.journalCompanionSummary.textContent = activeCompanion === null
    ? party.former.length === 0
      ? "No road oath has been sworn."
      : `${party.former.length} completed ${party.former.length === 1 ? "oath" : "oaths"} retained.`
    : `${activeCompanion.name} · ${activeCompanion.statusText}`;
  elements.journalCompanionActive.hidden = activeCompanion === null;
  elements.journalCompanionActive.replaceChildren(...(activeCompanion === null ? [] : [(() => {
    const record = document.createElement("article");
    record.className = "journal-companion-record";
    record.dataset.companionId = activeCompanion.id;
    record.dataset.status = activeCompanion.status;
    record.dataset.injured = String(isInjuredPartyStatus(activeCompanion.status));
    const name = document.createElement("strong");
    name.textContent = `${activeCompanion.name} · ${activeCompanion.role}`;
    const route = document.createElement("span");
    route.textContent = activeCompanion.purposeText;
    const facts = document.createElement("small");
    facts.textContent = `${activeCompanion.statusText} · HP ${activeCompanion.health}/${activeCompanion.maxHealth} · ${activeCompanion.victories} victories · bond ${activeCompanion.bond} · joined T${activeCompanion.joinedTick}`;
    record.append(name, route, facts);
    return record;
  })()]));
  elements.journalCompanionFormer.replaceChildren(...party.former.map((companion) => {
    const item = document.createElement("li");
    item.className = "journal-companion-record";
    item.dataset.companionId = companion.id;
    item.dataset.outcome = companion.departureOutcome;
    item.dataset.injured = String(companion.departureOutcome === "injured");
    const name = document.createElement("strong");
    name.textContent = `${companion.name} · ${companion.role}`;
    const route = document.createElement("span");
    route.textContent = companion.purposeText;
    const facts = document.createElement("small");
    facts.textContent = `${companion.departureText} · ${companion.victories} victories · bond ${companion.bond} · T${companion.joinedTick}–T${companion.departureTick}`;
    item.append(name, route, facts);
    return item;
  }));
  const mentorArc = state.legacyManifestations.mentorArc;
  const mentorLegend = mentorArc === null
    ? undefined
    : state.legacy.cards.find((candidate) => candidate.id === mentorArc.legendId);
  const mentorPhase = mentorArc === null
    ? "none"
    : mentorArc.farewellFact !== null
      ? "farewell"
      : mentorArc.returnFact !== null
        ? "return"
        : mentorArc.promiseFact !== null
          ? "promise"
          : "meeting";
  elements.journalMentorSummary.textContent = mentorArc === null || mentorLegend === undefined
    ? "No recurring mentor road has begun."
    : mentorPhase === "farewell"
      ? `${mentorLegend.heroName}'s road is complete. The kept promise remains in memory.`
      : mentorPhase === "return"
        ? `${mentorLegend.heroName} kept the promised return. One final parting remains.`
        : mentorPhase === "promise"
          ? `${mentorLegend.heroName} promised to return after the next completed chapter.`
          : `${mentorLegend.heroName}'s first meeting is remembered; no promise has yet been spoken.`;
  elements.journalMentorList.replaceChildren(...(mentorArc === null || mentorLegend === undefined ? [] : [(() => {
    const item = document.createElement("li");
    item.className = "journal-mentor-record";
    item.dataset.legendId = mentorLegend.id;
    item.dataset.phase = mentorPhase;
    item.dataset.importedPower = "false";
    item.dataset.mechanicalEffect = "none";
    item.dataset.memory = mentorArc.memoryFact?.memory ?? "none";
    const name = document.createElement("strong");
    name.textContent = `${mentorLegend.heroName} · Mortal mentor`;
    const relationship = document.createElement("span");
    relationship.textContent = mentorPhase === "farewell"
      ? "Roads parted as friends · kept-road-promise"
      : mentorPhase === "return"
        ? "Promise kept · the final road remains"
        : mentorPhase === "promise"
          ? "Promised return · after the next completed chapter"
          : "First meeting · future promise not yet spoken";
    const facts = document.createElement("small");
    facts.textContent = mentorArc.farewellFact !== null
      ? `Promise T${mentorArc.promiseFact?.tick ?? "?"} · returned T${mentorArc.returnFact?.tick ?? "?"} · farewell T${mentorArc.farewellFact.tick} · memory recorded T${mentorArc.memoryFact?.recordedTick ?? "?"} · no reward or power`
      : mentorArc.returnFact !== null
        ? `Returned T${mentorArc.returnFact.tick} · completed chapters ${mentorArc.returnFact.completedQuestBaseline}→${mentorArc.returnFact.completedQuestCount} · no reward or power`
        : mentorArc.promiseFact !== null
          ? `Promised T${mentorArc.promiseFact.tick} · visit ${mentorArc.promiseFact.townVisitOrdinal}, return due no earlier than visit ${mentorArc.promiseFact.scheduledTownVisit} and one completed chapter · no reward or power`
          : `Meeting ${mentorArc.meetingId} · migrated truth does not invent a past promise · no reward or power`;
    item.append(name, relationship, facts);
    return item;
  })()]));
  elements.journalSummary.textContent = journal.questSummary;
  elements.journalQuestLead.hidden = journal.questLead === null;
  elements.journalQuestLead.textContent = journal.questLead === null
    ? ""
    : `Quest lead · ${journal.questLead.locationName} · ${questLeadPhaseLabel(journal.questLead.phase)}${journal.questLead.discovered ? "" : " · rumored site"}`;
  elements.journalQuestLead.title = journal.questLead === null ? "" : `Quest lead at ${journal.questLead.locationName}: ${questLeadPhaseLabel(journal.questLead.phase)}`;
  elements.journalQuestList.replaceChildren(
    ...journal.quests.map((projected) => {
      const quest = document.createElement("section");
      quest.className = "journal-quest";
      quest.dataset.questId = projected.id;
      quest.dataset.status = projected.status;
      const title = document.createElement("h3");
      title.textContent = `${projected.title} · ${projected.statusLabel}`;
      const objectives = document.createElement("ul");
      objectives.append(...projected.objectives.map((projectedObjective) => {
        const objective = document.createElement("li");
        objective.dataset.status = projectedObjective.status;
        objective.dataset.ruleLabel = projectedObjective.ruleLabel;
        objective.textContent = `${projectedObjective.description} · ${projectedObjective.progress}`;
        objective.setAttribute("aria-label", `${projectedObjective.ruleLabel}: ${projectedObjective.description} · ${projectedObjective.progress}`);
        return objective;
      }));
      quest.append(title, objectives);
      return quest;
    }),
  );
  elements.journalCompletedList.replaceChildren(...journal.completedChapters.map((chapter) => {
    const item = document.createElement("li");
    item.dataset.completionId = chapter.id;
    item.dataset.questOrdinal = String(chapter.ordinal);
    const title = document.createElement("strong");
    title.textContent = `Chapter ${chapter.ordinal + 1} · ${chapter.title}`;
    const facts = document.createElement("span");
    facts.textContent = `Fulfilled T${chapter.fulfilledTick} · ${chapter.objectiveCount} objectives`;
    const reward = document.createElement("small");
    reward.textContent = chapter.rewardSummary;
    item.append(title, facts, reward);
    return item;
  }));
  const entries = journal.entries.map((projected) => {
    const item = document.createElement("li");
    item.dataset.eventId = projected.id;
    const time = document.createElement("time");
    time.textContent = `T${projected.tick} · ${projected.location}`;
    const headline = document.createElement("strong");
    headline.textContent = projected.headline;
    const action = document.createElement("p");
    action.textContent = projected.action;
    const changed = document.createElement("small");
    changed.textContent = `Changed · ${projected.consequence}`;
    item.append(time, headline, action, changed);
    return item;
  });
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "The first Chronicle beat is still unfolding.";
    entries.push(empty);
  }
  elements.journalEntryList.replaceChildren(...entries);

  const codex = projectCodexView(state);
  elements.codexRecorded.textContent = String(codex.recordedCount);
  elements.codexLearned.textContent = String(codex.learnedCount);
  elements.codexUnverified.textContent = String(codex.unverifiedCount);
  elements.codexSummary.textContent = codex.recordedCount === 0
    ? "No creature patterns recorded yet. Encountered species will appear here."
    : `${codex.recordedCount} encountered species · ${codex.learnedCount} verified ${codex.learnedCount === 1 ? "technique" : "techniques"}.`;
  const codexCards = codex.monsters.map((projected) => {
    const card = document.createElement("li");
    card.className = "codex-monster";
    card.dataset.monsterId = projected.monsterId;
    card.dataset.techniqueStatus = projected.techniqueStatus;
    const portrait = document.createElement("div");
    portrait.className = "codex-portrait";
    portrait.dataset.visualKey = projected.visualKey;
    portrait.setAttribute("aria-hidden", "true");
    const body = document.createElement("span");
    body.className = "codex-creature-body";
    const feature = document.createElement("span");
    feature.className = "codex-creature-feature";
    const eyes = document.createElement("span");
    eyes.className = "codex-creature-eyes";
    portrait.append(body, feature, eyes);

    const dossier = document.createElement("article");
    const heading = document.createElement("header");
    const name = document.createElement("h3");
    name.textContent = projected.monsterName;
    const status = document.createElement("span");
    status.className = "codex-technique-status";
    status.textContent = projected.techniqueStatus === "learned"
      ? "Technique learned"
      : projected.techniqueStatus === "unverified"
        ? "Pattern understood"
        : "Studying pattern";
    heading.append(name, status);

    const facts = document.createElement("dl");
    for (const [label, value] of [
      ["Battles encountered", projected.encounters],
      ["Victories studied", projected.victories],
    ] as const) {
      const fact = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      fact.append(term, description);
      facts.append(fact);
    }

    const habit = document.createElement("section");
    habit.className = "codex-habit";
    habit.dataset.status = projected.habit?.status ?? "unavailable";
    if (projected.habit?.status === "established") {
      habit.dataset.stance = projected.habit.preferredStance;
    }
    const habitMark = document.createElement("span");
    habitMark.className = "codex-habit-mark";
    habitMark.dataset.stance = projected.habit?.status === "established"
      ? projected.habit.preferredStance
      : "unknown";
    habitMark.setAttribute("aria-hidden", "true");
    const habitCopy = document.createElement("span");
    const habitName = document.createElement("strong");
    const habitDetail = document.createElement("small");
    if (projected.habit === null) {
      habitName.textContent = "Field note unavailable";
      habitDetail.textContent = "No Pattern Duel behavior is catalogued for this species.";
    } else if (projected.habit.status === "unconfirmed") {
      habitName.textContent = "Habit unconfirmed";
      habitDetail.textContent = `${projected.habit.encounters}/${projected.habit.requiredEncounters} encounters recorded; no stance inferred.`;
    } else {
      habitName.textContent = "Field note established";
      habitDetail.textContent = `${projected.habit.label}; habit, not intent.`;
    }
    habitCopy.append(habitName, habitDetail);
    habit.append(habitMark, habitCopy);

    const insightLabel = document.createElement("div");
    insightLabel.className = "codex-meter-label";
    const insightName = document.createElement("span");
    insightName.textContent = "Technique insight";
    const insightValue = document.createElement("strong");
    insightValue.textContent = `${projected.insight}/${projected.requiredInsight}`;
    insightLabel.append(insightName, insightValue);
    const insight = document.createElement("progress");
    insight.max = projected.requiredInsight;
    insight.value = projected.insight;
    insight.setAttribute(
      "aria-label",
      `${projected.monsterName} technique insight ${projected.insight} of ${projected.requiredInsight}`,
    );

    const technique = document.createElement("section");
    technique.className = "codex-technique";
    const techniqueName = document.createElement("h4");
    const techniqueDetail = document.createElement("p");
    if (projected.technique === null) {
      techniqueName.textContent = projected.techniqueStatus === "unverified"
        ? "Repertoire record unverified"
        : "Secret technique unknown";
      techniqueDetail.textContent = projected.techniqueStatus === "unverified"
        ? "The pattern is complete, but no matching learned ability and discovery record can verify it."
        : `${projected.remainingVictories} more ${projected.remainingVictories === 1 ? "victory" : "victories"} to complete the pattern.`;
      technique.append(techniqueName, techniqueDetail);
    } else {
      technique.dataset.effect = projected.technique.effect;
      techniqueName.textContent = projected.technique.name;
      techniqueDetail.textContent = `${projected.technique.effect} · ${projected.technique.manaCost} MP · ${projected.technique.potency} potency · ${projected.technique.uses} uses`;
      const masteryLabel = document.createElement("div");
      masteryLabel.className = "codex-meter-label";
      const masteryName = document.createElement("span");
      masteryName.textContent = `Mastery · Level ${projected.technique.level}`;
      const masteryValue = document.createElement("strong");
      masteryValue.textContent = `${projected.technique.experience}/${projected.technique.experienceCeiling}`;
      masteryLabel.append(masteryName, masteryValue);
      const mastery = document.createElement("progress");
      mastery.className = "codex-mastery-meter";
      mastery.max = Math.max(1, projected.technique.experienceCeiling - projected.technique.experienceFloor);
      mastery.value = Math.max(0, projected.technique.experience - projected.technique.experienceFloor);
      mastery.setAttribute(
        "aria-label",
        `${projected.technique.name} mastery ${projected.technique.experience} of ${projected.technique.experienceCeiling}`,
      );
      const provenance = document.createElement("small");
      provenance.textContent = `Learned from ${projected.monsterName} at T${projected.technique.discoveryTick}`;
      technique.append(techniqueName, techniqueDetail, masteryLabel, mastery, provenance);
    }
    dossier.append(heading, facts, habit, insightLabel, insight, technique);
    card.append(portrait, dossier);
    return card;
  });
  if (codexCards.length === 0) {
    const empty = document.createElement("li");
    empty.className = "codex-empty";
    empty.textContent = "No creatures encountered. The Codex will fill itself as the adventure reaches real battles.";
    codexCards.push(empty);
  }
  elements.codexGrid.replaceChildren(...codexCards);
  elements.codexOverflow.hidden = codex.hiddenCount === 0;
  elements.codexOverflow.textContent = codex.hiddenCount === 0
    ? ""
    : `${codex.hiddenCount} more encountered ${codex.hiddenCount === 1 ? "species is" : "species are"} recorded outside this bounded view.`;

  const spellbook = projectSpellbookView(state);
  elements.spellbookOwned.textContent = String(spellbook.abilityCount);
  elements.spellbookSpells.textContent = String(spellbook.spellCount);
  elements.spellbookTechniques.textContent = String(spellbook.techniqueCount);
  elements.spellbookSecrets.textContent = String(spellbook.secretCount);
  elements.spellbookUses.textContent = String(spellbook.totalBattleUses);
  elements.spellbookSummary.textContent = spellbook.abilityCount === 0
    ? "No owned abilities recorded yet."
    : `${spellbook.abilityCount} owned ${spellbook.abilityCount === 1 ? "ability" : "abilities"} · ${spellbook.masteredCount} at the current mastery cap.`;
  const breakthrough = spellbook.closestBreakthrough;
  elements.spellbookBreakthrough.hidden = breakthrough === null;
  elements.spellbookBreakthroughName.textContent = breakthrough?.abilityName ?? "";
  elements.spellbookBreakthroughDetail.textContent = breakthrough === null
    ? ""
    : `${breakthrough.experienceToNext} mastery XP to Level ${breakthrough.nextLevel}`;
  const kindLabel = { spell: "Spell", technique: "Technique", secret: "Monster secret" } as const;
  const spellbookCards = spellbook.abilities.map((projected) => {
    const card = document.createElement("li");
    card.className = "spellbook-ability";
    card.dataset.abilityId = projected.id;
    card.dataset.kind = projected.kind;
    card.dataset.effect = projected.effect;
    card.dataset.provenance = projected.provenanceStatus;

    const sigil = document.createElement("div");
    sigil.className = "spellbook-sigil";
    sigil.dataset.effect = projected.effect;
    sigil.setAttribute("aria-hidden", "true");
    for (const className of ["spellbook-sigil-ring", "spellbook-sigil-mark", "spellbook-sigil-core"]) {
      const part = document.createElement("span");
      part.className = className;
      sigil.append(part);
    }

    const detail = document.createElement("article");
    const heading = document.createElement("header");
    const identity = document.createElement("div");
    const kind = document.createElement("span");
    kind.className = "spellbook-kind";
    kind.textContent = kindLabel[projected.kind];
    const name = document.createElement("h3");
    name.textContent = projected.name;
    identity.append(kind, name);
    const level = document.createElement("span");
    level.className = "spellbook-level";
    const levelLabel = document.createElement("small");
    levelLabel.textContent = "Level";
    const levelValue = document.createElement("strong");
    levelValue.textContent = String(projected.level);
    level.append(levelLabel, levelValue);
    heading.append(identity, level);

    const effect = document.createElement("p");
    effect.className = "spellbook-effect";
    effect.textContent = projected.effect;

    const facts = document.createElement("dl");
    for (const [label, value] of [
      ["MP cost", projected.manaCost],
      ["Potency", projected.potency],
      ["Battle uses", projected.battleUses],
    ] as const) {
      const fact = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      fact.append(term, description);
      facts.append(fact);
    }

    const mastery = document.createElement("section");
    mastery.className = "spellbook-mastery";
    if (projected.mastered) {
      const capped = document.createElement("strong");
      capped.className = "spellbook-mastery-cap";
      capped.textContent = "Current mastery cap";
      const total = document.createElement("small");
      total.textContent = `${projected.experience} total mastery XP`;
      mastery.append(capped, total);
    } else {
      const meterLabel = document.createElement("div");
      const title = document.createElement("span");
      title.textContent = `Mastery to Level ${projected.level + 1}`;
      const value = document.createElement("strong");
      value.textContent = `${projected.masteryCurrent}/${projected.masterySpan}`;
      meterLabel.append(title, value);
      const meter = document.createElement("progress");
      meter.max = projected.masterySpan;
      meter.value = projected.masteryCurrent;
      meter.setAttribute(
        "aria-label",
        `${projected.name} current-tier mastery ${projected.masteryCurrent} of ${projected.masterySpan}; ${projected.experienceToNext} experience to Level ${projected.level + 1}`,
      );
      const remaining = document.createElement("small");
      remaining.textContent = `${projected.experienceToNext} XP remaining · ${projected.experience} total XP`;
      mastery.append(meterLabel, meter, remaining);
    }

    detail.append(heading, effect, facts, mastery);
    if (projected.kind === "secret") {
      const provenance = document.createElement("p");
      provenance.className = "spellbook-provenance";
      provenance.textContent = projected.provenance === null
        ? "Monster-secret origin unconfirmed"
        : `Learned from ${projected.provenance.monsterName} · recorded T${projected.provenance.discoveryTick}`;
      detail.append(provenance);
    }
    card.append(sigil, detail);
    return card;
  });
  if (spellbookCards.length === 0) {
    const empty = document.createElement("li");
    empty.className = "spellbook-empty";
    empty.textContent = "No owned abilities. Spells, techniques, and learned monster secrets will appear here when canonical records exist.";
    spellbookCards.push(empty);
  }
  elements.spellbookGrid.replaceChildren(...spellbookCards);
  elements.spellbookOverflow.hidden = spellbook.hiddenCount === 0;
  elements.spellbookOverflow.textContent = spellbook.hiddenCount === 0
    ? ""
    : `${spellbook.hiddenCount} more owned ${spellbook.hiddenCount === 1 ? "ability is" : "abilities are"} recorded outside this bounded view.`;
  presentHallOfChampions();
  elements.inspectionScreen.scrollTop = scrollTop;
}

function presentSpectatorInbox(): void {
  const watchButton = viewButtons.find((button) => button.dataset.view === "watch");
  const unread = spectatorInbox.unread;
  elements.watchBadge.hidden = unread === 0;
  elements.watchBadge.textContent = unread > 99 ? "99+" : String(unread);
  watchButton?.setAttribute(
    "aria-label",
    unread === 0
      ? "Watch"
      : `Watch, ${unread} unseen adventure ${unread === 1 ? "highlight" : "highlights"}`,
  );
  const visible = activeView === "watch" && spectatorRecapOpen && spectatorInbox.items.length > 0;
  elements.spectatorInbox.hidden = !visible;
  elements.spectatorInbox.dataset.count = String(spectatorInbox.items.length);
  elements.spectatorInbox.dataset.unread = String(unread);
  elements.spectatorInboxSummary.textContent = `${spectatorInbox.items.length} significant ${spectatorInbox.items.length === 1 ? "moment" : "moments"}, oldest first.`;
  const boundednessNotes: string[] = [];
  if (spectatorInbox.dropped > 0) {
    boundednessNotes.push(`${spectatorInbox.dropped} earlier significant ${spectatorInbox.dropped === 1 ? "moment was" : "moments were"} evicted`);
  }
  if (spectatorInbox.unavailableTicks > 0) {
    boundednessNotes.push(`${spectatorInbox.unavailableTicks} catch-up ${spectatorInbox.unavailableTicks === 1 ? "tick was" : "ticks were"} outside retained Chronicle history`);
  }
  elements.spectatorInboxDropped.hidden = boundednessNotes.length === 0;
  elements.spectatorInboxDropped.textContent = boundednessNotes.length === 0
    ? ""
    : `${boundednessNotes.join("; ")}.`;
  elements.spectatorInboxList.replaceChildren(...spectatorInbox.items.map((moment) => {
    const item = document.createElement("li");
    item.className = "spectator-moment";
    item.dataset.momentId = moment.id;
    item.dataset.kind = moment.kind;
    item.dataset.status = moment.status;
    item.dataset.provenance = moment.provenance;
    if (moment.sourceId !== null) item.dataset.sourceId = moment.sourceId;
    if (moment.latestSourceId !== null) item.dataset.latestSourceId = moment.latestSourceId;
    const heading = document.createElement("div");
    const kind = document.createElement("span");
    kind.className = "spectator-moment-kind";
    kind.textContent = moment.kind;
    const time = document.createElement("time");
    time.textContent = moment.fromTick === moment.tick
      ? `T${moment.tick}`
      : `T${moment.fromTick}–${moment.tick}`;
    heading.append(kind, time);
    const title = document.createElement("h3");
    title.textContent = moment.title;
    const location = document.createElement("p");
    location.className = "spectator-moment-location";
    location.textContent = moment.location;
    const details = document.createElement("ul");
    details.append(...moment.details.map((detail) => {
      const detailItem = document.createElement("li");
      detailItem.textContent = detail;
      return detailItem;
    }));
    if (moment.omittedDetails > 0) {
      const omitted = document.createElement("li");
      omitted.className = "spectator-moment-omitted";
      omitted.textContent = `${moment.omittedDetails} earlier exact ${moment.omittedDetails === 1 ? "detail" : "details"} omitted`;
      details.append(omitted);
    }
    item.append(heading, title, location, details);
    return item;
  }));
}

function setActiveView(view: InspectionView, restoreWatchFocus = false): void {
  const previousView = activeView;
  if (previousView === "watch" && view !== "watch") {
    settleActiveCutaway(false);
    elements.trapCutaway.hidden = true;
    elements.farewellCutaway.hidden = true;
  }
  if (previousView === "watch" && view !== "watch") {
    spectatorInbox = beginSpectatorAbsence(spectatorInbox, state);
    spectatorRecapOpen = false;
  }
  activeView = view;
  elements.app.dataset.activeView = view;
  for (const button of viewButtons) {
    const selected = button.dataset.view === view;
    button.setAttribute("aria-pressed", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  const inspecting = isScreenInspectionView(view);
  elements.mapInspector.hidden = view !== "map";
  elements.inspectionScreen.hidden = !inspecting;
  elements.inventoryView.hidden = view !== "inventory";
  elements.journalView.hidden = view !== "journal";
  elements.codexView.hidden = view !== "codex";
  elements.spellbookView.hidden = view !== "spellbook";
  elements.hallView.hidden = view !== "hall";
  if (inspecting) {
    elements.inspectionTitle.textContent = inspectionCopy[view].title;
    elements.inspectionSubtitle.textContent = inspectionCopy[view].subtitle;
  }
  renderer.setViewMode(view === "map" ? "map" : "live");
  const returningWithMoments = previousView !== "watch" && view === "watch" && spectatorInbox.items.length > 0;
  if (returningWithMoments) {
    spectatorRecapOpen = true;
    const missed = spectatorInbox.unread;
    spectatorInbox = markSpectatorInboxRead(spectatorInbox);
    elements.viewAnnouncement.textContent = `Watch view. ${missed} unseen adventure ${missed === 1 ? "highlight" : "highlights"} summarized. Live adventure presentation restored.`;
  } else {
    elements.viewAnnouncement.textContent = view === "watch"
      ? "Watch view. Live adventure presentation restored."
    : `${view[0]?.toUpperCase() ?? ""}${view.slice(1)} view. The adventure continues in the background.`;
  }
  presentSpectatorInbox();
  presentHeroInspectionActivity();
  if (restoreWatchFocus) viewButtons.find((button) => button.dataset.view === "watch")?.focus();
}

function createNewWorld(): WorldState {
  const campaignId = randomId();
  const seedBytes = crypto.getRandomValues(new Uint32Array(4));
  const seed = Array.from(seedBytes, (value) => value.toString(16).padStart(8, "0")).join("");
  return createWorld(seed, campaignId, createCampaignLegacyState(seed, champions));
}

function checkpointKey(campaignId: string): string {
  return `${checkpointPrefix}${campaignId}`;
}

async function catchUp(world: WorldState): Promise<WorldState> {
  const lastActive = Number(localStorage.getItem(checkpointKey(world.campaignId)));
  if (!Number.isFinite(lastActive) || lastActive <= 0) return world;
  const observedAtMs = Date.now();
  const elapsed = Math.max(0, observedAtMs - lastActive);
  const requestedTicks = Math.floor(elapsed / beatDurationMs);
  if (requestedTicks === 0) return world;
  return simulation.catchUp({
    id: `${world.campaignId}:${lastActive}:${observedAtMs}`,
    observedAtMs,
    elapsedMs: elapsed,
    requestedTicks,
  });
}

async function resumeDeferredCatchUp(): Promise<void> {
  if (!catchUpAfterPresentation || presentationBusy || paused || document.hidden) return;
  catchUpAfterPresentation = false;
  await runInteraction(async () => {
    state = await catchUp(state);
    present();
    await persist();
  });
}

function combatStatusText(status: CombatRosterStatus): string {
  const label = status.kind === "guarding"
    ? "Guarding"
    : status.kind === "poisoned"
      ? "Poison"
      : status.kind === "weakened"
        ? "Weakened"
        : "Burning";
  return `${label} ${status.duration}t · potency ${status.potency}`;
}

function presentCombatRoster(projection: CombatRosterProjection | null, combat: CombatState | null): void {
  elements.battleOverview.hidden = projection === null;
  elements.battleThreat.hidden = projection === null || combat === null;
  elements.battleThreat.textContent = combat === null ? "" : describeEncounterThreat(combat.threat);
  delete elements.battleThreat.dataset.rating;
  delete elements.battleThreat.dataset.score;
  delete elements.battleThreat.dataset.band;
  delete elements.battleThreat.dataset.pattern;
  if (combat !== null) {
    elements.battleThreat.dataset.rating = combat.threat.rating;
    if (combat.threat.rating === "place-bound") {
      elements.battleThreat.dataset.score = String(combat.threat.encounterScore);
      elements.battleThreat.dataset.band = combat.threat.band;
      elements.battleThreat.dataset.pattern = combat.threat.band;
    }
  }
  elements.battleRoster.replaceChildren();
  elements.battleUpcoming.replaceChildren();
  delete elements.battleOverview.dataset.combatId;
  delete elements.battleOverview.dataset.activeUnit;
  delete elements.battleOverview.dataset.focusTarget;
  delete elements.battleOverview.dataset.focusKind;
  delete elements.battleOverview.dataset.upcoming;
  if (projection === null) return;

  elements.battleOverview.dataset.combatId = projection.combatId;
  elements.battleOverview.dataset.activeUnit = projection.activeUnitId ?? "none";
  elements.battleOverview.dataset.focusTarget = projection.focusTargetId ?? "none";
  elements.battleOverview.dataset.focusKind = projection.focusKind;
  elements.battleOverview.dataset.upcoming = projection.upcomingTurns.map((turn) => turn.unitId).join(",");
  elements.battleRoster.replaceChildren(...projection.units.map((unit) => {
    const item = document.createElement("li");
    item.className = "battle-unit";
    item.dataset.unitId = unit.id;
    item.dataset.side = unit.side;
    item.dataset.living = String(unit.alive);
    item.dataset.active = String(unit.isActive);
    item.dataset.actedLast = String(unit.actedLast);
    item.dataset.targeted = String(unit.isFocused);
    item.dataset.intentTarget = String(unit.wasIntentTarget);
    item.dataset.health = `${unit.health}/${unit.maxHealth}`;
    item.dataset.mana = `${unit.mana}/${unit.maxMana}`;
    item.dataset.statuses = unit.statuses.map((status) => `${status.kind}:${status.duration}:${status.potency}`).join(",");

    const name = document.createElement("strong");
    name.className = "battle-unit-name";
    name.textContent = unit.name;
    const resources = document.createElement("span");
    resources.className = "battle-unit-resources";
    resources.textContent = `HP ${unit.health}/${unit.maxHealth} · MP ${unit.mana}/${unit.maxMana}`;
    const badges = document.createElement("span");
    badges.className = "battle-unit-badges";
    const badgeLabels: string[] = [];
    if (unit.isActive) badgeLabels.push("Next");
    if (unit.actedLast) badgeLabels.push("Acted");
    if (unit.isFocused) badgeLabels.push(projection.focusKind === "self-effect" ? "Self effect" : "Target");
    if (unit.wasIntentTarget && projection.latestTurn?.intentInterrupted === true) badgeLabels.push("Intent interrupted");
    if (!unit.alive) badgeLabels.push(unit.defeatedLastTurn ? "Defeated this turn" : "Defeated");
    badges.append(...badgeLabels.map((label) => {
      const badge = document.createElement("span");
      badge.textContent = label;
      return badge;
    }));
    const statuses = document.createElement("span");
    statuses.className = "battle-unit-statuses";
    statuses.textContent = unit.statuses.length === 0 ? "No status" : unit.statuses.map(combatStatusText).join(" · ");
    const meters = document.createElement("span");
    meters.className = "battle-unit-meters";
    const health = document.createElement("progress");
    health.max = Math.max(1, unit.maxHealth);
    health.value = unit.health;
    health.setAttribute("aria-label", `${unit.name} health ${unit.health} of ${unit.maxHealth}`);
    const mana = document.createElement("progress");
    mana.className = "battle-unit-mana";
    mana.max = Math.max(1, unit.maxMana);
    mana.value = unit.mana;
    mana.setAttribute("aria-label", `${unit.name} mana ${unit.mana} of ${unit.maxMana}`);
    meters.append(health, mana);
    item.append(name, resources, badges, statuses, meters);
    return item;
  }));
  elements.battleUpcoming.replaceChildren(...projection.upcomingTurns.map((turn) => {
    const item = document.createElement("li");
    item.dataset.slot = String(turn.slot);
    item.dataset.unitId = turn.unitId;
    item.dataset.round = String(turn.round);
    item.textContent = `${turn.slot} · ${turn.unitName}`;
    return item;
  }));
}

function present(): void {
  if (!presentationBusy && cutawayController.queue.active === null && elements.trapCutaway.dataset.active === "false") {
    elements.trapCutaway.hidden = true;
  }
  if (!presentationBusy && cutawayController.queue.active === null && elements.farewellCutaway.dataset.active === "false") {
    elements.farewellCutaway.hidden = true;
  }
  if (!presentationBusy && cutawayController.queue.active === null && elements.levelUpCutaway.dataset.active === "false") {
    elements.levelUpCutaway.hidden = true;
  }
  spectatorInbox = observeSpectatorInbox(
    spectatorInbox,
    observedPresentationState,
    state,
    activeView !== "watch",
  );
  observedPresentationState = state;
  const { depth } = state;
  elements.app.dataset.simulationTick = String(state.tick);
  elements.app.dataset.questReward = depth.pendingQuestReward === null ? "settled" : "pending";
  elements.app.dataset.questRewardId = depth.pendingQuestReward?.id ?? "none";
  elements.app.dataset.questInstanceId = depth.quest.instanceId;
  elements.app.dataset.questOrdinal = String(depth.quest.ordinal);
  elements.app.dataset.questAdmittedTick = String(depth.quest.admittedTick);
  const questLead = projectSuccessorQuestLead(state.seed, depth.atlas, depth.quest);
  if (questLead === null) {
    delete elements.app.dataset.questLeadId;
    delete elements.app.dataset.questLeadLocation;
    delete elements.app.dataset.questLeadPhase;
  } else {
    elements.app.dataset.questLeadId = questLead.id;
    elements.app.dataset.questLeadLocation = questLead.locationId;
    elements.app.dataset.questLeadPhase = questLead.phase;
  }
  const detail = depth.hero;
  const stats = derivedStats(detail);
  elements.heroName.textContent = detail.name;
  elements.heroLevel.textContent = `${detail.className} · Level ${detail.level} · ${detail.gold}g`;
  elements.healthText.textContent = `${detail.resources.health} / ${detail.resources.maxHealth}`;
  elements.healthBar.max = Math.max(1, detail.resources.maxHealth);
  elements.healthBar.value = detail.resources.health;
  const experience = projectHeroExperience(detail);
  elements.experienceText.textContent = experience.text;
  elements.experienceText.dataset.levelState = experience.state;
  elements.experienceBar.max = experience.progressMaximum;
  elements.experienceBar.value = experience.progressValue;
  elements.experienceBar.dataset.levelState = experience.state;
  elements.experienceBar.setAttribute("aria-label", experience.accessibleLabel);
  elements.might.textContent = String(detail.attributes.strength);
  elements.agility.textContent = String(detail.attributes.agility);
  elements.wits.textContent = String(detail.attributes.intellect);
  elements.spirit.textContent = String(detail.attributes.spirit);
  elements.armor.textContent = String(stats.armor);
  elements.power.textContent = String(stats.power);
  const compactGear = (["weapon", "body", "head"] as const).flatMap((slot) => {
    const equippedId = detail.equipment[slot];
    const equipped = detail.inventory.find((candidate) => candidate.id === equippedId);
    return equipped === undefined ? [] : [equipped.name];
  });
  elements.gearSummary.textContent = compactGear.length === 0 ? "No visible equipment" : compactGear.join(" · ");
  const abilityKind = { spell: "SPL", technique: "TEC", secret: "SEC" } as const;
  elements.abilitySummary.textContent = detail.abilities
    .slice(0, 2)
    .map((ability) => `${ability.name} L${ability.level}`)
    .join(" · ");
  elements.abilityList.replaceChildren(
    ...detail.abilities.slice(0, 4).map((ability) => {
      const item = document.createElement("li");
      item.dataset.kind = ability.kind;
      item.dataset.effect = ability.effect;
      const heading = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = `${abilityKind[ability.kind]} ${ability.name} · L${ability.level}`;
      const detailText = document.createElement("small");
      detailText.textContent = `${ability.effect} · ${ability.manaCost} MP · ${ability.uses} uses`;
      heading.append(name, detailText);
      const floor = abilityExperienceFloor(ability.level);
      const ceiling = abilityExperienceCeiling(ability.level);
      const meter = document.createElement("progress");
      meter.max = Math.max(1, ceiling - floor);
      meter.value = Math.max(0, ability.experience - floor);
      meter.setAttribute("aria-label", `${ability.name} mastery ${ability.experience} of ${ceiling}`);
      item.title = `${ability.name}, level ${ability.level}, ${ability.effect}, ${ability.manaCost} mana, ${ability.potency} potency, ${ability.experience}/${ceiling} mastery experience`;
      item.append(heading, meter);
      return item;
    }),
  );

  const questStatusLabel = depth.quest.status === "ready-to-fulfill"
    ? "Ready to fulfill"
    : depth.quest.status === "fulfilled"
      ? "Fulfilled"
      : depth.quest.status === "failed"
        ? "Failed"
        : "Active";
  elements.questTitle.textContent = `${depth.quest.title} · ${questStatusLabel}`;
  elements.questTitle.dataset.status = depth.quest.status;
  const latestQuestCompletion = depth.completedQuests.at(-1);
  elements.questSummary.textContent = depth.quest.status === "fulfilled" && latestQuestCompletion?.questInstanceId === depth.quest.instanceId
    ? `Fulfilled at T${latestQuestCompletion.fulfilledTick} · ${latestQuestCompletion.objectiveIds.length} objectives complete · ${describeCompletedQuestReward(latestQuestCompletion)}`
    : depth.quest.summary;
  elements.questLead.hidden = questLead === null;
  elements.questLead.textContent = questLead === null
    ? ""
    : `Lead · ${questLead.locationName} · ${questLeadPhaseLabel(questLead.phase)}${questLead.discovered ? "" : " · rumored site"}`;
  elements.questLead.title = questLead === null ? "" : `Quest lead at ${questLead.locationName}: ${questLeadPhaseLabel(questLead.phase)}`;
  const objectives = [
    ...depth.quest.objectives.map((objective) => ({ objective, parent: "Main" })),
    ...depth.quest.subquests.flatMap((subquest) =>
      subquest.objectives.map((objective) => ({ objective, parent: subquest.title })),
    ),
  ];
  elements.questObjectives.replaceChildren(
    ...objectives.slice(0, 4).map(({ objective, parent }) => {
      const item = document.createElement("li");
      item.dataset.complete = String(objective.status === "complete");
      item.dataset.ruleLabel = questObjectiveRuleLabel(objective.rule);
      item.textContent = `${parent}: ${objective.description} ${objective.current}/${objective.target}`;
      item.setAttribute("aria-label", `${item.dataset.ruleLabel}: ${parent}: ${objective.description} ${objective.current}/${objective.target}`);
      return item;
    }),
  );

  const latestCommandType = state.chronicle.at(-1)?.commandType;
  const isCounterDuelBeat = latestCommandType === "start-counter-duel" || latestCommandType === "counter-duel-action";
  const counterDuel = depth.counterDuel ?? (isCounterDuelBeat ? depth.completedCounterDuels.at(-1) ?? null : null);
  const combat = depth.combat ?? (
    state.scene.mode === "battle" && !isCounterDuelBeat
      ? depth.completedCombats.at(-1) ?? null
      : null
  );
  const combatTurn = combat === null || counterDuel !== null ? null : projectLatestCombatTurn(combat);
  const combatRoster = combat === null || counterDuel !== null ? null : projectCombatRoster(combat);
  presentCombatRoster(combatRoster, combat);
  const dungeon = depth.dungeon;
  const dungeonTraversal = dungeon === null || dungeon.completed ? null : projectDungeonWayfinding(dungeon);
  const dungeonTraps = dungeon === null ? [] : projectDungeonTraps(dungeon);
  const dungeonKeyGate = dungeon === null ? null : projectDungeonKeyGate(dungeon);
  const dungeonShrineUse = dungeon === null ? null : projectLatestShrineUse(dungeon, depth.tick);
  const dungeonShrineSummary = dungeonShrineUse === null ? null : describeDungeonShrineUse(dungeonShrineUse);
  const sightedKeyMove = dungeon === null
    ? undefined
    : projectDungeonMoveKnowledge(dungeon).find((move) => move.sightedWayfinderKey);
  const route = depth.atlas.route;
  const latestLeg = state.forwardMotion.recentLegs.at(-1) ?? null;
  const arrival = state.scene.mode === "travel" && latestLeg?.arrivedTick === state.tick ? latestLeg : null;
  const corridor = projectTravelCorridor(depth.atlas, arrival);
  delete elements.traversalText.dataset.biome;
  delete elements.traversalText.dataset.terrain;
  delete elements.traversalText.dataset.slope;
  delete elements.traversalText.dataset.crossing;
  delete elements.traversalText.dataset.trapsArmed;
  delete elements.traversalText.dataset.trapsSpent;
  delete elements.traversalText.dataset.trapsDisarmed;
  delete elements.traversalText.dataset.trapsTriggered;
  delete elements.traversalText.dataset.dungeonKey;
  delete elements.traversalText.dataset.dungeonGate;
  delete elements.traversalText.dataset.shrineState;
  delete elements.traversalText.dataset.shrineCell;
  delete elements.traversalText.dataset.shrineHealth;
  delete elements.traversalText.dataset.shrineMana;
  delete elements.traversalText.dataset.encounterEngine;
  delete elements.traversalText.dataset.counterDuelHabit;
  delete elements.traversalText.dataset.counterDuelHabitProgress;
  delete elements.traversalDirective.dataset.directions;
  delete elements.traversalDirective.dataset.frontierCell;
  delete elements.traversalDirective.dataset.routeLength;
  delete elements.traversalDirective.dataset.visibleObjective;
  delete elements.traversalDirective.dataset.visibleObjectiveDirection;
  delete elements.traversalDirective.dataset.shrineState;
  delete elements.traversalDirective.dataset.shrineCell;
  delete elements.traversalDirective.dataset.shrineHealth;
  delete elements.traversalDirective.dataset.shrineMana;
  delete elements.battleTurnStrip.dataset.combatId;
  delete elements.battleTurnStrip.dataset.turn;
  delete elements.battleTurnStrip.dataset.actor;
  delete elements.battleTurnStrip.dataset.target;
  delete elements.battleTurnStrip.dataset.action;
  delete elements.battleTurnStrip.dataset.interrupted;
  delete elements.battleTurnStrip.dataset.ability;
  delete elements.battleTurnStrip.dataset.manaBefore;
  delete elements.battleTurnStrip.dataset.manaSpent;
  delete elements.battleTurnStrip.dataset.manaAfter;
  delete elements.battleTurnStrip.dataset.healthBefore;
  delete elements.battleTurnStrip.dataset.damage;
  delete elements.battleTurnStrip.dataset.healthAfter;
  delete elements.battleTurnStrip.dataset.statuses;
  delete elements.battleTurnStrip.dataset.statusDurations;
  delete elements.battleTurnStrip.dataset.defeated;
  delete elements.battleTurnStrip.dataset.outcome;
  elements.battleTurnStrip.hidden = combatTurn === null;
  elements.battleTurnStrip.textContent = combatTurn === null ? "" : `Turn ${combatTurn.turn} · ${combatTurn.text}`;
  elements.battleTurnStrip.removeAttribute("title");
  if (combatTurn !== null && combat !== null) {
    elements.battleTurnStrip.dataset.combatId = combat.id;
    elements.battleTurnStrip.dataset.turn = String(combatTurn.turn);
    elements.battleTurnStrip.dataset.actor = combatTurn.actorId;
    elements.battleTurnStrip.dataset.target = combatTurn.targetId ?? "none";
    elements.battleTurnStrip.dataset.action = combatTurn.action;
    elements.battleTurnStrip.dataset.interrupted = String(combatTurn.intentInterrupted);
    if (combatTurn.abilityId !== null) elements.battleTurnStrip.dataset.ability = combatTurn.abilityId;
    if (combatTurn.mana !== null) {
      elements.battleTurnStrip.dataset.manaBefore = String(combatTurn.mana.manaBefore);
      elements.battleTurnStrip.dataset.manaSpent = String(combatTurn.mana.amount);
      elements.battleTurnStrip.dataset.manaAfter = String(combatTurn.mana.manaAfter);
    }
    if (combatTurn.damage !== null) {
      elements.battleTurnStrip.dataset.healthBefore = String(combatTurn.damage.healthBefore);
      elements.battleTurnStrip.dataset.damage = String(combatTurn.damage.amount);
      elements.battleTurnStrip.dataset.healthAfter = String(combatTurn.damage.healthAfter);
    }
    if (combatTurn.statusEvents.length > 0) {
      elements.battleTurnStrip.dataset.statuses = combatTurn.statusEvents.map((event) => `${event.kind}:${event.status}`).join(",");
      elements.battleTurnStrip.dataset.statusDurations = combatTurn.statusEvents.map((event) =>
        `${event.status}:${event.kind === "status-applied" ? event.durationBefore ?? 0 : event.durationBefore}->${event.durationAfter}`
      ).join(",");
    }
    if (combatTurn.defeatedIds.length > 0) elements.battleTurnStrip.dataset.defeated = combatTurn.defeatedIds.join(",");
    if (combatTurn.outcome !== null) elements.battleTurnStrip.dataset.outcome = combatTurn.outcome;
    elements.battleTurnStrip.title = "Canonical turn facts in resolution order; interrupted intent is never presented as an executed action.";
  }
  let presentsCorridor = false;
  if (counterDuel !== null) {
    const active = counterDuel.outcome === "ongoing";
    const habit = projectCounterDuelHabit(counterDuel, depth.hero.monsterLore);
    elements.traversalLabel.textContent = `Pattern Duel · ${active ? `Round ${counterDuel.round}` : counterDuel.outcome}`;
    elements.traversalText.textContent = `${state.hero.name} ${counterDuel.heroScore}–${counterDuel.opponentScore} ${counterDuel.opponentName} · ${active ? counterDuelTellText(counterDuel.tell) : `final after ${counterDuel.history.length} rounds`} · ${counterDuelHabitText(habit)}`;
    elements.traversalText.dataset.encounterEngine = "counter-triangle";
    elements.traversalText.dataset.counterDuelHabit = habit.status === "established" ? habit.preferredStance : "unconfirmed";
    elements.traversalText.dataset.counterDuelHabitProgress = `${habit.encounters}/${habit.requiredEncounters}`;
    elements.traversalProgress.max = 2;
    elements.traversalProgress.value = counterDuel.heroScore;
  } else if (combat !== null) {
    const enemies = combat.combatants.filter((combatant) => combatant.side === "enemies");
    const totalHealth = enemies.reduce((total, enemy) => total + enemy.maxHealth, 0);
    const remainingHealth = enemies.reduce((total, enemy) => total + enemy.health, 0);
    elements.traversalLabel.textContent = `Battle · Round ${combat.round}`;
    elements.traversalText.textContent = `${enemies.filter((enemy) => enemy.health > 0).length} foes · ${describeEncounterThreat(combat.threat)}`;
    elements.traversalProgress.max = Math.max(1, totalHealth);
    elements.traversalProgress.value = totalHealth - remainingHealth;
  } else if (dungeon !== null && (!dungeon.completed || state.scene.mode === "dungeon")) {
    const armedTraps = dungeonTraps.filter((trap) => trap.status === "armed").length;
    const disarmedTraps = dungeonTraps.filter((trap) => trap.status === "disarmed").length;
    const triggeredTraps = dungeonTraps.filter((trap) => trap.status === "triggered").length;
    elements.traversalLabel.textContent = dungeon.name;
    const hazardSummary = dungeonTraps.length === 0
      ? "No marked traps"
      : `${armedTraps} armed · ${disarmedTraps} disarmed · ${triggeredTraps} sprung`;
    const mechanismSummary = dungeonKeyGate?.key === null || dungeonKeyGate?.key === undefined
      ? ""
      : dungeonKeyGate.key.status === "sighted"
        ? " · Wayfinder Key sighted"
        : dungeonKeyGate.key.status === "carried"
          ? ` · Key carried${dungeonKeyGate.gate?.status === "locked" ? " · gate locked" : ""}`
          : " · Key used · gate open";
    elements.traversalText.textContent = dungeonShrineUse === null
      ? `${dungeon.visitedCellIds.length}/${dungeon.cells.length} rooms · ${hazardSummary}${mechanismSummary}`
      : `${dungeonShrineSummary === "RESOURCES FULL" ? "SHRINE FOUND" : "SHRINE AWAKENS"} · ${dungeonShrineSummary}`;
    elements.traversalText.dataset.trapsArmed = String(armedTraps);
    elements.traversalText.dataset.trapsSpent = String(disarmedTraps + triggeredTraps);
    elements.traversalText.dataset.trapsDisarmed = String(disarmedTraps);
    elements.traversalText.dataset.trapsTriggered = String(triggeredTraps);
    if (dungeonKeyGate?.key !== null && dungeonKeyGate?.key !== undefined) elements.traversalText.dataset.dungeonKey = dungeonKeyGate.key.status;
    if (dungeonKeyGate?.gate !== null && dungeonKeyGate?.gate !== undefined) elements.traversalText.dataset.dungeonGate = dungeonKeyGate.gate.status;
    if (dungeonShrineUse !== null) {
      const shrineState = dungeonShrineSummary === "RESOURCES FULL" ? "full" : "restored";
      elements.traversalText.dataset.shrineState = shrineState;
      elements.traversalText.dataset.shrineCell = dungeonShrineUse.cellId;
      elements.traversalText.dataset.shrineHealth = `${dungeonShrineUse.healthBefore}/${dungeonShrineUse.healthRestored}/${dungeonShrineUse.healthAfter}`;
      elements.traversalText.dataset.shrineMana = `${dungeonShrineUse.manaBefore}/${dungeonShrineUse.manaRestored}/${dungeonShrineUse.manaAfter}`;
    }
    elements.traversalProgress.max = dungeon.cells.length;
    elements.traversalProgress.value = dungeon.visitedCellIds.length;
  } else if (route !== null) {
    const destination = depth.atlas.locations.find(
      (location) => location.id === route.destinationId,
    );
    elements.traversalLabel.textContent = `Route · ${destination?.name ?? "Unknown"}`;
    const remaining = Math.max(0, route.totalDistance - route.distanceTravelled);
    const nextLocationId = route.path[route.legIndex + 1];
    const nextLocation = depth.atlas.locations.find((location) => location.id === nextLocationId);
    const knownDanger = nextLocation !== undefined && depth.atlas.discoveredLocationIds.includes(nextLocation.id)
      ? ` · known place danger ${nextLocation.danger}`
      : "";
    elements.traversalText.textContent = corridor === null
      ? `${route.distanceTravelled}/${route.totalDistance} mi · ${remaining} left${knownDanger}`
      : `${route.distanceTravelled}/${route.totalDistance} mi · ${remaining} left · ${describeTravelCorridor(corridor)}${knownDanger}`;
    elements.traversalProgress.max = Math.max(1, route.totalDistance);
    elements.traversalProgress.value = route.distanceTravelled;
    presentsCorridor = corridor !== null;
  } else if (corridor?.arriving === true) {
    elements.traversalLabel.textContent = `Arrived · ${corridor.toName}`;
    elements.traversalText.textContent = `${corridor.projection.legDistance}/${corridor.projection.legDistance} mi · ${describeTravelCorridor(corridor)}`;
    elements.traversalProgress.max = Math.max(1, corridor.projection.legDistance);
    elements.traversalProgress.value = corridor.projection.legDistance;
    presentsCorridor = true;
  } else {
    const town = depth.towns[depth.atlas.currentLocationId];
    elements.traversalLabel.textContent = town?.name ?? "Exploration";
    elements.traversalText.textContent = town === undefined ? "Planning" : `Visit ${town.visits}`;
    elements.traversalProgress.max = 100;
    elements.traversalProgress.value = town?.reputation ?? 0;
  }
  if (corridor !== null && presentsCorridor) {
    elements.traversalText.dataset.biome = corridor.biome;
    elements.traversalText.dataset.terrain = corridor.edgeTerrain;
    elements.traversalText.dataset.slope = corridor.slope;
    elements.traversalText.dataset.crossing = corridor.crossing?.phase ?? "none";
    elements.traversalText.title = `${corridor.fromName} → ${corridor.toName}; ${describeTravelCorridor(corridor)}`;
  } else {
    elements.traversalText.removeAttribute("title");
  }
  const directive = state.forwardMotion.activeDirective;
  const directiveDestination = directive === null
    ? undefined
    : depth.atlas.locations.find((location) => location.id === directive.destinationId);
  const currentArmedTrap = dungeonTraps.find((trap) => trap.current && trap.status === "armed");
  if (counterDuel !== null) {
    if (counterDuel.outcome === "ongoing") {
      const habit = projectCounterDuelHabit(counterDuel, depth.hero.monsterLore);
      elements.traversalDirective.textContent = habit.status === "established"
        ? `Live tell · ${counterDuelStanceLabel(counterDuel.tell.suggestedStance)} · Field note · favors ${counterDuelStanceLabel(habit.preferredStance)}`
        : `Live tell · ${counterDuelStanceLabel(counterDuel.tell.suggestedStance)} · Habit unconfirmed ${habit.encounters}/${habit.requiredEncounters}`;
      elements.traversalDirective.title = `${counterDuelHabitText(habit)}. The autonomous hero weighs the live tell against earned history; neither reveals the rival's committed stance. Rush defeats Feint; Feint defeats Ward; Ward defeats Rush.`;
    } else {
      elements.traversalDirective.textContent = `Resolved · ${counterDuel.outcome} · ${counterDuel.heroScore}–${counterDuel.opponentScore}`;
      elements.traversalDirective.title = depth.log.at(-1)?.message ?? "The Pattern Duel resolved once and the route remains open.";
    }
    elements.traversalDirective.dataset.reason = "counter-duel";
  } else if (dungeonShrineUse !== null && dungeonShrineSummary !== null) {
    const shrineState = dungeonShrineSummary === "RESOURCES FULL" ? "full" : "restored";
    elements.traversalDirective.textContent = `${dungeonShrineSummary === "RESOURCES FULL" ? "SHRINE FOUND" : "SHRINE AWAKENS"} · ${dungeonShrineSummary}`;
    elements.traversalDirective.title = "A first-visit shrine restores half of maximum HP and MP, clamped to each maximum; revisits cannot restore again.";
    elements.traversalDirective.dataset.reason = "dungeon-shrine";
    elements.traversalDirective.dataset.shrineState = shrineState;
    elements.traversalDirective.dataset.shrineCell = dungeonShrineUse.cellId;
    elements.traversalDirective.dataset.shrineHealth = `${dungeonShrineUse.healthBefore}/${dungeonShrineUse.healthRestored}/${dungeonShrineUse.healthAfter}`;
    elements.traversalDirective.dataset.shrineMana = `${dungeonShrineUse.manaBefore}/${dungeonShrineUse.manaRestored}/${dungeonShrineUse.manaAfter}`;
  } else if (dungeonTraversal !== null && currentArmedTrap !== undefined) {
    const attribute = dungeonTrapCheckAttribute(currentArmedTrap.kind, "disarm");
    elements.traversalDirective.textContent = `Disarming · ${dungeonTrapKindLabel(currentArmedTrap.kind)} · ${attribute} vs ${currentArmedTrap.disarmDifficulty}`;
    elements.traversalDirective.title = "A detected current-cell mechanism blocks movement until one canonical disarm attempt resolves it.";
    elements.traversalDirective.dataset.reason = "dungeon-disarm";
    elements.traversalDirective.dataset.directions = "";
    elements.traversalDirective.dataset.frontierCell = currentArmedTrap.cellId;
    elements.traversalDirective.dataset.routeLength = "0";
  } else if (dungeonTraversal !== null && sightedKeyMove !== undefined) {
    elements.traversalDirective.textContent = `Key sighted · entering ${sightedKeyMove.direction}`;
    elements.traversalDirective.title = `The visible Wayfinder Key is a concrete mapped objective in the ${sightedKeyMove.direction} chamber; no hidden route or hazard is assumed.`;
    elements.traversalDirective.dataset.reason = "dungeon-sighted-key";
    elements.traversalDirective.dataset.directions = sightedKeyMove.direction;
    elements.traversalDirective.dataset.frontierCell = sightedKeyMove.destinationCellId;
    elements.traversalDirective.dataset.routeLength = "1";
    elements.traversalDirective.dataset.visibleObjective = "wayfinder-key";
    elements.traversalDirective.dataset.visibleObjectiveDirection = sightedKeyMove.direction;
  } else if (dungeonTraversal !== null) {
    const directions = dungeonTraversal.nextPassageDirections;
    elements.traversalDirective.textContent = dungeonTraversal.mode === "return-to-gate"
      ? `Key carried · returning ${dungeonTraversal.nextDirection ?? "along the mapped route"} · ${dungeonTraversal.roomsToFrontier} ${dungeonTraversal.roomsToFrontier === 1 ? "room" : "rooms"} to gate`
      : dungeonTraversal.mode === "unlock-gate"
        ? "Unlocking · Wayfinder Gate · stationary key-turn"
        : dungeonTraversal.mode === "cross-gate"
          ? `Shortcut open · crossing ${dungeonTraversal.nextDirection ?? "the gate"}`
          : dungeonTraversal.mode === "retrace"
            ? `Retracing ${dungeonTraversal.nextDirection ?? "mapped passage"} · ${dungeonTraversal.roomsToFrontier} ${dungeonTraversal.roomsToFrontier === 1 ? "room" : "rooms"} to frontier`
            : `Exploring · ${directions.join(" or ")} ${directions.length === 1 ? "passage" : "passages"}`;
    elements.traversalDirective.title = dungeonTraversal.mode === "return-to-gate"
      ? "The Wayfinder Key redirects the autonomous hero along the exact explored route to the known sealed shortcut."
      : dungeonTraversal.mode === "unlock-gate"
        ? "Unlocking consumes one stationary canonical tick; the shortcut is crossed on the following tick."
        : dungeonTraversal.mode === "cross-gate"
          ? "The opened passage is now real movement and reveals its far side only as the hero crosses it."
          : dungeonTraversal.mode === "retrace"
            ? "The adventurer is following mapped rooms to the nearest junction with an unexplored exit."
            : "Every listed passage reaches an unvisited adjacent room; no direction is selected yet.";
    elements.traversalDirective.dataset.reason = `dungeon-${dungeonTraversal.mode}`;
    elements.traversalDirective.dataset.directions = directions.join(",");
    elements.traversalDirective.dataset.frontierCell = dungeonTraversal.frontierCellId ?? "";
    elements.traversalDirective.dataset.routeLength = String(dungeonTraversal.roomsToFrontier);
  } else if (dungeon !== null && dungeon.completed && state.scene.mode === "dungeon") {
    elements.traversalDirective.textContent = "Cleared · far stair reached";
    elements.traversalDirective.title = "The dungeon completed atomically with the final room's consequences.";
    elements.traversalDirective.dataset.reason = "dungeon-completed";
  } else {
    elements.traversalDirective.textContent = route === null
      ? "Momentum · choosing next purpose"
      : forwardMotionLabel(directive);
    elements.traversalDirective.title = directive === null
      ? "The Game Master is selecting the next canonical purpose."
      : describeForwardMotionReason(directive.reason, directiveDestination?.name ?? directive.destinationId);
    elements.traversalDirective.dataset.reason = directive?.reason ?? "planning";
  }

  elements.equipmentList.replaceChildren(
    ...equipmentSlots.map((slot) => {
      const item = document.createElement("li");
      const equippedId = detail.equipment[slot];
      const equipped = detail.inventory.find((candidate) => candidate.id === equippedId);
      const label = document.createElement("span");
      label.textContent = `${slot.slice(0, 3).toUpperCase()} `;
      const modifiers = equipped === undefined
        ? ""
        : Object.entries(equipped.modifiers)
            .filter((entry): entry is [string, number] => entry[1] !== undefined)
            .map(([modifier, amount]) => `${amount >= 0 ? "+" : ""}${amount} ${modifier}`)
            .join(", ");
      item.dataset.rarity = equipped?.rarity ?? "none";
      item.title = equipped === undefined ? `${slot}: empty` : `${equipped.name}${modifiers.length > 0 ? ` (${modifiers})` : ""}`;
      item.append(label, equipped?.name ?? "—", modifiers.length > 0 ? ` · ${modifiers}` : "");
      return item;
    }),
  );
  elements.eventLog.replaceChildren(
    ...depth.log.slice(-5).reverse().map((entry) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = `T${entry.tick}`;
      item.append(time, entry.message);
      return item;
    }),
  );

  elements.location.textContent = state.scene.location;
  elements.headline.textContent = state.scene.headline;
  const criticalRecovery = projectCriticalRoadsideRecovery(state);
  elements.action.textContent = criticalRecovery?.recoveryText ?? state.scene.action;
  elements.goal.textContent = state.scene.goal;
  elements.consequence.textContent = criticalRecovery?.readinessText ?? state.scene.consequence;
  const decision = state.chronicle.at(-1);
  const trace = decision?.decisionTrace;
  elements.decision.textContent = trace === undefined
    ? decision?.rationale ?? "The first instinct is still forming."
    : `${trace.actorName} → ${trace.selected.actionLabel}${trace.selected.targetLabel === null ? "" : ` → ${trace.selected.targetLabel}`} · ${trace.reasons[0]}`;
  elements.decision.title = decision?.rationale ?? "No canonical decision has resolved yet.";
  elements.decision.dataset.commandId = decision?.commandId ?? "pending";
  elements.decision.dataset.profileId = trace?.profileId ?? "pending";
  elements.decision.dataset.ruleId = trace?.matchedRuleId ?? "pending";
  elements.decision.dataset.reasonCode = trace?.reasonCode ?? "pending";
  presentViewScreens();
  presentHeroInspectionActivity();
  presentSpectatorInbox();
  renderer.render(state);
}

async function persist(): Promise<void> {
  await repository.save(state);
  if (
    state.championInduction !== null &&
    !champions.some((champion) => champion.id === state.championInduction?.id)
  ) {
    champions = await repository.listChampions();
    presentHallOfChampions();
  }
  durableState = state;
  localStorage.setItem(checkpointKey(state.campaignId), String(Date.now()));
}

async function refreshCampaigns(): Promise<void> {
  const campaigns = await repository.list();
  elements.campaignSelect.replaceChildren(
    ...campaigns.map((campaign) => {
      const option = document.createElement("option");
      option.value = campaign.campaignId;
      option.textContent = `${campaign.hero.name} · Lv ${campaign.hero.level}`;
      option.selected = campaign.campaignId === state.campaignId;
      return option;
    }),
  );
}

async function runInteraction(action: () => Promise<void>): Promise<void> {
  pendingInteractions += 1;
  try {
    while (stepping) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
    stepping = true;
    await action();
  } finally {
    stepping = false;
    pendingInteractions -= 1;
  }
}

async function step(): Promise<void> {
  if (paused || document.hidden || stepping || pendingInteractions > 0 || presentationBusy) return;
  stepping = true;
  try {
    const before = state;
    state = await simulation.advance();
    const source = state.chronicle.at(-1);
    lastAdvanceAtMs = Date.now();
    elements.app.dataset.runtimeStatus = "running";
    await persist();
    const cutawayCandidates = source === undefined
      ? Object.freeze([])
      : projectCutawayCandidates(before, state, source);
    present();
    for (const candidate of cutawayCandidates) enqueueCutaway(candidate);
    await refreshCampaigns();
  } catch {
    state = durableState;
    elements.app.dataset.runtimeStatus = "recovering";
    try {
      await simulation.reset(durableState);
      lastAdvanceAtMs = Date.now();
    } catch {
      simulation.terminate();
    }
    present();
    elements.consequence.textContent = "The adventure engine recovered from its last safe moment · retrying";
  } finally {
    stepping = false;
  }
}

async function recoverRuntime(): Promise<void> {
  if (runtimeRecovering || paused || document.hidden || pendingInteractions > 0 || presentationBusy) return;
  if (stepping) {
    elements.app.dataset.runtimeStatus = "recovering";
    simulation.terminate();
    return;
  }
  runtimeRecovering = true;
  elements.app.dataset.runtimeStatus = "recovering";
  try {
    await runInteraction(async () => {
      simulation.terminate();
      state = durableState;
      await simulation.reset(durableState);
      lastAdvanceAtMs = Date.now();
      present();
      elements.consequence.textContent = "The adventure engine resumed from its last safe moment";
    });
  } catch {
    simulation.terminate();
    elements.app.dataset.runtimeStatus = "waiting-to-recover";
  } finally {
    runtimeRecovering = false;
  }
}

function startRuntimeWatchdog(): void {
  if (runtimeWatchdog !== undefined) window.clearInterval(runtimeWatchdog);
  runtimeWatchdog = window.setInterval(() => {
    if (presentationBusy) {
      const maximumMs = activeCutawayMaximumMs(cutawayRegistry, cutawayController);
      if (!paused && !document.hidden && maximumMs !== null && Date.now() - cutawayStartedAtMs > maximumMs) {
        settleActiveCutaway();
      }
      return;
    }
    if (!shouldRecoverRuntime({
      nowMs: Date.now(),
      lastAdvanceAtMs,
      beatDurationMs,
      paused,
      hidden: document.hidden,
      interacting: pendingInteractions > 0 || presentationBusy,
    })) return;
    void recoverRuntime();
  }, 5_000);
}

function startLoop(): void {
  if (loop !== undefined) window.clearInterval(loop);
  loop = window.setInterval(() => void step(), beatDurationMs);
}

async function fetchDeployedVersion(): Promise<unknown> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}version.json?check=${encodeURIComponent(randomId())}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error(`Version check failed with ${response.status}`);
  return response.json();
}

function readUpdateAttempt(): UpdateAttempt | null {
  const source = sessionStorage.getItem(updateAttemptKey);
  if (source === null) return null;
  try {
    const value = JSON.parse(source) as Partial<UpdateAttempt>;
    if (
      typeof value.fromVersion !== "string"
      || typeof value.targetVersion !== "string"
      || !Number.isFinite(value.attemptedAt)
    ) return null;
    return value as UpdateAttempt;
  } catch {
    return null;
  }
}

function clearCompletedUpdateAttempt(): void {
  const attempt = readUpdateAttempt();
  if (attempt !== null && !isNewerVersion(attempt.targetVersion, __APP_VERSION__)) {
    sessionStorage.removeItem(updateAttemptKey);
  }
}

async function applyAutomaticUpdate(nextVersion: string): Promise<void> {
  const previousAttempt = readUpdateAttempt();
  if (
    previousAttempt?.fromVersion === __APP_VERSION__
    && previousAttempt.targetVersion === nextVersion
    && Date.now() - previousAttempt.attemptedAt < updateIntervalMs
  ) {
    throw new Error("This update target was already attempted recently");
  }
  elements.updateStatus.hidden = false;
  elements.updateStatus.textContent = `Saving progress · updating to v${nextVersion}…`;
  document.documentElement.dataset.updateStatus = "saving";
  catchUpAfterPresentation = false;
  settleActiveCutaway(false);
  await runInteraction(async () => persist());
  sessionStorage.setItem(updateAttemptKey, JSON.stringify({
    fromVersion: __APP_VERSION__,
    targetVersion: nextVersion,
    attemptedAt: Date.now(),
  } satisfies UpdateAttempt));
  document.documentElement.dataset.updateStatus = "reloading";
  window.location.reload();
}

function startAutomaticUpdates(): void {
  clearCompletedUpdateAttempt();
  automaticUpdateMonitor = new AutomaticUpdateMonitor({
    currentVersion: __APP_VERSION__,
    fetchVersion: fetchDeployedVersion,
    randomUnit: Math.random,
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancel: (timer) => window.clearTimeout(timer),
    isVisible: () => !document.hidden,
    applyUpdate: applyAutomaticUpdate,
    report: (status, version) => {
      document.documentElement.dataset.updateStatus = status;
      if (status === "deferred") {
        elements.updateStatus.textContent = `Update v${version ?? "new"} ready · resumes when visible`;
        elements.updateStatus.hidden = false;
        return;
      }
      if (status === "available") {
        elements.updateStatus.textContent = `Update v${version ?? "new"} found…`;
        elements.updateStatus.hidden = false;
        return;
      }
      elements.updateStatus.hidden = true;
      elements.updateStatus.textContent = "";
    },
  });
  automaticUpdateMonitor.start();
}

async function registerServiceWorker(): Promise<void> {
  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { updateViaCache: "none" },
  );
  await registration.update();
}

for (const button of viewButtons) {
  button.addEventListener("click", () => {
    if (!isInspectionView(button.dataset.view)) return;
    if (button.dataset.view === "watch" && activeView === "watch" && spectatorInbox.items.length > 0) {
      spectatorRecapOpen = !spectatorRecapOpen;
      if (spectatorRecapOpen) spectatorInbox = markSpectatorInboxRead(spectatorInbox);
      presentSpectatorInbox();
      return;
    }
    setActiveView(button.dataset.view);
  });
}

elements.miniMap.addEventListener("click", () => {
  setActiveView("map");
  viewButtons.find((button) => button.dataset.view === "map")?.focus();
});

elements.spectatorInboxClose.addEventListener("click", () => {
  spectatorRecapOpen = false;
  presentSpectatorInbox();
  viewButtons.find((button) => button.dataset.view === "watch")?.focus();
});

elements.trapCutawayOutcome.addEventListener("click", () => {
  if (!renderer.showCutawayOutcome()) return;
  elements.trapCutawayOutcome.disabled = true;
  elements.trapCutawayOutcome.hidden = true;
  viewButtons.find((button) => button.dataset.view === "watch")?.focus();
});

elements.farewellCutawayOutcome.addEventListener("click", () => {
  if (!renderer.showCutawayOutcome()) return;
  elements.farewellCutawayOutcome.disabled = true;
  elements.farewellCutawayOutcome.hidden = true;
  viewButtons.find((button) => button.dataset.view === "watch")?.focus();
});

elements.levelUpCutawayOutcome.addEventListener("click", () => {
  if (!renderer.showCutawayOutcome()) return;
  elements.levelUpCutawayOutcome.disabled = true;
  elements.levelUpCutawayOutcome.hidden = true;
  viewButtons.find((button) => button.dataset.view === "watch")?.focus();
});

elements.viewToolbar.addEventListener("keydown", (event) => {
  const currentIndex = viewButtons.findIndex((button) => button === document.activeElement);
  if (currentIndex < 0) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + viewButtons.length) % viewButtons.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % viewButtons.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = viewButtons.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  viewButtons[nextIndex]?.focus();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-close-view]")) {
  button.addEventListener("click", () => setActiveView("watch", true));
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented || activeView === "watch") return;
  const target = event.target;
  if (target instanceof Element && target.closest("dialog, [role='dialog'], [role='menu']") !== null) return;
  setActiveView("watch", true);
});

elements.pauseButton.addEventListener("click", () => {
  paused = !paused;
  if (!paused) lastAdvanceAtMs = Date.now();
  syncPresentationPaused();
  elements.pauseButton.textContent = paused ? "Resume" : "Pause";
  if (!paused && catchUpAfterPresentation && !presentationBusy) void resumeDeferredCatchUp();
});

elements.newButton.addEventListener("click", () => {
  void runInteraction(async () => {
    cancelCutawayPresentation();
    state = createNewWorld();
    await simulation.reset(state);
    present();
    await persist();
    await refreshCampaigns();
  });
});

elements.campaignSelect.addEventListener("change", () => {
  void runInteraction(async () => {
    cancelCutawayPresentation();
    const selected = await repository.load(elements.campaignSelect.value);
    if (selected === undefined) return;
    state = selected;
    await simulation.reset(state);
    state = await catchUp(state);
    lastAdvanceAtMs = Date.now();
    present();
    await persist();
    await refreshCampaigns();
  });
});

document.addEventListener("visibilitychange", () => {
  presentationSuspended = document.hidden;
  syncPresentationPaused();
  if (document.hidden) {
    void persist();
    return;
  }
  if (presentationBusy) {
    catchUpAfterPresentation = true;
    automaticUpdateMonitor?.notifyVisible();
    return;
  }
  void runInteraction(async () => {
    state = await catchUp(state);
    present();
    await persist();
  });
  automaticUpdateMonitor?.notifyVisible();
});

window.addEventListener("pagehide", () => {
  localStorage.setItem(checkpointKey(durableState.campaignId), String(Date.now()));
  presentationSuspended = true;
  syncPresentationPaused();
});
window.addEventListener("unload", () => renderer.dispose(), { once: true });
window.addEventListener("pageshow", () => {
  presentationSuspended = document.hidden;
  syncPresentationPaused();
  startLoop();
});

await simulation.reset(state);
state = await catchUp(state);
setActiveView("watch");
syncPresentationPaused();
present();
await persist();
await refreshCampaigns();
startLoop();
startRuntimeWatchdog();
elements.app.dataset.presentationBusy = "false";
elements.app.dataset.runtimeStatus = "running";
document.documentElement.dataset.ready = "true";
startAutomaticUpdates();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const register = (): void => {
    void registerServiceWorker().catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
