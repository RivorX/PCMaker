import test from "node:test";
import assert from "node:assert/strict";
import { prepareFirebaseCatalogPreview } from "../src/lib/firebase-import-preview.ts";
import {
  buildAdminImportPlan,
  insertAdminImportBatch,
  listExistingComponents,
  AdminImportError,
  normalizeFirebaseComponentId,
} from "../src/lib/firebase-admin-import.ts";

const source = {
  kind: "external",
  label: "test",
  capturedAt: "2026-11-17T00:00:00.000Z",
  url: null,
  provider: "test",
};

const snapshot = {
  version: 1,
  source: "test",
  components: [{
    id: "catalog-1",
    category: "cpu",
    name: "AMD CPU",
    manufacturer: "AMD",
    model: "Model 1",
    description: "Description",
    specifications: { socket: "AM5" },
    performanceScore: null,
    price: null,
    currency: "PLN",
    source,
    sourceIdentity: { provider: "test", externalId: "one", externalType: "CPU" },
  }],
};

const preview = prepareFirebaseCatalogPreview(snapshot);
const incoming = preview.components[0];

test("admin planning skips exact existing ID and never includes price/specification writes", () => {
  const compactId = incoming.id.replaceAll("-", "");
  assert.equal(normalizeFirebaseComponentId(compactId), incoming.id);
  assert.equal(normalizeFirebaseComponentId(incoming.id.toUpperCase()), incoming.id);
  assert.equal(normalizeFirebaseComponentId("opaque-test-id"), "opaque-test-id");
  const plan = buildAdminImportPlan(preview, [{
    id: compactId,
    name: incoming.name,
    manufacturer: incoming.manufacturer,
    model: incoming.model,
    componentType: incoming.componentType,
    description: incoming.description,
    price: 123,
    performanceScore: null,
    productUrl: null,
    specifications: [{ specificationName: "socket", specificationValue: "AM5" }],
  }]);
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.skippedExistingIds, [incoming.id]);
  assert.deepEqual(plan.conflicts, []);

  const insertPlan = buildAdminImportPlan(preview, []);
  assert.equal(insertPlan.rows.length, 1);
  assert.equal(insertPlan.rows[0].price, null);
  assert.equal(insertPlan.rows[0].performanceScore, null);
  assert.equal("specifications" in insertPlan.rows[0], false);
});

test("admin planning blocks same-ID changes and existing manufacturer/model conflicts", () => {
  const sameId = buildAdminImportPlan(preview, [{
    id: incoming.id,
    name: "Changed",
    manufacturer: incoming.manufacturer,
    model: incoming.model,
    componentType: incoming.componentType,
    description: incoming.description,
    price: null,
    performanceScore: null,
    productUrl: null,
  }]);
  assert.equal(sameId.conflicts[0].reason, "same_id_content");
  const pair = buildAdminImportPlan(preview, [{
    id: "different-id",
    name: incoming.name,
    manufacturer: incoming.manufacturer,
    model: incoming.model,
    componentType: incoming.componentType,
    description: incoming.description,
    price: null,
    performanceScore: null,
    productUrl: null,
  }]);
  assert.equal(pair.conflicts[0].reason, "existing_manufacturer_model");
});

test("admin existing reads paginate with bounded stable ordering", async () => {
  const calls = [];
  const client = {
    executeGraphqlRead: async (query, options) => {
      calls.push({ query, options });
      return { data: { components: options.variables.offset === 0 ? Array.from({ length: 2 }, (_, index) => ({ id: String(index), name: "n", componentType: "cpu" })) : [{ id: "2", name: "n", componentType: "cpu" }] } };
    },
  };
  const records = await listExistingComponents(client, { pageSize: 2, maxRows: 10 });
  assert.equal(records.length, 3);
  assert.match(calls[0].query, /orderBy: \[\{ id: ASC \}\]/);
  assert.deepEqual(calls.map((call) => call.options.variables), [{ limit: 2, offset: 0 }, { limit: 2, offset: 2 }]);
});

test("admin batch insert uses Component inserts and stops on response errors", async () => {
  const calls = [];
  await insertAdminImportBatch({ insertMany: async (table, rows) => { calls.push({ table, rows }); return { data: {} }; } }, [{ id: "id" }]);
  assert.equal(calls[0].table, "Component");
  await assert.rejects(() => insertAdminImportBatch({ insertMany: async () => ({ errors: [{ message: "hidden" }] }) }, [{ id: "id" }]), (error) => error instanceof AdminImportError && error.code === "insert_partial_error");
});
