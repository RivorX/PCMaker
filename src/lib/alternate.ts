import { createHash } from "node:crypto";
import type { AlternateOffer, AlternateSearchCandidate, OfferMoney } from "../types/offers";

const ALTERNATE_BASE_URL = "https://api.everydata.io/alt";
const ALTERNATE_LOOKUP_PATH = "/alternate-lookup-product";
const ALTERNATE_SEARCH_PATH = "/alternate-search-by-keyword";
const DEFAULT_EUR_PLN_RATE = 4.3;
const REQUEST_TIMEOUT_MS = 7_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_IN_FLIGHT = 20;
export const ALTERNATE_SORT_VALUES = ["relevance", "popularity", "price-asc", "price-desc", "rating", "newest", "discount"] as const;
export type AlternateSort = (typeof ALTERNATE_SORT_VALUES)[number];

type FetchImplementation = typeof fetch;
type CacheEntry = { value: AlternateOffer; expiresAt: number };
type SearchCacheEntry = { value: AlternateSearchResult; expiresAt: number };
export type AlternateSearchResult = {
  data: AlternateSearchCandidate[];
  resultCount: number;
  nextPage: number | null;
  lastPage: number | null;
};
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<AlternateOffer>>();
const searchCache = new Map<string, SearchCacheEntry>();
const searchInFlight = new Map<string, Promise<AlternateSearchResult>>();

export class AlternateNotConfiguredError extends Error {}
export class AlternateNotFoundError extends Error {}
export class AlternateUpstreamError extends Error {
  readonly kind: "unavailable" | "invalid" | "rate_limited" | "timeout";

  constructor(kind: "unavailable" | "invalid" | "rate_limited" | "timeout") {
    super("Alternate upstream request failed");
    this.kind = kind;
  }
}

const getApiKey = (): string => {
  const key = process.env.EVERYDATA_API_KEY?.trim();
  if (!key) throw new AlternateNotConfiguredError();
  return key;
};

export const getEurPlnRate = (): number => {
  const raw = process.env.EUR_PLN_RATE?.trim() || String(DEFAULT_EUR_PLN_RATE);
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0.01 || rate > 100) throw new AlternateUpstreamError("invalid");
  return rate;
};

const readOptionalText = (value: unknown, maxLength = 500): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new AlternateUpstreamError("invalid");
  return value.trim() || null;
};

const readRequiredText = (value: unknown, name: string, maxLength = 500): string => {
  const text = readOptionalText(value, maxLength);
  if (!text) throw new AlternateUpstreamError("invalid");
  return text;
};

const readIdentifier = (value: unknown, name: string): string => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return readRequiredText(value, name, 120);
};

const normalizeNumericIdentifier = (value: string): string => value.replace(/^0+(?=\d)/, "");

const readOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new AlternateUpstreamError("invalid");
  return value;
};

const readOptionalBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") throw new AlternateUpstreamError("invalid");
  return value;
};

const readCategories = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 120)) throw new AlternateUpstreamError("invalid");
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 20);
};

const readHighlights = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 500)) throw new AlternateUpstreamError("invalid");
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 20);
};

const readVerifiedSourceUrl = (value: unknown): string | null => {
  const text = readOptionalText(value, 1000);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new AlternateUpstreamError("invalid");
  }
  if (parsed.protocol !== "https:" || !["alternate.de", "www.alternate.de"].includes(parsed.hostname.toLowerCase())) {
    throw new AlternateUpstreamError("invalid");
  }
  return parsed.toString();
};

const readOptionalInteger = (value: unknown, name: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AlternateUpstreamError("invalid");
  return value;
};

const readOptionalRating = (value: unknown): string | null => readOptionalText(value, 40);

const configFingerprint = (apiKey: string, rate: number): string => createHash("sha256").update(`${apiKey}\u0000${rate}`).digest("hex");

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === "AbortError" || (typeof candidate.message === "string" && candidate.message.toLowerCase().includes("abort"));
};

const money = (amountEUR: number | null, rate: number): OfferMoney => {
  if (amountEUR === null) return { originalEUR: null, estimatedPLN: null };
  const amountCents = Math.round(amountEUR * 100);
  const estimatedPLNCents = Math.round(amountCents * rate);
  if (!Number.isSafeInteger(amountCents) || !Number.isSafeInteger(estimatedPLNCents)) throw new AlternateUpstreamError("invalid");
  return {
    originalEUR: { amountCents, currency: "EUR" },
    estimatedPLN: { amountCents: estimatedPLNCents, currency: "PLN", eurPlnRate: rate, isEstimate: true },
  };
};

const readJsonPayload = async (response: Response): Promise<unknown> => {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw new AlternateUpstreamError("timeout");
    throw new AlternateUpstreamError("invalid");
  }
  if (text.length > 1_000_000) throw new AlternateUpstreamError("invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new AlternateUpstreamError("invalid");
  }
};

const createTimeoutSignal = (timeoutMs: number): { signal: AbortSignal; cancel: () => void } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
};

const parseLookupResponse = (payload: unknown, rate: number, requestedProductId: string): AlternateOffer => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AlternateUpstreamError("invalid");
  const body = payload as Record<string, unknown>;
  const status = body.responseStatus;
  if (status === "PRODUCT_NOT_FOUND_RESPONSE" || status === "PRODUCT_NOT_FOUND") throw new AlternateNotFoundError();
  if (status !== "PRODUCT_FOUND_RESPONSE") throw new AlternateUpstreamError("invalid");
  const providerProductId = readIdentifier(body.productId, "productId");
  if (normalizeNumericIdentifier(providerProductId) !== normalizeNumericIdentifier(requestedProductId)) throw new AlternateUpstreamError("invalid");
  const price = readOptionalNumber(body.price);
  const shippingPrice = readOptionalNumber(body.shippingPrice);
  if (body.currency !== "EUR") throw new AlternateUpstreamError("invalid");
  const warehouseAvailability = readOptionalText(body.warehouseAvailability, 300);
  return {
    provider: "everydata-alternate",
    providerProductId,
    productTitle: readRequiredText(body.productTitle, "productTitle", 300),
    manufacturer: readOptionalText(body.manufacturer, 160),
    ean: readOptionalText(body.ean, 80),
    mpn: readOptionalText(body.mpn, 160),
    categories: readCategories(body.categories),
    price: money(price, rate),
    shipping: money(shippingPrice, rate),
    available: readOptionalBoolean(body.available),
    warehouseAvailability,
    sourceUrl: readVerifiedSourceUrl(body.url),
  };
};

const parseSearchResponse = (payload: unknown, rate: number): AlternateSearchResult => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AlternateUpstreamError("invalid");
  const body = payload as Record<string, unknown>;
  const status = body.responseStatus;
  if (status === "PRODUCT_NOT_FOUND_RESPONSE" || status === "PRODUCT_NOT_FOUND") {
    return { data: [], resultCount: 0, nextPage: null, lastPage: null };
  }
  if (status !== "PRODUCT_FOUND_RESPONSE" || !Array.isArray(body.searchProductDetails)) throw new AlternateUpstreamError("invalid");
  const data = body.searchProductDetails.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AlternateUpstreamError("invalid");
    const item = value as Record<string, unknown>;
    const productId = readIdentifier(item.productId ?? item.asin, "productId");
    const price = readOptionalNumber(item.price);
    const retailPrice = readOptionalNumber(item.retailPrice);
    if (item.currency !== "EUR") throw new AlternateUpstreamError("invalid");
    return {
      provider: "everydata-alternate" as const,
      providerProductId: productId,
      productTitle: readRequiredText(item.productDescription, "productDescription", 500),
      productDescription: readOptionalText(item.productDescription, 2000),
      manufacturer: readOptionalText(item.manufacturer, 160),
      ean: readOptionalText(item.ean, 80),
      mpn: readOptionalText(item.mpn, 160),
      categories: [],
      price: money(price, rate),
      retailPrice: money(retailPrice, rate),
      shipping: money(null, rate),
      available: readOptionalBoolean(item.available),
      warehouseAvailability: readOptionalText(item.deliveryMessage, 300),
      deliveryMessage: readOptionalText(item.deliveryMessage, 300),
      productRating: readOptionalRating(item.productRating),
      highlights: readHighlights(item.highlights),
      used: readOptionalBoolean(item.used),
      sourceUrl: readVerifiedSourceUrl(item.dpUrl),
    } satisfies AlternateSearchCandidate;
  });
  const resultCount = readOptionalInteger(body.resultCount, "resultCount") ?? data.length;
  const nextPage = readOptionalInteger(body.nextPage, "nextPage");
  const lastPage = readOptionalInteger(body.lastPage, "lastPage");
  return { data, resultCount, nextPage, lastPage };
};

const fetchAlternateProductUncached = async (productId: string, fetchImpl: FetchImplementation, timeoutMs = REQUEST_TIMEOUT_MS): Promise<AlternateOffer> => {
  const apiKey = getApiKey();
  const rate = getEurPlnRate();
  const url = new URL(`${ALTERNATE_BASE_URL}${ALTERNATE_LOOKUP_PATH}`);
  url.searchParams.set("productId", productId);
  const timeout = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: timeout.signal, redirect: "error", cache: "no-store" });
    if (response.status === 429) throw new AlternateUpstreamError("rate_limited");
    if (response.status === 404) throw new AlternateNotFoundError();
    if (!response.ok) throw new AlternateUpstreamError("unavailable");
    let payload: unknown;
    try {
      payload = await readJsonPayload(response);
    } catch (error) {
      if (error instanceof AlternateUpstreamError) throw error;
      throw new AlternateUpstreamError("invalid");
    }
    return parseLookupResponse(payload, rate, productId);
  } catch (error) {
    if (error instanceof AlternateNotFoundError || error instanceof AlternateUpstreamError || error instanceof AlternateNotConfiguredError) throw error;
    if (timeout.signal.aborted) throw new AlternateUpstreamError("timeout");
    if (isAbortError(error)) throw new AlternateUpstreamError("timeout");
    throw new AlternateUpstreamError("unavailable");
  } finally {
    timeout.cancel();
  }
};

const fetchAlternateSearchUncached = async (
  keyword: string,
  page: number,
  sortBy: AlternateSort,
  fetchImpl: FetchImplementation,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<AlternateSearchResult> => {
  const apiKey = getApiKey();
  const rate = getEurPlnRate();
  const url = new URL(`${ALTERNATE_BASE_URL}${ALTERNATE_SEARCH_PATH}`);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sortBy", sortBy);
  const timeout = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: timeout.signal, redirect: "error", cache: "no-store" });
    if (response.status === 429) throw new AlternateUpstreamError("rate_limited");
    if (!response.ok) throw new AlternateUpstreamError("unavailable");
    let payload: unknown;
    try {
      payload = await readJsonPayload(response);
    } catch (error) {
      if (error instanceof AlternateUpstreamError) throw error;
      throw new AlternateUpstreamError("invalid");
    }
    return parseSearchResponse(payload, rate);
  } catch (error) {
    if (error instanceof AlternateNotFoundError || error instanceof AlternateUpstreamError || error instanceof AlternateNotConfiguredError) throw error;
    if (timeout.signal.aborted) throw new AlternateUpstreamError("timeout");
    if (isAbortError(error)) throw new AlternateUpstreamError("timeout");
    throw new AlternateUpstreamError("unavailable");
  } finally {
    timeout.cancel();
  }
};

export const clearAlternateCache = (): void => {
  cache.clear();
  inFlight.clear();
  searchCache.clear();
  searchInFlight.clear();
};

export async function lookupAlternateProduct(
  productId: string,
  options: { fetchImpl?: FetchImplementation; now?: () => number; timeoutMs?: number } = {},
): Promise<{ data: AlternateOffer; cache: "hit" | "miss" }> {
  const normalizedId = productId.trim();
  if (!/^\d{1,40}$/.test(normalizedId)) throw new Error("invalid_product_id");
  // Validate server configuration even when an older cached value exists. This
  // keeps a removed key/rate from silently serving stale provider data.
  const fingerprint = configFingerprint(getApiKey(), getEurPlnRate());
  const cacheKey = `lookup:${normalizedId}:${fingerprint}`;
  const now = options.now?.() ?? Date.now();
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > now) return { data: existing.value, cache: "hit" };
  if (existing) cache.delete(cacheKey);
  const current = inFlight.get(cacheKey);
  if (current) return { data: await current, cache: "hit" };
  if (inFlight.size + searchInFlight.size >= MAX_IN_FLIGHT) throw new AlternateUpstreamError("unavailable");
  const request = fetchAlternateProductUncached(normalizedId, options.fetchImpl ?? fetch, options.timeoutMs);
  inFlight.set(cacheKey, request);
  try {
    const value = await request;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
    return { data: value, cache: "miss" };
  } finally {
    inFlight.delete(cacheKey);
  }
}

export async function searchAlternateProducts(
  keyword: string,
  options: { page?: number; sortBy?: AlternateSort; fetchImpl?: FetchImplementation; now?: () => number; timeoutMs?: number } = {},
): Promise<{ data: AlternateSearchResult; cache: "hit" | "miss" }> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword || normalizedKeyword.length > 120) throw new Error("invalid_keyword");
  const page = options.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error("invalid_page");
  const sortBy = options.sortBy ?? "relevance";
  if (!ALTERNATE_SORT_VALUES.includes(sortBy)) throw new Error("invalid_sort");
  const fingerprint = configFingerprint(getApiKey(), getEurPlnRate());
  const cacheKey = `search:${normalizedKeyword.toLocaleLowerCase("en-US")}:${page}:${sortBy}:${fingerprint}`;
  const now = options.now?.() ?? Date.now();
  const existing = searchCache.get(cacheKey);
  if (existing && existing.expiresAt > now) return { data: existing.value, cache: "hit" };
  if (existing) searchCache.delete(cacheKey);
  const current = searchInFlight.get(cacheKey);
  if (current) return { data: await current, cache: "hit" };
  if (inFlight.size + searchInFlight.size >= MAX_IN_FLIGHT) throw new AlternateUpstreamError("unavailable");
  const request = fetchAlternateSearchUncached(normalizedKeyword, page, sortBy, options.fetchImpl ?? fetch, options.timeoutMs);
  searchInFlight.set(cacheKey, request);
  try {
    const value = await request;
    if (searchCache.size >= MAX_CACHE_ENTRIES) searchCache.delete(searchCache.keys().next().value as string);
    searchCache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
    return { data: value, cache: "miss" };
  } finally {
    searchInFlight.delete(cacheKey);
  }
}
