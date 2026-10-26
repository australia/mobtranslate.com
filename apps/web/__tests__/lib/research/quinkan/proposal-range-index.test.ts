// @vitest-environment node
// Ported from quinkan-discovery/portal/tests (node:test -> vitest).

import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "vitest";
import {indexProposalDetailChunks} from "@/lib/research/quinkan/proposal-range-index";

const records = {
  "highres-hr_r1c2": {id: "highres-hr_r1c2", contributors: [{column: "slope", score: 0.7}]},
  "regional-r10c20": {id: "regional-r10c20", contributors: [{column: "roughness", score: 0.8}]},
  "regional-r30c40": {id: "regional-r30c40", contributors: [{column: "rainfall", score: 0.6}]},
};
const payload = Buffer.from(`${JSON.stringify(records, null, 2)}\n`);

async function* chunksOf(size: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < payload.byteLength; offset += size) {
    yield payload.subarray(offset, Math.min(payload.byteLength, offset + size));
  }
}

for (const chunkSize of [1, 7, 64, payload.byteLength]) {
  test(`indexes proposal ranges across ${chunkSize}-byte chunks`, async () => {
    const index = await indexProposalDetailChunks(chunksOf(chunkSize));
    assert.equal(index.observedBytes, payload.byteLength);
    assert.equal(index.sha256, createHash("sha256").update(payload).digest("hex"));
    assert.equal(index.ranges.size, Object.keys(records).length);
    for (const id of Object.keys(records)) {
      const range = index.ranges.get(id);
      assert.ok(range);
      const decoded = JSON.parse(payload.subarray(range.offset, range.offset + range.length).toString("utf8"));
      assert.equal(decoded.id, id);
    }
  });
}
