// @vitest-environment node
// Ported from quinkan-discovery/portal/tests (node:test -> vitest).

import assert from "node:assert/strict";
import {test} from "vitest";
import {fieldReportContract, fieldReportContracts} from "@/lib/research/quinkan/field-report-contract";

test("field report contract evaluates before recalibration", () => {
  assert.equal(fieldReportContract.baselineReleaseId, "laura-operational-map-v31-20260815");
  assert.match(fieldReportContract.frozenInventorySha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(fieldReportContract.regionalRankThresholds, [98.75, 99, 99.5, 99.9]);
  assert.match(fieldReportContract.sequence[1], /Evaluate every location/);
  assert.match(fieldReportContract.sequence[2], /Publish the pre-recalibration report/);
  assert.match(fieldReportContract.sequence[4], /Only then create a new model candidate/);
});

test("every frozen evaluation era stays pinned and internally consistent", () => {
  assert.ok(fieldReportContracts.length >= 2);
  const ids = fieldReportContracts.map((contract) => contract.preregistrationId);
  assert.equal(new Set(ids).size, ids.length);
  const v1 = fieldReportContracts.find(
    (contract) => contract.preregistrationId === "laura-pre-survey-prediction-evaluation-v1-20260810",
  );
  assert.ok(v1);
  assert.equal(v1.baselineReleaseId, "laura-operational-map-v16-20260810");
  assert.equal(v1.baselineWorkspaceMapSha256, "d78b1cfd6f2392ceef0b807fc790f1268f2cb76fd37859e2387e30d04decb0f1");
  for (const contract of fieldReportContracts) {
    assert.match(contract.preregistrationSha256, /^[0-9a-f]{64}$/);
    assert.match(contract.baselineWorkspaceMapSha256, /^[0-9a-f]{64}$/);
    assert.match(contract.sequence[2], /Publish the pre-recalibration report/);
  }
  assert.equal(fieldReportContract, fieldReportContracts[0]);
});
