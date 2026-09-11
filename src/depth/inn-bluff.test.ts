import { beforeAll, describe, expect, it } from "vitest";
import { commitLegalInnBluffChoice, naturalInnBluffBeforeAdmissionFixture, naturalInnBluffFixture } from "../../tests/inn-bluff-fixtures";
import { naturalSmithyJobFixture } from "../../tests/smithy-job-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { innBluffClaim, innBluffCommandId, isValidCampaignInnBluff, projectInnBluffDecision, selectInnBluff, selectInnBluffVenue, stepInnBluff } from "./inn-bluff";
import { createDepthState, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

type BluffCommand = Extract<DepthCommand, { type: "start-inn-bluff" | "resolve-inn-bluff" }>;
function reload(state: DepthState): DepthState { return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name); }
function preserved(state: DepthState) {
  const { tick: _tick, log: _log, innBluff: _bluff, hero, ...facts } = state;
  const { gold: _gold, ...heroFacts } = hero;
  return { ...facts, hero: heroFacts };
}
/** Literal unit contexts, not a searched natural autoplay fixture. A real
 * generated inn/host and legal start command still commit every private fact. */
function unitAdmission(heroId: string): DepthState {
  const state = createDepthState("shared-road-playful:7", heroId, "Mira Rook");
  const venue = selectInnBluffVenue(state);
  if (venue === null) throw new Error("Fixed cup unit context lacks its known real inn");
  return stepDepth(state, { type: "start-inn-bluff", ...venue });
}

describe("The Cup Is Exaggerating: one public tell, one exact wager", () => {
  let before: WorldState, ready: WorldState;
  beforeAll(() => { before = naturalInnBluffBeforeAdmissionFixture(); ready = naturalInnBluffFixture(); });

  it("seats the actual inn scholar after the completed town job without altering resources or earlier stories", () => {
    expect(before.tick).toBe(4);
    expect(before.depth.smithyJob?.completion?.shape).toBe("straight");
    expect(before.depth).not.toHaveProperty("innBluff");
    const bluff = ready.depth.innBluff!, venue = selectInnBluffVenue(before.depth)!;
    expect(venue).toMatchObject({ locationId: "location:0", innName: "The Candle Inn", residentName: "Cato Ash", residentRole: "scholar" });
    const town = before.depth.towns[venue.locationId]!, inn = town.buildings.find(entry => entry.id === venue.innId)!;
    expect(inn.residentIds).toContain(venue.residentId);
    expect(town.residents).toContainEqual(expect.objectContaining({ id: venue.residentId, homeBuildingId: venue.innId }));
    expect(bluff).toMatchObject({ ...venue, schemaVersion: 1, rulesVersion: "cup-exaggeration-v1", contentVersion: 1,
      heroId: before.hero.id, presenceRule: "admitted-together-v1", admission: { tick: 5, goldBefore: 9 }, resolution: null });
    expect(ready.depth.hero).toEqual(before.depth.hero);
    expect(ready.hero).toEqual(before.hero);
    expect(preserved(ready.depth)).toEqual(preserved(before.depth));
    expect(ready.chronicle.at(-1)).toMatchObject({ commandType: "start-inn-bluff", tick: 5,
      commandId: `${ready.campaignId}:${bluff.admission.sourceCommandId}` });
    expect(reload(ready.depth)).toEqual(ready.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(ready)))).toEqual(ready);
  });

  it("settles legal exposed-bluff, honest-claim and decline outcomes without rewriting the covered die", () => {
    const contexts = [unitAdmission("hero:cup-a"), unitAdmission("hero:cup-b")];
    const outcomes = new Set<string>();
    for (const state of contexts) {
      const admission = state.innBluff!.admission;
      for (const choice of ["challenge", "decline"] as const) {
        const command = { type: "resolve-inn-bluff", bluffId: state.innBluff!.bluffId, choice } as const;
        const after = stepDepth(state, command), result = after.innBluff!.resolution!;
        const expected = choice === "decline"
          ? { outcome: "declined", goldSpent: 0, goldReturned: 0, line: "I decline to invest in the cup's reputation." }
          : admission.face < 4
            ? { outcome: "exposed-bluff", goldSpent: 1, goldReturned: 2, line: "The cup had been speaking above its means." }
            : { outcome: "honest-claim", goldSpent: 1, goldReturned: 0, line: "My suspicion was free. The explanation was not." };
        expect(result).toEqual({ ...expected, tick: state.tick + 1, sourceCommandId: innBluffCommandId(state.tick + 1, command),
          choice, revealedFace: admission.face, goldBefore: state.hero.gold, goldAfter: state.hero.gold - expected.goldSpent + expected.goldReturned });
        expect(after.innBluff!.admission).toEqual(admission);
        expect(after.hero.gold).toBe(result.goldAfter);
        expect(preserved(after)).toEqual(preserved(state));
        expect(reload(after)).toEqual(after);
        expect(stepDepth(reload(state), command)).toEqual(after);
        outcomes.add(result.outcome);
      }
    }
    expect(outcomes).toEqual(new Set(["exposed-bluff", "honest-claim", "declined"]));
    for (const choice of ["challenge", "decline"] as const) {
      const after = commitLegalInnBluffChoice(ready, choice);
      expect(after.depth.innBluff!.resolution!.choice).toBe(choice);
      expect(after.hero.gold).toBe(after.depth.hero.gold);
      expect(preserved(after.depth)).toEqual(preserved(ready.depth));
    }
  });

  it("copies only public claim, fallible tell, actors and legal stakes into the decision packet", () => {
    const bytes = canonicalStringify(ready), decision = projectInnBluffDecision(ready.depth)!;
    expect(Object.keys(decision).sort()).toEqual(["bluffId", "heroId", "locationId", "innId", "innName", "residentId", "residentName", "residentRole",
      "tick", "sourceCommandId", "claim", "tell", "tellText", "tellAccuracy", "gold", "choices"].sort());
    expect(decision.claim).toBe(innBluffClaim);
    expect(decision.tellAccuracy).toBe("two-in-three");
    expect(decision.tellText).toBe(decision.tell === "fidgeting" ? "A thumb keeps finding the rim of the cup." : "The hand leaves the cup alone.");
    expect(decision.choices).toEqual([
      { choice: "challenge", label: "challenge the claim: stake 1 gold", goldCost: 1 },
      { choice: "decline", label: "decline the wager: keep every coin", goldCost: 0 },
    ]);
    for (const privateKey of ["seed", "face", "revealedFace", "outcome", "resolution", "admission", "goldReturned", "accurate", "fidelity"]) {
      expect(decision).not.toHaveProperty(privateKey);
    }
    expect(canonicalStringify(ready)).toBe(bytes);
    Object.assign(decision, { gold: 0, tell: "forged" });
    Object.assign(decision.choices[0]!, { goldCost: 99 });
    expect(canonicalStringify(ready)).toBe(bytes);
    expect(projectInnBluffDecision(ready.depth)).not.toEqual(decision);
  });
  it("rejects altered seed, private commitment, tell, participant, source, timing and payout receipts", () => {
    const finished = commitLegalInnBluffChoice(ready, "challenge").depth;
    const mutations: readonly ((state: DepthState) => void)[] = [
      state => { state.seed += ":forged"; },
      state => { Object.assign(state.innBluff!, { rulesVersion: "future" }); },
      state => { Object.assign(state.innBluff!, { residentRole: "innkeeper" }); },
      state => { Object.assign(state.innBluff!, { residentId: "invented-host" }); },
      state => { Object.assign(state.innBluff!, { presenceRule: "assumed-home" }); },
      state => { Object.assign(state.innBluff!.admission, { face: state.innBluff!.admission.face % 6 + 1 }); },
      state => { Object.assign(state.innBluff!.admission, { tell: state.innBluff!.admission.tell === "steady" ? "fidgeting" : "steady" }); },
      state => { Object.assign(state.innBluff!.admission, { sourceCommandId: "depth:5:wait" }); },
      state => { Object.assign(state.innBluff!.resolution!, { tick: state.tick + 1 }); },
      state => { Object.assign(state.innBluff!.resolution!, { sourceCommandId: "depth:6:wait" }); },
      state => { Object.assign(state.innBluff!.resolution!, { goldSpent: 0 }); },
      state => { Object.assign(state.innBluff!.resolution!, { goldReturned: 9 }); },
      state => { Object.assign(state.innBluff!.resolution!, { line: "Permanent gambling mastery earned." }); },
      state => { state.hero.gold += 1; },
    ];
    for (const mutate of mutations) {
      const forged = JSON.parse(canonicalStringify(finished)) as DepthState;
      mutate(forged);
      expect(forged).not.toEqual(finished);
      expect(isValidCampaignInnBluff(forged)).toBe(false);
      expect(() => reload(forged)).toThrow();
    }
    expect(() => stepDepth(ready.depth, { type: "wait" })).toThrow();
    expect(isValidCampaignInnBluff({ ...ready.depth, tick: ready.tick + 1 })).toBe(false);
    expect(() => stepInnBluff(ready.depth, { type: "resolve-inn-bluff", bluffId: "foreign", choice: "decline" })).toThrow();
    expect(() => stepInnBluff(ready.depth, { type: "resolve-inn-bluff", bluffId: ready.depth.innBluff!.bluffId, choice: "invented" } as unknown as BluffCommand)).toThrow();
  });

  it("preserves old absence and blocks zero-gold admission or a forged pending balance without removing decline", () => {
    expect(reload(before.depth)).not.toHaveProperty("innBluff");
    expect(isValidCampaignInnBluff({ ...before.depth, innBluff: null })).toBe(true);
    for (const innBluff of [undefined, {}, { schemaVersion: 2 }]) {
      const malformed = { ...before.depth, innBluff } as unknown as DepthState;
      expect(isValidCampaignInnBluff(malformed)).toBe(false);
      expect(() => upgradeDepthState(malformed, malformed.seed, malformed.hero.id, malformed.hero.name)).toThrow();
    }
    expect(selectInnBluffVenue({ ...before.depth, hero: { ...before.depth.hero, gold: 0 } })).toBeNull();
    const forged = { ...ready.depth, hero: { ...ready.depth.hero, gold: 0 } };
    expect(isValidCampaignInnBluff(forged)).toBe(false);
    expect(projectInnBluffDecision(forged)).toBeNull();
    expect(() => stepDepth(forged, { type: "resolve-inn-bluff", bluffId: ready.depth.innBluff!.bluffId, choice: "decline" })).toThrow();
    const declined = commitLegalInnBluffChoice(ready, "decline");
    expect(declined.depth.hero).toEqual(ready.depth.hero);
    expect(declined.hero).toEqual(ready.hero);
    expect(declined.depth.innBluff!.resolution).toMatchObject({ outcome: "declined", goldSpent: 0, goldReturned: 0, goldBefore: 9, goldAfter: 9 });
  });

  it("requires a healthy solo visit, actual host membership and no owed rest or unfinished job", () => {
    const bluff = ready.depth.innBluff!, town = before.depth.towns[bluff.locationId]!;
    for (const blocked of [
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, health: 0 } } },
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, health: 21 } } },
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, mana: 0 } } },
      { ...before.depth, quest: { ...before.depth.quest, status: "ready-to-fulfill" as const } },
      { ...before.depth, atlas: { ...before.depth.atlas, discoveredLocationIds: [] } },
      { ...before.depth, towns: { ...before.depth.towns, [bluff.locationId]: { ...town, visits: 0 } } },
      { ...before.depth, towns: { ...before.depth.towns, [bluff.locationId]: { ...town, residents: [] } } },
      { ...before.depth, towns: { ...before.depth.towns, [bluff.locationId]: { ...town, districts: [] } } },
      { ...before.depth, towns: { ...before.depth.towns, [bluff.locationId]: { ...town,
        buildings: town.buildings.map(building => ({ ...building, residentIds: [] })) } } },
      naturalSmithyJobFixture().depth,
    ]) expect(selectInnBluffVenue(blocked)).toBeNull();
    // A selector-only roster boundary, not an invented travel/recruitment record.
    const away = { ...before.depth, companions: { ...before.depth.companions,
      former: [{ identity: { residentId: bluff.residentId } }] } } as unknown as DepthState;
    expect(selectInnBluffVenue(away)?.residentId).not.toBe(bluff.residentId);
    const accompanied = { ...before.depth, companions: { ...before.depth.companions,
      active: [{ identity: { residentId: bluff.residentId } }] } } as unknown as DepthState;
    expect(selectInnBluffVenue(accompanied)).toBeNull();
  });

  it("continues normally without rerolling or repaying and preserves historical hosts after later recruitment", () => {
    const finished = commitLegalInnBluffChoice(ready, "challenge"), bluff = finished.depth.innBluff!;
    expect(selectInnBluff(finished.depth)).toBeNull();
    expect(selectInnBluffVenue(finished.depth)).toBeNull();
    expect(projectInnBluffDecision(finished.depth)).toBeNull();
    expect(() => stepDepth(finished.depth, { type: "resolve-inn-bluff", bluffId: bluff.bluffId, choice: "challenge" })).toThrow();
    expect(campaignDirector(finished).candidates.every(candidate => !["start-inn-bluff", "resolve-inn-bluff"].includes(candidate.command.type))).toBe(true);
    const continued = advanceWorld(finished);
    expect(continued.tick).toBe(finished.tick + 1);
    expect(continued.depth.innBluff).toEqual(bluff);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(continued)))).toEqual(continued);
    // Pure historical validation boundary: later membership/spending cannot
    // change who actually sat at the earlier table. No fake command is saved.
    const historical = { ...continued.depth, hero: { ...continued.depth.hero, gold: 0 },
      companions: { ...continued.depth.companions, active: [{ identity: { residentId: bluff.residentId } }] } } as unknown as DepthState;
    expect(isValidCampaignInnBluff(historical)).toBe(true);
  });

  it("stops hidden catch-up before both visible commands with exact repeat-safe sources and reloads", () => {
    for (const state of [before, ready]) {
      const request = { id: `inn-bluff:${state.tick}`, observedAtMs: 100_000 + state.tick, elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(state, request);
      expect(stopped.tick).toBe(state.tick);
      expect(stopped.depth).toEqual(state.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(campaignDirector(state).candidates[0]!.command.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
    }
  });
});
