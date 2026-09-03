import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { advanceWorld, createWorld } from "../core/simulation";
import type { ChronicleEntry, SceneState } from "../core/types";
import { classifyNarratorCapability } from "./capability";
import { isNarratorJobV1, isNarratorPromptV1 } from "./protocol";
import { projectSceneNarratorJob } from "./scene-packet";

function committedScene() {
  const world = advanceWorld(createWorld("narrator-scene", "campaign:narrator-scene"));
  const source = world.chronicle.at(-1);
  if (source === undefined) throw new Error("Narrator fixture needs a committed Chronicle entry");
  return { world, source };
}

describe("scene narrator packet", () => {
  it("projects only public place, scene kind, and committed intensity energy", () => {
    const { world, source } = committedScene();
    const before = canonicalHash(world);
    const job = projectSceneNarratorJob(world.campaignId, world.scene, source, world.chronicle.at(-1)?.id);
    expect(job).not.toBeNull();
    expect(job?.prompt).toEqual({
      schemaVersion: 1,
      task: "single-ambient-line",
      voice: world.scene.mode === "battle" || world.scene.mode === "dungeon"
        ? "hero-aside-v1"
        : "spare-observer-v1",
      move: world.scene.mode === "battle" || world.scene.mode === "dungeon"
        ? "register-pressure"
        : world.scene.mode === "camp" || world.scene.mode === "chronicle"
          ? "shade-atmosphere"
          : "establish-setting",
      facts: {
        schemaVersion: 1,
        kind: "public-scene",
        sceneKind: world.scene.mode,
        place: world.scene.location,
        energy: world.scene.sensoryIntensity === 0
          ? "quiet"
          : world.scene.sensoryIntensity === 3 ? "heightened" : "steady",
      },
    });
    const modelVisible = JSON.stringify(job?.prompt);
    for (const forbidden of ["eventId", "tick", "headline", "action", "goal", "consequence", "rationale", "chosenAction"]) {
      expect(modelVisible).not.toContain(`\"${forbidden}\"`);
    }
    expect(canonicalHash(world)).toBe(before);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job?.prompt)).toBe(true);
    expect(Object.isFrozen(job?.prompt.facts)).toBe(true);
    expect(isNarratorJobV1(job)).toBe(true);
    expect(isNarratorPromptV1(job?.prompt)).toBe(true);
  });

  it("requires an exact current Chronicle source and never narrates an initial scene", () => {
    const { world, source } = committedScene();
    expect(projectSceneNarratorJob(world.campaignId, world.scene, undefined, undefined)).toBeNull();
    const mutations: readonly ((scene: SceneState) => SceneState)[] = [
      (scene) => ({ ...scene, mode: scene.mode === "town" ? "travel" : "town" }),
      (scene) => ({ ...scene, location: `${scene.location} Elsewhere` }),
      (scene) => ({ ...scene, headline: `${scene.headline} Changed` }),
      (scene) => ({ ...scene, action: `${scene.action} Changed` }),
      (scene) => ({ ...scene, goal: `${scene.goal} Changed` }),
      (scene) => ({ ...scene, consequence: `${scene.consequence} Changed` }),
      (scene) => ({ ...scene, sensoryIntensity: scene.sensoryIntensity === 3 ? 2 : 3 }),
    ];
    for (const mutate of mutations) {
      expect(projectSceneNarratorJob(world.campaignId, mutate(world.scene), source, source.id)).toBeNull();
    }

    const olderIdenticalScene = { ...source, id: "chronicle:older-identical", tick: Math.max(0, source.tick - 1) };
    expect(projectSceneNarratorJob(world.campaignId, world.scene, olderIdenticalScene, source.id)).toBeNull();
  });

  it("uses pressure as an unattributed hero aside and keeps ambient fallback factual", () => {
    const { source } = committedScene();
    const scene: SceneState = {
      mode: "dungeon",
      location: "Moonclock Vault",
      headline: "Canonical headline is host-only",
      action: "Canonical action is host-only",
      goal: "Canonical goal is host-only",
      consequence: "Canonical consequence is host-only",
      sensoryIntensity: 3,
    };
    const matching: ChronicleEntry = { ...source, ...scene };
    const job = projectSceneNarratorJob("campaign:narrator-scene", scene, matching, matching.id);
    expect(job?.prompt).toMatchObject({
      voice: "hero-aside-v1",
      move: "register-pressure",
      facts: { place: "Moonclock Vault", energy: "heightened" },
    });
    expect(job?.deterministicFallback).toBe("This heightened moment has my attention.");
  });

  it("rejects extra prompt fields, voice/move conflicts, controls, and overlong places", () => {
    const { world, source } = committedScene();
    const job = projectSceneNarratorJob(world.campaignId, world.scene, source, source.id);
    if (job === null) throw new Error("Narrator fixture did not project");
    expect(isNarratorPromptV1({ ...job.prompt, hiddenFact: "dragon" })).toBe(false);
    expect(isNarratorPromptV1({ ...job.prompt, voice: "hero-aside-v1" })).toBe(false);
    expect(isNarratorPromptV1({ ...job.prompt, facts: { ...job.prompt.facts, place: "Bad\u202eplace" } })).toBe(false);
    expect(projectSceneNarratorJob(
      world.campaignId,
      { ...world.scene, location: "x".repeat(121) },
      { ...source, location: "x".repeat(121) },
      source.id,
    )).toBeNull();
  });

  it("binds host metadata to the campaign without exposing it to the model", () => {
    const { world, source } = committedScene();
    const job = projectSceneNarratorJob(world.campaignId, world.scene, source, source.id);
    expect(job?.campaignId).toBe(world.campaignId);
    expect(JSON.stringify(job?.prompt)).not.toContain(world.campaignId);
    expect(projectSceneNarratorJob("", world.scene, source, source.id)).toBeNull();
  });

  it("classifies WebGPU and WASM without excluding low-end phones", () => {
    expect(classifyNarratorCapability({
      worker: true,
      webAssembly: true,
      webGpu: false,
      hardwareConcurrency: 4,
      deviceMemoryGiB: 2,
      saveData: true,
    })).toMatchObject({ execution: "wasm", budget: "low-end", reason: "local-wasm-worker" });
    expect(classifyNarratorCapability({
      worker: true,
      webAssembly: true,
      webGpu: true,
      hardwareConcurrency: 8,
      deviceMemoryGiB: 8,
      saveData: false,
    })).toMatchObject({ execution: "webgpu", budget: "standard", reason: "local-webgpu-worker" });
    expect(classifyNarratorCapability({
      worker: false,
      webAssembly: true,
      webGpu: true,
      hardwareConcurrency: 8,
      deviceMemoryGiB: 8,
      saveData: false,
    })).toMatchObject({ execution: "none", budget: "unsupported" });
  });
});
