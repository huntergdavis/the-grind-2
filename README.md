# The Grind 2

An autonomous fantasy RPG built to be watched.

**Play it:** [hunterdavis.com/the-grind-2](https://hunterdavis.com/the-grind-2/)

The Grind 2 is a living screensaver: heroes travel, explore towns and dungeons,
fight, learn, make companions, and leave an inspectable history behind. It
plays itself, but every important event is grounded in the same deterministic
game state that drives the world.

## What is in v1.0

- Autonomous travel, quests, tactical combat, dungeons, towns, equipment, and
  a growing cast of companions.
- Story-rich encounters including flyting, original books that unlock language
  choices, board-game expeditions, jobs, reunions, and lasting callbacks.
- A clean watch-first interface with Focus mode, speed controls up to 100×,
  portraits and resource bars, and detailed information tucked into Adventure,
  Map, Codex, and Journal tabs.
- Chronicle Plates and journals that preserve meaningful firsts, discoveries,
  readings, conversations, and campaign history in the browser.
- Optional on-device LLM narration. Start with or without it; the deterministic
  game is complete either way. When enabled, narration runs client-side and
  stays out of the action until a story intermission is ready.

## Run locally

```sh
npm install
npm run dev
```

## Design

The project is client-side, local-first, and deliberately bounded: narrative
presentation may be imaginative, while gameplay facts, saves, and outcomes stay
verifiable. See the [roadmap](ROADMAP.md) for future work and [backlog](BACKLOG.md)
for shipped history.
