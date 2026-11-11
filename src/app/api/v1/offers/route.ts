import { COMPONENT_CATEGORIES, type ComponentCategory } from "@/types/catalog";
import {
  SerpApiNotConfiguredError,
  SerpApiUpstreamError,
  searchSerpApiProducts,
} from "@/lib/serpapi";
import type { SerpApiSearchResponse, OffersErrorResponse } from "@/types/offers";

const errorResponse = (status: number, error: OffersErrorResponse["error"], message: string): Response =>
  Response.json({ error, message, source: "offers" } satisfies OffersErrorResponse, { status });

const isCategory = (value: string): value is ComponentCategory =>
  (COMPONENT_CATEGORIES as readonly string[]).includes(value);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "search") return errorResponse(400, "invalid_query", "Parametr action musi mieć wartość search.");

  const keyword = url.searchParams.get("keyword") ?? url.searchParams.get("query") ?? "";
  const rawPage = url.searchParams.get("page");
  const rawLimit = url.searchParams.get("limit");
  const page = rawPage === null ? 1 : Number(rawPage);
  const limit = rawLimit === null ? 12 : Number(rawLimit);
  const rawCategory = url.searchParams.get("category") ?? undefined;
  if (!keyword.trim() || keyword.length > 120) return errorResponse(400, "invalid_query", "Parametr keyword musi mieć od 1 do 120 znaków.");
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return errorResponse(400, "invalid_query", "Parametr page musi być liczbą całkowitą od 1 do 1000.");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return errorResponse(400, "invalid_query", "Parametr limit musi być liczbą całkowitą od 1 do 50.");
  if (rawCategory !== undefined && !isCategory(rawCategory)) return errorResponse(400, "invalid_query", "Nieznana kategoria katalogu.");

  try {
    const result = await searchSerpApiProducts(keyword, { expectedCategory: rawCategory, page, limit });
    const body: SerpApiSearchResponse = {
      data: result.data,
      meta: {
        source: "serpapi-google-shopping",
        query: keyword.trim(),
        expectedCategory: rawCategory ?? null,
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasNext: result.hasNext,
        queriedAt: new Date().toISOString(),
        cache: result.cache,
      },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SerpApiNotConfiguredError) return errorResponse(503, "source_not_configured", "Źródło ofert nie jest jeszcze skonfigurowane.");
    if (error instanceof SerpApiUpstreamError) {
      if (error.kind === "rate_limited") return errorResponse(429, "rate_limited", "Źródło ofert jest chwilowo przeciążone. Spróbuj ponownie później.");
      if (error.kind === "timeout") return errorResponse(504, "upstream_timeout", "Źródło ofert nie odpowiedziało na czas.");
      return errorResponse(502, error.kind === "invalid" ? "upstream_invalid" : "upstream_unavailable", "Źródło ofert nie zwróciło poprawnej odpowiedzi.");
    }
    return errorResponse(502, "upstream_unavailable", "Nie udało się pobrać ofert.");
  }
}
