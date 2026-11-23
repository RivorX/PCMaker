import test from "node:test";
import assert from "node:assert/strict";
import { findCpuOffers } from "../src/lib/cpu-offers.ts";

const component = {
  id: "cpu-1",
  category: "cpu",
  name: "AMD Ryzen 7 7800X3D",
  manufacturer: "AMD",
  model: "Ryzen 7 7800X3D",
};

const offer = (title) => ({
  provider: "serpapi-google-shopping",
  providerProductId: title,
  title,
  source: "Sklep",
  price: { original: null, estimatedPLN: null, sourceText: null },
  link: null,
  thumbnail: null,
  sponsored: false,
});

test("looks up selected CPU pages through an injected provider and returns only strict matches", async () => {
  const calls = [];
  const result = await findCpuOffers(component, async (query, options) => {
    calls.push({ query, ...options });
    return {
      data: options.page === 1
        ? [offer("AMD Ryzen 7 7800X3D Box"), offer("AMD Ryzen 7 7800X")]
        : [offer("2x AMD Ryzen 7 7800X3D")],
      hasNext: options.page === 1,
    };
  });
  assert.equal(result.matchStatus, "candidates");
  assert.deepEqual(result.data.map((item) => item.title), ["AMD Ryzen 7 7800X3D Box"]);
  assert.deepEqual(calls.map((call) => [call.query, call.page, call.limit, call.expectedCategory]), [
    ["AMD Ryzen 7 7800X3D", 1, 50, "cpu"],
    ["AMD Ryzen 7 7800X3D", 2, 50, "cpu"],
  ]);
});

test("does not call the provider for non-CPU or unsupported models", async () => {
  let calls = 0;
  const search = async () => { calls += 1; return { data: [], hasNext: false }; };
  const gpu = { ...component, category: "gpu", name: "RTX 4070", manufacturer: "NVIDIA", model: "RTX 4070" };
  const legacy = { ...component, name: "AMD FX-8350", model: "FX-8350" };
  assert.equal((await findCpuOffers(gpu, search)).matchStatus, "unsupported");
  assert.equal((await findCpuOffers(legacy, search)).matchStatus, "unsupported");
  assert.equal(calls, 0);
});

