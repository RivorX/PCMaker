import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { importUserBenchmarkCsv } from "../src/lib/userbenchmark.ts";

const [inputPath, outputPath = "data/userbenchmark.components.json"] = process.argv.slice(2);
if (!inputPath) {
  console.error("Użycie: node --experimental-strip-types scripts/import-userbenchmark.mjs <plik.csv> [plik-wyjściowy.json]");
  process.exitCode = 2;
} else {
  try {
    const input = await readFile(inputPath, "utf8");
    const result = importUserBenchmarkCsv(input);
    const output = {
      version: 1,
      sourceFile: basename(inputPath),
      importedAt: new Date().toISOString(),
      source: "UserBenchmark CSV",
      components: result.components,
      report: { rowsRead: result.rowsRead, imported: result.components.length, skippedTypes: result.skippedTypes },
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(output.report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Nie udało się zaimportować pliku CSV.");
    process.exitCode = 1;
  }
}
