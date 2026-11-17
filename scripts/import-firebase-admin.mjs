import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import nextEnv from "@next/env";
import { prepareFirebaseCatalogPreview } from "../src/lib/firebase-import-preview.ts";
import {
  AdminImportError,
  buildAdminImportPlan,
  insertAdminImportBatch,
  listExistingComponents,
} from "../src/lib/firebase-admin-import.ts";

nextEnv.loadEnvConfig(process.cwd());

const DEFAULT_SNAPSHOT = ".local/catalog/userbenchmark.components.json";
const DEFAULT_REPORT = ".local/catalog/firebase-admin-import.report.json";
const DEFAULT_BATCH_SIZE = 25;

const usage = () => "Użycie: npm run import:firebase-admin -- [--apply] [--limit N] [--batch-size 25|50] [--snapshot plik]";

const parseArgs = (args) => {
  const result = { apply: false, limit: undefined, batchSize: DEFAULT_BATCH_SIZE, snapshot: DEFAULT_SNAPSHOT, report: DEFAULT_REPORT };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--limit") result.limit = Number(args[++index]);
    else if (arg === "--batch-size") result.batchSize = Number(args[++index]);
    else if (arg === "--snapshot") result.snapshot = args[++index];
    else if (arg === "--report") result.report = args[++index];
    else if (arg === "--help" || arg === "-h") { console.log(usage()); process.exit(0); }
    else throw new Error(usage());
  }
  if (result.limit !== undefined && (!Number.isSafeInteger(result.limit) || result.limit < 1)) throw new Error("--limit musi być dodatnią liczbą całkowitą.");
  if (!Number.isSafeInteger(result.batchSize) || result.batchSize < 1 || result.batchSize > 50) throw new Error("--batch-size musi być liczbą całkowitą od 1 do 50.");
  return result;
};

const createAdminClient = async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getDataConnect } = await import("firebase-admin/data-connect");
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "pcmaker-b0b0a" });
  return getDataConnect({ serviceId: "pcmaker-service", location: "europe-central2", connector: "default" }, app);
};

const writeReport = async (path, report) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

let activeReport;
let activeReportPath = DEFAULT_REPORT;

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  activeReportPath = options.report;
  const raw = await readFile(options.snapshot, "utf8");
  let snapshot;
  try { snapshot = JSON.parse(raw); } catch { throw new Error("Snapshot katalogu nie zawiera poprawnego JSON."); }
  const preview = prepareFirebaseCatalogPreview(snapshot, snapshot?.source, basename(options.snapshot));
  const client = await createAdminClient();
  const existing = await listExistingComponents(client);
  const selectedPreview = options.limit === undefined ? preview : { ...preview, components: preview.components.slice(0, options.limit) };
  const initialPlan = buildAdminImportPlan(selectedPreview, existing);
  const report = {
    mode: options.apply ? "apply" : "dry-run",
    status: initialPlan.conflicts.length ? "blocked" : "planned",
    snapshotFile: options.snapshot,
    reportFile: options.report,
    previewComponents: selectedPreview.components.length,
    existingComponents: existing.length,
    plannedInserts: initialPlan.rows.length,
    skippedExisting: initialPlan.skippedExistingIds.length,
    conflicts: initialPlan.conflicts,
    inserted: 0,
    batchSize: options.batchSize,
    limit: options.limit ?? null,
  };
  activeReport = report;
  if (initialPlan.conflicts.length) {
    await writeReport(options.report, report);
    console.log(JSON.stringify({ status: report.status, plannedInserts: report.plannedInserts, skippedExisting: report.skippedExisting, conflicts: report.conflicts.length }));
    process.exitCode = 1;
    return;
  }
  if (!options.apply || !initialPlan.rows.length) {
    await writeReport(options.report, report);
    console.log(JSON.stringify({ status: report.status, plannedInserts: report.plannedInserts, skippedExisting: report.skippedExisting, conflicts: 0 }));
    return;
  }

  const targetIds = new Set(initialPlan.rows.map((row) => String(row.id)));
  let inserted = 0;
  report.status = "applying";
  await writeReport(options.report, report);
  while (inserted < targetIds.size) {
    const pending = initialPlan.rows.slice(inserted);
    const batch = pending.slice(0, options.batchSize);
    await insertAdminImportBatch(client, batch);
    inserted += batch.length;
    report.inserted = inserted;
    await writeReport(options.report, report);
  }
  report.status = "applied";
  await writeReport(options.report, report);
  console.log(JSON.stringify({ status: report.status, inserted, skippedExisting: report.skippedExisting, conflicts: 0 }));
};

try {
  await main();
} catch (error) {
  const code = error instanceof AdminImportError ? error.code : "admin_import_failed";
  if (activeReport) {
    activeReport.status = "error";
    activeReport.errorCode = code;
    try { await writeReport(activeReportPath, activeReport); } catch { /* Keep the sanitized stderr result. */ }
  }
  console.error(`Firebase admin import failed (${code}).`);
  process.exitCode = 1;
}
