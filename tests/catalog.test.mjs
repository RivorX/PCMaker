import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importUserBenchmarkCsv } from "../src/lib/userbenchmark.ts";
import {
  CatalogUnavailableError,
  getCatalogDataset,
  listCatalogComponents,
} from "../src/lib/catalog.ts";

const csv = "Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL\nCPU,BX-TEST,Intel,Core Test,1,101,10,https://cpu.userbenchmark.com/SpeedTest/test\n";

test("sample catalog covers the supported categories and supports combined filters", () => {
  const previous = process.env.CATALOG_DATA_FILE;
  delete process.env.CATALOG_DATA_FILE;
  try {
    const dataset = getCatalogDataset();
    assert.equal(dataset.source, "sample");
    assert.equal(new Set(dataset.components.map((item) => item.category)).size, 8);
    assert.equal(new Set(dataset.components.map((item) => item.id)).size, dataset.components.length);
    assert.ok(dataset.components.every((item) => item.price === null && item.source.kind === "sample"));
    const filtered = listCatalogComponents({ category: "cpu", manufacturer: " amd ", query: "ryzen", page: 1, limit: 10 });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].manufacturer, "AMD");
    assert.equal(listCatalogComponents({ query: "[]*", page: 1, limit: 10 }).length, 0);
  } finally {
    if (previous === undefined) delete process.env.CATALOG_DATA_FILE;
    else process.env.CATALOG_DATA_FILE = previous;
  }
});

test("loads an imported JSON snapshot when CATALOG_DATA_FILE is configured", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pcmaker-catalog-"));
  const path = join(directory, "components.json");
  const imported = importUserBenchmarkCsv(csv, "2026-11-03T00:00:00.000Z");
  await writeFile(path, JSON.stringify({ version: 1, source: "UserBenchmark CSV", components: imported.components }), "utf8");
  const previous = process.env.CATALOG_DATA_FILE;
  process.env.CATALOG_DATA_FILE = path;
  try {
    assert.equal(getCatalogDataset().source, "external");
    assert.equal(getCatalogDataset().provider, "userbenchmark");
    assert.equal(listCatalogComponents({ query: "core test", page: 1, limit: 10 }).length, 1);
    assert.equal(listCatalogComponents({ page: 1, limit: 10 })[0].price, null);
  } finally {
    if (previous === undefined) delete process.env.CATALOG_DATA_FILE;
    else process.env.CATALOG_DATA_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not silently fall back when configured catalog is invalid", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pcmaker-catalog-invalid-"));
  const path = join(directory, "invalid.json");
  await writeFile(path, JSON.stringify({ version: 1, source: "broken", components: [{ id: "duplicate" }] }), "utf8");
  const previous = process.env.CATALOG_DATA_FILE;
  process.env.CATALOG_DATA_FILE = path;
  try {
    assert.throws(() => getCatalogDataset(), CatalogUnavailableError);
  } finally {
    if (previous === undefined) delete process.env.CATALOG_DATA_FILE;
    else process.env.CATALOG_DATA_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
