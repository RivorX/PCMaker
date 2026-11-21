import { createHash } from "node:crypto";
import type { CatalogComponent, ComponentCategory } from "../types/catalog";

const REQUIRED_HEADERS = ["Type", "Part Number", "Brand", "Model", "Rank", "Benchmark", "Samples", "URL"] as const;
const TYPE_MAP: Record<string, ComponentCategory | undefined> = {
  CPU: "cpu",
  GPU: "gpu",
  SSD: "storage",
  HDD: "storage",
  RAM: "memory",
};

export interface UserBenchmarkImportResult {
  components: CatalogComponent[];
  skippedTypes: string[];
  rowsRead: number;
}

export class UserBenchmarkCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserBenchmarkCsvError";
  }
}

/** Parse RFC 4180-style CSV, including quoted commas, escaped quotes and CRLF. */
export const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote) {
      if (character === ",") {
        row.push(field);
        field = "";
        closedQuote = false;
      } else if (character === "\n") {
        row.push(field);
        if (row.some((value) => value.trim() !== "")) rows.push(row);
        row = [];
        field = "";
        closedQuote = false;
      } else if (character === "\r" && input[index + 1] === "\n") {
        // The next newline commits a CRLF row.
      } else if (character.trim() !== "") {
        throw new UserBenchmarkCsvError("CSV zawiera znaki po zamknięciu pola w cudzysłowie.");
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === '"') {
      throw new UserBenchmarkCsvError("CSV zawiera nieoczekiwany cudzysłów w polu.");
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new UserBenchmarkCsvError("CSV zawiera niezamknięte cudzysłowy.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
};

const requiredHeaderIndex = (headers: string[]): Map<string, number> => {
  const cleaned = headers.map((header) => header.replace(/^\uFEFF/, "").trim());
  const duplicates = cleaned.filter((header, index) => cleaned.indexOf(header) !== index);
  if (duplicates.length > 0) {
    throw new UserBenchmarkCsvError(`CSV zawiera powtórzony nagłówek: ${duplicates[0]}.`);
  }
  const unknown = cleaned.filter((header) => !REQUIRED_HEADERS.includes(header as (typeof REQUIRED_HEADERS)[number]));
  if (unknown.length > 0) {
    throw new UserBenchmarkCsvError(`Nieznane kolumny CSV: ${unknown.join(", ")}.`);
  }
  const missing = REQUIRED_HEADERS.filter((header) => !cleaned.includes(header));
  if (missing.length > 0) {
    throw new UserBenchmarkCsvError(`Brak wymaganych kolumn CSV: ${missing.join(", ")}.`);
  }
  return new Map(cleaned.map((header, index) => [header, index]));
};

const requiredText = (value: string, field: string, rowNumber: number): string => {
  const normalized = value.trim();
  if (!normalized) throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: puste pole ${field}.`);
  return normalized;
};

const finiteNumber = (value: string, field: string, rowNumber: number): number => {
  const normalized = value.trim();
  const parsed = Number(normalized);
  if (!normalized || !Number.isFinite(parsed)) {
    throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: pole ${field} musi być liczbą skończoną.`);
  }
  return parsed;
};

const canonicalUserBenchmarkUrl = (value: string, rowNumber: number): string => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !(url.hostname === "userbenchmark.com" || url.hostname.endsWith(".userbenchmark.com"))) {
      throw new Error("unsupported host");
    }
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: URL musi wskazywać HTTPS na domenę userbenchmark.com.`);
  }
};

const stableId = (type: string, partNumber: string, url: string, rowNumber: number): string => {
  const identity = partNumber.trim() || canonicalUserBenchmarkUrl(url, rowNumber);
  if (!identity) throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: brak Part Number i URL do utworzenia stabilnego ID.`);
  const digest = createHash("sha256").update(`${type}\u0000${identity}`).digest("hex");
  return `userbenchmark-${type.toLowerCase()}-${digest}`;
};

export const importUserBenchmarkCsv = (input: string, capturedAt = new Date().toISOString()): UserBenchmarkImportResult => {
  const rows = parseCsvRows(input);
  if (rows.length === 0) throw new UserBenchmarkCsvError("CSV jest pusty.");
  const indexes = requiredHeaderIndex(rows[0]);
  const components: CatalogComponent[] = [];
  const seen = new Set<string>();
  const skippedTypes = new Set<string>();

  rows.slice(1).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    if (row.length !== rows[0].length) {
      throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: oczekiwano ${rows[0].length} pól, otrzymano ${row.length}.`);
    }
    const value = (header: (typeof REQUIRED_HEADERS)[number]) => row[indexes.get(header)!];
    const rawType = requiredText(value("Type"), "Type", rowNumber).toUpperCase();
    const category = TYPE_MAP[rawType];
    if (!category) {
      skippedTypes.add(rawType);
      return;
    }
    const partNumber = value("Part Number").trim();
    const brand = requiredText(value("Brand"), "Brand", rowNumber);
    const model = requiredText(value("Model"), "Model", rowNumber);
    const rank = finiteNumber(value("Rank"), "Rank", rowNumber);
    const benchmark = finiteNumber(value("Benchmark"), "Benchmark", rowNumber);
    const samples = finiteNumber(value("Samples"), "Samples", rowNumber);
    if (!Number.isInteger(rank) || rank < 1 || !Number.isInteger(samples) || samples < 0) {
      throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: Rank musi być dodatnią liczbą całkowitą, a Samples nieujemną liczbą całkowitą.`);
    }
    const rawUrl = value("URL").trim();
    const url = rawUrl ? canonicalUserBenchmarkUrl(rawUrl, rowNumber) : "";
    const id = stableId(rawType, partNumber, url, rowNumber);
    if (seen.has(id)) throw new UserBenchmarkCsvError(`Wiersz ${rowNumber}: zduplikowany komponent ${id}.`);
    seen.add(id);
    components.push({
      id,
      category,
      name: `${brand} ${model}`,
      manufacturer: brand,
      model,
      description: `Rekord z pliku UserBenchmark CSV. Benchmark jest metryką tego źródła i nie jest uniwersalnym wynikiem wydajności.`,
      specifications: {},
      performanceScore: null,
      price: null,
      currency: "PLN",
      source: { kind: "external", label: "UserBenchmark CSV", capturedAt, url: url || null, provider: "userbenchmark" },
      sourceIdentity: { provider: "userbenchmark", externalId: partNumber || url, externalType: rawType },
      sourceMetrics: { metric: "userbenchmark", rank, benchmark, samples },
    });
  });

  return { components, skippedTypes: [...skippedTypes].sort(), rowsRead: rows.length - 1 };
};
