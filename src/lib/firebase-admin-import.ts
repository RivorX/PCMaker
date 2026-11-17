import type { FirebaseImportComponent, FirebaseImportPreview } from "./firebase-import-preview.ts";

const ADMIN_LIST_QUERY = `query AdminListComponents($limit: Int!, $offset: Int!) {
  components(limit: $limit, offset: $offset, orderBy: [{ id: ASC }]) {
    id
    name
    manufacturer
    model
    componentType
    description
    price
    performanceScore
    productUrl
    specifications: componentSpecifications_on_component {
      specificationName
      specificationValue
    }
  }
}`;

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_ROWS = 100_000;

export interface AdminExistingComponent {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  componentType: string;
  description: string | null;
  price: number | null;
  performanceScore: number | null;
  productUrl: string | null;
  specifications?: Array<{ specificationName: string; specificationValue: string }>;
}

export interface AdminDataConnectClient {
  executeGraphqlRead: (query: string, options: { variables: { limit: number; offset: number } }) => Promise<unknown>;
  insertMany: (tableName: string, rows: Array<Record<string, unknown>>) => Promise<unknown>;
}

export interface AdminImportConflict {
  id: string;
  reason: "same_id_content" | "existing_manufacturer_model" | "duplicate_existing_id" | "duplicate_input_id";
}

export interface AdminImportPlan {
  rows: Array<Record<string, unknown>>;
  skippedExistingIds: string[];
  conflicts: AdminImportConflict[];
}

export class AdminImportError extends Error {
  readonly code: string;

  constructor(code: string, message = "Administracyjny import katalogu nie powiódł się.") {
    super(message);
    this.code = code;
    this.name = "AdminImportError";
  }
}

export const adminListComponentsQuery = ADMIN_LIST_QUERY;

export const normalizeFirebaseComponentId = (value: string): string => {
  const normalized = value.trim();
  if (/^[0-9a-f]{32}$/i.test(normalized)) {
    const lower = normalized.toLowerCase();
    return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return normalized.toLowerCase();
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, nullable = false): string | null => {
  if (value === null || value === undefined) return nullable ? null : "";
  return typeof value === "string" ? value.trim() : null;
};

const category = (value: string): string => {
  const normalized = value.trim().toLocaleLowerCase("pl-PL");
  const aliases: Record<string, string> = { ram: "memory", ssd: "storage", hdd: "storage" };
  return aliases[normalized] ?? normalized;
};

const pairKey = (manufacturer: string | null, model: string | null): string | null => {
  if (!manufacturer || !model) return null;
  return `${manufacturer.normalize("NFKC").toLocaleLowerCase("pl-PL")}\u0000${model.normalize("NFKC").toLocaleLowerCase("pl-PL")}`;
};

const controlledKey = (component: FirebaseImportComponent | AdminExistingComponent): string => JSON.stringify({
  id: component.id,
  name: text(component.name) ?? "",
  manufacturer: text(component.manufacturer, true),
  model: text(component.model, true),
  componentType: category(component.componentType),
  description: text(component.description, true),
  performanceScore: component.performanceScore ?? null,
  productUrl: text(component.productUrl, true),
});

const responseComponents = (response: unknown): AdminExistingComponent[] => {
  if (!isRecord(response) || !isRecord(response.data) || !Array.isArray(response.data.components)) {
    throw new AdminImportError("existing_read_invalid");
  }
  return response.data.components.map((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.componentType !== "string") {
      throw new AdminImportError("existing_read_invalid");
    }
    const specifications = value.specifications === undefined ? undefined : value.specifications;
    if (specifications !== undefined && !Array.isArray(specifications)) throw new AdminImportError("existing_read_invalid");
    return {
      id: normalizeFirebaseComponentId(value.id),
      name: value.name,
      manufacturer: text(value.manufacturer, true),
      model: text(value.model, true),
      componentType: value.componentType,
      description: text(value.description, true),
      price: typeof value.price === "number" ? value.price : null,
      performanceScore: typeof value.performanceScore === "number" ? value.performanceScore : null,
      productUrl: text(value.productUrl, true),
      ...(specifications ? { specifications: specifications as Array<{ specificationName: string; specificationValue: string }> } : {}),
    };
  });
};

export const listExistingComponents = async (
  client: AdminDataConnectClient,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<AdminExistingComponent[]> => {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new AdminImportError("invalid_page_size");
  const existing: AdminExistingComponent[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let response: unknown;
    try {
      response = await client.executeGraphqlRead(ADMIN_LIST_QUERY, { variables: { limit: pageSize, offset } });
    } catch {
      throw new AdminImportError("existing_read_failed");
    }
    const page = responseComponents(response);
    existing.push(...page);
    if (existing.length > maxRows) throw new AdminImportError("existing_read_limit");
    if (page.length < pageSize) return existing;
  }
  throw new AdminImportError("existing_read_limit");
};

export const buildAdminImportPlan = (
  preview: FirebaseImportPreview,
  existing: AdminExistingComponent[],
): AdminImportPlan => {
  const existingById = new Map<string, AdminExistingComponent>();
  const existingPairIds = new Map<string, string>();
  const conflicts: AdminImportConflict[] = [];
  for (const record of existing) {
    const normalizedRecord = { ...record, id: normalizeFirebaseComponentId(record.id) };
    if (existingById.has(normalizedRecord.id)) conflicts.push({ id: normalizedRecord.id, reason: "duplicate_existing_id" });
    existingById.set(normalizedRecord.id, normalizedRecord);
    const pair = pairKey(normalizedRecord.manufacturer, normalizedRecord.model);
    if (pair && existingPairIds.has(pair) && existingPairIds.get(pair) !== normalizedRecord.id) {
      conflicts.push({ id: normalizedRecord.id, reason: "existing_manufacturer_model" });
    } else if (pair) {
      existingPairIds.set(pair, normalizedRecord.id);
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  const skippedExistingIds: string[] = [];
  const incomingIds = new Set<string>();
  for (const component of preview.components) {
    if (incomingIds.has(component.id)) {
      conflicts.push({ id: component.id, reason: "duplicate_input_id" });
      continue;
    }
    incomingIds.add(component.id);
    const existingRecord = existingById.get(component.id);
    if (existingRecord) {
      if (controlledKey(component) === controlledKey(existingRecord)) skippedExistingIds.push(component.id);
      else conflicts.push({ id: component.id, reason: "same_id_content" });
      continue;
    }
    const pair = pairKey(component.manufacturer, component.model);
    const pairId = pair ? existingPairIds.get(pair) : undefined;
    if (pairId && pairId !== component.id) {
      conflicts.push({ id: component.id, reason: "existing_manufacturer_model" });
      continue;
    }
    rows.push({
      id: component.id,
      name: component.name,
      manufacturer: component.manufacturer || null,
      model: component.model || null,
      componentType: component.componentType,
      description: component.description || null,
      price: null,
      performanceScore: null,
      productUrl: component.productUrl,
    });
  }
  return { rows, skippedExistingIds, conflicts };
};

const hasResponseErrors = (response: unknown): boolean =>
  isRecord(response) && Array.isArray(response.errors) && response.errors.length > 0;

export const insertAdminImportBatch = async (
  client: AdminDataConnectClient,
  rows: Array<Record<string, unknown>>,
): Promise<void> => {
  if (!rows.length) return;
  let response: unknown;
  try {
    response = await client.insertMany("Component", rows);
  } catch {
    throw new AdminImportError("insert_failed");
  }
  if (hasResponseErrors(response)) throw new AdminImportError("insert_partial_error");
};
