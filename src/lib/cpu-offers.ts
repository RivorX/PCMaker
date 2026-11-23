import type { CatalogComponent } from "../types/catalog.ts";
import type { ComponentOffersMatchStatus, SerpApiShoppingResult } from "../types/offers.ts";
import { createCpuOfferMatcher } from "./cpu-offer-matcher.ts";
import { searchSerpApiProducts, SerpApiUpstreamError } from "./serpapi.ts";

const MAX_PAGES = 20;

export interface CpuOfferSearchPage {
  data: SerpApiShoppingResult[];
  hasNext: boolean;
}

export type CpuOfferSearch = (query: string, options: { page: number; limit: number; timeoutMs: number; expectedCategory: "cpu" }) => Promise<CpuOfferSearchPage>;

export interface CpuOfferLookupResult {
  data: SerpApiShoppingResult[];
  matchStatus: ComponentOffersMatchStatus;
  pages: number;
}

const defaultSearch: CpuOfferSearch = (query, options) => searchSerpApiProducts(query, options);

export async function findCpuOffers(
  component: CatalogComponent,
  search: CpuOfferSearch = defaultSearch,
): Promise<CpuOfferLookupResult> {
  if (component.category !== "cpu") return { data: [], matchStatus: "unsupported", pages: 0 };
  const matcher = createCpuOfferMatcher(component);
  if (!matcher.supported) return { data: [], matchStatus: "unsupported", pages: 0 };

  const matched: SerpApiShoppingResult[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= MAX_PAGES) {
    const result = await search(component.name, { expectedCategory: "cpu", page, limit: 50, timeoutMs: 20_000 });
    for (const candidate of result.data) if (matcher.matchesTitle(candidate.title)) matched.push(candidate);
    hasNext = result.hasNext;
    page += 1;
  }
  if (hasNext) {
    // Reuse the provider's sanitized error class so the route returns a
    // generic 502 rather than silently presenting a truncated result set.
    throw new SerpApiUpstreamError("invalid");
  }
  return { data: matched, matchStatus: matched.length > 0 ? "candidates" : "no_matches", pages: page - 1 };
}

