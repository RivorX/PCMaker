import {
  CatalogUnavailableError,
  getCatalogComponentFromDataset,
  loadCatalogDataset,
} from "@/lib/catalog";
import { findCpuOffers } from "@/lib/cpu-offers";
import {
  SerpApiNotConfiguredError,
  SerpApiUpstreamError,
} from "@/lib/serpapi";
import type { ComponentOffersErrorResponse, ComponentOffersResponse } from "@/types/offers";

const errorResponse = (status: number, error: ComponentOffersErrorResponse["error"], message: string): Response =>
  Response.json({ error, message, source: "components" } satisfies ComponentOffersErrorResponse, { status });

const providerError = (error: unknown): Response => {
  if (error instanceof SerpApiNotConfiguredError) return errorResponse(503, "source_not_configured", "Źródło ofert nie jest jeszcze skonfigurowane.");
  if (error instanceof SerpApiUpstreamError) {
    if (error.kind === "rate_limited") return errorResponse(429, "rate_limited", "Źródło ofert jest chwilowo przeciążone. Spróbuj ponownie później.");
    if (error.kind === "timeout") return errorResponse(504, "upstream_timeout", "Źródło ofert nie odpowiedziało na czas.");
    return errorResponse(502, error.kind === "invalid" ? "upstream_invalid" : "upstream_unavailable", "Źródło ofert nie zwróciło poprawnej odpowiedzi.");
  }
  return errorResponse(502, "upstream_unavailable", "Nie udało się pobrać ofert.");
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const componentId = id.trim();
  if (!componentId || componentId.length > 200 || componentId.includes("/")) {
    return errorResponse(400, "invalid_query", "Nieprawidłowy identyfikator podzespołu.");
  }

  let dataset;
  try {
    dataset = await loadCatalogDataset();
  } catch (error) {
    if (error instanceof CatalogUnavailableError) return errorResponse(503, "catalog_unavailable", "Katalog danych jest obecnie niedostępny.");
    throw error;
  }
  const component = getCatalogComponentFromDataset(dataset, componentId);
  if (!component) return errorResponse(404, "not_found", "Nie znaleziono podzespołu w katalogu.");

  const baseMeta = { componentId: component.id, componentName: component.name, matchingBasis: "title" as const };
  if (component.category !== "cpu") {
    const body: ComponentOffersResponse = { data: [], meta: { ...baseMeta, matchStatus: "unsupported" } };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await findCpuOffers(component);
    const body: ComponentOffersResponse = {
      data: result.data,
      meta: {
        ...baseMeta,
        matchStatus: result.matchStatus,
        query: component.name,
        pages: result.pages,
      },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerError(error);
  }
}
