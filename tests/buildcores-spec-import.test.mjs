import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDCORES_SPECIFICATION_SOURCE_NAME,
  buildBuildCoresSpecPlan,
} from "../src/lib/buildcores-spec-import.ts";

const match = {
  componentId: "11111111-1111-8111-8111-111111111111",
  componentName: "AMD Ryzen 5 7600",
  sourceUrl: "https://github.com/buildcores/buildcores-open-db/blob/c9002fe308396c780d8a378cc93c10d85b215b8b/open-db/CPU/example.json",
  sourceRecord: { id: "example", name: "AMD Ryzen 5 7600", manufacturer: "AMD", category: "CPU", fields: {} },
  fields: { socket: "AM5", memoryType: "DDR5", cores: "6", threads: "12" },
  matchKind: "model",
};

test("plans additive specs and preserves existing values", () => {
  const plan = buildBuildCoresSpecPlan([match], [{
    id: match.componentId,
    name: match.componentName,
    manufacturer: "AMD",
    model: "Ryzen 5 7600",
    componentType: "CPU",
    description: null,
    price: null,
    performanceScore: null,
    productUrl: null,
    specifications: [{ specificationName: "socket", specificationValue: "AM5" }],
  }]);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.counts.keepRows, 1);
  assert.equal(plan.counts.addRows, 4);
  assert.ok(plan.addRows.some((row) => row.specificationName === BUILDCORES_SPECIFICATION_SOURCE_NAME));
  assert.ok(plan.addRows.every((row) => row.componentId === match.componentId));
  assert.equal(plan.deleteCandidates.length, 0);
  assert.equal(plan.deletionReview.status, "not_attempted");
});

test("blocks a conflicting existing specification without overwrite", () => {
  const plan = buildBuildCoresSpecPlan([match], [{
    id: match.componentId,
    name: match.componentName,
    manufacturer: "AMD",
    model: "Ryzen 5 7600",
    componentType: "CPU",
    description: null,
    price: null,
    performanceScore: null,
    productUrl: null,
    specifications: [{ specificationName: "cores", specificationValue: "8" }],
  }]);
  assert.equal(plan.addRows.length, 0);
  assert.equal(plan.conflicts[0].reason, "existing_value_conflict:cores");
});

