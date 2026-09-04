import type { NarratorBrowserStagedArtifactV2 } from "../../../src/narrator/evaluation-browser-assets-v2";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "../../../src/narrator/protocol";

export interface NarratorBrowserAcquisitionItemV2 {
  readonly path: string;
  readonly url: string;
}

function denseItems(value: unknown): value is readonly NarratorBrowserAcquisitionItemV2[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return false;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!Object.hasOwn(value, index)
      || !isNarratorRecord(item)
      || !narratorHasExactKeys(item, ["path", "url"])
      || !isNarratorBoundedText(item.path, 240)
      || !isNarratorBoundedText(item.url, 500)) return false;
  }
  return true;
}

export async function acquireNarratorBrowserArtifactsV2(
  value: unknown,
): Promise<readonly NarratorBrowserStagedArtifactV2[]> {
  if (!denseItems(value)) throw new TypeError("Narrator browser acquisition manifest is invalid");
  const paths = new Set(value.map((item) => item.path));
  if (paths.size !== value.length) throw new TypeError("Narrator browser acquisition paths are duplicated");
  const staged: NarratorBrowserStagedArtifactV2[] = [];
  for (const item of value) {
    const url = new URL(item.url, globalThis.location.href);
    if (url.origin !== globalThis.location.origin
      || !url.pathname.startsWith("/__narrator_staging__/")
      || url.search !== ""
      || url.hash !== "") {
      throw new TypeError("Narrator browser acquisition URL is outside the staging origin");
    }
    const result = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit" });
    if (!result.ok) throw new Error(`Narrator browser acquisition failed: ${item.path}`);
    staged.push(Object.freeze({ path: item.path, bytes: await result.arrayBuffer() }));
  }
  return Object.freeze(staged);
}
