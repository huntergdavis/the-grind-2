import "./style.css";
import { CampaignRepository } from "./core/persistence";
import { createWorld } from "./core/simulation";
import type { WorldState } from "./core/types";
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
};

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
  elements.heroName.textContent = state.hero.name;
  elements.heroLevel.textContent = `Level ${state.hero.level} · ${state.hero.gold}g`;
  elements.location.textContent = state.scene.location;
  elements.headline.textContent = state.scene.headline;
  elements.action.textContent = state.scene.action;
  elements.goal.textContent = state.scene.goal;
  elements.consequence.textContent = state.scene.consequence;
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
