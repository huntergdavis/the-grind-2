import { describe, expect, it } from "vitest";
import { stageInformationVisible } from "./stage-information";

describe("ordinary stage information visibility", () => {
  it("hides analytical information in focused Watch", () => {
    expect(stageInformationVisible("watch", "focus")).toBe(false);
  });

  it.each(["panels", undefined, "unknown"])("retains information in Watch with %s chrome", (mode) => {
    expect(stageInformationVisible("watch", mode)).toBe(true);
  });

  it.each(["map", "inventory", "journal", "codex", "spellbook", "hall", undefined])(
    "does not apply Watch hiding to %s", (view) => {
      expect(stageInformationVisible(view, "focus")).toBe(true);
      expect(stageInformationVisible(view, "panels")).toBe(true);
    },
  );

  it("changes immediately and symmetrically without keeping a prior mode", () => {
    expect(["panels", "focus", "panels", "focus"].map((mode) => stageInformationVisible("watch", mode)))
      .toEqual([true, false, true, false]);
  });
});
