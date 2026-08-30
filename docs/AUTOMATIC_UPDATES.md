# Automatic deployment updates

The Grind 2 is designed to stay open for very long adventures. Every build
publishes one explicit version in `package.json`, `public/version.json`, the
compiled client, and the service-worker cache name. `npm run check:version`
rejects a release when those markers disagree.

After the initial campaign is loaded and safely persisted, the client checks
`version.json` immediately. A current deployment schedules the next check for a
fresh random delay from 60 through 75 minutes, including seconds. Failed or
malformed checks do not interrupt play and retry on the same randomized cadence.
Every request uses `cache: no-store` and a unique query value. The service worker
also treats the manifest as network-only, so a stale cache cannot hide a release.

When the deployed version is semantically newer (an equal or older manifest is
treated as current, preventing reload loops during CDN skew or rollback):

1. A hidden tab defers the update until it becomes visible.
2. A visible tab enters the same serialized interaction boundary used by campaign
   changes, waits for an active simulation beat, and persists the current state.
3. Only after persistence succeeds does the page reload. If saving fails, play
   continues on the current build and the monitor retries later.

Navigation is network-first. Service workers use the browser's natural waiting
lifecycle: a new worker does not force control of other open tabs or delete their
active cache. It activates and removes older versioned caches after every tab
using the previous worker has closed.

Before reloading, the client records the source version, target version, and
attempt time in session storage. If the same old build returns under the same
newer manifest, it will not try that target again for at least one hour. This
prevents a partial deployment or failed navigation from creating a reload loop
while still allowing a later retry.

This lifecycle follows the W3C [Service Workers specification](https://www.w3.org/TR/service-workers/),
particularly its update, waiting, activation, and cache-bypass mechanisms.
