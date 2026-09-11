import { describe, expect, it } from "vitest";
import { createReparteeDwell, reparteeDwellPending, updateReparteeDwell } from "./repartee-dwell";

describe("visible repartee reading time", () => {
  it("holds each source for eight seconds regardless of how often the adventure loop polls", () => {
    const started = updateReparteeDwell(createReparteeDwell(), "hero-a:read", 100, true);
    expect(reparteeDwellPending(started, true)).toBe(true);
    const almost = updateReparteeDwell(started, "hero-a:read", 8_099, true);
    expect(reparteeDwellPending(almost, true)).toBe(true);
    const done = updateReparteeDwell(almost, "hero-a:read", 8_100, true);
    expect(reparteeDwellPending(done, true)).toBe(false);
    let frequent = started;
    for (let now = 150; now <= 8_100; now += 50) frequent = updateReparteeDwell(frequent, "hero-a:read", now, true);
    expect(frequent.elapsedMs).toBe(done.elapsedMs);
    expect(started.elapsedMs).toBe(0);
  });

  it("freezes elapsed time across pause, hidden tabs, and another presentation without resume debt", () => {
    let clock = updateReparteeDwell(createReparteeDwell(), "hero-a:round-1", 0, true);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 3_000, false);
    expect(clock.elapsedMs).toBe(3_000);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 800_000, false);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 900_000, true);
    expect(clock.elapsedMs).toBe(3_000);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 904_999, true);
    expect(reparteeDwellPending(clock, true)).toBe(true);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 905_000, true);
    expect(reparteeDwellPending(clock, true)).toBe(false);
  });

  it("starts a fresh hold on each new command and campaign, without transferring old credit", () => {
    let clock = updateReparteeDwell(createReparteeDwell(), "hero-a:read", 0, true);
    clock = updateReparteeDwell(clock, "hero-a:read", 80_000, true);
    expect(clock.elapsedMs).toBe(8_000);
    clock = updateReparteeDwell(clock, "hero-a:round-1", 80_100, true);
    expect(clock.elapsedMs).toBe(0);
    clock = updateReparteeDwell(clock, "hero-b:round-1", 80_200, true);
    expect(clock.elapsedMs).toBe(0);
    expect(clock.sourceKey).toBe("hero-b:round-1");
    clock = updateReparteeDwell(clock, null, 80_300, true);
    expect(clock.running).toBe(false);
    expect(reparteeDwellPending(clock, true)).toBe(false);
  });

  it("does not freeze other inspection tabs and admits only the explicit fast fixture bypass", () => {
    const clock = updateReparteeDwell(createReparteeDwell(), "hero:book", 0, true);
    expect(reparteeDwellPending(clock, false)).toBe(false);
    expect(reparteeDwellPending(clock, true, true)).toBe(false);
    expect(reparteeDwellPending(clock, true, false)).toBe(true);
  });

  it("does not add time for repeated or invalid samples", () => {
    let clock = updateReparteeDwell(createReparteeDwell(), "hero:book", 100, true);
    clock = updateReparteeDwell(clock, "hero:book", 100, true);
    clock = updateReparteeDwell(clock, "hero:book", Number.NaN, true);
    clock = updateReparteeDwell(clock, "hero:book", 10, true);
    expect(clock.elapsedMs).toBe(0);
    expect(clock.sampledAtMs).toBe(100);
    expect(Number.isFinite(clock.sampledAtMs)).toBe(true);
  });
});
