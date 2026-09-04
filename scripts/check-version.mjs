import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const resource = JSON.parse(await readFile("public/version.json", "utf8"));
const serviceWorker = await readFile("public/sw.js", "utf8");
const expectedCache = `the-grind-2:assets:v${packageJson.version}`;

if (packageLock.version !== packageJson.version) {
  throw new Error(
    `Lockfile version ${packageLock.version} does not match package ${packageJson.version}`,
  );
}
if (packageLock.packages?.[""]?.version !== packageJson.version) {
  throw new Error(
    `Lockfile root package version ${packageLock.packages?.[""]?.version} does not match package ${packageJson.version}`,
  );
}
if (resource.version !== packageJson.version) {
  throw new Error(`Version resource ${resource.version} does not match package ${packageJson.version}`);
}
if (!serviceWorker.includes(`const cacheName = "${expectedCache}";`)) {
  throw new Error(`Service worker cache does not match ${expectedCache}`);
}

process.stdout.write(`Version contract ${packageJson.version} is consistent.\n`);
