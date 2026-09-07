import { captureFarewellRemembrance } from "../narrator/farewell-remembrance";
import type { HeldNarrative } from "./creative-story-director";
import { normalizeNarrativeDirection } from "../narrator/creative-direction";
import { normalizeCreativeMomentSelection } from "../narrator/creative-moment";

/** One already-presented passage for intentional rereading, never model memory or a save. */
export function createLastPresentedStory(initialCampaignId: string) {
  let campaignId = initialCampaignId;
  let last: HeldNarrative | null = null;

  return {
    syncCampaign(nextCampaignId: string): void {
      if (nextCampaignId === campaignId) return;
      campaignId = nextCampaignId;
      last = null;
    },
    /** The host calls this only after successfully showing a new automatic story. */
    remember(passage: HeldNarrative): boolean {
      if (passage.campaignId !== campaignId) return false;
      const momentSelection = normalizeCreativeMomentSelection(passage.momentSelection);
      last = Object.freeze({
        text: passage.text,
        location: passage.location,
        headline: passage.headline,
        campaignId: passage.campaignId,
        sourceTick: passage.sourceTick,
        readyAtMs: passage.readyAtMs,
        inspirationTone: passage.inspirationTone,
        origin: passage.origin,
        ...(passage.direction === undefined ? {} : { direction: normalizeNarrativeDirection(passage.direction) }),
        ...(momentSelection === null ? {} : { momentSelection }),
        ...(passage.remembrance === undefined
          ? {} : { remembrance: captureFarewellRemembrance(passage.remembrance) }),
      });
      return true;
    },
    /** Reading neither consumes the passage nor touches the director's newer draft. */
    get(currentCampaignId: string): HeldNarrative | null {
      return currentCampaignId === campaignId ? last : null;
    },
  };
}
