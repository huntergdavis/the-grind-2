import { describe, expect, it, vi } from "vitest";
import type { ChroniclePlateRecipeV1 } from "./chronicle-plate";
import {
  chroniclePlateArchiveKey, chroniclePlateMaximumBytes, chroniclePlateMaximumEntries, createChroniclePlateArchive,
} from "./chronicle-plate-archive";

function recipe(tick = 1, campaignId = "campaign:one"): ChroniclePlateRecipeV1 {
  return { schemaVersion: 1, kind: "town-visit", templateId: "town-landmarks@1",
    sourceEventId: `${campaignId}:${tick}`, campaignId, sourceTick: tick,
    town: { id: "town:location:1", locationId: "location:1", name: "Greyford", specialty: "orchards" },
    visit: { before: 2, after: 3 }, reputation: { before: 4, after: 5 },
    landmarks: [{ id: "building:inn", name: "The Badger Inn", kind: "inn", districtId: "district:1" }],
  };
}

function storage(initial?: string) {
  const saved = new Map<string, string>(initial === undefined ? [] : [[chroniclePlateArchiveKey, initial]]);
  return { saved, getItem: vi.fn((key: string) => saved.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }) };
}

function envelope(entries: readonly unknown[], schemaVersion = 1): string {
  return JSON.stringify({ schemaVersion, entries });
}

describe("browser-local Chronicle Plate archive", () => {
  it("records once, preserves first event-time composition, and restores without model or save dependencies", () => {
    const local = storage();
    local.saved.set("unrelated-save", "unchanged");
    const archive = createChroniclePlateArchive(() => local);
    expect(archive.snapshot).toEqual({ entries: [], persistent: true });
    expect(archive.record(recipe())).toBe(true);
    expect(archive.record(recipe())).toBe(false);
    expect(archive.record({ ...recipe(), town: { ...recipe().town, name: "Later town name" } })).toBe(false);
    expect(local.setItem).toHaveBeenCalledTimes(1);
    expect(local.saved.get("unrelated-save")).toBe("unchanged");
    expect(local.saved.size).toBe(2);
    expect(createChroniclePlateArchive(() => local).snapshot).toEqual(archive.snapshot);
  });

  it("keeps newest insertion first across campaigns without relying on clock or sorting tick numbers across heroes", () => {
    const local = storage();
    const archive = createChroniclePlateArchive(() => local);
    archive.record(recipe(500, "earlier-hero"));
    archive.record(recipe(2, "new-hero"));
    archive.record(recipe(1, "new-hero"));
    expect(archive.snapshot.entries.map((entry) => entry.sourceEventId)).toEqual(["new-hero:1", "new-hero:2", "earlier-hero:500"]);
    expect(createChroniclePlateArchive(() => local).snapshot.entries).toEqual(archive.snapshot.entries);
  });

  it("retains immutable copied nested facts and does not mutate previous snapshots or caller inputs", () => {
    const archive = createChroniclePlateArchive(() => storage());
    const empty = archive.snapshot;
    const source = { ...recipe(), town: { ...recipe().town }, landmarks: [{ ...recipe().landmarks[0]! }] };
    expect(archive.record(source)).toBe(true);
    source.town.name = "Future town";
    source.landmarks[0]!.name = "Future inn";
    expect(empty.entries).toEqual([]);
    const snapshot = archive.snapshot;
    const entry = snapshot.entries[0]!;
    expect(entry.town.name).toBe("Greyford");
    expect(entry.landmarks[0]!.name).toBe("The Badger Inn");
    for (const value of [snapshot, snapshot.entries, entry, entry.town, entry.visit, entry.reputation, entry.landmarks, entry.landmarks[0]]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(source.town)).toBe(false);
  });

  it("evicts oldest insertions at 48 entries deterministically across campaigns", () => {
    const local = storage();
    const archive = createChroniclePlateArchive(() => local);
    for (let tick = 1; tick <= 50; tick += 1) expect(archive.record(recipe(tick, tick % 2 ? "one" : "two"))).toBe(true);
    expect(archive.snapshot.entries).toHaveLength(chroniclePlateMaximumEntries);
    expect(archive.snapshot.entries[0]!.sourceTick).toBe(50);
    expect(archive.snapshot.entries.at(-1)!.sourceTick).toBe(3);
    expect(createChroniclePlateArchive(() => local).snapshot).toEqual(archive.snapshot);
  });

  it("enforces the UTF-8 byte cap independently of the entry cap without cutting names or JSON", () => {
    const local = storage();
    const archive = createChroniclePlateArchive(() => local);
    const locationId = "地".repeat(480);
    for (let tick = 1; tick <= 48; tick += 1) {
      const large = { ...recipe(tick),
        town: { id: `town:${locationId}`, locationId, name: "森".repeat(160), specialty: "茶".repeat(160) },
        landmarks: [0, 1, 2].map((index) => ({ id: `${"館".repeat(510)}${index}`, name: "橋".repeat(160),
          kind: "inn" as const, districtId: "街".repeat(512) })),
      };
      expect(archive.record(large)).toBe(true);
    }
    expect(archive.snapshot.entries.length).toBeLessThan(chroniclePlateMaximumEntries);
    expect(archive.snapshot.entries[0]!.sourceTick).toBe(48);
    const stored = local.saved.get(chroniclePlateArchiveKey)!;
    expect(new TextEncoder().encode(stored).byteLength).toBeLessThanOrEqual(chroniclePlateMaximumBytes);
    expect(createChroniclePlateArchive(() => local).snapshot).toEqual(archive.snapshot);
    expect(archive.snapshot.entries.every((entry) => entry.landmarks[0]!.name === "橋".repeat(160))).toBe(true);
  });

  it.each([
    "not JSON", envelope([], 2), JSON.stringify({ schemaVersion: 1, entries: [], unexpected: true }),
    envelope([recipe(), recipe()]), envelope([{ ...recipe(), sourceTick: 2 }]),
    envelope([{ ...recipe(), town: { ...recipe().town, privateThought: "not allowed" } }]),
    envelope(Array.from({ length: 49 }, (_, index) => recipe(index))),
    " ".repeat(chroniclePlateMaximumBytes + 1),
  ])("preserves an invalid or unsupported stored archive without overwriting it (%#)", (initial) => {
    const local = storage(initial);
    const archive = createChroniclePlateArchive(() => local);
    expect(archive.snapshot).toEqual({ entries: [], persistent: false });
    expect(archive.record(recipe(2))).toBe(true);
    expect(archive.snapshot.entries).toEqual([recipe(2)]);
    expect(archive.snapshot.persistent).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.saved.get(chroniclePlateArchiveKey)).toBe(initial);
  });

  it("does not overwrite storage after a read failure even when writing later becomes available", () => {
    const local = storage(envelope([recipe()]));
    local.getItem.mockImplementationOnce(() => { throw new Error("read denied"); });
    const archive = createChroniclePlateArchive(() => local);
    archive.record(recipe(2));
    expect(archive.snapshot.persistent).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.saved.get(chroniclePlateArchiveKey)).toBe(envelope([recipe()]));
  });

  it("retains a failed write in this page, reports session-only honestly, and can save all entries on a later successful record", () => {
    const local = storage(envelope([recipe()]));
    local.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    const archive = createChroniclePlateArchive(() => local);
    expect(archive.record(recipe(2))).toBe(true);
    expect(archive.snapshot.persistent).toBe(false);
    expect(archive.snapshot.entries.map((entry) => entry.sourceTick)).toEqual([2, 1]);
    expect(createChroniclePlateArchive(() => local).snapshot.entries).toEqual([recipe()]);
    expect(archive.record(recipe(3))).toBe(true);
    expect(archive.snapshot.persistent).toBe(true);
    expect(createChroniclePlateArchive(() => local).snapshot.entries.map((entry) => entry.sourceTick)).toEqual([3, 2, 1]);
  });

  it("ignores malformed records without changing entries, storage, or persistence status", () => {
    const local = storage();
    const archive = createChroniclePlateArchive(() => local);
    for (const invalid of [null, {}, { ...recipe(), sourceEventId: "different:1" }, { ...recipe(), landmarks: [] }]) {
      expect(archive.record(invalid)).toBe(false);
    }
    expect(archive.snapshot).toEqual({ entries: [], persistent: true });
    expect(local.setItem).not.toHaveBeenCalled();
  });
});
