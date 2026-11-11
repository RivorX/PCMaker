import test from "node:test";
import assert from "node:assert/strict";
import {
  FirebaseCatalogUnavailableError,
  getFirebaseCatalogSnapshot,
  resetFirebaseCatalogCache,
} from "../src/lib/firebase-catalog.ts";
import { CatalogUnavailableError, loadCatalogDataset } from "../src/lib/catalog.ts";

const API_KEY = "firebase-test-key-not-for-output";

const withFirebaseEnv = async (callback) => {
  const previous = {
    source: process.env.CATALOG_SOURCE,
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    catalogKey: process.env.CATALOG_FIREBASE_API_KEY,
  };
  process.env.CATALOG_SOURCE = "firebase";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = API_KEY;
  delete process.env.CATALOG_FIREBASE_API_KEY;
  try {
    return await callback();
  } finally {
    if (previous.source === undefined) delete process.env.CATALOG_SOURCE;
    else process.env.CATALOG_SOURCE = previous.source;
    if (previous.apiKey === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previous.apiKey;
    if (previous.catalogKey === undefined) delete process.env.CATALOG_FIREBASE_API_KEY;
    else process.env.CATALOG_FIREBASE_API_KEY = previous.catalogKey;
    resetFirebaseCatalogCache();
  }
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

test("maps Firebase records and canonical category aliases without inventing data", async () => {
  await withFirebaseEnv(async () => {
    resetFirebaseCatalogCache();
    const previousFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (input, init) => {
      request = { input: String(input), init };
      return jsonResponse({
        data: {
          components: [{
            id: "ram-1",
            name: "  Memory test  ",
            manufacturer: null,
            model: null,
            componentType: "RAM",
            description: null,
            price: 999,
            performanceScore: 88,
            productUrl: "https://example.test/ram?token=do-not-reflect&keep=1",
          }],
        },
      });
    };
    try {
      const snapshot = await getFirebaseCatalogSnapshot();
      assert.equal(snapshot.components.length, 1);
      assert.equal(snapshot.components[0].category, "memory");
      assert.equal(snapshot.components[0].name, "Memory test");
      assert.equal(snapshot.components[0].manufacturer, "");
      assert.equal(snapshot.components[0].model, "");
      assert.equal(snapshot.components[0].description, "");
      assert.deepEqual(snapshot.components[0].specifications, {});
      assert.equal(snapshot.components[0].price, null);
      assert.equal(snapshot.components[0].performanceScore, null);
      assert.equal(snapshot.components[0].source.kind, "database");
      assert.equal(snapshot.components[0].source.provider, "firebase-sql-connect");
      assert.match(snapshot.components[0].source.url, /^https:\/\/example\.test\/ram\?keep=1$/);
      assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(API_KEY));
      assert.equal(request.init.method, "POST");
      assert.equal(request.init.headers["x-goog-api-key"], API_KEY);
      assert.deepEqual(JSON.parse(request.init.body), { operationName: "ListComponents", variables: {} });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("accepts a valid empty Firebase catalog", async () => {
  await withFirebaseEnv(async () => {
    resetFirebaseCatalogCache();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse({ data: { components: [] } });
    try {
      const snapshot = await getFirebaseCatalogSnapshot();
      assert.deepEqual(snapshot.components, []);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("fails on unknown component type and does not fall back to sample data", async () => {
  await withFirebaseEnv(async () => {
    resetFirebaseCatalogCache();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse({
      data: { components: [{ id: "mystery", name: "Mystery", componentType: "unknown" }] },
    });
    try {
      await assert.rejects(() => getFirebaseCatalogSnapshot(), FirebaseCatalogUnavailableError);
      await assert.rejects(() => loadCatalogDataset(), CatalogUnavailableError);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("sanitizes an upstream HTTP or GraphQL error", async () => {
  await withFirebaseEnv(async () => {
    resetFirebaseCatalogCache();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => jsonResponse({ errors: [{ message: "internal details" }] }, 200);
    try {
      await assert.rejects(() => getFirebaseCatalogSnapshot(), FirebaseCatalogUnavailableError);
    } finally {
      globalThis.fetch = previousFetch;
    }
    resetFirebaseCatalogCache();
    globalThis.fetch = async () => jsonResponse({ error: "internal details" }, 500);
    try {
      await assert.rejects(() => getFirebaseCatalogSnapshot(), FirebaseCatalogUnavailableError);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("deduplicates concurrent requests and serves the sixty-second cache", async () => {
  await withFirebaseEnv(async () => {
    resetFirebaseCatalogCache();
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({ data: { components: [] } });
    };
    try {
      await Promise.all([getFirebaseCatalogSnapshot(), getFirebaseCatalogSnapshot()]);
      await getFirebaseCatalogSnapshot();
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
