import { readFileSync } from "node:fs";
import sampleData from "../data/components.sample.json" with { type: "json" };
import type { CatalogComponent, ComponentCategory } from "../types/catalog";

const COMPONENT_CATEGORIES = [
  "cpu", "gpu", "motherboard", "memory", "storage", "psu", "case", "cooling",
] as const;
const MAX_COMPONENTS = 100_000;
const sampleComponents = sampleData as unknown as CatalogComponent[];

export const catalogCategories = [...COMPONENT_CATEGORIES] as ComponentCategory[];

export class CatalogUnavailableError extends Error {
  constructor() {
    super("Katalog danych jest obecnie niedostępny.");
    this.name = "CatalogUnavailableError";
  }
}

export interface CatalogDataset {
  components: CatalogComponent[];
  source: "sample" | "external" | "database";
  provider?: string;
}

let cachedDatasetKey: string | null = null;
let cachedDataset: CatalogDataset | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const isCategory = (value: unknown): value is ComponentCategory =>
  typeof value === "string" && (COMPONENT_CATEGORIES as readonly string[]).includes(value);

const safeHttpsUrl = (value: unknown, provider: string | undefined): value is string | null => {
  if (value === null) return true;
  if (!isString(value) || !value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (provider === "userbenchmark") {
      return url.hostname === "userbenchmark.com" || url.hostname.endsWith(".userbenchmark.com");
    }
    return true;
  } catch {
    return false;
  }
};

const validComponent = (value: unknown): value is CatalogComponent => {
  if (!isRecord(value)) return false;
  if (!isString(value.id) || value.id.length === 0 || value.id.length > 255) return false;
  if (!isCategory(value.category)) return false;
  if (!["name", "manufacturer", "model", "description", "currency"].every((key) => isString(value[key]))) return false;
  if (value.currency !== "PLN" || !isRecord(value.specifications)) return false;
  if (!Object.entries(value.specifications).every(([key, spec]) => key.length > 0 && key.length <= 100 && isString(spec) && spec.length <= 255)) return false;
  if (!isNullableNumber(value.performanceScore) || !isNullableNumber(value.price) || (value.price !== null && value.price < 0)) return false;
  if (!isRecord(value.source) || !isString(value.source.label) || !isString(value.source.capturedAt)) return false;
  if (!(value.source.kind === "sample" || value.source.kind === "external" || value.source.kind === "database")) return false;
  const provider = value.source.provider;
  if (provider !== undefined && (!isString(provider) || provider.length > 80)) return false;
  if (!safeHttpsUrl(value.source.url, provider)) return false;
  if (value.sourceIdentity !== undefined) {
    if (!isRecord(value.sourceIdentity) || !isString(value.sourceIdentity.provider) || !isString(value.sourceIdentity.externalId) || !isString(value.sourceIdentity.externalType)) return false;
  }
  if (value.sourceMetrics !== undefined) {
    const metrics = value.sourceMetrics;
    if (!isRecord(metrics) || metrics.metric !== "userbenchmark" || typeof metrics.rank !== "number" || !Number.isInteger(metrics.rank) || metrics.rank < 1 || typeof metrics.benchmark !== "number" || !Number.isFinite(metrics.benchmark) || typeof metrics.samples !== "number" || !Number.isInteger(metrics.samples) || metrics.samples < 0) return false;
  }
  return true;
};

const validateComponents = (value: unknown): CatalogComponent[] => {
  if (!Array.isArray(value) || value.length > MAX_COMPONENTS || !value.every(validComponent)) throw new CatalogUnavailableError();
  const ids = new Set<string>();
  for (const component of value) {
    if (ids.has(component.id)) throw new CatalogUnavailableError();
    ids.add(component.id);
  }
  return value;
};

const loadConfiguredDataset = (filePath: string): CatalogDataset => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || !isString(parsed.source) || !Array.isArray(parsed.components)) throw new Error("invalid dataset");
    const components = validateComponents(parsed.components);
    const provider = components.find((component) => component.source.provider)?.source.provider;
    return { components, source: "external", ...(provider ? { provider } : {}) };
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    throw new CatalogUnavailableError();
  }
};

export const getCatalogDataset = (): CatalogDataset => {
  const configuredPath = process.env.CATALOG_DATA_FILE?.trim();
  if (!configuredPath) return { components: sampleComponents, source: "sample" };
  if (cachedDatasetKey === configuredPath && cachedDataset) return cachedDataset;
  const dataset = loadConfiguredDataset(configuredPath);
  cachedDatasetKey = configuredPath;
  cachedDataset = dataset;
  return dataset;
};

export const getCatalogSource = (): CatalogDataset["source"] => getCatalogDataset().source;
export const getCatalogProvider = (): string | undefined => getCatalogDataset().provider;

const normalize = (value: string): string => value.trim().toLocaleLowerCase("pl-PL");

export interface CatalogFilters {
  query?: string;
  category?: ComponentCategory;
  manufacturer?: string;
  page: number;
  limit: number;
}

export const listCatalogComponents = (filters: CatalogFilters): CatalogComponent[] => {
  const dataset = getCatalogDataset();
  const query = filters.query ? normalize(filters.query) : "";
  const manufacturer = filters.manufacturer ? normalize(filters.manufacturer) : "";
  return dataset.components
    .filter((component) => !filters.category || component.category === filters.category)
    .filter((component) => !manufacturer || normalize(component.manufacturer) === manufacturer)
    .filter((component) => {
      if (!query) return true;
      const searchable = [component.name, component.manufacturer, component.model, component.category, component.description, ...Object.entries(component.specifications).flat()].map(normalize).join(" ");
      return searchable.includes(query);
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pl-PL"));
};

export const getCatalogComponent = (id: string): CatalogComponent | undefined =>
  getCatalogDataset().components.find((component) => component.id === id);

export const getCatalogManufacturers = (): string[] =>
  [...new Set(getCatalogDataset().components.map((component) => component.manufacturer))].sort((left, right) => left.localeCompare(right, "pl-PL"));

export const isCatalogCategory = (value: string): value is ComponentCategory =>
  (COMPONENT_CATEGORIES as readonly string[]).includes(value);
