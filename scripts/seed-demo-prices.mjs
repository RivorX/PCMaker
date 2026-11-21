import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { listExistingComponents } from "../src/lib/firebase-admin-import.ts";

const projectId = "pcmaker-b0b0a";
const sourceCommit = "c9002fe308396c780d8a378cc93c10d85b215b8b";
const sourceName = "BuildCores OpenDB";
const sourcePrefix = `https://github.com/buildcores/buildcores-open-db/blob/${sourceCommit}/open-db/`;
const expectedCount = 1030;
const bands = {
  cpu: [250, 1800],
  gpu: [400, 3500],
  memory: [100, 550],
  storage: [120, 1000],
};
const args = process.argv.slice(2).join(" ");
assert.match(args, /^(?:--apply(?: --limit [1-9]\d{0,3})?)?$/, "Use --apply [--limit N] or omit arguments for a preview");
const apply = args.startsWith("--apply");
const limit = args.includes("--limit") ? Number(args.split(" ").at(-1)) : expectedCount;
assert.ok(limit <= expectedCount, "Invalid write limit");

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, projectId, "Unexpected Firebase project");
const { adminDataConnect: dc } = await import("../src/lib/firebase-admin.ts");

const existing = await listExistingComponents(dc);
const targets = existing.filter((component) => component.specifications?.some(
  (spec) => spec.specificationName === sourceName && spec.specificationValue.startsWith(sourcePrefix),
));
assert.equal(targets.length, expectedCount, "BuildCores catalog count changed");
assert.equal(new Set(targets.map(({ id }) => id)).size, expectedCount, "Duplicate component ID");
const used = new Set(existing.map(({ price }) => price).filter((price) => price !== null));
const plan = [];
for (const component of targets.sort((a, b) => a.id.localeCompare(b.id))) {
  if (component.price !== null) continue;
  assert.match(component.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const band = bands[component.componentType.toLowerCase()];
  assert.ok(Array.isArray(band), "Unexpected component category");
  const [min, max] = band;
  const width = max - min + 1;
  const start = createHash("sha256").update(`pcmaker-demo-price-v1:${component.id}`).digest().readUInt32BE() % width;
  let price;
  for (let index = 0; index < width; index++) {
    const candidate = min + ((start + index) % width);
    if (!used.has(candidate)) { price = candidate; break; }
  }
  assert.ok(price, "No unused price in category band");
  used.add(price);
  plan.push({
    id: component.id,
    name: component.name,
    category: component.componentType,
    sourceUrl: component.specifications.find((spec) => spec.specificationName === sourceName).specificationValue,
    price,
  });
}

const selected = plan.slice(0, limit);
const mode = !apply ? "preview" : limit < expectedCount ? "pilot" : "apply";
const report = { projectId, mode, currency: "PLN", targets: targets.length, existingPrices: targets.length - plan.length, planned: selected.length, confirmed: 0, rows: selected };
await mkdir(".local/catalog", { recursive: true });
const reportPath = `.local/catalog/demo-prices-${mode}.json`;
const save = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await save();

if (apply) {
  for (let offset = 0; offset < selected.length; offset += 20) {
    const batch = selected.slice(offset, offset + 20);
    const declarations = batch.flatMap((_, i) => [`$id${i}: UUID!`, `$price${i}: Float!`, `$url${i}: String!`]);
    const variables = Object.fromEntries(batch.flatMap((row, i) => [[`id${i}`, row.id], [`price${i}`, row.price], [`url${i}`, row.sourceUrl]]));
    const operations = batch.map((_, i) => `
      row${i}: component_updateMany(
        where: {
          id: {eq: $id${i}}, price: {isNull: true},
          componentSpecifications_on_component: {exist: {
            specificationName: {eq: "BuildCores OpenDB"}, specificationValue: {eq: $url${i}}
          }}
        },
        data: {price: $price${i}}
      ) @check(expr: "this == 1", message: "Catalog row changed")
    `);
    const response = await dc.executeGraphql(
      `mutation SeedDemoPrices(${declarations.join(", ")}) @transaction { ${operations.join("\n")} }`,
      { variables },
    );
    assert.ok(!response.errors?.length && batch.every((_, i) => response.data?.[`row${i}`] === 1), "Could not confirm a batch");
    report.confirmed += batch.length;
    await save();
  }
  const after = new Map((await listExistingComponents(dc)).map((component) => [component.id, component.price]));
  for (const { id, price } of selected) assert.equal(after.get(id), price, "Saved price differs from plan");
  for (const { id, price } of targets) {
    if (price !== null) assert.equal(after.get(id), price, "An existing price changed");
  }
  report.verified = true;
  await save();
}
console.log(JSON.stringify({ ...report, rows: undefined, reportPath }));
