import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCommittedSourceSnapshot,
  createNarratorFullRunEvidenceSet,
  createPrivateOutputDirectory,
  evidenceForCommit,
  parseNarratorBrowserArguments,
  readPrivateNarratorSalt,
  resolveNarratorOutputDirectory,
  sha256,
  writePrivateEvidenceFile,
  writePrivateJsonEvidence,
} from "../run-support.mjs";

const executeFile = promisify(execFile);
const runEntry = fileURLToPath(new URL("../run.mjs", import.meta.url));
const temporaryRoots = [];

async function temporaryRoot(label) {
  const root = await mkdtemp(join(tmpdir(), `the-grind-2-${label}-`));
  temporaryRoots.push(root);
  return root;
}

async function writeWithMode(path, content, mode = 0o600) {
  await writeFile(path, content, { mode });
  await chmod(path, mode);
}

async function outputLayout(label = "output") {
  const root = await temporaryRoot(label);
  const repositoryRoot = join(root, "repository");
  const diagnosticDist = join(
    repositoryRoot,
    "tools/narrator-browser-evaluation/.narrator-browser-evaluation-dist",
  );
  const externalParent = join(root, "external");
  await mkdir(diagnosticDist, { recursive: true });
  await mkdir(externalParent);
  await writeFile(join(repositoryRoot, ".gitignore"), ".narrator-browser-evaluation-dist/\n");
  await executeFile("git", ["init", "-q"], { cwd: repositoryRoot });
  return { root, repositoryRoot, diagnosticDist, externalParent };
}

async function sourceRepository() {
  const repositoryRoot = await temporaryRoot("source");
  await executeFile("git", ["init", "-q"], { cwd: repositoryRoot });
  await executeFile("git", ["config", "user.email", "narrator-test@example.invalid"], { cwd: repositoryRoot });
  await executeFile("git", ["config", "user.name", "Narrator Test"], { cwd: repositoryRoot });
  const text = "Caf\u00e9 in the ruins\n";
  const binary = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x0a]);
  await writeFile(join(repositoryRoot, "source.txt"), text);
  await writeFile(join(repositoryRoot, "binary.bin"), binary);
  await executeFile("git", ["add", "source.txt", "binary.bin"], { cwd: repositoryRoot });
  await executeFile("git", ["commit", "-q", "-m", "fixture"], { cwd: repositoryRoot });
  return { repositoryRoot, text, binary, sourcePaths: ["source.txt", "binary.bin"] };
}

afterEach(async () => {
  const roots = temporaryRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("narrator browser argument parsing", () => {
  it("accepts only complete, exact smoke and run forms", () => {
    const smoke = parseNarratorBrowserArguments([
      "smoke", "--model-dir", "/model", "--run-id", "run:smoke", "--out", "/output",
    ]);
    expect(smoke).toEqual({ mode: "smoke", "model-dir": "/model", "run-id": "run:smoke", out: "/output" });
    expect(Object.isFrozen(smoke)).toBe(true);

    expect(parseNarratorBrowserArguments([
      "run",
      "--model-dir", "/model",
      "--run-id", "run:full",
      "--out", "/output",
      "--sheet-id", "sheet:full",
      "--secret-salt-file", "/private/salt",
      "--adapter-receipt", "/private/receipt",
    ])).toMatchObject({ mode: "run", "sheet-id": "sheet:full" });

    for (const malformed of [
      [],
      ["unknown"],
      ["smoke", "--model-dir", "/model", "--run-id", "run", "--out"],
      ["smoke", "--model-dir", "/model", "--run-id", "run", "--out", "/one", "--out", "/two"],
      ["smoke", "--model-dir", "/model", "--run-id", "run", "--out", "/one", "--sheet-id", "sheet"],
      ["run", "--model-dir", "/model", "--run-id", "run", "--out", "/one"],
      [
        "run", "--model-dir", "/model", "--run-id", "run", "--out", "/one",
        "--sheet-id", "sheet", "--secret-salt", "forbidden", "--adapter-receipt", "/receipt",
      ],
      ["smoke", "--model-dir", "", "--run-id", "run", "--out", "/one"],
    ]) expect(parseNarratorBrowserArguments(malformed)).toBeNull();
  });
});

describe("narrator browser evidence paths", () => {
  it("permits ignored smoke output but requires full-run output outside the repository", async () => {
    const layout = await outputLayout();
    const ignoredSmoke = join(layout.diagnosticDist, "smoke-evidence");
    const externalRun = join(layout.externalParent, "run-evidence");
    await expect(resolveNarratorOutputDirectory({
      requestedPath: ignoredSmoke,
      mode: "smoke",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).resolves.toBe(ignoredSmoke);
    await expect(resolveNarratorOutputDirectory({
      requestedPath: ignoredSmoke,
      mode: "run",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow("outside the repository");
    await expect(resolveNarratorOutputDirectory({
      requestedPath: externalRun,
      mode: "run",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).resolves.toBe(externalRun);
  });

  it("rejects unignored, pre-existing, missing-parent, and symlink-resolved repository targets", async () => {
    const layout = await outputLayout("unsafe-output");
    const repositoryChild = join(layout.repositoryRoot, "evidence");
    await expect(resolveNarratorOutputDirectory({
      requestedPath: repositoryChild,
      mode: "smoke",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow("diagnostic build directory");

    await writeFile(join(layout.repositoryRoot, ".gitignore"), "");
    await expect(resolveNarratorOutputDirectory({
      requestedPath: join(layout.diagnosticDist, "not-ignored"),
      mode: "smoke",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow("ignored by Git");

    const existing = join(layout.externalParent, "existing");
    await mkdir(existing);
    await expect(resolveNarratorOutputDirectory({
      requestedPath: existing,
      mode: "run",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow("must not already exist");

    await expect(resolveNarratorOutputDirectory({
      requestedPath: join(layout.root, "missing", "child"),
      mode: "run",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow();

    const linkedParent = join(layout.root, "linked-repository");
    await symlink(layout.repositoryRoot, linkedParent, "dir");
    await expect(resolveNarratorOutputDirectory({
      requestedPath: join(linkedParent, "secret-evidence"),
      mode: "run",
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
      diagnosticDist: layout.diagnosticDist,
    })).rejects.toThrow("outside the repository");
  });

  it("creates exact-mode directories and exclusive exact-mode evidence files", async () => {
    const root = await temporaryRoot("private-output");
    const output = join(root, "new-output");
    await createPrivateOutputDirectory(output);
    expect((await lstat(output)).mode & 0o777).toBe(0o700);
    await expect(createPrivateOutputDirectory(output)).rejects.toThrow();

    const evidence = join(output, "evidence.json");
    await writePrivateEvidenceFile(evidence, "first\n");
    const metadata = await lstat(evidence);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.mode & 0o777).toBe(0o600);
    await expect(writePrivateEvidenceFile(evidence, "second\n")).rejects.toThrow();
    expect(await readFile(evidence, "utf8")).toBe("first\n");

    const target = join(output, "target.json");
    const linked = join(output, "linked.json");
    await writeWithMode(target, "target\n");
    await symlink(target, linked);
    await expect(writePrivateEvidenceFile(linked, "replacement\n")).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("target\n");
  });

  it("retains the validated adapter receipt in an exactly bound five-file run set", async () => {
    const hashes = ["1", "2", "3", "4"].map((value) => value.repeat(16));
    const adapterReceipt = { contentHash: hashes[0], receipt: "adapter" };
    const runReceipt = { contentHash: hashes[1], receipt: "run" };
    const blindSheet = { contentHash: hashes[2], receipt: "sheet" };
    const blindKey = { contentHash: hashes[3], receipt: "key" };
    const runPackage = {
      adapterBuildReceiptHash: hashes[0],
      runReceiptHash: hashes[1],
      blindSheetHash: hashes[2],
      blindKeyHash: hashes[3],
      modelAdmitted: false,
      displayAuthorized: false,
    };
    const evidenceSet = createNarratorFullRunEvidenceSet({
      adapterReceipt, runReceipt, blindSheet, blindKey, runPackage,
    });
    expect(evidenceSet.map(({ name }) => name)).toEqual([
      "adapter-build-receipt.json",
      "run-receipt.json",
      "blind-sheet.json",
      "blind-key.json",
      "run-package.json",
    ]);
    expect(Object.isFrozen(evidenceSet)).toBe(true);
    expect(evidenceSet.every(Object.isFrozen)).toBe(true);

    const root = await temporaryRoot("full-evidence");
    const output = join(root, "run");
    await createPrivateOutputDirectory(output);
    await Promise.all(evidenceSet.map(({ name, value }) =>
      writePrivateJsonEvidence(join(output, name), value)));
    expect(JSON.parse(await readFile(join(output, "adapter-build-receipt.json"), "utf8")))
      .toEqual(adapterReceipt);
    for (const { name } of evidenceSet) {
      expect((await lstat(join(output, name))).mode & 0o777).toBe(0o600);
    }

    const fieldNames = [
      "adapterBuildReceiptHash", "runReceiptHash", "blindSheetHash", "blindKeyHash",
    ];
    for (const name of fieldNames) {
      expect(() => createNarratorFullRunEvidenceSet({
        adapterReceipt,
        runReceipt,
        blindSheet,
        blindKey,
        runPackage: { ...runPackage, [name]: "f".repeat(16) },
      })).toThrow("bindings are invalid");
    }
  });
});

describe("narrator private salt", () => {
  it("accepts only an external exact-mode regular file and never reports its value", async () => {
    const layout = await outputLayout("salt");
    const salt = "a".repeat(64);
    const valid = join(layout.externalParent, "salt.txt");
    await writeWithMode(valid, `${salt}\n`);
    await expect(readPrivateNarratorSalt({
      requestedPath: valid,
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
    })).resolves.toBe(salt);

    const invalidCases = [
      ["short.txt", "short\n", 0o600],
      ["whitespace.txt", `${"b".repeat(43)} embedded\n`, 0o600],
      ["oversized.txt", `${"c".repeat(241)}\n`, 0o600],
      ["permissive.txt", `${"d".repeat(64)}\n`, 0o644],
    ];
    for (const [name, content, mode] of invalidCases) {
      const path = join(layout.externalParent, name);
      await writeWithMode(path, content, mode);
      try {
        await readPrivateNarratorSalt({
          requestedPath: path,
          cwd: layout.root,
          repositoryRoot: layout.repositoryRoot,
        });
        throw new Error("Expected invalid salt to fail");
      } catch (error) {
        expect(String(error)).not.toContain(content.trim());
      }
    }

    const insideRepository = join(layout.repositoryRoot, "salt.txt");
    await writeWithMode(insideRepository, `${"e".repeat(64)}\n`);
    await expect(readPrivateNarratorSalt({
      requestedPath: insideRepository,
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
    })).rejects.toThrow("outside the repository");

    const directory = join(layout.externalParent, "salt-directory");
    await mkdir(directory, { mode: 0o700 });
    await expect(readPrivateNarratorSalt({
      requestedPath: directory,
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
    })).rejects.toThrow("regular file");

    const linkedSalt = join(layout.externalParent, "linked-salt.txt");
    await symlink(valid, linkedSalt);
    await expect(readPrivateNarratorSalt({
      requestedPath: linkedSalt,
      cwd: layout.root,
      repositoryRoot: layout.repositoryRoot,
    })).rejects.toThrow("regular file");
  });
});

describe("narrator committed source evidence", () => {
  it("binds clean working bytes to HEAD and preserves binary and non-ASCII evidence", async () => {
    const fixture = await sourceRepository();
    const sourceCommit = await assertCommittedSourceSnapshot(fixture);
    const evidence = await evidenceForCommit({ ...fixture, sourceCommit });
    expect(evidence.map((entry) => entry.path)).toEqual(["binary.bin", "source.txt"]);
    expect(evidence[0]).toMatchObject({
      byteLength: fixture.binary.byteLength,
      sha256: sha256(fixture.binary),
    });
    expect(evidence[1]).toMatchObject({
      byteLength: Buffer.byteLength(fixture.text),
      sha256: sha256(Buffer.from(fixture.text)),
    });
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("rejects dirty, staged-only, deleted, and untracked expected sources", async () => {
    const fixture = await sourceRepository();
    const textPath = join(fixture.repositoryRoot, "source.txt");

    await writeFile(textPath, "dirty\n");
    await expect(assertCommittedSourceSnapshot(fixture)).rejects.toThrow("differs from");
    await writeFile(textPath, fixture.text);

    await writeFile(textPath, "staged\n");
    await executeFile("git", ["add", "source.txt"], { cwd: fixture.repositoryRoot });
    await writeFile(textPath, fixture.text);
    await expect(assertCommittedSourceSnapshot(fixture)).rejects.toThrow("differs from");
    await executeFile("git", ["reset", "-q", "HEAD", "--", "source.txt"], { cwd: fixture.repositoryRoot });

    await unlink(textPath);
    await expect(assertCommittedSourceSnapshot(fixture)).rejects.toThrow("differs from");
    await writeFile(textPath, fixture.text);

    const untracked = join(fixture.repositoryRoot, "untracked.txt");
    await writeFile(untracked, "untracked\n");
    await expect(assertCommittedSourceSnapshot({
      repositoryRoot: fixture.repositoryRoot,
      sourcePaths: [...fixture.sourcePaths, "untracked.txt"],
    })).rejects.toThrow("not tracked");
  });
});

describe("narrator runner CLI wiring", () => {
  it("rejects legacy plaintext salt arguments before creating output or echoing the value", async () => {
    const root = await temporaryRoot("cli");
    const output = join(root, "must-not-exist");
    const plaintextSalt = "do-not-echo-this-secret-value";
    let failure;
    try {
      await executeFile(process.execPath, [
        runEntry,
        "run",
        "--model-dir", "/missing-model",
        "--run-id", "run:invalid",
        "--sheet-id", "sheet:invalid",
        "--secret-salt", plaintextSalt,
        "--adapter-receipt", "/missing-receipt",
        "--out", output,
      ]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect(failure.code).toBe(2);
    expect(`${failure.stdout ?? ""}${failure.stderr ?? ""}`).not.toContain(plaintextSalt);
    await expect(lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);
});
