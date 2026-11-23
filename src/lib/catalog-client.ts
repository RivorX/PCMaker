import type { ComponentCategory } from "@/lib/drafts";

export interface ConfiguratorCatalogComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer: string;
  description: string;
  price: number | null;
  socket: string;
  memoryType: string;
}

export async function fetchCatalog(): Promise<ConfiguratorCatalogComponent[]> {
  const response = await fetch("/api/v1/configurator/catalog", { cache: "no-store" });
  const body = await response.json() as {
    data?: ConfiguratorCatalogComponent[];
    message?: string;
  };

  if (!response.ok || !Array.isArray(body.data)) {
    throw new Error(body.message ?? "Nie udało się pobrać katalogu.");
  }

  return body.data;
}
