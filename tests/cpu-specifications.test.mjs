import test from "node:test";
import assert from "node:assert/strict";
import { supplementCpuSpecifications } from "../src/lib/cpu-specifications.ts";

const component = (model, specifications = {}, specificationProvenance) => ({
  id: `cpu-${model}`,
  category: "cpu",
  name: `AMD ${model}`,
  manufacturer: "AMD",
  model,
  description: "",
  specifications,
  ...(specificationProvenance ? { specificationProvenance } : {}),
  performanceScore: null,
  price: null,
  currency: "PLN",
  source: { kind: "database", label: "Firebase Data Connect", capturedAt: "2026-11-17T00:00:00.000Z", url: null },
});

test("supplements the exact pilot CPU while preserving existing values and provenance", () => {
  const existing = { Rdzenie: "database value", Custom: "keep" };
  const provenance = { Rdzenie: { sourceLabel: "Existing source", sourceUrl: "https://source.example/cpu" } };
  const result = supplementCpuSpecifications(component("Ryzen 7 7800X3D", existing, provenance));
  assert.equal(result.specifications.Rdzenie, "database value");
  assert.equal(result.specifications.Custom, "keep");
  assert.equal(result.specifications.Socket, "AM5");
  assert.equal(result.specifications.Wątki, "16");
  assert.equal(result.specificationProvenance.Rdzenie.sourceLabel, "Existing source");
  assert.equal(result.specificationProvenance.Socket.sourceUrl, "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800X3d.html");
});

test("does not supplement a neighboring model variant or another category", () => {
  const variant = component("Ryzen 7 7800X");
  const gpu = { ...variant, category: "gpu", name: "AMD Radeon RX 7800X" };
  assert.strictEqual(supplementCpuSpecifications(variant), variant);
  assert.strictEqual(supplementCpuSpecifications(gpu), gpu);
});

