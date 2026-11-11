import { createHash } from "node:crypto";
import type { ComponentCategory } from "../types/catalog";
import type { SerpApiShoppingResult, ShoppingCurrency, ShoppingPrice } from "../types/offers";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_EUR_PLN_RATE = 4.3;
const REQUEST_TIMEOUT_MS = 7_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_IN_FLIGHT = 20;
const MAX_RESPONSE_BYTES = 1_000_000;

type FetchImplementation = typeof fetch;
type Snapshot = { data: SerpApiShoppingResult[]; expiresAt: number };

const cache = new Map<string, Snapshot>();
const inFlight = new Map<string, Promise<SerpApiShoppingResult[]>>();

export class SerpApiNotConfiguredError extends Error {}
export class SerpApiNotFoundError extends Error {}
export class SerpApiUpstreamError extends Error {
  readonly kind: "unavailable" | "invalid" | "rate_limited" | "timeout";

  constructor(kind: "unavailable" | "invalid" | "rate_limited" | "timeout") {
    super("SerpAPI request failed");
    this.kind = kind;
  }
}

const getApiKey = (): string => {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) throw new SerpApiNotConfiguredError();
  if (key.length > 500) throw new SerpApiUpstreamError("invalid");
  return key;
};

export const getEurPlnRate = (): number => {
  const raw = process.env.EUR_PLN_RATE?.trim() || String(DEFAULT_EUR_PLN_RATE);
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0.01 || rate > 100) throw new SerpApiUpstreamError("invalid");
  return rate;
};

const configFingerprint = (apiKey: string, rate: number): string =>
  createHash("sha256").update(`${apiKey}\u0000${rate}`).digest("hex");

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === "AbortError" || (typeof candidate.message === "string" && candidate.message.toLowerCase().includes("abort"));
};

const readText = (value: unknown, maxLength = 500): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new SerpApiUpstreamError("invalid");
  return value.trim() || null;
};

const readRequiredText = (value: unknown, maxLength = 500): string => {
  const text = readText(value, maxLength);
  if (!text) throw new SerpApiUpstreamError("invalid");
  return text;
};

const readOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new SerpApiUpstreamError("invalid");
  return value;
};

const readOptionalBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") throw new SerpApiUpstreamError("invalid");
  return value;
};

const safeHttpsUrl = (value: unknown): string | null => {
  const text = readText(value, 2_000);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname.toLowerCase() === "serpapi.com") return null;
  for (const key of parsed.searchParams.keys()) {
    if (/(?:api[_-]?key|token|secret|password)/i.test(key)) return null;
  }
  return parsed.toString();
};

const normalizeNumberText = (value: string): number | null => {
  const match = value.replace(/\u00a0/g, " ").match(/\d[\d\s.,]*/);
  if (!match) return null;
  let numeric = match[0].replace(/\s/g, "");
  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    numeric = comma > dot ? numeric.replace(/\./g, "").replace(",", ".") : numeric.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = numeric.length - comma - 1;
    numeric = decimals === 3 ? numeric.replace(/,/g, "") : numeric.replace(",", ".");
  } else if (dot >= 0 && numeric.length - dot - 1 === 3) {
    numeric = numeric.replace(/\./g, "");
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const classifyCurrency = (text: string): ShoppingCurrency | null => {
  const upper = text.toUpperCase();
  if (/\bPLN\b|ZŁ|ZL|ZŁOT/.test(upper)) return "PLN";
  if (/€|\bEUR\b/.test(upper)) return "EUR";
  return null;
};

const cents = (amount: number): number => {
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value)) throw new SerpApiUpstreamError("invalid");
  return value;
};

const createPrice = (priceValue: unknown, extractedValue: unknown, rate: number): ShoppingPrice => {
  const sourceText = readText(priceValue, 160);
  if (!sourceText) return { original: null, estimatedPLN: null, sourceText: null };
  const currency = classifyCurrency(sourceText);
  if (!currency) return { original: null, estimatedPLN: null, sourceText };
  const extracted = readOptionalNumber(extractedValue);
  const amount = extracted ?? normalizeNumberText(sourceText);
  if (amount === null) return { original: null, estimatedPLN: null, sourceText };
  const amountCents = cents(amount);
  if (currency === "PLN") {
    return {
      original: { amountCents, currency },
      estimatedPLN: { amountCents, currency: "PLN", isEstimate: false },
      sourceText,
    };
  }
  const estimatedCents = Math.round(amountCents * rate);
  if (!Number.isSafeInteger(estimatedCents)) throw new SerpApiUpstreamError("invalid");
  return {
    original: { amountCents, currency },
    estimatedPLN: { amountCents: estimatedCents, currency: "PLN", eurPlnRate: rate, isEstimate: true },
    sourceText,
  };
};

const isWholePcForCpu = (title: string, expectedCategory: ComponentCategory | undefined): boolean => {
  if (expectedCategory !== "cpu") return false;
  const lower = title.toLocaleLowerCase("pl-PL");
  if (/\b(?:gaming\s*pc|desktop|komputer|computer|notebook|laptop|pc\s*(?:gaming|zestaw|gamingowy)|complete\s*(?:pc|computer)|all[- ]in[- ]one|zestaw\s*komputerowy|pakiet\s*pc)\b/i.test(lower)) return true;
  const memory = /\b\d+\s*(?:gb|tb)\s*(?:ram|pamięci|memory|ddr\d)?\b|\b(?:ram|pamięci)\s*\d+\s*(?:gb|tb)\b|\bddr\d\b/i.test(lower);
  const storage = /\b\d+\s*(?:gb|tb)\s*(?:ssd|hdd|nvme|dysk)\b|\b(?:ssd|hdd|nvme)\s*\d*\s*(?:gb|tb)?\b/i.test(lower);
  // "Radeon Graphics" describes an integrated GPU in a valid CPU title;
  // dedicated cards carry a model token such as RX9070/RTX5060.
  const graphics = /\b(?:rtx|gtx|rx)\s*\d|\bgeforce\s+\w*\d|\bgpu\b/i.test(lower);
  const operatingSystem = /\bwin(?:dows)?\s*(?:10|11)\b/i.test(lower);
  return [memory, storage, graphics, operatingSystem].filter(Boolean).length >= 2;
};

const readProductId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new SerpApiUpstreamError("invalid");
    return String(value);
  }
  return readText(value, 200);
};

const normalizeItem = (value: unknown, rate: number, expectedCategory: ComponentCategory | undefined, sponsored: boolean): SerpApiShoppingResult | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SerpApiUpstreamError("invalid");
  const item = value as Record<string, unknown>;
  const title = readRequiredText(item.title, 500);
  if (isWholePcForCpu(title, expectedCategory)) return null;
  const link = safeHttpsUrl(item.product_link) ?? safeHttpsUrl(item.link);
  const thumbnail = safeHttpsUrl(item.thumbnail);
  const providerProductId = readProductId(item.product_id);
  const source = readText(item.source, 160);
  return {
    provider: "serpapi-google-shopping",
    providerProductId,
    title,
    source,
    price: createPrice(item.price, item.extracted_price, rate),
    link,
    thumbnail,
    sponsored,
  };
};

const collectItems = (body: Record<string, unknown>, rate: number, expectedCategory: ComponentCategory | undefined): SerpApiShoppingResult[] => {
  const raw: Array<{ value: unknown; sponsored: boolean }> = [];
  const add = (value: unknown, sponsored: boolean) => {
    if (!Array.isArray(value)) return;
    for (const item of value) raw.push({ value: item, sponsored });
  };
  add(body.shopping_results, false);
  add(body.inline_shopping_results, true);
  if (Array.isArray(body.categorized_shopping_results)) {
    for (const group of body.categorized_shopping_results) {
      if (!group || typeof group !== "object" || Array.isArray(group)) throw new SerpApiUpstreamError("invalid");
      add((group as Record<string, unknown>).shopping_results, false);
    }
  }
  const seen = new Set<string>();
  const result: SerpApiShoppingResult[] = [];
  for (const entry of raw) {
    const item = normalizeItem(entry.value, rate, expectedCategory, entry.sponsored);
    if (!item) continue;
    const identity = `${item.providerProductId ?? item.title.toLocaleLowerCase("pl-PL")}\u0000${item.source ?? ""}\u0000${item.price.original?.amountCents ?? ""}\u0000${item.price.original?.currency ?? ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }
  return result;
};

const readJsonPayload = async (response: Response): Promise<unknown> => {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw new SerpApiUpstreamError("timeout");
    throw new SerpApiUpstreamError("invalid");
  }
  if (text.length > MAX_RESPONSE_BYTES) throw new SerpApiUpstreamError("invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new SerpApiUpstreamError("invalid");
  }
};

const fetchUncached = async (
  query: string,
  expectedCategory: ComponentCategory | undefined,
  fetchImpl: FetchImplementation,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<SerpApiShoppingResult[]> => {
  const apiKey = getApiKey();
  const rate = getEurPlnRate();
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "pl");
  url.searchParams.set("hl", "pl");
  url.searchParams.set("google_domain", "google.pl");
  url.searchParams.set("location", "Warsaw, Poland");
  url.searchParams.set("api_key", apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store" });
    if (response.status === 429) throw new SerpApiUpstreamError("rate_limited");
    if (response.status === 401 || response.status === 403) throw new SerpApiNotConfiguredError();
    if (!response.ok) throw new SerpApiUpstreamError("unavailable");
    const payload = await readJsonPayload(response);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SerpApiUpstreamError("invalid");
    const body = payload as Record<string, unknown>;
    if (typeof body.error === "string") throw new SerpApiUpstreamError("unavailable");
    const normalized = collectItems(body, rate, expectedCategory);
    if (JSON.stringify(normalized).includes(apiKey)) throw new SerpApiUpstreamError("invalid");
    return normalized;
  } catch (error) {
    if (error instanceof SerpApiNotConfiguredError || error instanceof SerpApiUpstreamError) throw error;
    if (controller.signal.aborted || isAbortError(error)) throw new SerpApiUpstreamError("timeout");
    throw new SerpApiUpstreamError("unavailable");
  } finally {
    clearTimeout(timer);
  }
};

export const clearSerpApiCache = (): void => {
  cache.clear();
  inFlight.clear();
};

export async function searchSerpApiProducts(
  query: string,
  options: { expectedCategory?: ComponentCategory; page?: number; limit?: number; fetchImpl?: FetchImplementation; now?: () => number; timeoutMs?: number } = {},
): Promise<{ data: SerpApiShoppingResult[]; page: number; limit: number; total: number; hasNext: boolean; cache: "hit" | "miss" }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 120) throw new Error("invalid_query");
  const page = options.page ?? 1;
  const limit = options.limit ?? 12;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("invalid_page");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("invalid_limit");
  const apiKey = getApiKey();
  const rate = getEurPlnRate();
  const fingerprint = configFingerprint(apiKey, rate);
  const categoryKey = options.expectedCategory ?? "all";
  const key = `search:${normalizedQuery.toLocaleLowerCase("pl-PL")}:${categoryKey}:${fingerprint}`;
  const now = options.now?.() ?? Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    const start = (page - 1) * limit;
    return { data: existing.data.slice(start, start + limit), page, limit, total: existing.data.length, hasNext: start + limit < existing.data.length, cache: "hit" };
  }
  if (existing) cache.delete(key);
  const current = inFlight.get(key);
  if (current) {
    const data = await current;
    const start = (page - 1) * limit;
    return { data: data.slice(start, start + limit), page, limit, total: data.length, hasNext: start + limit < data.length, cache: "hit" };
  }
  if (inFlight.size >= MAX_IN_FLIGHT) throw new SerpApiUpstreamError("unavailable");
  const request = fetchUncached(normalizedQuery, options.expectedCategory, options.fetchImpl ?? fetch, options.timeoutMs);
  inFlight.set(key, request);
  try {
    const data = await request;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
    const start = (page - 1) * limit;
    return { data: data.slice(start, start + limit), page, limit, total: data.length, hasNext: start + limit < data.length, cache: "miss" };
  } finally {
    inFlight.delete(key);
  }
}
