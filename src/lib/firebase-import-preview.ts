import { createHash } from "node:crypto";
import type { ComponentCategory } from "../types/catalog.ts";
import { COMPONENT_CATEGORIES } from "../types/catalog.ts";

const MAX_COMPONENTS = 100_000;
const UUID_NAMESPACE = "pcmaker-firebase-component-preview-v1";
const SENSITIVE_QUERY_KEYS = /^(?:api[_-]?key|x-goog-api-key|key|token|access[_-]?token|auth(?:orization)?|secret|password|credential|signature|sig)$/i;

export const FIREBASE_PREVIEW_BLOCKERS = [
  "Component.price requires a non-null value in the current schema; preview assigns no guessed price.",
  "No approved catalog-write operation is available; no network, SQL, or mutation is executed.",
] as const;

export class FirebaseImportPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseImportPreviewError";
  }
}

export interface FirebaseImportComponent {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  componentType: ComponentCategory;
  description: string;
  price: null;
  performanceScore: null;
  productUrl: string | null;
}

export interface FirebaseImportManifestEntry {
  componentId: string;
  sourceCatalogId: string;
  sourceIdentity: {
    provider: string;
    externalId: string;
    externalType: string;
  } | null;
  source: {
    kind: string;
    label: string;
    capturedAt: string;
    url: string | null;
    provider?: string;
  };
  specifications: Record<string, string>;
  sourceMetrics?: Record<string, unknown>;
}

export interface FirebaseImportPreview {
  version: 1;
  readyToWrite: false;
  blockers: readonly string[];
  source: {
    format: "CatalogComponent snapshot";
    snapshotVersion: 1;
    label: string;
    sourceFile?: string;
  };
  components: FirebaseImportComponent[];
  manifest: FirebaseImportManifestEntry[];
}

interface RecordValue {
  [key: string]: unknown;
}

interface ValidatedInput {
  id: string;
  category: ComponentCategory;
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  source: FirebaseImportManifestEntry["source"];
  sourceIdentity: FirebaseImportManifestEntry["sourceIdentity"];
  specifications: Record<string, string>;
  sourceMetrics?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string, maxLength: number, required = false): string => {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new FirebaseImportPreviewError(`${field} musi być tekstem o długości do ${maxLength} znaków.`);
  }
  const normalized = value.trim();
  if (required && !normalized) throw new FirebaseImportPreviewError(`${field} nie może być puste.`);
  return normalized;
};

const safeSourceUrl = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = text(value, "source.url", 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    throw new FirebaseImportPreviewError("source.url musi wskazywać bezpieczny adres HTTPS.");
  }
};

const category = (value: unknown): ComponentCategory => {
  const normalized = text(value, "category", 40, true).toLocaleLowerCase("pl-PL");
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(normalized)) {
    throw new FirebaseImportPreviewError(`Nieznana kategoria komponentu: ${normalized}.`);
  }
  return normalized as ComponentCategory;
};

const sourceIdentity = (value: unknown): FirebaseImportManifestEntry["sourceIdentity"] => {
  if (value === undefined) return null;
  if (!isRecord(value)) throw new FirebaseImportPreviewError("sourceIdentity musi być obiektem.");
  return {
    provider: text(value.provider, "sourceIdentity.provider", 80, true),
    externalId: text(value.externalId, "sourceIdentity.externalId", 255, true),
    externalType: text(value.externalType, "sourceIdentity.externalType", 80, true),
  };
};

const source = (value: unknown): FirebaseImportManifestEntry["source"] => {
  if (!isRecord(value)) throw new FirebaseImportPreviewError("source musi być obiektem.");
  const kind = text(value.kind, "source.kind", 40, true);
  if (!(kind === "sample" || kind === "external" || kind === "database")) {
    throw new FirebaseImportPreviewError("source.kind ma nieobsługiwaną wartość.");
  }
  const result: FirebaseImportManifestEntry["source"] = {
    kind,
    label: text(value.label, "source.label", 200, true),
    capturedAt: text(value.capturedAt, "source.capturedAt", 100, true),
    url: safeSourceUrl(value.url),
  };
  if (value.provider !== undefined) result.provider = text(value.provider, "source.provider", 80, true);
  return result;
};

const validateSpecifications = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) throw new FirebaseImportPreviewError("specifications musi być obiektem.");
  const specifications: Record<string, string> = {};
  for (const [key, specification] of Object.entries(value)) {
    text(key, "specifications key", 100, true);
    specifications[key] = text(specification, `specifications.${key}`, 255);
  }
  return specifications;
};

const validateInput = (value: unknown): ValidatedInput => {
  if (!isRecord(value)) throw new FirebaseImportPreviewError("Każdy komponent musi być obiektem.");
  const id = text(value.id, "id", 255, true);
  const name = text(value.name, "name", 200, true);
  const manufacturer = text(value.manufacturer, "manufacturer", 100);
  const model = text(value.model, "model", 150);
  const description = text(value.description, "description", 10_000);
  const sourceValue = source(value.source);
  const identity = sourceIdentity(value.sourceIdentity);
  const specifications = validateSpecifications(value.specifications);
  if (value.currency !== "PLN") throw new FirebaseImportPreviewError("currency musi mieć wartość PLN.");
  if (!(value.price === null || (typeof value.price === "number" && Number.isFinite(value.price)))) {
    throw new FirebaseImportPreviewError("price musi być liczbą skończoną albo null.");
  }
  if (typeof value.price === "number" && value.price < 0) {
    throw new FirebaseImportPreviewError("price nie może być ujemną liczbą.");
  }
  if (!(value.performanceScore === null || (typeof value.performanceScore === "number" && Number.isFinite(value.performanceScore)))) {
    throw new FirebaseImportPreviewError("performanceScore musi być liczbą skończoną albo null.");
  }
  let metrics: Record<string, unknown> | undefined;
  if (value.sourceMetrics !== undefined) {
    if (!isRecord(value.sourceMetrics)) throw new FirebaseImportPreviewError("sourceMetrics musi być obiektem.");
    metrics = { ...value.sourceMetrics };
  }
  return { id, category: category(value.category), name, manufacturer, model, description, source: sourceValue, sourceIdentity: identity, specifications, ...(metrics ? { sourceMetrics: metrics } : {}) };
};

export const stableFirebaseComponentId = (input: { id: string; sourceIdentity: FirebaseImportManifestEntry["sourceIdentity"] }): string => {
  const identity = input.sourceIdentity
    ? JSON.stringify([input.sourceIdentity.provider, input.sourceIdentity.externalId, input.sourceIdentity.externalType])
    : JSON.stringify(["catalog-id", input.id]);
  const bytes = createHash("sha256").update(`${UUID_NAMESPACE}\u0000${identity}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const pairKey = (manufacturer: string, model: string): string | null => {
  if (!manufacturer || !model) return null;
  return `${manufacturer.normalize("NFKC").toLocaleLowerCase("pl-PL")}\u0000${model.normalize("NFKC").toLocaleLowerCase("pl-PL")}`;
};

export const prepareFirebaseCatalogPreview = (
  snapshot: unknown,
  sourceLabel?: string,
  sourceFile?: string,
): FirebaseImportPreview => {
  if (!isRecord(snapshot) || snapshot.version !== 1 || !Array.isArray(snapshot.components)) {
    throw new FirebaseImportPreviewError("Wejście musi być snapshotem version: 1 z tablicą components; surowy sample JSON nie jest obsługiwany.");
  }
  const snapshotSource = text(snapshot.source, "source", 200, true);
  if (snapshot.components.length > MAX_COMPONENTS) throw new FirebaseImportPreviewError("Snapshot zawiera zbyt wiele komponentów.");
  const components: FirebaseImportComponent[] = [];
  const manifest: FirebaseImportManifestEntry[] = [];
  const sourceIds = new Set<string>();
  const outputIds = new Set<string>();
  const pairs = new Map<string, number>();
  snapshot.components.forEach((value, index) => {
    const input = validateInput(value);
    if (sourceIds.has(input.id)) throw new FirebaseImportPreviewError(`Duplikat source catalog id: ${input.id}.`);
    sourceIds.add(input.id);
    const id = stableFirebaseComponentId(input);
    if (outputIds.has(id)) throw new FirebaseImportPreviewError(`Kolizja deterministycznego UUID dla komponentu ${input.id}.`);
    outputIds.add(id);
    const duplicatePair = pairKey(input.manufacturer, input.model);
    if (duplicatePair && pairs.has(duplicatePair)) {
      throw new FirebaseImportPreviewError(`Duplikat manufacturer/model w rekordach ${pairs.get(duplicatePair)! + 1} i ${index + 1}.`);
    }
    if (duplicatePair) pairs.set(duplicatePair, index);
    components.push({
      id,
      name: input.name,
      manufacturer: input.manufacturer,
      model: input.model,
      componentType: input.category,
      description: input.description,
      price: null,
      performanceScore: null,
      productUrl: input.source.url,
    });
    manifest.push({
      componentId: id,
      sourceCatalogId: input.id,
      sourceIdentity: input.sourceIdentity,
      source: input.source,
      specifications: input.specifications,
      ...(input.sourceMetrics ? { sourceMetrics: input.sourceMetrics } : {}),
    });
  });
  const label = text(sourceLabel ?? snapshotSource, "source label", 200, true);
  return {
    version: 1,
    readyToWrite: false,
    blockers: FIREBASE_PREVIEW_BLOCKERS,
    source: {
      format: "CatalogComponent snapshot",
      snapshotVersion: 1,
      label,
      ...(sourceFile ? { sourceFile: text(sourceFile, "sourceFile", 255, true) } : {}),
    },
    components,
    manifest,
  };
};
