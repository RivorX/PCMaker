import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  FirebaseImportPreviewError,
  prepareFirebaseCatalogPreview,
  stableFirebaseComponentId,
} from "../src/lib/firebase-import-preview.ts";

const component = (overrides = {}) => ({
  id: "userbenchmark-cpu-1",
  category: "cpu",
  name: "AMD Ryzen Preview",
  manufacturer: "AMD",
  model: "Ryzen Preview",
  description: "Opis rekordu źródłowego.",
  specifications: { socket: "AM5" },
  performanceScore: null,
  price: null,
  currency: "PLN",
  source: {
    kind: "external",
    label: "UserBenchmark CSV",
    capturedAt: "2026-11-11T00:00:00.000Z",
    url: "https://cpu.userbenchmark.com/SpeedTest/demo?token=remove&keep=1",
    provider: "userbenchmark",
  },
  sourceIdentity: { provider: "userbenchmark", externalId: "PART-1", externalType: "CPU" },
  sourceMetrics: { metric: "userbenchmark", rank: 1, benchmark: 123, samples: 10 },
  ...overrides,
});

const snapshot = (components = [component()]) => ({
  version: 1,
  source: "UserBenchmark CSV",
  components,
});

test("prepares GraphQL-shaped fields with stable UUIDs and separate provenance", () => {
  const preview = prepareFirebaseCatalogPreview(snapshot());
  assert.equal(preview.readyToWrite, false);
  assert.equal(preview.components.length, 1);
  assert.deepEqual(Object.keys(preview.components[0]).sort(), [
    "componentType", "description", "id", "manufacturer", "model", "name", "performanceScore", "price", "productUrl",
  ].sort());
  assert.match(preview.components[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(preview.components[0].componentType, "cpu");
  assert.equal(preview.components[0].price, null);
  assert.equal(preview.components[0].performanceScore, null);
  assert.equal(preview.components[0].productUrl, "https://cpu.userbenchmark.com/SpeedTest/demo?keep=1");
  assert.deepEqual(preview.manifest[0].sourceIdentity, component().sourceIdentity);
  assert.deepEqual(preview.manifest[0].specifications, { socket: "AM5" });
  assert.equal(preview.manifest[0].sourceMetrics.benchmark, 123);
  assert.equal(preview.blockers.length, 2);
  assert.match(preview.blockers.join("\n"), /Component\.price/);
  assert.match(preview.blockers.join("\n"), /No approved catalog-write operation/);
});

test("uses deterministic UUID identity and validates malformed or negative input", () => {
  const first = component();
  const preview = prepareFirebaseCatalogPreview(snapshot([first]));
  const expected = stableFirebaseComponentId({ id: first.id, sourceIdentity: first.sourceIdentity });
  assert.equal(preview.components[0].id, expected);
  assert.equal(stableFirebaseComponentId({ id: first.id, sourceIdentity: first.sourceIdentity }), expected);
  assert.notEqual(stableFirebaseComponentId({ id: "other", sourceIdentity: null }), expected);
  assert.throws(() => prepareFirebaseCatalogPreview([first]), FirebaseImportPreviewError);
  assert.throws(() => prepareFirebaseCatalogPreview(snapshot([{ ...first, price: -1 }])), /price nie może/);
  assert.throws(() => prepareFirebaseCatalogPreview(snapshot([{ ...first, category: "unknown" }])), /Nieznana kategoria/);
});

test("rejects duplicate source IDs, deterministic IDs, and manufacturer/model pairs", () => {
  const duplicateSource = component();
  assert.throws(() => prepareFirebaseCatalogPreview(snapshot([duplicateSource, { ...duplicateSource }])), /Duplikat source catalog id/);
  const duplicatePair = component({ id: "userbenchmark-cpu-2", sourceIdentity: { provider: "userbenchmark", externalId: "PART-2", externalType: "CPU" } });
  assert.throws(() => prepareFirebaseCatalogPreview(snapshot([duplicateSource, duplicatePair])), /Duplikat manufacturer\/model/);
  const duplicateIdentity = component({ id: "userbenchmark-cpu-2" });
  assert.throws(() => prepareFirebaseCatalogPreview(snapshot([duplicateSource, duplicateIdentity])), /Duplikat source catalog id|Kolizja deterministycznego UUID/);
});

test("CLI reports missing input and unreadable input without creating a preview", () => {
  const args = ["--experimental-strip-types", "scripts/prepare-firebase-catalog.mjs"];
  const missingInput = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(missingInput.status, 2);
  assert.match(missingInput.stderr, /Użycie/);
  const unreadable = spawnSync(process.execPath, [...args, "does-not-exist.snapshot.json"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stderr, /ENOENT|odczytać|open/i);
});
