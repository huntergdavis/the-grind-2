import type { WorldState } from "../core/types";
import { bellMoveOptions, projectBellBoard, type BellTurnReceipt } from "../depth/borrowed-bell";
import { isValidCampaignBorrowedBell } from "../depth/borrowed-bell-campaign";

export interface BorrowedBellSceneView {
  readonly phase: "admission" | "roll" | "move" | "result";
  readonly commandId: string;
  readonly tick: number;
  readonly instanceId: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly turn: number;
  readonly roll: number | null;
  readonly path: readonly number[];
  readonly board: ReturnType<typeof projectBellBoard>;
  readonly title: string;
  readonly narrative: string;
  readonly choice: string;
  readonly deadline: string;
  readonly consequence: string;
}

export function bellDeadlineMarks(completedTurns: number): string {
  return [1, 2, 3, 4].map(turn => turn <= completedTurns ? "[■]" : "[·]").join(" ");
}

function moveChoice(move: BellTurnReceipt): string {
  return `Roll ${move.roll.value} → ${move.pace === "steady" ? "one careful step (−1 MP)" : `${move.stepsAllowed} rolled steps`} · ${move.path.join(" → ")}${move.discardedPips > 0 ? ` · ${move.discardedPips} unused pips` : ""}.`;
}

/** The view never rolls, chooses, moves or reveals rooms; only this exact command owns the scene. */
export function projectBorrowedBellScene(state: WorldState): BorrowedBellSceneView | null {
  const expedition = state.depth.bellExpedition;
  const source = state.chronicle.at(-1);
  if (expedition === null || !isValidCampaignBorrowedBell(state.depth) || source?.commandId === undefined
    || source.tick !== state.tick || source.mode !== "chronicle" || state.scene.mode !== "chronicle"
    || expedition.heroId !== state.depth.hero.id || expedition.locationId !== state.depth.atlas.currentLocationId) return null;
  const pending = expedition.pendingRoll;
  const move = expedition.turns.at(-1);
  const completion = expedition.completion;
  const owns = (command: string, tick: number): boolean => source.commandId === `${state.campaignId}:${command}` && source.tick === tick;
  const admitted = source.commandType === "start-bell" && owns(expedition.sourceCommandId, expedition.startedTick)
    && pending === null && move === undefined && completion === null;
  const rolled = source.commandType === "roll-bell" && pending !== null && owns(pending.sourceCommandId, pending.tick);
  const moved = source.commandType === "move-bell" && move !== undefined && owns(move.sourceCommandId, move.tick);
  const completed = source.commandType === "move-bell" && completion !== null && owns(completion.sourceCommandId, completion.tick);
  if (!admitted && !rolled && !moved && !completed) return null;
  const board = projectBellBoard(expedition);
  const turn = rolled ? pending!.turn : admitted ? 1 : move?.turn ?? completion!.turn;
  const phase = completed ? "result" : admitted ? "admission" : rolled ? "roll" : "move";
  const options = rolled ? bellMoveOptions(expedition) : [];
  const canSteady = options.some(option => option.pace === "steady");
  const routeLabels = [...new Set(options.map(option => option.route).filter(route => route !== null))]
    .map(route => board.cells.find(cell => cell.id === route)?.label ?? `space ${route}`);
  const completedTurns = admitted ? 0 : rolled ? turn - 1 : turn;
  const result = completion?.outcome;
  const resultText = result === "delivered" ? "Delivered before closing · +3 gold, once."
    : result === "late" ? "Late return · no delivery bonus."
      : "Bell returned · no delivery bonus.";
  return Object.freeze({
    phase, commandId: source.commandId, tick: source.tick, instanceId: expedition.instanceId,
    heroId: state.depth.hero.id, heroName: state.hero.name, turn,
    roll: rolled ? pending!.value : admitted ? null : move?.roll.value ?? null,
    path: Object.freeze(move !== undefined && !rolled ? [...move.path] : [expedition.currentCell]), board,
    title: completed ? `The Borrowed Bell · ${result === "delivered" ? "delivered" : "returned"}` : "The Borrowed Bell",
    narrative: admitted ? "The clerk hands you the festival bell. In this storehouse, every delivery must follow the board’s rules."
      : rolled ? `The die shows ${pending!.value}. ${canSteady ? "Take the roll, or steady the bell for one precise step." : "No MP to steady the bell; the rolled route remains open."}`
        : move?.landing.text ?? "The bell is safely returned.",
    choice: admitted ? "One hero, one bell. Forks stop movement; only landing triggers a room."
      : rolled ? `${canSteady ? "Steady costs exactly 1 MP. " : ""}${routeLabels.length > 0 ? `Fork: ${routeLabels.join(" / ")}.` : "The next corridor is fixed."}`
        : move === undefined ? "The declared fallback returns the borrowed bell." : moveChoice(move),
    deadline: completed ? resultText : `${bellDeadlineMarks(completedTurns)} Turn ${turn} · deliver by turn 4 for +3 gold.`,
    consequence: admitted ? "Shortcut toll: at most 1 MP on landing. Other effects remain unknown until experienced."
      : rolled ? "This is a committed roll, not a reroll. Passing a room grants nothing."
        : move === undefined ? "No repeat reward; the adventure continues."
          : `MP ${move.manaBefore} → ${expedition.mana} · gold ${move.goldBefore} → ${expedition.gold}. HP unchanged.`,
  });
}

export function createBorrowedBellView(caption: HTMLElement, journal: HTMLDetailsElement) {
  const doc = caption.ownerDocument;
  const content = journal.querySelector<HTMLElement>(".journal-bell-content");
  if (content === null) throw new Error("Missing Borrowed Bell Journal content");
  let visible = true;
  let scene: BorrowedBellSceneView | null = null;
  let latest: WorldState | null = null;
  let shownKey = "";
  let shownCampaign = "";
  function paragraph(text: string, className?: string): HTMLParagraphElement {
    const node = doc.createElement("p");
    node.textContent = text;
    if (className !== undefined) node.className = className;
    return node;
  }
  function renderCaption(): void {
    caption.hidden = !visible || scene === null;
    const app = caption.closest<HTMLElement>("#app");
    if (app !== null) {
      if (caption.hidden) delete app.dataset.bellScene;
      else app.dataset.bellScene = scene!.phase;
    }
    if (scene === null) {
      caption.replaceChildren();
      for (const key of ["phase", "command", "instance", "cell", "turn", "roll", "outcome", "hero"]) delete caption.dataset[key];
      return;
    }
    caption.dataset.phase = scene.phase;
    caption.dataset.command = scene.commandId;
    caption.dataset.instance = scene.instanceId;
    caption.dataset.cell = String(scene.board.currentCell);
    caption.dataset.turn = String(scene.turn);
    caption.dataset.roll = scene.roll === null ? "unrolled" : String(scene.roll);
    caption.dataset.outcome = scene.board.outcome ?? "pending";
    caption.dataset.hero = scene.heroId;
    const title = doc.createElement("h2"); title.textContent = scene.title;
    caption.replaceChildren(title, paragraph(scene.narrative, "bell-narrative"), paragraph(scene.choice, "bell-choice"),
      paragraph(scene.deadline, "bell-deadline"), paragraph(scene.consequence, "bell-note"));
  }
  function renderJournal(force = false): void {
    if (latest === null) return;
    const state = latest, expedition = state.depth.bellExpedition;
    const key = `${state.campaignId}:${JSON.stringify(expedition)}`;
    if (key === shownKey || (!force && journal.open && shownCampaign === state.campaignId)) return;
    shownKey = key; shownCampaign = state.campaignId;
    journal.dataset.campaign = state.campaignId;
    if (expedition === null || !isValidCampaignBorrowedBell(state.depth)) {
      content!.replaceChildren(paragraph("No Borrowed Bell expedition recorded. An eligible solo town stop can open this finite delivery board."));
      return;
    }
    const board = projectBellBoard(expedition), completion = expedition.completion;
    const place = state.depth.atlas.locations.find(location => location.id === expedition.locationId);
    const nodes: HTMLElement[] = [paragraph(`One hero carries a borrowed festival bell through a nine-space delivery board. On-time delivery earns 3 gold by turn 4; late return earns no delivery bonus. Only landing triggers a room.`),
      paragraph(`Admitted T${expedition.startedTick} at ${place?.name ?? expedition.locationId}. Instance ${expedition.instanceId}; rules v${expedition.rulesVersion}. Command ${expedition.sourceCommandId}.`, "journal-repartee-source")];
    const knowledge = doc.createElement("details"), summary = doc.createElement("summary"), known = doc.createElement("ul");
    summary.textContent = "Board knowledge and posted routes";
    known.setAttribute("aria-label", "Known Borrowed Bell spaces");
    for (const cell of board.cells) {
      const node = doc.createElement("li"); node.dataset.bellCell = String(cell.id); node.dataset.disclosure = cell.disclosure;
      node.textContent = `${cell.id} · ${cell.label} — ${cell.effectText} ${cell.exits.length > 0 ? `Routes: ${cell.exits.join(", ")}.` : "Exit."}`;
      known.append(node);
    }
    knowledge.append(summary, known); nodes.push(knowledge);
    const turns = doc.createElement("ol"); turns.setAttribute("aria-label", "Exact Borrowed Bell turns");
    for (const move of expedition.turns) {
      const item = doc.createElement("li"); item.dataset.command = move.sourceCommandId; item.dataset.turn = String(move.turn);
      item.dataset.path = move.path.join(","); item.dataset.pace = move.pace;
      const roll = paragraph(`Turn ${move.turn}: die ${move.roll.value}. Rolled T${move.roll.tick} by ${move.roll.sourceCommandId}.`, "bell-roll");
      roll.dataset.command = move.roll.sourceCommandId;
      const landing = paragraph(`Landed on ${move.landedCell}: ${move.landing.text}`, "bell-landing");
      item.append(roll, paragraph(moveChoice(move), "bell-choice"), landing,
        paragraph(`Steady cost ${move.steadyCost} MP; landing cost ${move.landing.manaSpent} MP; landing gain ${move.landing.goldGranted} gold. MP ${move.manaBefore} → ${move.manaAfter}; gold ${move.goldBefore} → ${move.goldAfter}.`),
        paragraph(`Moved T${move.tick} by ${move.sourceCommandId}.`, "journal-repartee-source"));
      const event = state.chronicle.find(entry => entry.commandId === `${state.campaignId}:${move.sourceCommandId}`);
      item.append(paragraph(event === undefined ? "The move receipt is retained; its extra decision trace has left the rolling Chronicle."
        : `Recorded computer choice: ${event.rationale}`, "journal-repartee-source"));
      turns.append(item);
    }
    nodes.push(turns);
    if (expedition.pendingRoll !== null) {
      const roll = expedition.pendingRoll;
      const pending = paragraph(`Turn ${roll.turn}: die ${roll.value}, awaiting the chosen route and pace. Rolled T${roll.tick} by ${roll.sourceCommandId}.`, "bell-pending-roll");
      pending.dataset.command = roll.sourceCommandId; nodes.push(pending);
    }
    if (completion !== null) {
      const result = paragraph(`${completion.outcome} on turn ${completion.turn}; delivery bonus ${completion.bonusGold} gold, once only. Final MP ${expedition.mana}; gold ${expedition.gold}. HP unchanged.`, "bell-result");
      result.dataset.command = completion.sourceCommandId; result.dataset.outcome = completion.outcome;
      nodes.push(result, paragraph(`Completed T${completion.tick} by ${completion.sourceCommandId}. This is a returned borrowed bell, not completion of an unrelated dungeon or quest.`, "journal-repartee-source"));
    }
    content!.replaceChildren(...nodes);
  }
  journal.addEventListener("toggle", () => { if (!journal.open) renderJournal(true); });
  return {
    render(state: WorldState): void { latest = state; scene = projectBorrowedBellScene(state); renderCaption(); renderJournal(); },
    setVisible(value: boolean): void { visible = value; renderCaption(); },
  };
}
