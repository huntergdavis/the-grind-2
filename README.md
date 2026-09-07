# The Grind 2

An endlessly unfolding, fully client-side RPG screensaver.

**Play:** https://hunterdavis.com/the-grind-2/

Start a fresh adventure with **Play with LLM** or **Play without LLM**. LLM
storytelling runs on your device; without it, the deterministic adventure runs
normally. **Menu → Options** remembers your choice and keeps advanced narration
controls out of the way. A complete saved model is reused when you return.

**Menu → Adventure speed** offers 1x, 2x, 5x, 10x, 25x, 50x and 100x,
remembered in this browser. It speeds up foreground adventure steps; story
reading, cutscenes and offline catch-up keep their own pace. Actual throughput
depends on the device, and Pause remains in control.

**Journal → Narratives** automatically keeps completed accepted stories, even
before their intermission appears. Read this hero or all saved heroes, and export
the displayed stories as JSON. LLM/authored labels and paired character voices
stay intact. The newest 200 stories (up to 256 KiB total) survive reload and
No LLM in this browser; if storage fails, export the session copy to keep it.
This is an imagined-story archive, separate from game saves. Previous prose is
not yet fed into the next model prompt.

**Focus** is a top-level toggle beside Pause and Menu, including in the compact
layout. It hides ordinary battle/duel information rails as well as full HUD
panels; fighters, vital cues and narrative cutscenes remain. Recaps wait for
intentional reading through Adventure panels instead of opening over Focus.

```sh
npm install
npm run dev
```

See [the plan](PLAN.md) and [backlog](BACKLOG.md).
