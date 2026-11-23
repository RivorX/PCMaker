import test from "node:test";
import assert from "node:assert/strict";
import { createCpuOfferMatcher } from "../src/lib/cpu-offer-matcher.ts";

const amd = { name: "AMD Ryzen 7 7800X3D", manufacturer: "AMD", model: "Ryzen 7 7800X3D" };
const intel = { name: "Intel Core i5-14600K", manufacturer: "Intel", model: "Core i5-14600K" };

test("matches supported AMD and Intel title variants without confusing suffixes", () => {
  const amdMatcher = createCpuOfferMatcher(amd);
  assert.equal(amdMatcher.supported, true);
  assert.equal(amdMatcher.matchesTitle("Procesor AMD Ryzen 7 7800 X3D BOX"), true);
  assert.equal(amdMatcher.matchesTitle("Procesor AMD Ryzen 7 7800X"), false);
  assert.equal(amdMatcher.matchesTitle("2x Procesor AMD Ryzen 7 7800X3D Box"), false);
  assert.equal(amdMatcher.matchesTitle("2 x Procesor AMD Ryzen 7 7800X3D Box"), false);
  assert.equal(amdMatcher.matchesTitle("3x Intel Core i5-14600K"), false);
  assert.equal(amdMatcher.matchesTitle("Procesor AMD Ryzen 7 8700G AM5 DDR5 Radeon Graphics"), false);
  assert.equal(amdMatcher.matchesTitle("Procesor AMD Ryzen 7 7800X3D 32GB DDR5"), false);

  const amd8700 = createCpuOfferMatcher({ name: "AMD Ryzen 7 8700G", manufacturer: "AMD", model: "Ryzen 7 8700G" });
  assert.equal(amd8700.matchesTitle("AMD Ryzen 7 8700G 8 Core 16 Threads Radeon Graphics"), true);
  assert.equal(amd8700.matchesTitle("Intel Ryzen 7 8700G 8 Core 16 Threads"), false);

  const intelMatcher = createCpuOfferMatcher(intel);
  assert.equal(intelMatcher.supported, true);
  assert.equal(intelMatcher.matchesTitle("Procesor Intel Core i5-14600K Tray"), true);
  assert.equal(intelMatcher.matchesTitle("Intel Core i5 14600KF"), false);
  assert.equal(intelMatcher.matchesTitle("Intel Core i5-14600K / 14700K"), false);
  assert.equal(intelMatcher.matchesTitle("Renkforce Zestaw modernizacyjny Intel Core i5 14600K 16 GB DDR4-RAM"), false);
  assert.equal(intelMatcher.matchesTitle("Intel Core i5-14600K LGA1700 Z790"), false);
});

test("supports Core Ultra and refuses unsupported or ambiguous catalog models", () => {
  const ultra = createCpuOfferMatcher({ name: "Intel Core Ultra 7 265K", manufacturer: "Intel", model: "Core Ultra 7 265K" });
  assert.equal(ultra.supported, true);
  assert.equal(ultra.matchesTitle("Intel Core Ultra 7 265 K processor"), true);
  assert.equal(ultra.matchesTitle("Intel Core 7 265K"), false);

  const legacy = createCpuOfferMatcher({ name: "AMD FX-8350", manufacturer: "AMD", model: "FX-8350" });
  assert.equal(legacy.supported, false);
  assert.equal(legacy.matchesTitle("AMD FX-8350"), false);
});

