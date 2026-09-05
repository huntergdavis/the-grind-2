import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  assertCommittedSourceSnapshot,
  evidenceForCommit,
} from "../../narrator-browser-evaluation/run-support.mjs";

const executeFile = promisify(execFile);

async function git(root, ...arguments_) {
  return executeFile("git", arguments_, { cwd: root });
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "grind2-story-beat-provenance-test-"));
  await git(root, "init", "--quiet");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await git(root, "config", "user.name", "Fixture");
  await mkdir(resolve(root, "tool"));
  await writeFile(resolve(root, "tool/runtime.mjs"), "export const version = 1;\n");
  await writeFile(resolve(root, "tool/contract.ts"), "export const contract = 1;\n");
  await git(root, "add", "tool/runtime.mjs", "tool/contract.ts");
  await git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

test("binds source evidence to one clean, retrievable commit", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const paths = ["tool/runtime.mjs", "tool/contract.ts"];
  const commit = await assertCommittedSourceSnapshot({ repositoryRoot: root, sourcePaths: paths });
  assert.match(commit, /^[0-9a-f]{40}$/u);
  const evidence = await evidenceForCommit({ repositoryRoot: root, sourcePaths: paths, sourceCommit: commit });
  assert.deepEqual(evidence.map((entry) => entry.path), [...paths].sort());
  assert.equal(evidence.every((entry) => /^[0-9a-f]{64}$/u.test(entry.sha256)), true);
});

test("refuses relevant untracked, worktree-dirty, and index-dirty source", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const tracked = ["tool/runtime.mjs", "tool/contract.ts"];

  await writeFile(resolve(root, "tool/untracked.ts"), "export const hidden = true;\n");
  await assert.rejects(
    assertCommittedSourceSnapshot({ repositoryRoot: root, sourcePaths: [...tracked, "tool/untracked.ts"] }),
    /not tracked/u,
  );

  await writeFile(resolve(root, "tool/runtime.mjs"), "export const version = 2;\n");
  await assert.rejects(
    assertCommittedSourceSnapshot({ repositoryRoot: root, sourcePaths: tracked }),
    /differs/u,
  );

  await git(root, "add", "tool/runtime.mjs");
  await assert.rejects(
    assertCommittedSourceSnapshot({ repositoryRoot: root, sourcePaths: tracked }),
    /differs/u,
  );
});
