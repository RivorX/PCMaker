import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

const root = process.cwd();
loadEnvConfig(root);
const defaults = {
  snapshot: ".local/catalog/userbenchmark.components.json",
  coverage: ".local/catalog/opendb-coverage.json",
  modelCoverage: ".local/catalog/opendb-cpu-model-coverage.json",
  archive: ".local/catalog/opendb-c9002fe308396c780d8a378cc93c10d85b215b8b.zip",
  report: ".local/catalog/buildcores-spec-import.report.json",
};
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const paths = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, resolve(root, value(`--${key === "modelCoverage" ? "model-coverage" : key}`, fallback))]));
const existingPath = value("--existing", null);
const applySpecs = flag("--apply-specs");
if (applySpecs && existingPath) {
  console.error("BuildCores import aborted: --apply-specs requires a fresh admin preflight; remove --existing.");
  process.exit(1);
}
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const writeReport = async (report) => { await mkdir(dirname(paths.report), { recursive: true }); await writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8"); };

const main = async () => {
  const [{ readPinnedBuildCoresCpuRecords, resolveBuildCoresMatches, buildBuildCoresSpecPlan, BUILDCORES_COMMIT, BUILDCORES_LICENSE, BUILDCORES_LICENSE_URL, BUILDCORES_SPECIFICATION_SOURCE_NAME }, { listExistingComponents }, { adminDataConnect }] = await Promise.all([
    import("../src/lib/buildcores-spec-import.ts"),
    import("../src/lib/firebase-admin-import.ts"),
    import("../src/lib/firebase-admin.ts"),
  ]);
  const [snapshotBytes, snapshot, coverage, modelCoverage] = await Promise.all([readFile(paths.snapshot), readJson(paths.snapshot), readJson(paths.coverage), readJson(paths.modelCoverage)]);
  const snapshotSha256 = sha256(snapshotBytes);
  const archive = readPinnedBuildCoresCpuRecords(paths.archive);
  const matches = resolveBuildCoresMatches(snapshot, coverage, modelCoverage, archive.records, snapshotSha256);
  let existing;
  if (existingPath) {
    const parsed = await readJson(resolve(root, existingPath));
    existing = Array.isArray(parsed) ? parsed : parsed?.components;
    if (!Array.isArray(existing)) throw new Error("existing_invalid");
  } else {
    existing = await listExistingComponents(adminDataConnect);
  }
  const plan = buildBuildCoresSpecPlan(matches, existing);
  const report = {
    version: 1,
    mode: applySpecs ? "apply-specs" : "dry-run",
    readyToWrite: false,
    planValidated: plan.conflicts.length === 0,
    applyRequested: applySpecs,
    applied: { components: 0, rows: 0 },
    source: { name: BUILDCORES_SPECIFICATION_SOURCE_NAME, commit: BUILDCORES_COMMIT, license: BUILDCORES_LICENSE, licenseUrl: BUILDCORES_LICENSE_URL, archive: paths.archive, archiveSha256: archive.archiveSha256, snapshot: paths.snapshot, snapshotSha256, coverage: paths.coverage, modelCoverage: paths.modelCoverage },
    counts: plan.counts,
    safeguards: { originalImportedIdsOnly: true, exactCoverageAndPinnedArchive: true, existingSpecificationsNeverOverwritten: true, sourceMarkerName: BUILDCORES_SPECIFICATION_SOURCE_NAME, deletesExecuted: false, deletionReview: plan.deletionReview },
    conflicts: plan.conflicts,
    deleteCandidates: plan.deleteCandidates,
    addRows: plan.addRows,
    keepRows: plan.keepRows,
  };
  await writeReport(report);
  if (applySpecs) {
    if (plan.conflicts.length) throw new Error("plan_conflicts");
    const grouped = new Map();
    for (const row of plan.addRows) grouped.set(row.componentId, [...(grouped.get(row.componentId) ?? []), row]);
    for (const [componentId, rows] of grouped) {
      const response = await adminDataConnect.insertMany("ComponentSpecification", rows.map(({ id, componentId: rowComponentId, specificationName, specificationValue }) => ({ id, componentId: rowComponentId, specificationName, specificationValue })));
      if (response && typeof response === "object" && Array.isArray(response.errors) && response.errors.length > 0) throw new Error("specification_insert_failed");
      report.applied.components += 1;
      report.applied.rows += rows.length;
      await writeReport(report);
      console.log(`applied component ${componentId}: ${rows.length} specification rows`);
    }
  }
  console.log(JSON.stringify({ mode: report.mode, readyToWrite: report.readyToWrite, counts: report.counts, applied: report.applied, report: paths.report }, null, 2));
};

main().catch((error) => { console.error(`BuildCores import aborted: ${error?.code || "buildcores_import_failed"}`); process.exitCode = 1; });

