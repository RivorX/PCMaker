import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { normalizeFirebaseComponentId, type AdminExistingComponent } from "./firebase-admin-import.ts";
import { buildCoresNonCpuFields } from "./buildcores-category-fields.ts";
import { stableFirebaseComponentId } from "./firebase-import-preview.ts";

export const BUILDCORES_COMMIT = "c9002fe308396c780d8a378cc93c10d85b215b8b";
export const BUILDCORES_ARCHIVE_SHA256 = "400CE915B34A9097123E47DDA7C7D3760CFB59800F50F55638FA1FB36890A1B9";
export const BUILDCORES_LICENSE = "CC BY-NC-SA 4.0";
export const BUILDCORES_LICENSE_URL = `https://github.com/buildcores/buildcores-open-db/blob/${BUILDCORES_COMMIT}/NOTICE.md`;
export const BUILDCORES_SPECIFICATION_SOURCE_NAME = "BuildCores OpenDB";

const SPECIFICATION_FIELDS = ["socket", "memoryType", "cores", "threads", "tdp", "memoryGB", "lengthMM", "slotWidth", "interface", "powerConnectors", "capacityGB", "modules", "speed", "formFactor", "storageType"] as const;
const REFERENCED_COMPONENT_RELATIONS = [
  "ComponentSpecification.component",
  "ComponentCompatibility.component",
  "ComponentCompatibility.compatibleComponent",
  "ConfigurationComponent.component",
  "ComponentRecommendation.sourceComponent",
  "ComponentRecommendation.recommendedComponent",
] as const;
type SpecificationField = (typeof SPECIFICATION_FIELDS)[number];
type OpenDbCategory = "CPU" | "GPU" | "RAM" | "Storage";

export interface BuildCoresOpenDbRecord {
  id: string;
  name: string;
  manufacturer: string;
  category: OpenDbCategory;
  fields: Partial<Record<SpecificationField, string>>;
}

export interface BuildCoresResolvedMatch {
  componentId: string;
  componentName: string;
  sourceUrl: string;
  sourceRecord: BuildCoresOpenDbRecord;
  fields: Record<string, string>;
  matchKind: "mpn" | "model";
}

export interface BuildCoresSpecInsert {
  id: string;
  componentId: string;
  specificationName: string;
  specificationValue: string;
  sourceUrl: string;
}

export interface BuildCoresSpecPlan {
  matches: BuildCoresResolvedMatch[];
  addRows: BuildCoresSpecInsert[];
  keepRows: Array<{ componentId: string; specificationName: string; specificationValue: string; sourceUrl?: string }>;
  conflicts: Array<{ componentId: string; reason: string }>;
  deleteCandidates: string[];
  deletionReview: { status: "not_attempted"; reason: string; referencedRelations: readonly string[] };
  counts: { candidateComponents: number; addRows: number; keepRows: number; conflicts: number; deleteCandidates: number };
}

export class BuildCoresImportError extends Error {
  readonly code: string;
  constructor(code: string, message = "Import specyfikacji BuildCores nie powiódł się.") {
    super(message);
    this.code = code;
    this.name = "BuildCoresImportError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();

interface ZipEntry { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number }

const readZipEntries = (archive: Buffer): ZipEntry[] => {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const end = archive.lastIndexOf(signature);
  if (end < 0) throw new BuildCoresImportError("archive_invalid");
  const count = archive.readUInt16LE(end + 10);
  const directorySize = archive.readUInt32LE(end + 12);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (count > 100_000 || directoryOffset + directorySize > archive.length) throw new BuildCoresImportError("archive_invalid");
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new BuildCoresImportError("archive_invalid");
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    entries.push({
      name: archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"),
      method: archive.readUInt16LE(cursor + 10),
      compressedSize: archive.readUInt32LE(cursor + 20),
      uncompressedSize: archive.readUInt32LE(cursor + 24),
      localOffset: archive.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const readZipEntry = (archive: Buffer, entry: ZipEntry): Buffer => {
  if (entry.uncompressedSize > 5_000_000 || entry.localOffset + 30 > archive.length) throw new BuildCoresImportError("archive_invalid");
  const local = entry.localOffset;
  if (archive.readUInt32LE(local) !== 0x04034b50) throw new BuildCoresImportError("archive_invalid");
  const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
  const end = start + entry.compressedSize;
  if (end > archive.length) throw new BuildCoresImportError("archive_invalid");
  const compressed = archive.subarray(start, end);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new BuildCoresImportError("archive_encoding_unsupported");
};

const recordFields = (category: OpenDbCategory, item: Record<string, unknown>): Partial<Record<SpecificationField, string>> => {
  const fields: Partial<Record<SpecificationField, string>> = {};
  if (category !== "CPU") return buildCoresNonCpuFields(category, item);
  const specifications = isRecord(item.specifications) ? item.specifications : {};
  const socket = text(item.socket);
  if (/^[A-Za-z]+(?:[ -]?)[0-9]+[A-Za-z0-9+ -]*$/.test(socket)) fields.socket = socket.replace(/\s+/g, "");
  const memory = isRecord(specifications.memory) ? specifications.memory : {};
  const memoryTypes = Array.isArray(memory.types) ? memory.types.map(text).filter(Boolean) : [];
  if (memoryTypes.length) fields.memoryType = [...new Set(memoryTypes)].join(" / ");
  const cores = isRecord(item.cores) ? item.cores : {};
  if (typeof cores.total === "number" && Number.isInteger(cores.total) && cores.total > 0) fields.cores = String(cores.total);
  if (typeof cores.threads === "number" && Number.isInteger(cores.threads) && cores.threads > 0) fields.threads = String(cores.threads);
  const tdp = specifications.tdp;
  if ((typeof tdp === "number" && Number.isFinite(tdp) && tdp > 0) || (typeof tdp === "string" && tdp.trim())) fields.tdp = String(tdp).trim();
  return fields;
};

export const readPinnedBuildCoresCpuRecords = (archivePath: string): { archiveSha256: string; records: Map<string, BuildCoresOpenDbRecord> } => {
  const fileName = archivePath.split(/[\\/]/).pop() ?? "";
  if (fileName !== `opendb-${BUILDCORES_COMMIT}.zip`) throw new BuildCoresImportError("archive_unpinned");
  const archive = readFileSync(archivePath);
  const archiveSha256 = sha256File(archivePath);
  if (archiveSha256 !== BUILDCORES_ARCHIVE_SHA256) throw new BuildCoresImportError("archive_hash_mismatch");
  const records = new Map<string, BuildCoresOpenDbRecord>();
  for (const entry of readZipEntries(archive)) {
    const match = /(?:^|\/)open-db\/(CPU|GPU|RAM|Storage)\/([^/]+)\.json$/i.exec(entry.name);
    if (!match) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(readZipEntry(archive, entry).toString("utf8")); } catch { throw new BuildCoresImportError("archive_record_invalid"); }
    if (!isRecord(parsed) || !isRecord(parsed.metadata)) throw new BuildCoresImportError("archive_record_invalid");
    const category = match[1] as OpenDbCategory;
    const id = text(parsed.opendb_id);
    const name = text(parsed.metadata.name);
    const manufacturer = text(parsed.metadata.manufacturer);
    if (!id || !name || id.toLowerCase() !== match[2].toLowerCase()) continue;
    if (records.has(id.toLowerCase())) throw new BuildCoresImportError("archive_duplicate_record");
    records.set(`${category}|${id.toLowerCase()}`, { id, name, manufacturer, category, fields: recordFields(category, parsed) });
  }
  if (!records.size) throw new BuildCoresImportError("archive_no_cpu_records");
  return { archiveSha256, records };
};

const normalizedField = (name: string): SpecificationField | null => {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  if (normalized === "memorytypes" || normalized === "memorytype") return "memoryType";
  const field = SPECIFICATION_FIELDS.find((candidate) => candidate.toLocaleLowerCase("en-US") === normalized);
  return field ?? null;
};

export const resolveBuildCoresMatches = (
  snapshot: unknown,
  coverage: unknown,
  modelCoverage: unknown,
  archiveRecords: Map<string, BuildCoresOpenDbRecord>,
  snapshotSha256: string,
): BuildCoresResolvedMatch[] => {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.components)) throw new BuildCoresImportError("snapshot_invalid");
  if (!isRecord(coverage) || !isRecord(modelCoverage) || coverage.snapshotSha256 !== modelCoverage.snapshotSha256 || String(coverage.snapshotSha256).toUpperCase() !== snapshotSha256.toUpperCase()) {
    throw new BuildCoresImportError("coverage_snapshot_mismatch");
  }
  if (coverage.commit !== BUILDCORES_COMMIT || modelCoverage.commit !== BUILDCORES_COMMIT) throw new BuildCoresImportError("coverage_commit_mismatch");
  const components = new Map<string, Record<string, unknown>>();
  for (const raw of snapshot.components) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !isRecord(raw.sourceIdentity)) throw new BuildCoresImportError("snapshot_record_invalid");
    if (raw.sourceIdentity.provider === "userbenchmark") components.set(raw.id, raw);
  }
  const rows = [...(Array.isArray(coverage.rows) ? coverage.rows : []), ...(Array.isArray(modelCoverage.rows) ? modelCoverage.rows : [])];
  const matches = new Map<string, BuildCoresResolvedMatch>();
  for (const raw of rows) {
    if (!isRecord(raw) || typeof raw.id !== "string") throw new BuildCoresImportError("coverage_row_invalid");
    if (raw.status !== "matched" && raw.status !== "matchedByModel") continue;
    const component = components.get(raw.id);
    if (!component) throw new BuildCoresImportError("coverage_id_not_original_component");
    const source = text(raw.source);
    const sourceMatch = /\/open-db\/(CPU|GPU|RAM|Storage)\/([^/]+)\.json$/i.exec(source);
    if (!sourceMatch || !source.startsWith(`https://github.com/buildcores/buildcores-open-db/blob/${BUILDCORES_COMMIT}/`)) throw new BuildCoresImportError("coverage_source_invalid");
    const record = archiveRecords.get(`${sourceMatch[1]}|${sourceMatch[2].toLowerCase()}`);
    if (!record) throw new BuildCoresImportError("coverage_source_missing_archive_record");
    const externalType = text(isRecord(component.sourceIdentity) ? component.sourceIdentity.externalType : "").toUpperCase();
    const sourceType = text(raw.type).toUpperCase() || externalType;
    const expectedCategory = sourceType === "SSD" || sourceType === "HDD" ? "Storage" : sourceType;
    if (record.category !== expectedCategory) throw new BuildCoresImportError("coverage_category_mismatch");
    if (sourceType !== externalType && !(expectedCategory === "Storage" && (externalType === "SSD" || externalType === "HDD"))) throw new BuildCoresImportError("coverage_snapshot_type_mismatch");
    const requested = raw.status === "matched"
      ? (Array.isArray(raw.fields) ? raw.fields.map((field) => normalizedField(String(field))).filter((field): field is SpecificationField => field !== null) : [])
      : (isRecord(raw.fields) ? Object.keys(raw.fields).map(normalizedField).filter((field): field is SpecificationField => field !== null) : []);
    const fields = {} as Record<SpecificationField, string>;
    for (const field of [...new Set(requested)]) {
      const value = record.fields[field];
      if (!value) throw new BuildCoresImportError("coverage_field_missing_archive_value", `Brak pola ${field} w rekordzie ${record.id}.`);
      fields[field] = value;
    }
    if (!Object.keys(fields).length) throw new BuildCoresImportError("coverage_no_supported_fields");
    const resolved: BuildCoresResolvedMatch = {
      componentId: stableFirebaseComponentId({ id: raw.id, sourceIdentity: component.sourceIdentity as { provider: string; externalId: string; externalType: string } }),
      componentName: text(component.name),
      sourceUrl: source,
      sourceRecord: record,
      fields,
      matchKind: raw.status === "matched" ? "mpn" : "model",
    };
    const previous = matches.get(resolved.componentId);
    if (previous && JSON.stringify(previous.fields) !== JSON.stringify(resolved.fields)) throw new BuildCoresImportError("coverage_duplicate_conflict");
    matches.set(resolved.componentId, resolved);
  }
  return [...matches.values()];
};

const normalizedSpecName = (value: string): string => value.trim().toLocaleLowerCase("en-US");
const normalizedSpecValue = (value: string): string => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const stableSpecId = (componentId: string, name: string, value: string): string => {
  const bytes = createHash("sha256").update(`pcmaker-buildcores-spec-v1\u0000${componentId}\u0000${name}\u0000${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const buildBuildCoresSpecPlan = (matches: BuildCoresResolvedMatch[], existing: AdminExistingComponent[]): BuildCoresSpecPlan => {
  const existingById = new Map(existing.map((component) => [normalizeFirebaseComponentId(component.id), component]));
  const addRows: BuildCoresSpecInsert[] = [];
  const keepRows: BuildCoresSpecPlan["keepRows"] = [];
  const conflicts: BuildCoresSpecPlan["conflicts"] = [];
  for (const match of matches) {
    const component = existingById.get(match.componentId);
    if (!component) {
      conflicts.push({ componentId: match.componentId, reason: "component_not_in_admin_read" });
      continue;
    }
    const byName = new Map<string, { name: string; value: string }>();
    let blocked = false;
    for (const specification of component.specifications ?? []) {
      const name = text(specification.specificationName);
      const value = text(specification.specificationValue);
      const key = normalizedSpecName(name);
      if (!name || !value || (byName.has(key) && byName.get(key)?.value !== value)) {
        conflicts.push({ componentId: match.componentId, reason: "duplicate_existing_specification" });
        blocked = true;
        break;
      }
      byName.set(key, { name, value });
    }
    if (blocked) continue;
    const componentAdds: BuildCoresSpecInsert[] = [];
    for (const [name, value] of Object.entries(match.fields)) {
      const existingSpec = byName.get(normalizedSpecName(name));
      if (existingSpec) {
        if (normalizedSpecValue(existingSpec.value) !== normalizedSpecValue(value)) {
          conflicts.push({ componentId: match.componentId, reason: `existing_value_conflict:${name}` });
          blocked = true;
          break;
        }
        keepRows.push({ componentId: match.componentId, specificationName: existingSpec.name, specificationValue: existingSpec.value });
      } else {
        componentAdds.push({ id: stableSpecId(match.componentId, name, value), componentId: match.componentId, specificationName: name, specificationValue: value, sourceUrl: match.sourceUrl });
      }
    }
    if (blocked) continue;
    if (componentAdds.length > 0) {
      const marker = byName.get(normalizedSpecName(BUILDCORES_SPECIFICATION_SOURCE_NAME));
      if (marker) {
        if (marker.value !== match.sourceUrl) {
          conflicts.push({ componentId: match.componentId, reason: "existing_source_marker_conflict" });
          continue;
        }
        keepRows.push({ componentId: match.componentId, specificationName: marker.name, specificationValue: marker.value, sourceUrl: marker.value });
      } else {
        componentAdds.push({ id: stableSpecId(match.componentId, BUILDCORES_SPECIFICATION_SOURCE_NAME, match.sourceUrl), componentId: match.componentId, specificationName: BUILDCORES_SPECIFICATION_SOURCE_NAME, specificationValue: match.sourceUrl, sourceUrl: match.sourceUrl });
      }
    }
    addRows.push(...componentAdds);
  }
  return {
    matches,
    addRows,
    keepRows,
    conflicts,
    deleteCandidates: [],
    deletionReview: { status: "not_attempted", reason: "Nie wykonano preflightu wszystkich referencji komponentu; ten dry-run nie generuje ani nie wykonuje DELETE.", referencedRelations: REFERENCED_COMPONENT_RELATIONS },
    counts: { candidateComponents: matches.length, addRows: addRows.length, keepRows: keepRows.length, conflicts: conflicts.length, deleteCandidates: 0 },
  };
};

