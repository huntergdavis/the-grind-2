import { captureFarewellRemembrance } from "../narrator/farewell-remembrance";
import { captureFirstSharedVictory } from "../narrator/first-shared-victory";
import type { HeldNarrative } from "./creative-story-director";
import { normalizeNarrativeDirection } from "../narrator/creative-direction";
import { normalizeCreativeMomentSelection } from "../narrator/creative-moment";
import { captureStoryDuet } from "../narrator/story-duet";
import { captureStoryVoiceInspiration } from "../narrator/story-voice-inspiration";

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
      const inspiration = captureStoryVoiceInspiration(passage.voiceInspiration);
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
        ...(passage.firstVictory === undefined
          ? {} : { firstVictory: captureFirstSharedVictory(passage.firstVictory) }),
        ...(passage.duet === undefined ? {} : { duet: captureStoryDuet(passage.duet) }),
        ...(passage.origin !== "authored" || passage.duet !== undefined || inspiration === null
          || inspiration.text !== passage.text || inspiration.heroName !== passage.remembrance?.heroName
          ? {} : { voiceInspiration: inspiration }),
      });
      return true;
    },
    /** Reading neither consumes the passage nor touches the director's newer draft. */
    get(currentCampaignId: string): HeldNarrative | null {
      return currentCampaignId === campaignId ? last : null;
    },
  };
}
