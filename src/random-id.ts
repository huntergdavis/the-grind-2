export type BrowserEntropy = Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>;

function hex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function randomId(source: BrowserEntropy = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  const version = bytes[6];
  const variant = bytes[8];
  if (version === undefined || variant === undefined) throw new Error("Browser entropy source returned too few bytes");
  bytes[6] = (version & 0x0f) | 0x40;
  bytes[8] = (variant & 0x3f) | 0x80;
  const encoded = [...bytes].map(hex).join("");
  return `${encoded.slice(0, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}-${encoded.slice(16, 20)}-${encoded.slice(20)}`;
}
