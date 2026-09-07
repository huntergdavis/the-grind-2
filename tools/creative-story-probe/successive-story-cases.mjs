/** Public synthetic fixtures, not recorded gameplay and not authored narrative examples. */
export function isExactRecalledPassage(text, continuity) {
  return typeof text === 'string' && continuity.some((memory) => memory.text === text);
}

export function createSuccessiveStoryCases() {
  const campaignId = 'synthetic:successive-story-proof';
  return [
    {
      id: 'injured-companion-on-the-road', mode: 'travel',
      facts: {
        location: 'Road to Greyford',
        headline: 'Mara and injured Rowan continue toward Greyford.',
        action: 'Mara travelled beside Rowan toward their shared-road oath destination, Greyford.',
        consequence: 'Both remain alive. Rowan is still injured, travelling with Mara; they have not arrived.',
      },
      status: 'injured',
      expected: 'Named Mara and Rowan; care or worry about the unfinished shared road, without healing, death, departure, or invented past events.',
    },
    {
      id: 'injured-companion-arrives-alive', mode: 'town',
      facts: {
        location: 'Greyford',
        headline: 'Mara and Rowan reach their shared-road oath destination.',
        action: 'Mara arrived at Greyford alongside Rowan, completing their journey to the oath destination.',
        consequence: 'Both arrived alive. Rowan remains injured and beside Mara; no recovery or departure occurred.',
      },
      status: 'arrived-injured',
      expected: 'Named Mara and Rowan; a traceable earlier concern develops through arrival into relief with continuing care. Rowan remains alive, injured and present; no healing, departure or invented past events.',
    },
  ].map((fixture, index) => {
    const job = {
      schemaVersion: 1, task: 'author-story-beat', disposition: 'manual-ephemeral-noncanonical',
      campaignId, eventId: `synthetic:${fixture.id}`, tick: 20 + index,
      sourceFingerprint: index === 0 ? '1111111111111111' : '2222222222222222',
      facts: { schemaVersion: 1, kind: 'public-story-beat', ...fixture.facts },
      deterministicFallback: fixture.facts.headline, maximumInputTokens: 320, maximumOutputTokens: 48,
    };
    return {
      id: fixture.id, fixtureKind: 'synthetic-public-successive-scene',
      mode: fixture.mode, focus: 'shared-road', facts: fixture.facts, job,
      viewpoint: { hero: { name: 'Mara', values: ['loyalty', 'mercy'] },
        companion: { name: 'Rowan', role: 'miller', status: fixture.status,
          purpose: 'shared-road-oath', victories: 1 } },
      identity: JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]),
      attempt: 0, expected: fixture.expected,
    };
  });
}
