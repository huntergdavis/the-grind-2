import { beforeAll, describe, expect, it } from "vitest";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { usefulReplyBook, usefulReplyCall, usefulReplyResponses } from "../depth/useful-reply";
import { naturalUsefulReplyFixture } from "../../tests/useful-reply-fixtures";
import { projectReparteeScene, projectUsefulReplyScene } from "./repartee-view";

describe("useful reply, unscored presentation", () => {
  let before: WorldState, reading: WorldState, practice: WorldState;
  beforeAll(() => {
    before = naturalUsefulReplyFixture();
    reading = advanceWorld(before);
    practice = advanceWorld(reading);
  });

  it("shows only the actual public book reading, with no future reply or contest score", () => {
    expect(before.depth.usefulReply).toBeNull();
    expect(projectUsefulReplyScene(before)).toBeNull();
    expect(usefulReplyResponses(null).some((response) => response.classification === "constructive")).toBe(false);
    const lesson = reading.depth.usefulReply!;
    const scene = projectUsefulReplyScene(reading)!;
    expect(scene).toMatchObject({
      phase: "lesson-reading", commandId: `${reading.campaignId}:${lesson.reading.sourceCommandId}`,
      lessonId: lesson.lessonId, heroId: lesson.heroId, residentId: null, residentName: null,
      bookId: usefulReplyBook.id, title: usefulReplyBook.title, call: usefulReplyBook.excerpt, reply: null,
      classification: "learned", marks: [], momentum: null, outcome: null, witness: null, encore: false,
    });
    expect(scene.buildingName).toBe(reading.depth.towns[lesson.locationId]!.buildings.find((entry) => entry.id === lesson.buildingId)!.name);
    expect(scene.consequence).toBe("One constructive reply learned · practice is unscored.");
    expect(usefulReplyResponses(lesson).some((response) => response.expressionId === usefulReplyBook.expressionId)).toBe(true);
    expect(projectReparteeScene(reading)).toEqual(scene);
  });

  it("stages the exact committed constructive reply with its actual resident and reading source", () => {
    const lesson = practice.depth.usefulReply!, reply = lesson.reply!;
    const scene = projectUsefulReplyScene(practice)!;
    expect(scene).toMatchObject({
      phase: "lesson-practice", title: "Practice · unscored", classification: "constructive",
      commandId: `${practice.campaignId}:${reply.sourceCommandId}`, tick: reply.tick,
      heroId: lesson.heroId, residentId: lesson.residentId, residentName: lesson.residentName,
      readingSourceCommandId: lesson.reading.sourceCommandId,
      call: usefulReplyCall.text, reply: reply.reply, marks: [], momentum: null, outcome: null, witness: null,
      consequence: "Constructive · leadership means helping others.",
    });
    expect(reply.readingSourceCommandId).toBe(lesson.reading.sourceCommandId);
    expect(projectReparteeScene(practice)).toEqual(scene);
  });

  it("retains exact reading and reply scenes after reload without changing old narrative or resources", () => {
    const original = JSON.stringify([before.depth.repartee, before.depth.reparteeWitness, before.depth.reparteeCallback]);
    for (const world of [reading, practice]) {
      const saved = JSON.stringify(world);
      const scene = projectUsefulReplyScene(world)!;
      expect(projectUsefulReplyScene(JSON.parse(saved))).toEqual(scene);
      expect(Object.isFrozen(scene)).toBe(true);
      expect(Object.isFrozen(scene.marks)).toBe(true);
      expect(JSON.stringify(world)).toBe(saved);
      expect(JSON.stringify([world.depth.repartee, world.depth.reparteeWitness, world.depth.reparteeCallback])).toBe(original);
      expect(world.depth.hero.resources).toEqual(before.depth.hero.resources);
    }
  });

  it("rejects a stale tick, foreign source, wrong mode, absent actor or different venue", () => {
    const original = practice.chronicle.at(-1)!;
    const withSource = (change: Partial<typeof original>): WorldState => ({
      ...practice, chronicle: [...practice.chronicle.slice(0, -1), { ...original, ...change }],
    });
    expect(projectUsefulReplyScene(withSource({ commandId: `another-campaign:${practice.depth.usefulReply!.reply!.sourceCommandId}` }))).toBeNull();
    expect(projectUsefulReplyScene(withSource({ tick: practice.tick - 1 }))).toBeNull();
    expect(projectUsefulReplyScene(withSource({ commandType: "read-useful-book" }))).toBeNull();
    expect(projectUsefulReplyScene({ ...practice, scene: { ...practice.scene, mode: "battle" } })).toBeNull();
    const lesson = practice.depth.usefulReply!, town = practice.depth.towns[lesson.locationId]!;
    expect(projectUsefulReplyScene({ ...practice, depth: { ...practice.depth,
      towns: { ...practice.depth.towns, [lesson.locationId]: { ...town, residents: town.residents.filter((entry) => entry.id !== lesson.residentId) } },
    } })).toBeNull();
    expect(projectUsefulReplyScene({ ...practice, depth: { ...practice.depth,
      atlas: { ...practice.depth.atlas, currentLocationId: "not-the-reading-venue" },
    } })).toBeNull();
  });

  it("keeps the historical lesson but removes the stage when ordinary play resumes", () => {
    const after = advanceWorld(practice);
    expect(after.depth.usefulReply).toEqual(practice.depth.usefulReply);
    expect(projectUsefulReplyScene(after)).toBeNull();
    expect(projectReparteeScene(after)).toBeNull();
  });
});
