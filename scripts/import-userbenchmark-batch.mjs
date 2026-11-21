import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  prepareUserBenchmarkBatch,
  USERBENCHMARK_BATCH_DEFAULT_INPUTS,
} from "../src/lib/userbenchmark-batch.ts";

const inputPaths = process.argv.slice(2);
const paths = inputPaths.length ? inputPaths : [...USERBENCHMARK_BATCH_DEFAULT_INPUTS];
const snapshotPath = ".local/catalog/userbenchmark.components.json";
const reportPath = ".local/catalog/userbenchmark.batch.report.json";
const quarantinePath = ".local/catalog/userbenchmark.quarantine.json";

try {
  const inputs = [];
  for (const file of paths) inputs.push({ file, content: await readFile(file, "utf8") });
  const capturedAt = new Date().toISOString();
  const result = prepareUserBenchmarkBatch(inputs, capturedAt);
  const report = {
    ...result.report,
    capturedAt,
    snapshotFile: snapshotPath,
    quarantineFile: quarantinePath,
  };
  const snapshot = {
    version: 1,
    sourceFile: paths.map((file) => basename(file)).join(", "),
    importedAt: capturedAt,
    source: "UserBenchmark CSV",
    components: result.components,
    report,
  };
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(quarantinePath, `${JSON.stringify({ version: 1, source: "UserBenchmark CSV", entries: result.quarantine }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ rawRead: report.rawRead, parsed: report.parsed, accepted: report.accepted, deduplicatedIdentical: report.deduplicatedIdentical, quarantined: report.quarantined, conflictGroups: report.conflictGroups }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Nie udało się połączyć plików UserBenchmark.");
  process.exitCode = 1;
}
