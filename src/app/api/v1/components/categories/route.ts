import {
  CatalogUnavailableError,
  catalogCategories,
  getCatalogManufacturersFromDataset,
  loadCatalogDataset,
} from "@/lib/catalog";

export async function GET() {
  try {
    const dataset = await loadCatalogDataset();
    return Response.json({
      data: {
        categories: catalogCategories,
        manufacturers: getCatalogManufacturersFromDataset(dataset),
      },
      source: dataset.source,
      ...(dataset.provider ? { provider: dataset.provider } : {}),
    });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return Response.json({ error: "catalog_unavailable", message: "Katalog danych jest obecnie niedostępny.", source: "components" }, { status: 503 });
    }
    throw error;
  }
}
