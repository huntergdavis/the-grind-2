import type { NarratorVerifiedBrowserAssetClosureV2 } from "../../../src/narrator/evaluation-browser-assets-v2";
import type { NarratorModelCandidate } from "../../../src/narrator/model-candidate";

export function createNarratorVerifiedModelFetchV2(
  verified: NarratorVerifiedBrowserAssetClosureV2,
  candidate: NarratorModelCandidate,
  origin: string,
  onRead: (path: string) => void,
): (input: string | URL, init?: RequestInit) => Promise<Response> {
  const trustedOrigin = new URL(origin).origin;
  const root = `/__verified_narrator__/${candidate.model.repository}/`;
  return async (input, init = {}) => {
    const method = init.method ?? "GET";
    const url = new URL(String(input), trustedOrigin);
    if (method !== "GET"
      || url.origin !== trustedOrigin
      || !url.pathname.startsWith(root)
      || url.search !== ""
      || url.hash !== "") {
      throw new TypeError("Narrator model loader requested an unauthorized resource");
    }
    const path = decodeURIComponent(url.pathname.slice(root.length));
    const blob = verified.modelArtifactBlob(path);
    onRead(path);
    return new Response(blob, {
      status: 200,
      headers: {
        "content-length": String(blob.size),
        "content-type": blob.type,
      },
    });
  };
}
