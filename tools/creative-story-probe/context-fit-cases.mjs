export const contextFitCaseModes = Object.freeze({
  'rested-curious-hero': 'discovery',
  'newly-sworn-companion': 'travel',
  'injured-active-companion': 'camp',
});

/** Reuse the exact historical synthetic public facts, viewpoints, and foci. */
export function createContextFitCases(baseline) {
  if (baseline.outputs?.length !== 3) throw new Error('Expected three historical synthetic viewpoint fixtures');
  return Object.entries(contextFitCaseModes).map(([id, mode]) => {
    const fixture = baseline.outputs.find((row) => row.id === id);
    if (!fixture?.facts || !fixture.viewpoint || !fixture.focus) throw new Error(`Missing historical fixture: ${id}`);
    const job = {
      schemaVersion: 1, task: 'author-story-beat', disposition: 'manual-ephemeral-noncanonical',
      campaignId: 'synthetic:viewpoint-probe', eventId: `synthetic:${id}`, tick: 3,
      sourceFingerprint: '0123456789abcdef',
      facts: { schemaVersion: 1, kind: 'public-story-beat', ...fixture.facts },
      deterministicFallback: fixture.facts.headline, maximumInputTokens: 320, maximumOutputTokens: 48,
    };
    return {
      id, mode, focus: fixture.focus, facts: fixture.facts, viewpoint: fixture.viewpoint,
      expected: fixture.expected, job,
      identity: JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]),
      attempt: 0,
      historical: {
        seed: fixture.seed, messages: fixture.messages, raw: fixture.raw,
        cleaned: fixture.cleaned, generationMs: fixture.generationMs,
      },
    };
  });
}
