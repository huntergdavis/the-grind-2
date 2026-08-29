import "./style.css";
import { CampaignRepository } from "./core/persistence";
import { advanceWorld, createWorld } from "./core/simulation";
import type { WorldState } from "./core/types";
import { GameRenderer } from "./render/game-renderer";

const beatDurationMs = new URLSearchParams(window.location.search).has("fast")
  ? 250
  : 4_800;
const maximumCatchUpBeats = 96;
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
let paused = false;
let stepping = false;
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

function catchUp(world: WorldState): WorldState {
  const lastActive = Number(localStorage.getItem(checkpointKey(world.campaignId)));
  if (!Number.isFinite(lastActive) || lastActive <= 0) return world;
  const elapsed = Math.max(0, Date.now() - lastActive);
  const beats = Math.min(maximumCatchUpBeats, Math.floor(elapsed / beatDurationMs));
  let caughtUp = world;
  for (let index = 0; index < beats; index += 1) caughtUp = advanceWorld(caughtUp);
  return caughtUp;
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
  localStorage.setItem(checkpointKey(state.campaignId), String(Date.now()));
  await repository.save(state);
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

async function step(): Promise<void> {
  if (paused || document.hidden || stepping) return;
  stepping = true;
  try {
    state = advanceWorld(state);
    present();
    await persist();
    await refreshCampaigns();
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
  void (async () => {
    state = createNewWorld();
    present();
    await persist();
    await refreshCampaigns();
  })();
});

elements.campaignSelect.addEventListener("change", () => {
  void (async () => {
    const selected = await repository.load(elements.campaignSelect.value);
    if (selected === undefined) return;
    state = catchUp(selected);
    present();
    await persist();
    await refreshCampaigns();
  })();
});

document.addEventListener("visibilitychange", () => {
  renderer.setPaused(paused || document.hidden);
  if (document.hidden) {
    void persist();
    return;
  }
  state = catchUp(state);
  present();
  void persist();
});

window.addEventListener("pagehide", () => void persist());
window.addEventListener("pageshow", startLoop);

state = catchUp(state);
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
