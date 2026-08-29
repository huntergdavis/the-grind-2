import { describe, expect, it } from "vitest";
import { randomId, type BrowserEntropy } from "./random-id";

describe("browser random identifiers", () => {
  it("uses a native random UUID when the secure-context API exists", () => {
    const source = {
      randomUUID: () => "12345678-1234-4123-8123-123456789abc",
      getRandomValues: <T extends ArrayBufferView | null>(value: T): T => value,
    } satisfies BrowserEntropy;
    expect(randomId(source)).toBe("12345678-1234-4123-8123-123456789abc");
  });

  it("creates a v4 UUID from Web Crypto entropy on an HTTP LAN origin", () => {
    const source = {
      getRandomValues: <T extends ArrayBufferView | null>(value: T): T => {
        if (value instanceof Uint8Array) value.set(Array.from({ length: 16 }, (_, index) => index));
        return value;
      },
    } satisfies BrowserEntropy;
    expect(randomId(source)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
