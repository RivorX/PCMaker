import test from "node:test";
import assert from "node:assert/strict";
import { importUserBenchmarkCsv, UserBenchmarkCsvError } from "../src/lib/userbenchmark.ts";

const header = "Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL";

test("imports verified UserBenchmark columns and preserves source metric", () => {
  const csv = `${header}\r\nCPU,BX1,Intel,"Core i5, demo",1,123,20,https://cpu.userbenchmark.com/cpu\r\nGPU,,NVIDIA,RTX Demo,2,99,3,https://gpu.userbenchmark.com/gpu\r\nUSB,U1,Brand,Skipped,1,1,1,https://www.userbenchmark.com/usb\r\n`;
  const result = importUserBenchmarkCsv(csv, "2026-11-03T00:00:00.000Z");
  assert.equal(result.rowsRead, 3);
  assert.equal(result.components.length, 2);
  assert.deepEqual(result.skippedTypes, ["USB"]);
  assert.equal(result.components[0].sourceMetrics?.benchmark, 123);
  assert.equal(result.components[0].price, null);
  assert.match(result.components[1].id, /^userbenchmark-gpu-[a-f0-9]{64}$/);
  assert.equal(result.components[0].sourceIdentity.externalId, "BX1");
});

test("rejects unknown headers, malformed rows, nonfinite numbers and duplicates", () => {
  assert.throws(() => importUserBenchmarkCsv(`${header},Extra\nCPU,P,Intel,Demo,1,2,3,url`), UserBenchmarkCsvError);
  assert.throws(() => importUserBenchmarkCsv(`${header}\nCPU,P,Intel,Demo,1,2`), UserBenchmarkCsvError);
  assert.throws(() => importUserBenchmarkCsv(`${header}\nCPU,P,Intel,Demo,1,NaN,3,url`), UserBenchmarkCsvError);
  assert.throws(() => importUserBenchmarkCsv(`${header}\nCPU,P,Intel,Demo,1,2,3,url\nCPU,P,Intel,Demo,1,2,3,url`), UserBenchmarkCsvError);
  assert.throws(() => importUserBenchmarkCsv(`${header}\nCPU,P,Intel,Demo,1,2,3,https://evil.example/demo`), UserBenchmarkCsvError);
});
