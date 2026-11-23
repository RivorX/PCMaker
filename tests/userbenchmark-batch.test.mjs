import test from "node:test";
import assert from "node:assert/strict";
import { prepareUserBenchmarkBatch } from "../src/lib/userbenchmark-batch.ts";

const header = "Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL";
const csv = (row) => `${header}\n${row}\n`;
const cpu = "CPU,PART-CPU,Intel,Core Demo,1,123,10,https://cpu.userbenchmark.com/SpeedTest/1/Core-Demo";
const gpu = "GPU,PART-GPU,NVIDIA,RTX Demo,1,200,20,https://gpu.userbenchmark.com/SpeedTest/2/RTX-Demo";

test("combines valid physical rows from multiple files", () => {
  const result = prepareUserBenchmarkBatch([
    { file: "CPU_UserBenchmarks.csv", content: csv(cpu) },
    { file: "GPU_UserBenchmarks.csv", content: csv(gpu) },
  ], "2026-11-11T00:00:00.000Z");
  assert.equal(result.report.rawRead, 2);
  assert.equal(result.report.parsed, 2);
  assert.equal(result.report.accepted, 2);
  assert.equal(result.report.quarantined, 0);
  assert.equal(result.components[0].sourceMetrics?.benchmark, 123);
  assert.equal(result.components[1].sourceIdentity?.externalId, "PART-GPU");
});

test("drops exact duplicates but quarantines every stable-ID conflict", () => {
  const exact = prepareUserBenchmarkBatch([
    { file: "one.csv", content: csv(cpu) },
    { file: "two.csv", content: csv(cpu) },
  ], "2026-11-11T00:00:00.000Z");
  assert.equal(exact.report.accepted, 1);
  assert.equal(exact.report.deduplicatedIdentical, 1);
  assert.equal(exact.report.quarantined, 0);

  const conflict = prepareUserBenchmarkBatch([
    { file: "one.csv", content: csv(cpu) },
    { file: "two.csv", content: csv("CPU,PART-CPU,Intel,Core Different,2,120,8,https://cpu.userbenchmark.com/SpeedTest/3/Core-Different") },
  ], "2026-11-11T00:00:00.000Z");
  assert.equal(conflict.report.accepted, 0);
  assert.equal(conflict.report.conflictGroups.stableId, 1);
  assert.equal(conflict.report.quarantined, 2);
  assert.ok(conflict.quarantine.every((entry) => entry.reason.includes("conflict_stable_id")));
});

test("quarantines all distinct MPNs with the same manufacturer/model", () => {
  const result = prepareUserBenchmarkBatch([
    { file: "one.csv", content: csv(cpu) },
    { file: "two.csv", content: csv("CPU,PART-OTHER,Intel,Core Demo,1,123,10,https://cpu.userbenchmark.com/SpeedTest/4/Core-Demo") },
  ], "2026-11-11T00:00:00.000Z");
  assert.equal(result.report.accepted, 0);
  assert.equal(result.report.conflictGroups.manufacturerModel, 1);
  assert.equal(result.report.quarantined, 2);
  assert.ok(result.quarantine.every((entry) => entry.file && entry.line === 2 && entry.record.includes("Core Demo")));
});

test("quarantines malformed physical rows without repairing their CSV", () => {
  const malformed = "SSD,PART-SSD,Brand,Model \"4TB,1,100,1,https://ssd.userbenchmark.com/SpeedTest/5/Model";
  const result = prepareUserBenchmarkBatch([{ file: "SSD_UserBenchmarks.csv", content: csv(malformed) }], "2026-11-11T00:00:00.000Z");
  assert.equal(result.report.rawRead, 1);
  assert.equal(result.report.accepted, 0);
  assert.equal(result.report.quarantined, 1);
  assert.match(result.quarantine[0].reason, /strict_import_error/);
  assert.equal(result.quarantine[0].record, malformed);
});
