import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(scriptDir, "..");
const testBundleDir = path.join(artifactDir, ".test-dist");
const testFiles = [
  "tests/academic-mappings.spec.ts",
  "tests/academic-transcripts.spec.ts",
  "tests/academic-transcript-model-evaluation.spec.ts",
  "tests/institution-status.spec.ts",
  "tests/institution-status-additional.spec.ts",
];

await rm(testBundleDir, { recursive: true, force: true });

try {
  for (const testFile of testFiles) {
    const testBundlePath = path.join(
      testBundleDir,
      `${path.basename(testFile, ".spec.ts")}.test.cjs`,
    );

    await build({
      entryPoints: [path.join(artifactDir, testFile)],
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
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(testBundleDir, { recursive: true, force: true });
}