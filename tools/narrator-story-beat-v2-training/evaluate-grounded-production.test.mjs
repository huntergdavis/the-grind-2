import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, "../..");
const groundedEvaluator = resolve(toolDirectory, "evaluate_grounded.py");

const candidateScript = String.raw`
import importlib.util
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("grounded_v2_production_test", path)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load grounded evaluator")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prompts = json.load(sys.stdin)
rows = []
for entry in prompts:
    if set(entry) != {"id", "prompt"}:
        raise ValueError("prompt projection differs")
    facts = module.factual_story_beat_facts_from_prompt(entry["prompt"])
    rows.append({
        "id": entry["id"],
        "forms": [form.text for form in module.story_beat_forms(facts)],
    })
json.dump(rows, sys.stdout, ensure_ascii=False, separators=(",", ":"))
`;

test("every target-free Python candidate passes the production V2 validator", async () => {
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const [corpusModule, contractModule, formModule] = await Promise.all([
      server.ssrLoadModule("/src/narrator/story-beat-v2-training-corpus.ts"),
      server.ssrLoadModule("/src/narrator/story-beat-v2.ts"),
      server.ssrLoadModule("/src/narrator/story-beat-v2-form-selection.ts"),
    ]);
    assert.equal(
      corpusModule.isFactualStoryBeatTrainingCorpusV2(
        corpusModule.factualStoryBeatTrainingCorpusV2,
      ),
      true,
    );
    const productionRows = corpusModule.factualStoryBeatTrainingCorpusV2.cases
      .filter((entry) => entry.split === "holdout");
    const promptProjection = productionRows.map(({ id, prompt }) => ({
      id,
      prompt,
    }));
    assert.equal(
      promptProjection.some((entry) => Object.hasOwn(entry, "target")),
      false,
    );

    const generated = spawnSync(
      "python3",
      ["-c", candidateScript, groundedEvaluator],
      {
        cwd: repositoryRoot,
        input: JSON.stringify(promptProjection),
        encoding: "utf8",
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONHASHSEED: "20260906",
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(generated.stderr, "");
    const candidateRows = JSON.parse(generated.stdout);
    assert.equal(candidateRows.length, 200);

    const productionById = new Map(
      productionRows.map((entry) => [entry.id, entry]),
    );
    let formCount = 0;
    let minimumForms = Number.POSITIVE_INFINITY;
    let maximumForms = 0;
    for (const row of candidateRows) {
      assert.deepEqual(Object.keys(row).sort(), ["forms", "id"]);
      const production = productionById.get(row.id);
      assert.notEqual(production, undefined);
      assert.equal(Array.isArray(row.forms), true);
      assert.deepEqual(
        formModule.factualStoryBeatFormsV2(production.facts)
          .map((form) => form.text),
        row.forms,
        `${row.id}: browser form catalog differs from grounded evaluator`,
      );
      minimumForms = Math.min(minimumForms, row.forms.length);
      maximumForms = Math.max(maximumForms, row.forms.length);
      for (const form of row.forms) {
        assert.equal(
          contractModule.validateFactualStoryBeatResultV2(
            form,
            production.facts,
          ),
          form,
          `${row.id}: ${form}`,
        );
        formCount += 1;
      }
    }
    assert.deepEqual(
      {
        rows: candidateRows.length,
        formCount,
        minimumForms,
        maximumForms,
      },
      {
        rows: 200,
        formCount: 3612,
        minimumForms: 6,
        maximumForms: 24,
      },
    );
  } finally {
    await server.close();
  }
});
