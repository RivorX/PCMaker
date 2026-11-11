import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { prepareFirebaseCatalogPreview } from "../src/lib/firebase-import-preview.ts";

const [inputPath, outputPath = ".local/catalog/firebase-import.preview.json"] = process.argv.slice(2);

if (!inputPath) {
  console.error("Użycie: node --experimental-strip-types scripts/prepare-firebase-catalog.mjs <snapshot-version1.json> [preview.json]");
  process.exitCode = 2;
} else {
  try {
    const input = await readFile(inputPath, "utf8");
    let snapshot;
    try {
      snapshot = JSON.parse(input);
    } catch {
      throw new Error("Wejściowy plik nie zawiera poprawnego JSON.");
    }
    const preview = prepareFirebaseCatalogPreview(snapshot, snapshot?.source ?? "CatalogComponent snapshot", basename(inputPath));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ readyToWrite: preview.readyToWrite, components: preview.components.length, output: outputPath }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Nie udało się przygotować podglądu importu Firebase.");
    process.exitCode = 1;
  }
}
