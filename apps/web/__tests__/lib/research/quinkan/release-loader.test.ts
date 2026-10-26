// @vitest-environment node
// Ported from quinkan-discovery/portal/tests (node:test -> vitest).

import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, test} from "vitest";
import {loadPublicReleaseFromConfig} from "@/lib/research/quinkan/release-loader-core";

const temporaryRoots: string[] = [];
const filenames = [
  "atlas-map.json",
  "environmental-layers.json",
  "experiments.json",
  "model-summary.json",
  "project.json",
  "sources.json",
] as const;

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeRelease(): Promise<{root: string; releaseDir: string}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "quinkan-public-release-test-"));
  temporaryRoots.push(root);
  const releasesDir = path.join(root, "releases");
  const releaseDir = path.join(releasesDir, "synthetic-release");
  const publicDir = path.join(releaseDir, "public");
  await mkdir(publicDir, {recursive: true});
  const approval = Buffer.from('{"synthetic":"approval"}\n');
  await writeFile(path.join(releaseDir, "approval.json"), approval);
  const files = [];
  for (const filename of filenames) {
    const bytes = Buffer.from(`${JSON.stringify({schema_version: 1, filename})}\n`);
    await writeFile(path.join(publicDir, filename), bytes);
    files.push({path: `public/${filename}`, sha256: hash(bytes), bytes: bytes.byteLength});
  }
  const manifest = {
    schema_version: 1,
    release_id: "synthetic-release",
    approved_at_utc: "2026-08-09T00:00:00Z",
    authority_record_id: "synthetic-authority-record",
    approval_sha256: hash(approval),
    files,
    builder: {name: "quinkan-public-bundle", version: "0.1.0"},
  };
  await writeFile(path.join(releaseDir, "release-manifest.json"), `${JSON.stringify(manifest)}\n`);
  return {root: releasesDir, releaseDir};
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

test("loads an exact immutable release and verifies every hash", async () => {
  const release = await makeRelease();
  const result = await loadPublicReleaseFromConfig({
    releasesDir: release.root,
    releaseId: "synthetic-release",
  });
  assert.equal(result.manifest.release_id, "synthetic-release");
  assert.deepEqual(Object.keys(result.payloads).sort(), [...filenames].sort());
});

test("rejects payload tampering", async () => {
  const release = await makeRelease();
  await writeFile(path.join(release.releaseDir, "public", "project.json"), '{"tampered":true}\n');
  await assert.rejects(
    loadPublicReleaseFromConfig({releasesDir: release.root, releaseId: "synthetic-release"}),
    /does not match release manifest/,
  );
});

test("rejects a restricted path component", async () => {
  const release = await makeRelease();
  const restrictedRoot = path.join(path.dirname(release.root), "restricted");
  await mkdir(restrictedRoot);
  await assert.rejects(
    loadPublicReleaseFromConfig({releasesDir: restrictedRoot, releaseId: "synthetic-release"}),
    /forbidden restricted component/,
  );
});

test("rejects symlinked payloads", async () => {
  const release = await makeRelease();
  const project = path.join(release.releaseDir, "public", "project.json");
  await unlink(project);
  await symlink(path.join(release.releaseDir, "public", "sources.json"), project);
  await assert.rejects(
    loadPublicReleaseFromConfig({releasesDir: release.root, releaseId: "synthetic-release"}),
    /non-symlink regular file/,
  );
});

test("rejects extra release files", async () => {
  const release = await makeRelease();
  await writeFile(path.join(release.releaseDir, "unexpected.json"), "{}\n");
  await assert.rejects(
    loadPublicReleaseFromConfig({releasesDir: release.root, releaseId: "synthetic-release"}),
    /unexpected public release entries/,
  );
});

test("rejects a manifest whose ID differs from its immutable directory", async () => {
  const release = await makeRelease();
  const manifestPath = path.join(release.releaseDir, "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.release_id = "different-release";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(
    loadPublicReleaseFromConfig({releasesDir: release.root, releaseId: "synthetic-release"}),
    /does not match the selected immutable release/,
  );
});
