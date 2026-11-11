import test from "node:test";
import assert from "node:assert/strict";
import {
  AlternateNotConfiguredError,
  AlternateNotFoundError,
  AlternateUpstreamError,
  clearAlternateCache,
  lookupAlternateProduct,
  searchAlternateProducts,
} from "../src/lib/alternate.ts";

const found = {
  responseStatus: "PRODUCT_FOUND_RESPONSE",
  productTitle: "Demo GPU",
  manufacturer: "Demo",
  productId: 1108895,
  price: 75.9,
  shippingPrice: 7.99,
  currency: "EUR",
  available: true,
  warehouseAvailability: "in_stock",
  ean: "123",
  mpn: "DEMO-1",
  categories: ["GPU"],
  url: "https://www.alternate.de/Example/Demo-GPU/html/product/1108895",
};

test("preserves absent prices, provider 404 and timeouts while reading the response", async () => {
  clearAlternateCache();
  const previousKey = process.env.EVERYDATA_API_KEY;
  const previousRate = process.env.EUR_PLN_RATE;
  process.env.EVERYDATA_API_KEY = "test-secret";
  process.env.EUR_PLN_RATE = "4.30";
  try {
    const result = await lookupAlternateProduct("1108895", {
      fetchImpl: async () => new Response(JSON.stringify({ ...found, price: null, shippingPrice: null })),
    });
    assert.deepEqual(result.data.price, { originalEUR: null, estimatedPLN: null });
    assert.deepEqual(result.data.shipping, { originalEUR: null, estimatedPLN: null });
    await assert.rejects(() => lookupAlternateProduct("404", {
      fetchImpl: async () => new Response("not found", { status: 404 }),
    }), AlternateNotFoundError);
    await assert.rejects(() => lookupAlternateProduct("408", {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => { throw new DOMException("aborted", "AbortError"); } }),
    }), (error) => error instanceof AlternateUpstreamError && error.kind === "timeout");
  } finally {
    if (previousKey === undefined) delete process.env.EVERYDATA_API_KEY;
    else process.env.EVERYDATA_API_KEY = previousKey;
    if (previousRate === undefined) delete process.env.EUR_PLN_RATE;
    else process.env.EUR_PLN_RATE = previousRate;
    clearAlternateCache();
  }
});

test("maps Alternate EUR prices to rounded PLN estimates and caches lookup", async () => {
  clearAlternateCache();
  process.env.EVERYDATA_API_KEY = "test-secret";
  process.env.EUR_PLN_RATE = "4.30";
  let calls = 0;
  const fetchImpl = async (input, init) => {
    calls += 1;
    assert.match(String(input), /alternate-lookup-product\?productId=1108895$/);
    assert.equal(init.headers["x-api-key"], "test-secret");
    return new Response(JSON.stringify(found), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [first, second] = await Promise.all([
    lookupAlternateProduct("1108895", { fetchImpl, now: () => 1000 }),
    lookupAlternateProduct("1108895", { fetchImpl, now: () => 1000 }),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "hit");
  assert.deepEqual(first.data.price.originalEUR, { amountCents: 7590, currency: "EUR" });
  assert.deepEqual(first.data.price.estimatedPLN, { amountCents: 32637, currency: "PLN", eurPlnRate: 4.3, isEstimate: true });
  assert.equal(first.data.shipping.estimatedPLN.amountCents, 3436);
  assert.equal(first.data.sourceUrl, "https://www.alternate.de/Example/Demo-GPU/html/product/1108895");
  delete process.env.EVERYDATA_API_KEY;
  delete process.env.EUR_PLN_RATE;
});

test("maps provider errors and malformed payloads without exposing response data", async () => {
  clearAlternateCache();
  process.env.EVERYDATA_API_KEY = "test-secret";
  await assert.rejects(() => lookupAlternateProduct("1", { fetchImpl: async () => new Response("no", { status: 429 }) }), AlternateUpstreamError);
  await assert.rejects(() => lookupAlternateProduct("2", { fetchImpl: async () => new Response(JSON.stringify({ responseStatus: "PRODUCT_FOUND_RESPONSE", productId: 2 }), { status: 200 }) }), AlternateUpstreamError);
  await assert.rejects(() => lookupAlternateProduct("3", { fetchImpl: async () => new Response(JSON.stringify({ responseStatus: "PRODUCT_NOT_FOUND_RESPONSE" }), { status: 200 }) }), AlternateNotFoundError);
  delete process.env.EVERYDATA_API_KEY;
});

test("rejects unconfigured, invalid IDs and invalid fixed rates before provider calls", async () => {
  clearAlternateCache();
  delete process.env.EVERYDATA_API_KEY;
  await assert.rejects(() => lookupAlternateProduct("1", { fetchImpl: async () => { throw new Error("must not call"); } }), AlternateNotConfiguredError);
  process.env.EVERYDATA_API_KEY = "test-secret";
  await assert.rejects(() => lookupAlternateProduct("bad-id", { fetchImpl: async () => { throw new Error("must not call"); } }), /invalid_product_id/);
  process.env.EUR_PLN_RATE = "NaN";
  await assert.rejects(() => lookupAlternateProduct("4", { fetchImpl: async () => { throw new Error("must not call"); } }), AlternateUpstreamError);
  delete process.env.EVERYDATA_API_KEY;
  delete process.env.EUR_PLN_RATE;
});

test("rejects a provider payload for a different product and unsafe money", async () => {
  clearAlternateCache();
  process.env.EVERYDATA_API_KEY = "test-secret";
  await assert.rejects(() => lookupAlternateProduct("1108895", {
    fetchImpl: async () => new Response(JSON.stringify({ ...found, productId: "999" }), { status: 200 }),
  }), (error) => error instanceof AlternateUpstreamError && error.kind === "invalid");
  await assert.rejects(() => lookupAlternateProduct("1108896", {
    fetchImpl: async () => new Response(JSON.stringify({ ...found, productId: "1108896", price: Number.MAX_VALUE }), { status: 200 }),
  }), (error) => error instanceof AlternateUpstreamError && error.kind === "invalid");
  delete process.env.EVERYDATA_API_KEY;
});

test("maps provider timeout to a sanitized upstream error", async () => {
  clearAlternateCache();
  process.env.EVERYDATA_API_KEY = "test-secret";
  const fetchImpl = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(
    () => lookupAlternateProduct("5", { fetchImpl, timeoutMs: 10 }),
    (error) => error instanceof AlternateUpstreamError && error.kind === "timeout",
  );
  delete process.env.EVERYDATA_API_KEY;
});

test("maps the verified Alternate search envelope and preserves a verified shop URL", async () => {
  clearAlternateCache();
  process.env.EVERYDATA_API_KEY = "test-secret";
  process.env.EUR_PLN_RATE = "4.30";
  let calls = 0;
  const searchPayload = {
    responseStatus: "PRODUCT_FOUND_RESPONSE",
    responseMessage: "Products found",
    sortStrategy: "relevance",
    domainCode: "de",
    keyword: "ssd",
    numberOfProducts: 24,
    resultCount: 1,
    nextPage: 2,
    lastPage: 28,
    searchProductDetails: [{
      productDescription: "Intenso TOP SSD 512 GB",
      subtitle: "schwarz",
      manufacturer: "Intenso",
      asin: "1108895",
      productId: "1108895",
      variationId: "1108895",
      price: 75.9,
      retailPrice: 0,
      productRating: "4.7",
      dpUrl: "https://www.alternate.de/Intenso/TOP-SSD-512-GB/html/product/1108895",
      deliveryMessage: "Sofort verfügbar",
      available: true,
      currency: "EUR",
      used: false,
      highlights: ["Kapazität: 512 GB"],
    }],
  };
  const fetchImpl = async (input, init) => {
    calls += 1;
    assert.match(String(input), /alternate-search-by-keyword\?keyword=ssd&page=1&sortBy=relevance$/);
    assert.equal(init.headers["x-api-key"], "test-secret");
    return new Response(JSON.stringify(searchPayload), { status: 200 });
  };
  const first = await searchAlternateProducts("ssd", { fetchImpl, now: () => 2000 });
  const second = await searchAlternateProducts("ssd", { fetchImpl, now: () => 2001 });
  assert.equal(calls, 1);
  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "hit");
  assert.equal(first.data.resultCount, 1);
  assert.equal(first.data.data[0].sourceUrl, "https://www.alternate.de/Intenso/TOP-SSD-512-GB/html/product/1108895");
  assert.deepEqual(first.data.data[0].price.estimatedPLN, { amountCents: 32637, currency: "PLN", eurPlnRate: 4.3, isEstimate: true });
  assert.equal(first.data.data[0].retailPrice.originalEUR.amountCents, 0);
  delete process.env.EVERYDATA_API_KEY;
  delete process.env.EUR_PLN_RATE;
});
