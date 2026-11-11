import {
  catalogCategories,
  CatalogUnavailableError,
  getCatalogDataset,
  isCatalogCategory,
  listCatalogComponents,
} from "@/lib/catalog";
import type {
  CatalogErrorResponse,
  CatalogListResponse,
} from "@/types/catalog";

const errorResponse = (message: string): Response => {
  const body: CatalogErrorResponse = {
    error: "invalid_query",
    message,
    source: "components",
  };
  return Response.json(body, { status: 400 });
};

const unavailableResponse = (): Response => Response.json(
  {
    error: "catalog_unavailable",
    message: "Katalog danych jest obecnie niedostępny.",
    source: "components",
  } satisfies CatalogErrorResponse,
  { status: 503 },
);

export function GET(request: Request) {
  const url = new URL(request.url);
  const rawPage = url.searchParams.get("page");
  const rawLimit = url.searchParams.get("limit");
  const query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined;
  const rawCategory = url.searchParams.get("category") ?? undefined;
  const manufacturer = url.searchParams.get("manufacturer") ?? undefined;
  const page = rawPage === null ? 1 : Number(rawPage);
  const limit = rawLimit === null ? 12 : Number(rawLimit);

  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return errorResponse("Parametr page musi być liczbą całkowitą od 1 do 1000.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return errorResponse("Parametr limit musi być liczbą całkowitą od 1 do 50.");
  }
  if (query !== undefined && query.length > 120) {
    return errorResponse("Parametr q może mieć maksymalnie 120 znaków.");
  }
  if (manufacturer !== undefined && manufacturer.length > 80) {
    return errorResponse("Parametr manufacturer może mieć maksymalnie 80 znaków.");
  }
  if (rawCategory !== undefined && !isCatalogCategory(rawCategory)) {
    return errorResponse(`Nieznana kategoria. Dostępne: ${catalogCategories.join(", ")}.`);
  }

  try {
    const dataset = getCatalogDataset();
    const filtered = listCatalogComponents({
      query,
      category: rawCategory,
      manufacturer,
      page,
      limit,
    });
    const start = (page - 1) * limit;
    const body: CatalogListResponse = {
      data: filtered.slice(start, start + limit),
      meta: {
        query: query?.trim() || null,
        category: rawCategory ?? null,
        manufacturer: manufacturer?.trim() || null,
        page,
        limit,
        total: filtered.length,
        source: dataset.source,
        ...(dataset.provider ? { provider: dataset.provider } : {}),
        generatedAt: new Date().toISOString(),
      },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) return unavailableResponse();
    throw error;
  }
}
