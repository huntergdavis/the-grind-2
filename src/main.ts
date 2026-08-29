import "./style.css";
import { CampaignRepository } from "./core/persistence";
import { createWorld } from "./core/simulation";
import type { WorldState } from "./core/types";
import { abilityExperienceCeiling, abilityExperienceFloor, derivedStats } from "./depth";
import type { EquipmentSlot } from "./depth/types";
import { GameRenderer } from "./render/game-renderer";
import { SimulationClient } from "./worker/simulation-client";

const beatDurationMs = new URLSearchParams(window.location.search).has("fast")
  ? 250
  : 4_800;
const checkpointPrefix = "the-grind-2:last-active:";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const elements = {
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
  equipmentList: requiredElement<HTMLUListElement>("#equipment-list"),
  abilityList: requiredElement<HTMLUListElement>("#ability-list"),
  eventLog: requiredElement<HTMLOListElement>("#event-log"),
};

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

function createNewWorld(): WorldState {
  const campaignId = crypto.randomUUID();
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
  const { depth } = state;
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
  const route = depth.atlas.route;
  if (combat !== null) {
    const enemies = combat.combatants.filter((combatant) => combatant.side === "enemies");
    const totalHealth = enemies.reduce((total, enemy) => total + enemy.maxHealth, 0);
    const remainingHealth = enemies.reduce((total, enemy) => total + enemy.health, 0);
    elements.traversalLabel.textContent = `Battle · Round ${combat.round}`;
    elements.traversalText.textContent = `${enemies.filter((enemy) => enemy.health > 0).length} foes`;
    elements.traversalProgress.max = Math.max(1, totalHealth);
    elements.traversalProgress.value = totalHealth - remainingHealth;
  } else if (dungeon !== null && !dungeon.completed) {
    elements.traversalLabel.textContent = dungeon.name;
    elements.traversalText.textContent = `${dungeon.visitedCellIds.length}/${dungeon.cells.length} rooms`;
    elements.traversalProgress.max = dungeon.cells.length;
    elements.traversalProgress.value = dungeon.visitedCellIds.length;
  } else if (route !== null) {
    const destination = depth.atlas.locations.find(
      (location) => location.id === route.destinationId,
    );
    elements.traversalLabel.textContent = `Route · ${destination?.name ?? "Unknown"}`;
    elements.traversalText.textContent = `${route.distanceTravelled}/${route.totalDistance} mi`;
    elements.traversalProgress.max = Math.max(1, route.totalDistance);
    elements.traversalProgress.value = route.distanceTravelled;
  } else {
    const town = depth.towns[depth.atlas.currentLocationId];
    elements.traversalLabel.textContent = town?.name ?? "Exploration";
    elements.traversalText.textContent = town === undefined ? "Planning" : `Visit ${town.visits}`;
    elements.traversalProgress.max = 100;
    elements.traversalProgress.value = town?.reputation ?? 0;
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
    present();
    await persist();
    await refreshCampaigns();
  } catch {
    state = durableState;
    await simulation.reset(durableState);
    present();
    elements.consequence.textContent = "The adventure recovered from its last safe moment";
  } finally {
    stepping = false;
  }
}

function startLoop(): void {
  if (loop !== undefined) window.clearInterval(loop);
  loop = window.setInterval(() => void step(), beatDurationMs);
}

elements.pauseButton.addEventListener("click", () => {
  paused = !paused;
  renderer.setPaused(paused);
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
    present();
    await persist();
    await refreshCampaigns();
  });
});

document.addEventListener("visibilitychange", () => {
  renderer.setPaused(paused || document.hidden);
  if (document.hidden) {
    void persist();
    return;
  }
  void runInteraction(async () => {
    state = await catchUp(state);
    present();
    await persist();
  });
});

window.addEventListener("pagehide", () => {
  localStorage.setItem(checkpointKey(durableState.campaignId), String(Date.now()));
  renderer.setPaused(true);
});
window.addEventListener("pageshow", () => {
  renderer.setPaused(paused || document.hidden);
  startLoop();
});

await simulation.reset(state);
state = await catchUp(state);
present();
await persist();
await refreshCampaigns();
startLoop();
document.documentElement.dataset.ready = "true";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
