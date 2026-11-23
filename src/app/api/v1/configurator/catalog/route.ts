import { CatalogUnavailableError, loadCatalogDataset } from "@/lib/catalog";
import type { CatalogComponent, CatalogErrorResponse } from "@/types/catalog";
import type { ComponentCategory } from "@/lib/drafts";

interface ConfiguratorCatalogComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer: string;
  description: string;
  price: number | null;
  socket: string;
  memoryType: string;
}

const toConfiguratorComponent = (component: CatalogComponent): ConfiguratorCatalogComponent => ({
  id: component.id,
  name: component.name,
  category: component.category,
  manufacturer: component.manufacturer,
  description: component.description,
  price: component.price,
  socket: component.specifications.socket ?? "",
  memoryType: component.specifications.memoryType ?? "",
});

const unavailableResponse = (): Response => Response.json(
  {
    error: "catalog_unavailable",
    message: "Katalog danych jest obecnie niedostępny.",
    source: "components",
  } satisfies CatalogErrorResponse,
  { status: 503 },
);

export async function GET() {
  try {
    const dataset = await loadCatalogDataset();
    return Response.json(
      { data: dataset.components.map(toConfiguratorComponent) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CatalogUnavailableError) return unavailableResponse();
    throw error;
  }
}
