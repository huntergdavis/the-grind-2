import "./style.css";
import { CampaignRepository } from "./core/persistence";
import { describeForwardMotionReason, forwardMotionLabel } from "./core/forward-motion";
import { createWorld } from "./core/simulation";
import type { WorldState } from "./core/types";
import { abilityExperienceCeiling, abilityExperienceFloor, derivedStats, dungeonTrapCheckAttribute, dungeonTrapKindLabel, projectDungeonTraps, projectDungeonWayfinding } from "./depth";
import type { EquipmentSlot } from "./depth/types";
import { GameRenderer } from "./render/game-renderer";
import { describeTravelCorridor, projectTravelCorridor } from "./render/travel-corridor";
import { randomId } from "./random-id";
import { shouldRecoverRuntime } from "./runtime/liveness";
import {
  projectViewHero,
  type HeroInspectionActivity,
  type HeroInspectionView,
} from "./ui/hero-inspection-activity";
import { projectMiniMap, type MiniMapLine } from "./ui/mini-map";
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

const beatDurationMs = new URLSearchParams(window.location.search).has("fast")
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
  questObjectives: requiredElement<HTMLUListElement>("#quest-objectives"),
  traversalLabel: requiredElement<HTMLElement>("#traversal-label"),
  traversalText: requiredElement<HTMLElement>("#traversal-progress-text"),
  traversalProgress: requiredElement<HTMLProgressElement>("#traversal-progress"),
  traversalDirective: requiredElement<HTMLElement>("#traversal-directive"),
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
  journalQuestList: requiredElement<HTMLElement>("#journal-quest-list"),
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
  viewAnnouncement: requiredElement<HTMLElement>("#view-announcement"),
  watchBadge: requiredElement<HTMLElement>("#watch-badge"),
  spectatorInbox: requiredElement<HTMLElement>("#spectator-inbox"),
  spectatorInboxSummary: requiredElement<HTMLElement>("#spectator-inbox-summary"),
  spectatorInboxDropped: requiredElement<HTMLElement>("#spectator-inbox-dropped"),
  spectatorInboxList: requiredElement<HTMLOListElement>("#spectator-inbox-list"),
  spectatorInboxClose: requiredElement<HTMLButtonElement>("#spectator-inbox-close"),
  updateStatus: requiredElement<HTMLElement>("#update-status"),
};

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
    subtitle: "Exact quests and the twelve most recent Chronicle beats.",
  },
  codex: {
    title: "Monster Codex",
    subtitle: "Encountered species, studied victories, and only verified secret techniques.",
  },
  spellbook: {
    title: "Spellbook & Mastery",
    subtitle: "Every owned spell, technique, monster secret, and exact current-tier mastery band.",
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
  elements.app.dataset.presentationPaused = String(presentationPaused);
  renderer.setPaused(presentationPaused);
}

const svgNamespace = "http://www.w3.org/2000/svg";

function miniMapPolyline(line: MiniMapLine, className: string): SVGPolylineElement {
  const polyline = document.createElementNS(svgNamespace, "polyline");
  polyline.classList.add(className);
  polyline.dataset.mapId = line.id;
  polyline.setAttribute("points", line.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "));
  return polyline;
}

function presentMiniMap(): void {
  const miniMap = projectMiniMap(state.depth.atlas);
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

function presentViewScreens(): void {
  const scrollTop = elements.inspectionScreen.scrollTop;
  presentMiniMap();
  const map = projectMapView(state);
  elements.mapTitle.textContent = map.destination === null ? "The known world" : `Road to ${map.destination}`;
  elements.mapCurrentPlace.textContent = map.currentLeg ?? map.currentPlace;
  elements.mapRoute.textContent = map.progress;
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
  elements.journalSummary.textContent = journal.questSummary;
  elements.journalQuestList.replaceChildren(
    ...journal.quests.map((projected) => {
      const quest = document.createElement("section");
      quest.className = "journal-quest";
      quest.dataset.questId = projected.id;
      quest.dataset.status = projected.status;
      const title = document.createElement("h3");
      title.textContent = projected.title;
      const objectives = document.createElement("ul");
      objectives.append(...projected.objectives.map((projectedObjective) => {
        const objective = document.createElement("li");
        objective.dataset.status = projectedObjective.status;
        objective.textContent = `${projectedObjective.description} · ${projectedObjective.progress}`;
        return objective;
      }));
      quest.append(title, objectives);
      return quest;
    }),
  );
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
    dossier.append(heading, facts, insightLabel, insight, technique);
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
  return createWorld(seed, campaignId);
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

function present(): void {
  spectatorInbox = observeSpectatorInbox(
    spectatorInbox,
    observedPresentationState,
    state,
    activeView !== "watch",
  );
  observedPresentationState = state;
  const { depth } = state;
  elements.app.dataset.simulationTick = String(state.tick);
  const detail = depth.hero;
  const stats = derivedStats(detail);
  elements.heroName.textContent = detail.name;
  elements.heroLevel.textContent = `${detail.className} · Level ${detail.level} · ${detail.gold}g`;
  elements.healthText.textContent = `${detail.resources.health} / ${detail.resources.maxHealth}`;
  elements.healthBar.max = Math.max(1, detail.resources.maxHealth);
  elements.healthBar.value = detail.resources.health;
  const previousLevelExperience = detail.level <= 1 ? 0 : 12 * (detail.level - 1) ** 2;
  const nextLevelExperience = 12 * detail.level ** 2;
  elements.experienceText.textContent = `${detail.experience} / ${nextLevelExperience}`;
  elements.experienceBar.max = Math.max(1, nextLevelExperience - previousLevelExperience);
  elements.experienceBar.value = Math.max(0, detail.experience - previousLevelExperience);
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

  elements.questTitle.textContent = depth.quest.title;
  elements.questSummary.textContent = depth.quest.summary;
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
      item.textContent = `${parent}: ${objective.description} ${objective.current}/${objective.target}`;
      return item;
    }),
  );

  const combat = depth.combat;
  const dungeon = depth.dungeon;
  const dungeonTraversal = dungeon === null || dungeon.completed ? null : projectDungeonWayfinding(dungeon);
  const dungeonTraps = dungeon === null ? [] : projectDungeonTraps(dungeon);
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
  delete elements.traversalDirective.dataset.directions;
  delete elements.traversalDirective.dataset.frontierCell;
  delete elements.traversalDirective.dataset.routeLength;
  let presentsCorridor = false;
  if (combat !== null) {
    const enemies = combat.combatants.filter((combatant) => combatant.side === "enemies");
    const totalHealth = enemies.reduce((total, enemy) => total + enemy.maxHealth, 0);
    const remainingHealth = enemies.reduce((total, enemy) => total + enemy.health, 0);
    elements.traversalLabel.textContent = `Battle · Round ${combat.round}`;
    elements.traversalText.textContent = `${enemies.filter((enemy) => enemy.health > 0).length} foes`;
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
    elements.traversalText.textContent = `${dungeon.visitedCellIds.length}/${dungeon.cells.length} rooms · ${hazardSummary}`;
    elements.traversalText.dataset.trapsArmed = String(armedTraps);
    elements.traversalText.dataset.trapsSpent = String(disarmedTraps + triggeredTraps);
    elements.traversalText.dataset.trapsDisarmed = String(disarmedTraps);
    elements.traversalText.dataset.trapsTriggered = String(triggeredTraps);
    elements.traversalProgress.max = dungeon.cells.length;
    elements.traversalProgress.value = dungeon.visitedCellIds.length;
  } else if (route !== null) {
    const destination = depth.atlas.locations.find(
      (location) => location.id === route.destinationId,
    );
    elements.traversalLabel.textContent = `Route · ${destination?.name ?? "Unknown"}`;
    const remaining = Math.max(0, route.totalDistance - route.distanceTravelled);
    elements.traversalText.textContent = corridor === null
      ? `${route.distanceTravelled}/${route.totalDistance} mi · ${remaining} left`
      : `${route.distanceTravelled}/${route.totalDistance} mi · ${remaining} left · ${describeTravelCorridor(corridor)}`;
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
  if (dungeonTraversal !== null && currentArmedTrap !== undefined) {
    const attribute = dungeonTrapCheckAttribute(currentArmedTrap.kind, "disarm");
    elements.traversalDirective.textContent = `Disarming · ${dungeonTrapKindLabel(currentArmedTrap.kind)} · ${attribute} vs ${currentArmedTrap.disarmDifficulty}`;
    elements.traversalDirective.title = "A detected current-cell mechanism blocks movement until one canonical disarm attempt resolves it.";
    elements.traversalDirective.dataset.reason = "dungeon-disarm";
    elements.traversalDirective.dataset.directions = "";
    elements.traversalDirective.dataset.frontierCell = currentArmedTrap.cellId;
    elements.traversalDirective.dataset.routeLength = "0";
  } else if (dungeonTraversal !== null) {
    const directions = dungeonTraversal.nextPassageDirections;
    elements.traversalDirective.textContent = dungeonTraversal.mode === "retrace"
      ? `Retracing ${dungeonTraversal.nextDirection ?? "mapped passage"} · ${dungeonTraversal.roomsToFrontier} ${dungeonTraversal.roomsToFrontier === 1 ? "room" : "rooms"} to frontier`
      : `Exploring · ${directions.join(" or ")} ${directions.length === 1 ? "passage" : "passages"}`;
    elements.traversalDirective.title = dungeonTraversal.mode === "retrace"
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
  elements.action.textContent = state.scene.action;
  elements.goal.textContent = state.scene.goal;
  elements.consequence.textContent = state.scene.consequence;
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
  if (paused || document.hidden || stepping || pendingInteractions > 0) return;
  stepping = true;
  try {
    state = await simulation.advance();
    lastAdvanceAtMs = Date.now();
    elements.app.dataset.runtimeStatus = "running";
    present();
    await persist();
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
  if (runtimeRecovering || paused || document.hidden || pendingInteractions > 0) return;
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
    if (!shouldRecoverRuntime({
      nowMs: Date.now(),
      lastAdvanceAtMs,
      beatDurationMs,
      paused,
      hidden: document.hidden,
      interacting: pendingInteractions > 0,
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
});

elements.newButton.addEventListener("click", () => {
  void runInteraction(async () => {
    state = createNewWorld();
    await simulation.reset(state);
    present();
    await persist();
    await refreshCampaigns();
  });
});

elements.campaignSelect.addEventListener("change", () => {
  void runInteraction(async () => {
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
