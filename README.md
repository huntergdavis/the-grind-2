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
This is an imagined-story archive, separate from game saves. With LLM enabled,
the next draft can recall up to two short earlier passages from the same hero's
adventure, including named voices. Current scene facts take priority; older
prose is omitted if needed to stay within the existing model input budget.
This is bounded story continuity, not permanent emotional state or a guarantee
that the experimental small model will follow every thread.

**Watch** keeps the scene clear: compact named character portraits, exact health
and mana bars, and one current status replace the permanent wall of statistics.
An injured companion stays visibly injured, not dead; companion portraits only
show health. **Character** opens full details in Adventure panels. Inventory,
Skills, Map and Journal remain available for deliberate inspection.

**Focus** is a top-level toggle beside Pause and Menu. It also clears navigation
chrome; the compact character strip and narrative cutscenes remain. Analytical
battle/duel labels stay off the actors in both Watch layouts. Recaps wait for
intentional reading through Adventure panels instead of opening over Focus.

```sh
npm install
npm run dev
```

See [the plan](PLAN.md) and [backlog](BACKLOG.md).
