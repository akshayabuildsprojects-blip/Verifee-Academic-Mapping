import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(scriptDir, "..");
const testBundleDir = path.join(artifactDir, ".test-dist");
const testBundlePath = path.join(testBundleDir, "academic-mappings.test.cjs");

await rm(testBundleDir, { recursive: true, force: true });

try {
  await build({
    entryPoints: [path.join(artifactDir, "tests/academic-mappings.spec.ts")],
    outfile: testBundlePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "info",
  });

  const result = spawnSync(process.execPath, ["--test", testBundlePath], {
    cwd: artifactDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(testBundleDir, { recursive: true, force: true });
}