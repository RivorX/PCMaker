import { CatalogUnavailableError, catalogCategories, getCatalogDataset, getCatalogManufacturers } from "@/lib/catalog";

export function GET() {
  try {
    const dataset = getCatalogDataset();
    return Response.json({
      data: {
        categories: catalogCategories,
        manufacturers: getCatalogManufacturers(),
      },
      source: dataset.source,
    });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return Response.json({ error: "catalog_unavailable", message: "Katalog danych jest obecnie niedostępny.", source: "components" }, { status: 503 });
    }
    throw error;
  }
}
