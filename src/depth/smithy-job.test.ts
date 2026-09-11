import { beforeAll, describe, expect, it } from "vitest";
import { commitLegalSmithyStroke, naturalSmithyJobBeforeAdmissionFixture, naturalSmithyJobFixture } from "../../tests/smithy-job-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { isValidCampaignSmithyJob, selectSmithyJob, selectSmithyJobVenue, smithyJobCommandId, smithyStrokeOptions, stepSmithyJob } from "./smithy-job";
import { stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

type JobCommand = Extract<DepthCommand, { type: "start-smithy-job" | "smithy-stroke" }>;
function pureCommit(state: DepthState, command: JobCommand): DepthState {
  const result = stepSmithyJob(state, command);
  return { ...state, tick: state.tick + 1, smithyJob: result.smithyJob,
    hero: { ...state.hero, gold: result.gold, resources: { ...state.hero.resources, mana: result.mana } } };
}
function reload(state: DepthState): DepthState { return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name); }
function preserved(state: DepthState) {
  const { tick: _tick, log: _log, smithyJob: _job, hero, ...facts } = state;
  const { gold: _gold, resources, ...heroFacts } = hero, { mana: _mana, ...resourceFacts } = resources;
  return { ...facts, hero: { ...heroFacts, resources: resourceFacts } };
}

describe("Surely I Can Make One Nail: one real job, two recorded strokes", () => {
  let before: WorldState, ready: WorldState;
  beforeAll(() => { before = naturalSmithyJobBeforeAdmissionFixture(); ready = naturalSmithyJobFixture(); });

  it("starts only at the actual visited smithy and explicitly admits the real host without changing resources", () => {
    expect(before.tick).toBe(1);
    expect(before.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    expect(before.depth).not.toHaveProperty("smithyJob");
    const venue = selectSmithyJobVenue(before.depth)!, job = ready.depth.smithyJob!;
    expect(venue).toMatchObject({ locationId: "location:0", smithName: "The Wheel Smithy", residentName: "Hale Cooper", residentRole: "healer" });
    const town = before.depth.towns[venue.locationId]!, smith = town.buildings.find((entry) => entry.id === venue.smithId)!;
    expect(smith.residentIds).toContain(venue.residentId);
    expect(town.residents).toContainEqual(expect.objectContaining({ id: venue.residentId, homeBuildingId: venue.smithId }));
    expect(job).toMatchObject({ ...venue, schemaVersion: 1, rulesVersion: "one-nail-v1", contentVersion: 1,
      heroId: before.hero.id, presenceRule: "admitted-together-v1", admission: { tick: 2, manaBefore: 24, goldBefore: 7 }, strokes: [], completion: null });
    expect(ready.depth.hero).toEqual(before.depth.hero);
    expect(ready.hero).toEqual(before.hero);
    expect(preserved(ready.depth)).toEqual(preserved(before.depth));
    expect(ready.chronicle.at(-1)).toMatchObject({ commandType: "start-smithy-job", tick: 2,
      commandId: `${ready.campaignId}:${job.admission.sourceCommandId}` });
    expect(reload(ready.depth)).toEqual(ready.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(ready)))).toEqual(ready);
  });

  it("resolves all four legal two-stroke sequences with the exact shape, MP and wage", () => {
    const sequences = [
      ["tap", "tap", "unfinished", 2, 0, 0, "A convincing beginning. The point is still missing."],
      ["tap", "drive", "straight", 3, 1, 2, "A nail, as advertised. Two gold, as promised."],
      ["drive", "tap", "straight", 3, 1, 2, "A nail, as advertised. Two gold, as promised."],
      ["drive", "drive", "bent", 4, 2, 0, "Excellent. A corner nail."],
    ] as const;
    for (const [firstStroke, secondStroke, shape, points, manaSpent, goldEarned, line] of sequences) {
      const first = commitLegalSmithyStroke(ready, firstStroke), after = commitLegalSmithyStroke(first, secondStroke);
      const job = after.depth.smithyJob!, completion = job.completion!;
      expect(first.depth.smithyJob!.completion).toBeNull();
      expect(first.depth.smithyJob!.strokes).toHaveLength(1);
      expect(first.depth.hero.gold).toBe(ready.depth.hero.gold);
      expect(job.strokes.map((stroke) => stroke.stroke)).toEqual([firstStroke, secondStroke]);
      expect(job.strokes.map((stroke) => stroke.tick)).toEqual([3, 4]);
      expect(job.strokes.map((stroke) => stroke.index)).toEqual([0, 1]);
      expect(completion).toEqual({ tick: 4, sourceCommandId: job.strokes[1]!.sourceCommandId,
        shape, points, goldBefore: 7, goldEarned, goldAfter: 7 + goldEarned, line });
      expect(after.depth.hero.resources.mana).toBe(24 - manaSpent);
      expect(after.depth.hero.gold).toBe(7 + goldEarned);
      expect(preserved(after.depth)).toEqual(preserved(ready.depth));
      expect(after.depth.hero.experience).toBe(ready.depth.hero.experience);
      expect(after.chronicle.at(-1)).toMatchObject({ commandType: "smithy-stroke", tick: 4,
        commandId: `${after.campaignId}:${completion.sourceCommandId}` });
      for (const state of [first, after]) {
        expect(reload(state.depth)).toEqual(state.depth);
        expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
      }
      expect(selectSmithyJob(after.depth)).toBeNull();
      expect(selectSmithyJobVenue(after.depth)).toBeNull();
      expect(() => stepDepth(after.depth, { type: "smithy-stroke", jobId: job.jobId, strokeIndex: 1, stroke: secondStroke })).toThrow();
    }
  });

  it("admits with one owned MP and finishes by tapping after the drive spends it", () => {
    // Explicit MP/gold boundary after a genuine ordinary command; not a claim
    // that the natural hero arrived with these supplies. No outcome is staged.
    const ordinary = stepDepth(before.depth, { type: "wait" });
    const boundary = { ...ordinary, hero: { ...ordinary.hero, gold: 0, resources: { ...ordinary.hero.resources, mana: 1 } } };
    const venue = selectSmithyJobVenue(boundary)!;
    expect(venue).not.toBeNull();
    const admitted = pureCommit(boundary, { type: "start-smithy-job", ...venue });
    const driven = pureCommit(admitted, { type: "smithy-stroke", jobId: venue.jobId, strokeIndex: 0, stroke: "drive" });
    expect(driven.hero.resources.mana).toBe(0);
    expect(smithyStrokeOptions(driven).map((option) => option.stroke)).toEqual(["tap"]);
    expect(() => stepSmithyJob(driven, { type: "smithy-stroke", jobId: venue.jobId, strokeIndex: 1, stroke: "drive" })).toThrow();
    const finished = pureCommit(driven, { type: "smithy-stroke", jobId: venue.jobId, strokeIndex: 1, stroke: "tap" });
    expect(finished.smithyJob!.completion).toMatchObject({ shape: "straight", goldEarned: 2 });
    expect(finished.hero.resources.mana).toBe(0);
    expect(finished.hero.gold).toBe(2);
    expect(isValidCampaignSmithyJob(finished)).toBe(true);
    expect(selectSmithyJobVenue({ ...boundary, hero: { ...boundary.hero, resources: { ...boundary.hero.resources, mana: 0 } } })).toBeNull();
  });

  it("rejects forged source, host, stroke, MP, shape, wage and skipped sequence receipts", () => {
    const finished = commitLegalSmithyStroke(commitLegalSmithyStroke(ready, "drive"), "tap").depth;
    const job = finished.smithyJob!;
    expect(job.strokes[0]!.sourceCommandId).toBe(smithyJobCommandId(3,
      { type: "smithy-stroke", jobId: job.jobId, strokeIndex: 0, stroke: "drive" }));
    const mutations: readonly ((state: DepthState) => void)[] = [
      (state) => { Object.assign(state.smithyJob!, { rulesVersion: "unknown" }); },
      (state) => { Object.assign(state.smithyJob!, { presenceRule: "assumed-home" }); },
      (state) => { Object.assign(state.smithyJob!, { residentRole: "smith" }); },
      (state) => { Object.assign(state.smithyJob!, { residentId: "invented-resident" }); },
      (state) => { Object.assign(state.smithyJob!.admission, { sourceCommandId: "depth:2:wait" }); },
      (state) => { Object.assign(state.smithyJob!.strokes[0]!, { manaSpent: 0 }); },
      (state) => { Object.assign(state.smithyJob!.strokes[0]!, { pointsAdded: 1 }); },
      (state) => { Object.assign(state.smithyJob!.strokes[1]!, { tick: 5 }); },
      (state) => { Object.assign(state.smithyJob!.completion!, { shape: "bent" }); },
      (state) => { Object.assign(state.smithyJob!.completion!, { goldEarned: 4 }); },
      (state) => { Object.assign(state.smithyJob!.completion!, { line: "A permanent new smithing skill!" }); },
      (state) => { state.hero.resources.mana += 1; },
      (state) => { state.hero.gold += 1; },
    ];
    for (const mutate of mutations) {
      const state = JSON.parse(canonicalStringify(finished)) as DepthState;
      expect(isValidCampaignSmithyJob(state)).toBe(true);
      mutate(state);
      expect(isValidCampaignSmithyJob(state)).toBe(false);
      expect(() => reload(state)).toThrow();
    }
    expect(() => stepDepth(ready.depth, { type: "wait" })).toThrow();
    expect(() => stepDepth(ready.depth, { type: "smithy-stroke", jobId: job.jobId, strokeIndex: 1, stroke: "tap" })).toThrow();
    expect(isValidCampaignSmithyJob({ ...ready.depth, tick: ready.tick + 1 })).toBe(false);
    expect(() => stepSmithyJob(ready.depth, { type: "smithy-stroke", jobId: "foreign", strokeIndex: 0, stroke: "tap" })).toThrow();
    expect(() => stepSmithyJob(ready.depth, { type: "smithy-stroke", jobId: job.jobId, strokeIndex: 0, stroke: "invented" } as unknown as JobCommand)).toThrow();
  });

  it("keeps old absence and completed history while requiring the real venue and healthy solo admission", () => {
    expect(reload(before.depth)).not.toHaveProperty("smithyJob");
    expect(isValidCampaignSmithyJob({ ...before.depth, smithyJob: null })).toBe(true);
    for (const smithyJob of [undefined, {}, { schemaVersion: 2 }]) {
      const invalid = { ...before.depth, smithyJob } as unknown as DepthState;
      expect(isValidCampaignSmithyJob(invalid)).toBe(false);
      // JSON omits undefined; exercise the malformed present field directly.
      expect(() => upgradeDepthState(invalid, invalid.seed, invalid.hero.id, invalid.hero.name)).toThrow();
    }
    const job = ready.depth.smithyJob!, town = before.depth.towns[job.locationId]!;
    for (const blocked of [
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, health: 0 } } },
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, health: 21 } } },
      { ...before.depth, hero: { ...before.depth.hero, resources: { ...before.depth.hero.resources, mana: 0 } } },
      { ...before.depth, quest: { ...before.depth.quest, status: "ready-to-fulfill" as const } },
      { ...before.depth, atlas: { ...before.depth.atlas, discoveredLocationIds: [] } },
      { ...before.depth, towns: { ...before.depth.towns, [job.locationId]: { ...town, visits: 0 } } },
      { ...before.depth, towns: { ...before.depth.towns, [job.locationId]: { ...town, residents: [] } } },
      { ...before.depth, towns: { ...before.depth.towns, [job.locationId]: { ...town, districts: [] } } },
    ]) expect(selectSmithyJobVenue(blocked)).toBeNull();
    const finished = commitLegalSmithyStroke(commitLegalSmithyStroke(ready, "drive"), "tap");
    const continued = advanceWorld(finished);
    expect(campaignDirector(finished).candidates.every((candidate) => !["start-smithy-job", "smithy-stroke"].includes(candidate.command.type))).toBe(true);
    expect(continued.tick).toBe(finished.tick + 1);
    expect(continued.depth.smithyJob).toEqual(finished.depth.smithyJob);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(continued)))).toEqual(continued);
    // Pure historical roster boundary: later membership must not retroactively
    // invalidate who hosted the job. No fictional recruitment command is saved.
    const historical = { ...continued.depth, hero: { ...continued.depth.hero, gold: 0 },
      companions: { ...continued.depth.companions, active: [{ identity: { residentId: job.residentId } }] } } as unknown as DepthState;
    expect(isValidCampaignSmithyJob(historical)).toBe(true);
    const absentHost = { ...before.depth, companions: { ...before.depth.companions,
      former: [{ identity: { residentId: job.residentId } }] } } as unknown as DepthState;
    expect(selectSmithyJobVenue(absentHost)?.residentId).not.toBe(job.residentId);
  });

  it("stops hidden catch-up before admission and each stroke with exact, repeat-safe pending sources", () => {
    for (const state of [before, ready, commitLegalSmithyStroke(ready, "drive")]) {
      const request = { id: `smithy:${state.tick}`, observedAtMs: 100_000 + state.tick, elapsedMs: 48_000, requestedTicks: 10 };
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
