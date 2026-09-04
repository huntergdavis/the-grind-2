import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const privateSaltPattern = /^[A-Za-z0-9_-]{43,240}$/u;
const contentHashPattern = /^[0-9a-f]{16}$/u;

function isExpectedGitMiss(error) {
  return typeof error === "object" && error !== null && error.code === 1;
}

async function gitSucceeds(arguments_, repositoryRoot) {
  try {
    await executeFile("git", arguments_, { cwd: repositoryRoot });
    return true;
  } catch (error) {
    if (isExpectedGitMiss(error)) return false;
    throw error;
  }
}

function requirePosixPermissions() {
  if (process.platform === "win32") {
    throw new Error("Narrator evidence collection requires POSIX file permissions");
  }
}

export function parseNarratorBrowserArguments(argv) {
  if (!Array.isArray(argv)) return null;
  const [mode, ...rest] = argv;
  if (mode !== "smoke" && mode !== "run") return null;
  if (rest.length % 2 !== 0) return null;
  const allowed = mode === "smoke"
    ? new Set(["model-dir", "run-id", "out"])
    : new Set(["model-dir", "run-id", "out", "sheet-id", "secret-salt-file", "adapter-receipt"]);
  const options = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (typeof key !== "string"
      || !key.startsWith("--")
      || typeof value !== "string"
      || value.length === 0) return null;
    const name = key.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
  }
  if (!options["model-dir"] || !options["run-id"] || !options.out) return null;
  if (mode === "run" && (!options["sheet-id"]
    || !options["secret-salt-file"]
    || !options["adapter-receipt"])) return null;
  return Object.freeze(options);
}

export function pathIsInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function resolveNarratorOutputDirectory({
  requestedPath,
  mode,
  cwd,
  repositoryRoot,
  diagnosticDist,
}) {
  if (mode !== "smoke" && mode !== "run") {
    throw new Error("Narrator diagnostic output mode is invalid");
  }
  const requested = isAbsolute(requestedPath) ? requestedPath : resolve(cwd, requestedPath);
  const leaf = basename(requested);
  if (leaf === "" || leaf === "." || leaf === "..") {
    throw new Error("Narrator diagnostic output must name a new child directory");
  }
  const parent = await realpath(dirname(requested));
  const resolvedOutput = resolve(parent, leaf);
  const [realRepositoryRoot, realDiagnosticDist] = await Promise.all([
    realpath(repositoryRoot),
    realpath(diagnosticDist),
  ]);
  try {
    await lstat(resolvedOutput);
    throw new Error("Narrator diagnostic output must not already exist");
  } catch (error) {
    if (!(typeof error === "object" && error !== null && error.code === "ENOENT")) throw error;
  }
  if (pathIsInside(realRepositoryRoot, resolvedOutput)) {
    if (mode === "run") {
      throw new Error("Narrator B2 run output must be outside the repository");
    }
    if (resolvedOutput === realDiagnosticDist || !pathIsInside(realDiagnosticDist, resolvedOutput)) {
      throw new Error("Narrator smoke output must be outside the repository or inside its diagnostic build directory");
    }
    const ignored = await gitSucceeds(
      ["check-ignore", "--quiet", "--no-index", "--", resolvedOutput],
      realRepositoryRoot,
    );
    if (!ignored) throw new Error("Narrator smoke output inside the repository must be ignored by Git");
  }
  return resolvedOutput;
}

export async function createPrivateOutputDirectory(path) {
  requirePosixPermissions();
  await mkdir(path, { mode: 0o700 });
  await chmod(path, 0o700);
  const metadata = await lstat(path);
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o700) {
    throw new Error("Narrator diagnostic output directory is not an exact-mode private directory");
  }
}

export async function writePrivateEvidenceFile(path, bytes) {
  requirePosixPermissions();
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new Error("Narrator evidence output is not an exact-mode private regular file");
    }
  } finally {
    await handle.close();
  }
}

export async function writePrivateJsonEvidence(path, value) {
  await writePrivateEvidenceFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function createNarratorFullRunEvidenceSet({
  adapterReceipt,
  runReceipt,
  blindSheet,
  blindKey,
  runPackage,
}) {
  const bindings = [
    [adapterReceipt?.contentHash, runPackage?.adapterBuildReceiptHash],
    [runReceipt?.contentHash, runPackage?.runReceiptHash],
    [blindSheet?.contentHash, runPackage?.blindSheetHash],
    [blindKey?.contentHash, runPackage?.blindKeyHash],
  ];
  if (runPackage?.modelAdmitted !== false
    || runPackage?.displayAuthorized !== false
    || bindings.some(([observed, expected]) => !contentHashPattern.test(String(observed)) || observed !== expected)) {
    throw new TypeError("Narrator full-run evidence bindings are invalid");
  }
  return Object.freeze([
    Object.freeze({ name: "adapter-build-receipt.json", value: adapterReceipt }),
    Object.freeze({ name: "run-receipt.json", value: runReceipt }),
    Object.freeze({ name: "blind-sheet.json", value: blindSheet }),
    Object.freeze({ name: "blind-key.json", value: blindKey }),
    Object.freeze({ name: "run-package.json", value: runPackage }),
  ]);
}

export async function readPrivateNarratorSalt({ requestedPath, cwd, repositoryRoot }) {
  requirePosixPermissions();
  const absolutePath = isAbsolute(requestedPath) ? requestedPath : resolve(cwd, requestedPath);
  const linkMetadata = await lstat(absolutePath);
  if (!linkMetadata.isFile()
    || linkMetadata.isSymbolicLink()
    || (linkMetadata.mode & 0o777) !== 0o600) {
    throw new Error("Narrator B2 salt file must be an exact-mode private regular file");
  }
  const resolvedPath = await realpath(absolutePath);
  const realRepositoryRoot = await realpath(repositoryRoot);
  if (pathIsInside(realRepositoryRoot, resolvedPath)) {
    throw new Error("Narrator B2 salt file must be outside the repository");
  }
  if (linkMetadata.size > 241) throw new Error("Narrator B2 salt file is invalid");
  const raw = await readFile(resolvedPath, "utf8");
  const value = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if ((raw !== value && raw !== `${value}\n`) || !privateSaltPattern.test(value)) {
    throw new Error("Narrator B2 salt file is invalid");
  }
  return value;
}

export async function assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths }) {
  const { stdout } = await executeFile(
    "git",
    ["rev-parse", "--verify", "HEAD^{commit}"],
    { cwd: repositoryRoot },
  );
  const sourceCommit = stdout.trim();
  for (const path of sourcePaths) {
    let committed;
    try {
      ({ stdout: committed } = await executeFile(
        "git",
        ["rev-parse", "--verify", `${sourceCommit}:${path}`],
        { cwd: repositoryRoot },
      ));
    } catch {
      throw new Error(`Narrator browser source is not tracked by ${sourceCommit}: ${path}`);
    }
    const [worktreeClean, indexClean] = await Promise.all([
      gitSucceeds(["diff", "--quiet", "--no-ext-diff", "--", path], repositoryRoot),
      gitSucceeds(["diff", "--cached", "--quiet", "--no-ext-diff", sourceCommit, "--", path], repositoryRoot),
    ]);
    if (!worktreeClean || !indexClean) {
      throw new Error(`Narrator browser source differs from ${sourceCommit}: ${path}`);
    }
    let working;
    try {
      ({ stdout: working } = await executeFile("git", ["hash-object", "--", path], { cwd: repositoryRoot }));
    } catch {
      throw new Error(`Narrator browser source differs from ${sourceCommit}: ${path}`);
    }
    if (committed.trim() !== working.trim()) {
      throw new Error(`Narrator browser source differs from ${sourceCommit}: ${path}`);
    }
  }
  return sourceCommit;
}

export async function evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit }) {
  const evidence = [];
  for (const path of [...sourcePaths].sort()) {
    const { stdout } = await executeFile(
      "git",
      ["show", `${sourceCommit}:${path}`],
      { cwd: repositoryRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 },
    );
    evidence.push(Object.freeze({
      path,
      byteLength: stdout.byteLength,
      sha256: sha256(stdout),
    }));
  }
  return Object.freeze(evidence);
}
