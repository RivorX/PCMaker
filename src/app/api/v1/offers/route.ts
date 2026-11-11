import {
  ALTERNATE_SORT_VALUES,
  AlternateNotConfiguredError,
  AlternateNotFoundError,
  AlternateUpstreamError,
  lookupAlternateProduct,
  searchAlternateProducts,
} from "@/lib/alternate";
import type { OffersErrorResponse, OffersLookupResponse, OffersSearchResponse } from "@/types/offers";

const errorResponse = (status: number, error: OffersErrorResponse["error"], message: string): Response =>
  Response.json({ error, message, source: "offers" } satisfies OffersErrorResponse, { status });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "lookup" && action !== "search") {
    return errorResponse(400, "invalid_query", "Parametr action musi mieć wartość lookup albo search.");
  }

  if (action === "search") {
    const keyword = url.searchParams.get("keyword") ?? url.searchParams.get("query") ?? "";
    const rawPage = url.searchParams.get("page");
    const page = rawPage === null ? 1 : Number(rawPage);
    const rawSortBy = url.searchParams.get("sortBy");
    const sortBy = rawSortBy ?? "relevance";
    if (!keyword.trim() || keyword.length > 120) return errorResponse(400, "invalid_query", "Parametr keyword musi mieć od 1 do 120 znaków.");
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return errorResponse(400, "invalid_query", "Parametr page musi być liczbą całkowitą od 1 do 1000.");
    if (!ALTERNATE_SORT_VALUES.includes(sortBy as (typeof ALTERNATE_SORT_VALUES)[number])) return errorResponse(400, "invalid_query", "Nieprawidłowa strategia sortowania ofert.");
    try {
      const result = await searchAlternateProducts(keyword, { page, sortBy: sortBy as (typeof ALTERNATE_SORT_VALUES)[number] });
      const body: OffersSearchResponse = {
        data: result.data.data,
        meta: {
          source: "everydata-alternate",
          keyword: keyword.trim(),
          page,
          sortBy,
          resultCount: result.data.resultCount,
          nextPage: result.data.nextPage,
          lastPage: result.data.lastPage,
          queriedAt: new Date().toISOString(),
          cache: result.cache,
        },
      };
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof AlternateNotConfiguredError) return errorResponse(503, "source_not_configured", "Źródło ofert nie jest jeszcze skonfigurowane.");
      if (error instanceof AlternateUpstreamError) {
        if (error.kind === "rate_limited") return errorResponse(429, "rate_limited", "Źródło ofert jest chwilowo przeciążone. Spróbuj ponownie później.");
        if (error.kind === "timeout") return errorResponse(504, "upstream_timeout", "Źródło ofert nie odpowiedziało na czas.");
        return errorResponse(502, error.kind === "invalid" ? "upstream_invalid" : "upstream_unavailable", "Źródło ofert nie zwróciło poprawnej odpowiedzi.");
      }
      return errorResponse(502, "upstream_unavailable", "Nie udało się pobrać ofert.");
    }
  }

  const productId = url.searchParams.get("productId")?.trim() ?? "";
  if (!/^\d{1,40}$/.test(productId)) {
    return errorResponse(400, "invalid_query", "Parametr productId musi być niepustym identyfikatorem liczbowym.");
  }

  try {
    const result = await lookupAlternateProduct(productId);
    const body: OffersLookupResponse = {
      data: result.data,
      meta: { source: "everydata-alternate", queriedAt: new Date().toISOString(), cache: result.cache },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AlternateNotConfiguredError) {
      return errorResponse(503, "source_not_configured", "Źródło ofert nie jest jeszcze skonfigurowane.");
    }
    if (error instanceof AlternateNotFoundError) {
      return errorResponse(404, "offer_not_found", "Nie znaleziono oferty dla podanego identyfikatora.");
    }
    if (error instanceof AlternateUpstreamError) {
      if (error.kind === "rate_limited") return errorResponse(429, "rate_limited", "Źródło ofert jest chwilowo przeciążone. Spróbuj ponownie później.");
      if (error.kind === "timeout") return errorResponse(504, "upstream_timeout", "Źródło ofert nie odpowiedziało na czas.");
      return errorResponse(502, error.kind === "invalid" ? "upstream_invalid" : "upstream_unavailable", "Źródło ofert nie zwróciło poprawnej odpowiedzi.");
    }
    return errorResponse(502, "upstream_unavailable", "Nie udało się pobrać oferty.");
  }
}
