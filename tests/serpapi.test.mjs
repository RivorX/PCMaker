import test from "node:test";
import assert from "node:assert/strict";
import {
  SerpApiNotConfiguredError,
  SerpApiUpstreamError,
  clearSerpApiCache,
  searchSerpApiProducts,
} from "../src/lib/serpapi.ts";

const flatPayload = {
  search_metadata: { status: "Success", id: "internal-only" },
  search_parameters: { engine: "google_shopping", q: "Ryzen" },
  shopping_results: [
    {
      position: 1,
      title: "AMD Ryzen 7 7800X3D",
      product_id: "amd-7800x3d",
      product_link: "https://www.google.com/shopping/product/123",
      source: "Sklep CPU",
      price: "1 499,00 zł",
      extracted_price: 1499,
      thumbnail: "https://images.example.test/cpu.jpg",
    },
    {
      position: 2,
      title: "Komputer Gamingowy PC Ryzen 7 7800X3D RX 9070 16GB Win11",
      product_id: "whole-pc-1",
      product_link: "https://www.google.com/shopping/product/124",
      source: "Sklep PC",
      price: "6 999,00 zł",
      extracted_price: 6999,
    },
    {
      position: 3,
      title: "Ryzen 7 7800X3D 32GB RAM 2TB SSD Radeon RX 9070 16GB Win 11 WiFi",
      product_id: "whole-pc-2",
      product_link: "https://www.google.com/shopping/product/125",
      source: "Sklep PC",
      price: "7 999,00 zł",
      extracted_price: 7999,
    },
    {
      position: 4,
      title: "Ryzen 7 7800X3D — import USD",
      product_id: "usd-1",
      product_link: "https://shop.example.test/usd",
      source: "Sklep USD",
      price: "$399.99",
      extracted_price: 399.99,
    },
    {
      position: 5,
      title: "AMD Ryzen 7 7800X3D duplicate",
      product_id: "amd-7800x3d",
      product_link: "https://www.google.com/shopping/product/126",
      source: "Sklep CPU",
      price: "1 499,00 zł",
      extracted_price: 1499,
    },
    {
      position: 6,
      title: "AMD Ryzen 7 7800X3D other shop",
      product_id: "amd-7800x3d",
      product_link: "https://www.google.com/shopping/product/129",
      source: "Inny sklep CPU",
      price: "1 550,00 zł",
      extracted_price: 1550,
    },
  ],
  categorized_shopping_results: [{ category: "Promoted", shopping_results: [{
    title: "Ryzen 7 promoted",
    product_id: "promoted-1",
    product_link: "https://www.google.com/shopping/product/127",
    source: "Sklep promoted",
    price: "€100.00",
    extracted_price: 100,
  }] }],
  inline_shopping_results: [{
    title: "Ryzen inline",
    product_id: "inline-1",
    product_link: "https://www.google.com/shopping/product/128",
    source: "Sklep inline",
    price: "900,00 zł",
    extracted_price: 900,
  }],
};

const setConfigured = () => {
  const previousKey = process.env.SERPAPI_API_KEY;
  const previousRate = process.env.EUR_PLN_RATE;
  process.env.SERPAPI_API_KEY = "test-serp-key";
  process.env.EUR_PLN_RATE = "4.30";
  return () => {
    if (previousKey === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = previousKey;
    if (previousRate === undefined) delete process.env.EUR_PLN_RATE;
    else process.env.EUR_PLN_RATE = previousRate;
    clearSerpApiCache();
  };
};

test("normalizes flat/grouped shopping results, PLN prices and local pagination", async () => {
  const restore = setConfigured();
  try {
    let calls = 0;
    const fetchImpl = async (input, init) => {
      calls += 1;
      const url = new URL(input);
      assert.equal(url.origin, "https://serpapi.com");
      assert.equal(url.pathname, "/search.json");
      assert.equal(url.searchParams.get("engine"), "google_shopping");
      assert.equal(url.searchParams.get("q"), "Ryzen");
      assert.equal(url.searchParams.get("gl"), "pl");
      assert.equal(url.searchParams.get("hl"), "pl");
      assert.equal(url.searchParams.get("google_domain"), "google.pl");
      assert.equal(url.searchParams.get("location"), "Warsaw, Poland");
      assert.equal(url.searchParams.get("api_key"), "test-serp-key");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      return new Response(JSON.stringify(flatPayload), { status: 200 });
    };
    const first = await searchSerpApiProducts(" Ryzen ", { expectedCategory: "cpu", limit: 2, fetchImpl, now: () => 1000 });
    const middle = await searchSerpApiProducts("Ryzen", { expectedCategory: "cpu", page: 2, limit: 2, fetchImpl, now: () => 1001 });
    const second = await searchSerpApiProducts("Ryzen", { expectedCategory: "cpu", page: 3, limit: 2, fetchImpl, now: () => 1001 });
    assert.equal(calls, 1);
    assert.equal(first.cache, "miss");
    assert.equal(second.cache, "hit");
    assert.equal(first.total, 5);
    assert.equal(first.hasNext, true);
    assert.equal(first.data.length, 2);
    assert.equal(first.data[0].title, "AMD Ryzen 7 7800X3D");
    assert.deepEqual(first.data[0].price.estimatedPLN, { amountCents: 149900, currency: "PLN", isEstimate: false });
    assert.equal(first.data[0].link, "https://www.google.com/shopping/product/123");
    assert.equal(first.data[1].price.estimatedPLN, null);
    assert.deepEqual(middle.data[1].price.estimatedPLN, { amountCents: 90000, currency: "PLN", isEstimate: false });
    assert.equal(middle.data[1].sponsored, true);
    assert.equal(second.data.length, 1);
    assert.equal(second.data[0].sponsored, false);
    assert.deepEqual(second.data[0].price.estimatedPLN, { amountCents: 43000, currency: "PLN", eurPlnRate: 4.3, isEstimate: true });
  } finally {
    restore();
  }
});

test("accepts a flat snapshot without prices and refuses unsafe links", async () => {
  const restore = setConfigured();
  try {
    const payload = { shopping_results: [{
      title: "GPU bez ceny",
      product_id: "gpu-1",
      product_link: "https://shop.example.test/product?api_key=leak",
      link: "https://shop.example.test/product/1",
      source: "Sklep",
      price: null,
      extracted_price: null,
    }] };
    const result = await searchSerpApiProducts("GPU", { fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    assert.equal(result.data[0].price.estimatedPLN, null);
    assert.equal(result.data[0].link, "https://shop.example.test/product/1");
  } finally {
    restore();
  }
});

test("does not convert USD, excludes PC bundles for CPU context and does not invent pages", async () => {
  const restore = setConfigured();
  try {
    const payload = { shopping_results: [
      { title: "CPU USD", product_id: "usd", price: "$399.99", extracted_price: 399.99 },
      { title: "Ryzen 7 7800X3D 32GB RAM 2TB SSD Radeon RX 9070 16GB Win 11 WiFi", product_id: "bundle", price: "7 999,00 zł", extracted_price: 7999 },
      { title: "Ryzen 7 standalone", product_id: "cpu", price: "1 299,00 zł", extracted_price: 1299 },
    ] };
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return new Response(JSON.stringify(payload), { status: 200 }); };
    const result = await searchSerpApiProducts("Ryzen", { expectedCategory: "cpu", page: 2, limit: 2, fetchImpl });
    assert.equal(calls, 1);
    assert.equal(result.total, 2);
    assert.equal(result.hasNext, false);
    assert.equal(result.data.length, 0);
    const firstPage = await searchSerpApiProducts("Ryzen", { expectedCategory: "cpu", page: 1, limit: 2, fetchImpl });
    assert.equal(firstPage.data[0].price.estimatedPLN, null);
    assert.equal(firstPage.data[1].title, "Ryzen 7 standalone");
  } finally {
    restore();
  }
});

test("sanitizes missing key, rate limits and timeouts", async () => {
  clearSerpApiCache();
  const previousKey = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  await assert.rejects(() => searchSerpApiProducts("CPU", { fetchImpl: async () => { throw new Error("must not call"); } }), SerpApiNotConfiguredError);
  process.env.SERPAPI_API_KEY = "test-serp-key";
  await assert.rejects(() => searchSerpApiProducts("RATE", { fetchImpl: async () => new Response("", { status: 429 }) }), (error) => error instanceof SerpApiUpstreamError && error.kind === "rate_limited");
  await assert.rejects(() => searchSerpApiProducts("TIMEOUT", { timeoutMs: 10, fetchImpl: async (_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })) }), (error) => error instanceof SerpApiUpstreamError && error.kind === "timeout");
  if (previousKey === undefined) delete process.env.SERPAPI_API_KEY;
  else process.env.SERPAPI_API_KEY = previousKey;
  clearSerpApiCache();
});

test("CPU filtering excludes actual desktop title patterns but preserves integrated graphics CPUs", async () => {
  const restore = setConfigured();
  try {
    const titles = [
      "Komputer Komfig Ryzen 7 7800X3D 32GB",
      "Desktop Polecany zestaw Ryzen 7 7800X3D/32GB/1TB/RX9070 XT 16GB",
      "Ryzen 7 7800X3D 32GB RAM 2TB SSD Radeon RX 9070 16GB Win 11 WiFi",
      "Procesor AMD Ryzen 7 8700G AM5 DDR5 Radeon Graphics",
      "Gaming Ryzen 7 7800X3d 32Gb 1Tb Rx9070xt 16Gb Win11",
      "ASUS PC Gaming AMD Ryzen 7 7800X3D RX 9070 GRE",
      "Gamingowy Portos Ryzen 7 7800X3D SSD2TB 4TB 32GB RX9060XT 16GB Wifi",
      "CORE RYZEN 7 7800X3D SSD2TB 32GB RTX5060Ti WIFI WIN11",
    ];
    const data = await searchSerpApiProducts("Procesor", { expectedCategory: "cpu", fetchImpl: async () => new Response(JSON.stringify({ shopping_results: titles.map((title, index) => ({ title, product_id: String(index), source: "Sklep", price: "1 499,00 zł", extracted_price: 1499 })) })) });
    assert.deepEqual(data.data.map((item) => item.title), [titles[3]]);
  } finally { restore(); }
});

test("rejects provider errors and prevents reflected credentials from entering results", async () => {
  const restore = setConfigured();
  try {
    for (const payload of [
      { error: "test-serp-key" },
      { shopping_results: [{ title: "CPU test-serp-key", price: "10 zł", extracted_price: 10 }] },
    ]) {
      await assert.rejects(() => searchSerpApiProducts("CPU", { fetchImpl: async () => new Response(JSON.stringify(payload)) }), (error) => error instanceof SerpApiUpstreamError && !error.message.includes("test-serp-key"));
    }
  } finally { restore(); }
});
