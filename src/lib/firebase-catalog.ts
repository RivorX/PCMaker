import { createHash } from "node:crypto";
import type { CatalogComponent, ComponentCategory } from "../types/catalog";

const FIREBASE_QUERY_ENDPOINT = "https://firebasedataconnect.googleapis.com/v1";
const DEFAULT_PROJECT_ID = "pcmaker-b0b0a";
const DEFAULT_LOCATION = "europe-central2";
const DEFAULT_SERVICE = "pcmaker-service";
const DEFAULT_CONNECTOR = "default";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const CACHE_TTL_MS = 60_000;

const CATEGORY_ALIASES: Record<string, ComponentCategory> = {
  cpu: "cpu",
  gpu: "gpu",
  motherboard: "motherboard",
  memory: "memory",
  ram: "memory",
  storage: "storage",
  ssd: "storage",
  hdd: "storage",
  psu: "psu",
  case: "case",
  cooling: "cooling",
};

export class FirebaseCatalogUnavailableError extends Error {
  constructor() {
    super("Firebase Data Connect catalog is unavailable.");
    this.name = "FirebaseCatalogUnavailableError";
  }
}

export interface FirebaseCatalogSnapshot {
  components: CatalogComponent[];
  capturedAt: string;
}

interface FirebaseCatalogConfig {
  projectId: string;
  location: string;
  service: string;
  connector: string;
  apiKey: string;
}

interface RecordValue {
  [key: string]: unknown;
}

let cached: { key: string; expiresAt: number; snapshot: FirebaseCatalogSnapshot } | null = null;
let inFlight: { key: string; promise: Promise<FirebaseCatalogSnapshot> } | null = null;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textField = (value: unknown, required: boolean, maxLength: number): string => {
  if (value === null || value === undefined) {
    if (required) throw new FirebaseCatalogUnavailableError();
    return "";
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new FirebaseCatalogUnavailableError();
  }
  const text = value.trim();
  if (required && !text) throw new FirebaseCatalogUnavailableError();
  return text;
};

const SENSITIVE_QUERY_KEYS = /^(?:api[_-]?key|key|token|access[_-]?token|auth(?:orization)?|secret|password|credential|signature|sig)$/i;

const safeHttpsUrl = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2_000) throw new FirebaseCatalogUnavailableError();
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) throw new FirebaseCatalogUnavailableError();
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    throw new FirebaseCatalogUnavailableError();
  }
};

const categoryFromValue = (value: unknown): ComponentCategory => {
  if (typeof value !== "string") throw new FirebaseCatalogUnavailableError();
  const category = CATEGORY_ALIASES[value.trim().toLocaleLowerCase("pl-PL")];
  if (!category) throw new FirebaseCatalogUnavailableError();
  return category;
};

const mapComponent = (value: unknown, capturedAt: string): CatalogComponent => {
  if (!isRecord(value)) throw new FirebaseCatalogUnavailableError();
  const id = textField(value.id, true, 255);
  const category = categoryFromValue(value.componentType);
  const sourceUrl = safeHttpsUrl(value.productUrl);
  return {
    id,
    category,
    name: textField(value.name, true, 200),
    manufacturer: textField(value.manufacturer, false, 100),
    model: textField(value.model, false, 150),
    description: textField(value.description, false, 10_000),
    specifications: {},
    // Data Connect currently exposes no currency contract for this column.
    // Keep the nullable values honest instead of treating the Float as PLN.
    price: null,
    performanceScore: null,
    currency: "PLN",
    source: {
      kind: "database",
      label: "Firebase Data Connect",
      capturedAt,
      url: sourceUrl,
      provider: "firebase-sql-connect",
    },
    sourceIdentity: {
      provider: "firebase-sql-connect",
      externalId: id,
      externalType: "Component",
    },
  };
};

const getConfig = (): FirebaseCatalogConfig => {
  const apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim();
  if (!apiKey || apiKey.length > 512) throw new FirebaseCatalogUnavailableError();
  const resourceSegment = (name: string, fallback: string): string => {
    const value = (process.env[name] ?? fallback).trim() || fallback;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new FirebaseCatalogUnavailableError();
    return value;
  };
  return {
    projectId: resourceSegment("NEXT_PUBLIC_FIREBASE_PROJECT_ID", DEFAULT_PROJECT_ID),
    location: resourceSegment("FIREBASE_DATACONNECT_LOCATION", DEFAULT_LOCATION),
    service: resourceSegment("FIREBASE_DATACONNECT_SERVICE", DEFAULT_SERVICE),
    connector: resourceSegment("FIREBASE_DATACONNECT_CONNECTOR", DEFAULT_CONNECTOR),
    apiKey,
  };
};

const configKey = (config: FirebaseCatalogConfig): string => createHash("sha256")
  .update(JSON.stringify(config))
  .digest("hex");

const endpointFor = (config: FirebaseCatalogConfig): string =>
  `${FIREBASE_QUERY_ENDPOINT}/projects/${encodeURIComponent(config.projectId)}/locations/${encodeURIComponent(config.location)}/services/${encodeURIComponent(config.service)}/connectors/${encodeURIComponent(config.connector)}:executeQuery`;

const readBoundedResponse = async (response: Response): Promise<string> => {
  if (!response.body) {
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) throw new FirebaseCatalogUnavailableError();
    return raw;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new FirebaseCatalogUnavailableError();
      }
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
};

const fetchSnapshot = async (config: FirebaseCatalogConfig): Promise<FirebaseCatalogSnapshot> => {
  const capturedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(endpointFor(config), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({ operationName: "ListComponents", variables: {} }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new FirebaseCatalogUnavailableError();
    }
    if (!response.ok) throw new FirebaseCatalogUnavailableError();
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) throw new FirebaseCatalogUnavailableError();
    let raw: string;
    try {
      raw = await readBoundedResponse(response);
    } catch {
      throw new FirebaseCatalogUnavailableError();
    }
    if (raw.includes(config.apiKey)) {
      throw new FirebaseCatalogUnavailableError();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new FirebaseCatalogUnavailableError();
    }
    if (!isRecord(parsed) || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
      throw new FirebaseCatalogUnavailableError();
    }
    const data = parsed.data;
    if (!isRecord(data) || !Array.isArray(data.components)) {
      throw new FirebaseCatalogUnavailableError();
    }
    const components = data.components.map((component) => mapComponent(component, capturedAt));
    const ids = new Set<string>();
    for (const component of components) {
      if (ids.has(component.id)) throw new FirebaseCatalogUnavailableError();
      ids.add(component.id);
    }
    return { components, capturedAt };
  } finally {
    clearTimeout(timeout);
  }
};

export const getFirebaseCatalogSnapshot = async (): Promise<FirebaseCatalogSnapshot> => {
  const config = getConfig();
  const key = configKey(config);
  const now = Date.now();
  if (cached && cached.key === key && cached.expiresAt > now) return cached.snapshot;
  if (inFlight?.key === key) return inFlight.promise;
  const promise = fetchSnapshot(config).then((snapshot) => {
    cached = { key, expiresAt: Date.now() + CACHE_TTL_MS, snapshot };
    return snapshot;
  }).finally(() => {
    if (inFlight?.key === key) inFlight = null;
  });
  inFlight = { key, promise };
  return promise;
};

// Test-only reset hook; it does not expose credentials or provider data.
export const resetFirebaseCatalogCache = (): void => {
  cached = null;
  inFlight = null;
};
