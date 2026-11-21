import {
  CatalogUnavailableError,
  getCatalogComponentFromDataset,
  loadCatalogDataset,
} from "@/lib/catalog";
import type { CatalogComponent, CatalogErrorResponse } from "@/types/catalog";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let component: CatalogComponent | undefined;
  let source: "sample" | "external" | "database";
  let provider: string | undefined;
  try {
    const dataset = await loadCatalogDataset();
    component = getCatalogComponentFromDataset(dataset, id);
    source = dataset.source;
    provider = dataset.provider;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      const body: CatalogErrorResponse = {
        error: "catalog_unavailable",
        message: "Katalog danych jest obecnie niedostępny.",
        source: "components",
      };
      return Response.json(body, { status: 503 });
    }
    throw error;
  }
  if (!component) {
    const body: CatalogErrorResponse = {
      error: "not_found",
      message: "Nie znaleziono podzespołu w katalogu.",
      source: "components",
    };
    return Response.json(body, { status: 404 });
  }
  return Response.json({ data: component, meta: { source, ...(provider ? { provider } : {}) } });
}
