import { CatalogUnavailableError, getCatalogComponent, getCatalogDataset } from "@/lib/catalog";
import type { CatalogComponent, CatalogErrorResponse } from "@/types/catalog";

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return context.params.then(({ id }) => {
    let component: CatalogComponent | undefined;
    let source: "sample" | "external" | "database";
    try {
      component = getCatalogComponent(id);
      source = getCatalogDataset().source;
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
    return Response.json({ data: component, meta: { source } });
  });
}
