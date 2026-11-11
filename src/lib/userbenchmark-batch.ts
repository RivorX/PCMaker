import type { CatalogComponent } from "../types/catalog.ts";
import { importUserBenchmarkCsv } from "./userbenchmark.ts";

export const USERBENCHMARK_BATCH_DEFAULT_INPUTS = [
  ".local/catalog/raw/CPU_UserBenchmarks.csv",
  ".local/catalog/raw/GPU_UserBenchmarks.csv",
  ".local/catalog/raw/SSD_UserBenchmarks.csv",
  ".local/catalog/raw/HDD_UserBenchmarks.csv",
  ".local/catalog/raw/RAM_UserBenchmarks.csv",
] as const;

export interface UserBenchmarkBatchInput { file: string; content: string }

export interface UserBenchmarkBatchQuarantineEntry {
  file: string;
  line: number;
  lineEnd?: number;
  reason: string;
  record: string;
}

export interface UserBenchmarkBatchFileReport {
  file: string;
  rawRead: number;
  parsed: number;
  accepted: number;
  deduplicatedIdentical: number;
  quarantined: number;
  headerError?: string;
}

export interface UserBenchmarkBatchReport {
  rawRead: number;
  parsed: number;
  accepted: number;
  deduplicatedIdentical: number;
  quarantined: number;
  physicalLinesRead: number;
  conflictGroups: { stableId: number; manufacturerModel: number };
  files: UserBenchmarkBatchFileReport[];
}

export interface UserBenchmarkBatchResult {
  components: CatalogComponent[];
  report: UserBenchmarkBatchReport;
  quarantine: UserBenchmarkBatchQuarantineEntry[];
  capturedAt: string;
}

interface Candidate {
  component: CatalogComponent;
  file: string;
  line: number;
  lineEnd?: number;
  record: string;
  fingerprint: string;
}

interface LogicalRecord { record: string; line: number; lineEnd?: number }

const logicalRecords = (content: string): { header: string; records: LogicalRecord[]; physicalLinesRead: number } => {
  const lines = content.split(/\r\n|\n|\r/);
  const records: LogicalRecord[] = [];
  let physicalLinesRead = 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    physicalLinesRead += 1;
    const line = index + 1;
    records.push({ record: lines[index], line });
  }
  return { header: lines[0] ?? "", records, physicalLinesRead };
};

const normalizedPair = (component: CatalogComponent): string =>
  `${component.manufacturer.normalize("NFKC").trim().toLocaleLowerCase("pl-PL")}\u0000${component.model.normalize("NFKC").trim().toLocaleLowerCase("pl-PL")}`;

const fingerprint = (component: CatalogComponent): string => JSON.stringify({
  id: component.id,
  name: component.name,
  manufacturer: component.manufacturer,
  model: component.model,
  category: component.category,
  description: component.description,
  specifications: component.specifications,
  performanceScore: component.performanceScore,
  price: component.price,
  source: component.source,
  sourceIdentity: component.sourceIdentity,
  sourceMetrics: component.sourceMetrics,
});

const quarantineEntry = (candidate: Pick<Candidate, "file" | "line" | "lineEnd" | "record">, reason: string): UserBenchmarkBatchQuarantineEntry => ({
  file: candidate.file,
  line: candidate.line,
  ...(candidate.lineEnd ? { lineEnd: candidate.lineEnd } : {}),
  reason,
  record: candidate.record,
});

export const prepareUserBenchmarkBatch = (inputs: UserBenchmarkBatchInput[], capturedAt: string): UserBenchmarkBatchResult => {
  if (!inputs.length) throw new Error("Nie podano plików UserBenchmark do połączenia.");
  const candidates: Candidate[] = [];
  const quarantine: UserBenchmarkBatchQuarantineEntry[] = [];
  const fileReports: UserBenchmarkBatchFileReport[] = [];
  let physicalLinesRead = 0;

  for (const input of inputs) {
    const parsedFile = logicalRecords(input.content);
    physicalLinesRead += parsedFile.physicalLinesRead;
    let headerError: string | undefined;
    try {
      importUserBenchmarkCsv(`${parsedFile.header}\n`, capturedAt);
    } catch (error) {
      headerError = error instanceof Error ? error.message : "Niepoprawny nagłówek CSV.";
    }
    let parsed = 0;
    let quarantined = 0;
    for (const record of parsedFile.records) {
      if (headerError) {
        quarantine.push(quarantineEntry({ file: input.file, ...record }, `invalid_header:${headerError}`));
        quarantined += 1;
        continue;
      }
      if (record.lineEnd !== undefined) {
        quarantine.push(quarantineEntry({ file: input.file, ...record }, "unsupported_multiline_record"));
        quarantined += 1;
        continue;
      }
      try {
        const result = importUserBenchmarkCsv(`${parsedFile.header}\n${record.record}\n`, capturedAt);
        if (result.components.length === 0) {
          quarantine.push(quarantineEntry({ file: input.file, ...record }, `unsupported_type:${result.skippedTypes.join(", ") || "unknown"}`));
          quarantined += 1;
          continue;
        }
        const component = result.components[0];
        candidates.push({ component, file: input.file, ...record, fingerprint: fingerprint(component) });
        parsed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "strict_import_error";
        quarantine.push(quarantineEntry({ file: input.file, ...record }, `strict_import_error:${message}`));
        quarantined += 1;
      }
    }
    fileReports.push({ file: input.file, rawRead: parsedFile.records.length, parsed, accepted: 0, deduplicatedIdentical: 0, quarantined, ...(headerError ? { headerError } : {}) });
  }

  const groupsById = new Map<string, Candidate[]>();
  const groupsByPair = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const byId = groupsById.get(candidate.component.id) ?? [];
    byId.push(candidate);
    groupsById.set(candidate.component.id, byId);
    const pair = normalizedPair(candidate.component);
    const byPair = groupsByPair.get(pair) ?? [];
    byPair.push(candidate);
    groupsByPair.set(pair, byPair);
  }

  const conflictReasons = new Map<Candidate, Set<string>>();
  const markConflicts = (groups: Map<string, Candidate[]>, reason: string): number => {
    let conflicts = 0;
    for (const group of groups.values()) {
      if (new Set(group.map((candidate) => candidate.fingerprint)).size <= 1) continue;
      conflicts += 1;
      for (const candidate of group) {
        const reasons = conflictReasons.get(candidate) ?? new Set<string>();
        reasons.add(reason);
        conflictReasons.set(candidate, reasons);
      }
    }
    return conflicts;
  };
  const stableIdConflictGroups = markConflicts(groupsById, "conflict_stable_id");
  const manufacturerModelConflictGroups = markConflicts(groupsByPair, "conflict_manufacturer_model");
  const conflictCandidates = new Set(conflictReasons.keys());
  for (const candidate of conflictCandidates) {
    quarantine.push(quarantineEntry(candidate, [...conflictReasons.get(candidate)!].sort().join(";")));
  }

  const survivors: Candidate[] = [];
  const seenFingerprints = new Set<string>();
  let deduplicatedIdentical = 0;
  const fileByName = new Map(fileReports.map((report) => [report.file, report]));
  for (const candidate of candidates) {
    const fileReport = fileByName.get(candidate.file)!;
    if (conflictCandidates.has(candidate)) {
      fileReport.quarantined += 1;
      continue;
    }
    if (seenFingerprints.has(candidate.fingerprint)) {
      deduplicatedIdentical += 1;
      fileReport.deduplicatedIdentical += 1;
      continue;
    }
    seenFingerprints.add(candidate.fingerprint);
    survivors.push(candidate);
    fileReport.accepted += 1;
  }
  return {
    components: survivors.map((candidate) => candidate.component),
    report: {
      rawRead: fileReports.reduce((sum, report) => sum + report.rawRead, 0),
      parsed: candidates.length,
      accepted: survivors.length,
      deduplicatedIdentical,
      quarantined: quarantine.length,
      physicalLinesRead,
      conflictGroups: { stableId: stableIdConflictGroups, manufacturerModel: manufacturerModelConflictGroups },
      files: fileReports,
    },
    quarantine,
    capturedAt,
  };
};
