import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";
import type { DungeonPerspectiveView } from "../ui/dungeon-perspective-view";
import { drawDungeonPerspective, dungeonPerspectiveDoorPolygons } from "./dungeon-perspective";

const room: DungeonPerspectiveView = Object.freeze({
  schemaVersion: 1, campaignId: "campaign:perspective-drawing", dungeonId: "dungeon:public",
  tick: 3, sourceCommandId: "campaign:perspective-drawing:step:3", currentCellId: "known-room",
  heroId: "hero:perspective-drawing", heroName: "Aster", facing: "north", completed: false,
  exits: Object.freeze([]), currentTrap: null, keyStatus: "unknown", landmark: null, search: null, secretPassage: null, guardian: null,
});

describe("public-only dungeon perspective drawing", () => {
  it("draws a bounded remembered lair mark only when the public current-room packet supplies it", () => {
    for (const status of ["revealed", "cleared", "unbeaten"] as const) {
      const drawing = drawDungeonPerspective({ ...room, guardian: { dungeonId: room.dungeonId, cellId: room.currentCellId,
        status, guardianId: "actual-guardian", guardianName: "Ash Goblin 1" } });
      const mark = drawing.layer.children.find(child => child.label === `lair-${status}`);
      expect(mark).toBeInstanceOf(Graphics);
      if (!(mark instanceof Graphics)) throw new Error("Missing public floor mark");
      expect(mark.context.bounds.minX).toBeGreaterThan(100);
      expect(mark.context.bounds.maxX).toBeLessThan(132);
      expect(mark.context.bounds.minY).toBeGreaterThan(86);
      expect(mark.context.bounds.maxY).toBeLessThan(102);
      expect(drawing.labels.map(label => label.text)).toContain(status === "revealed" ? "LAIR" : status.toUpperCase());
      expect(drawing.layer.children.some(child => child.label === "actual-guardian")).toBe(false);
      drawing.layer.destroy({ children: true });
    }
  });
  it("keeps a bounded native room inside the existing viewport without changing its packet", () => {
    const before = JSON.stringify(room), drawing = drawDungeonPerspective(room);
    expect(drawing.viewport).toEqual({ x: 44, y: 32, width: 232, height: 124 });
    expect([drawing.layer.x, drawing.layer.y]).toEqual([44, 32]);
    expect(drawing.labels.map(label => label.text)).toEqual(["↑ N"]);
    expect(drawing.layer.children.length).toBeLessThan(20);
    for (const child of drawing.layer.children) {
      if (!(child instanceof Graphics)) continue;
      const bounds = child.context.bounds;
      expect(bounds.minX).toBeGreaterThanOrEqual(-2);
      expect(bounds.minY).toBeGreaterThanOrEqual(-2);
      expect(bounds.maxX).toBeLessThanOrEqual(234);
      expect(bounds.maxY).toBeLessThanOrEqual(126);
    }
    expect(JSON.stringify(room)).toBe(before);
    drawing.layer.destroy({ children: true });
  });

  it("draws only the supplied visible doors and a compass equivalent for the door behind", () => {
    const view: DungeonPerspectiveView = { ...room, exits: [
      { direction: "east", relative: "right", destinationCellId: "known-east", visited: false, available: true,
        gate: "none", trap: null, sightedKey: false },
      { direction: "south", relative: "back", destinationCellId: "known-south", visited: true, available: false,
        gate: "none", trap: null, sightedKey: false },
    ] };
    const drawing = drawDungeonPerspective(view);
    expect(drawing.labels.map(label => label.text)).toEqual(["E", "↑ N · ↓ S"]);
    expect(Object.keys(dungeonPerspectiveDoorPolygons)).toEqual(["front", "left", "right"]);
    drawing.layer.destroy({ children: true });
  });

  it("keeps a promised or remotely mapped shrine out of the room and labels only a known current hazard", () => {
    const baseline = drawDungeonPerspective(room);
    const promised = drawDungeonPerspective({ ...room, landmark: { kind: "far-stair-shrine", status: "promised", here: false } });
    const remote = drawDungeonPerspective({ ...room, landmark: { kind: "far-stair-shrine", status: "mapped", here: false } });
    expect(promised.layer.children.length).toBe(baseline.layer.children.length);
    expect(remote.layer.children.length).toBe(baseline.layer.children.length);
    const known = drawDungeonPerspective({ ...room, currentTrap: { kind: "mana-siphon", status: "armed" } });
    expect(known.labels.map(label => label.text)).toEqual(["ARMED", "↑ N"]);
    for (const drawing of [baseline, promised, remote, known]) drawing.layer.destroy({ children: true });
  });

  it("keeps a draught on intact stone in each orientation, including a compass cue behind", () => {
    for (const [relative, direction] of [["front", "north"], ["right", "east"], ["back", "south"], ["left", "west"]] as const) {
      const drawing = drawDungeonPerspective({ ...room, secretPassage: { phase: "draught", relative, direction } });
      expect(drawing.labels.map(label => label.text)).toEqual(relative === "back" ? ["↑ N · ↓ S"] : [direction[0]!.toUpperCase(), "↑ N"]);
      // A draft adds only one bounded air graphic (plus a direction label), no doorway polygon.
      const baseline = drawDungeonPerspective(room);
      expect(drawing.layer.children.filter(child => child instanceof Graphics).length)
        .toBe(baseline.layer.children.filter(child => child instanceof Graphics).length + 1);
      for (const child of drawing.layer.children) {
        if (!(child instanceof Graphics)) continue;
        expect(child.context.bounds.minX).toBeGreaterThanOrEqual(-2);
        expect(child.context.bounds.minY).toBeGreaterThanOrEqual(-2);
        expect(child.context.bounds.maxX).toBeLessThanOrEqual(234);
        expect(child.context.bounds.maxY).toBeLessThanOrEqual(126);
      }
      drawing.layer.destroy({ children: true }); baseline.layer.destroy({ children: true });
    }
  });

  it("marks an actually opened doorway without adding an extra room or invented exit", () => {
    const view: DungeonPerspectiveView = { ...room, secretPassage: { phase: "open", relative: "right", direction: "east", destinationCellId: "known-east" },
      exits: [{ direction: "east", relative: "right", destinationCellId: "known-east", visited: true, available: true, gate: "none", trap: null, sightedKey: false }] };
    const drawing = drawDungeonPerspective(view), ordinary = drawDungeonPerspective({ ...view, secretPassage: null });
    expect(drawing.labels.map(label => label.text)).toEqual(["E", "↑ N"]);
    expect(drawing.layer.children.length).toBe(ordinary.layer.children.length);
    drawing.layer.destroy({ children: true }); ordinary.layer.destroy({ children: true });
  });
});
