import { describe, expect, it } from "vitest";
import {
  defaultStageChromeMode,
  parseStageChromeMode,
  resolveStageChromeMode,
  shouldOpenCompactPanelsDrawer,
  toggledStageChromeMode,
} from "./stage-focus";

describe("responsive Stage Focus", () => {
  it("defaults compact viewports to Focus and larger viewports to Panels", () => {
    expect(defaultStageChromeMode(true)).toBe("focus");
    expect(defaultStageChromeMode(false)).toBe("panels");
    expect(resolveStageChromeMode(null, true)).toEqual({ mode: "focus", explicit: false });
    expect(resolveStageChromeMode(null, false)).toEqual({ mode: "panels", explicit: false });
  });

  it("accepts only exact version-one preferences", () => {
    expect(parseStageChromeMode("focus")).toBe("focus");
    expect(parseStageChromeMode("panels")).toBe("panels");
    for (const invalid of [null, "", "standard", "FOCUS", " focus", "__proto__"]) {
      expect(parseStageChromeMode(invalid)).toBeNull();
    }
  });

  it("lets an explicit preference override either responsive default", () => {
    expect(resolveStageChromeMode("panels", true)).toEqual({ mode: "panels", explicit: true });
    expect(resolveStageChromeMode("focus", false)).toEqual({ mode: "focus", explicit: true });
    expect(resolveStageChromeMode("invalid", true)).toEqual({ mode: "focus", explicit: false });
  });

  it("toggles symmetrically", () => {
    expect(toggledStageChromeMode("panels")).toBe("focus");
    expect(toggledStageChromeMode("focus")).toBe("panels");
  });

  it("admits the runtime-only drawer only from compact focused Watch", () => {
    expect(shouldOpenCompactPanelsDrawer(true, "focus", "watch")).toBe(true);
    expect(shouldOpenCompactPanelsDrawer(false, "focus", "watch")).toBe(false);
    expect(shouldOpenCompactPanelsDrawer(true, "panels", "watch")).toBe(false);
    expect(shouldOpenCompactPanelsDrawer(true, "focus", "map")).toBe(false);
  });
});
