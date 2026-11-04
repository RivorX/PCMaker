import type { ComponentCategory } from "@/lib/drafts";
import { dataConnect } from "@/lib/firebase";
import { listComponents } from "@/lib/dataconnect-generated";

export interface CatalogComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer: string;
  description: string;
  price: number;
  socket: string;
  memoryType: string;
}

export const configurableCategories: ComponentCategory[] = [
  "cpu",
  "motherboard",
  "memory",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooling",
];

const categoryNames: Record<string, ComponentCategory> = {
  cpu: "cpu",
  processor: "cpu",
  procesor: "cpu",
  motherboard: "motherboard",
  mainboard: "motherboard",
  "płyta główna": "motherboard",
  "plyta glowna": "motherboard",
  memory: "memory",
  ram: "memory",
  "pamięć ram": "memory",
  "pamiec ram": "memory",
  gpu: "gpu",
  graphics: "gpu",
  "graphics card": "gpu",
  "karta graficzna": "gpu",
  storage: "storage",
  disk: "storage",
  drive: "storage",
  ssd: "storage",
  hdd: "storage",
  nvme: "storage",
  "hard drive": "storage",
  "solid state drive": "storage",
  dysk: "storage",
  psu: "psu",
  "power supply": "psu",
  "power supply unit": "psu",
  zasilacz: "psu",
  case: "case",
  chassis: "case",
  obudowa: "case",
  cooling: "cooling",
  cooler: "cooling",
  chłodzenie: "cooling",
  chlodzenie: "cooling",
};

const normalizeCategory = (value: string): ComponentCategory | null => {
  const key = value.trim().toLocaleLowerCase("pl-PL").replace(/[_-]+/g, " ");
  return categoryNames[key] ?? null;
};

const normalizeText = (value: string | null | undefined): string => value?.trim() ?? "";

interface RawCatalogComponent {
  id: string;
  name: string;
  componentType: string;
  manufacturer?: string | null;
  description?: string | null;
  price: number;
}

export async function fetchCatalog(): Promise<CatalogComponent[]> {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    throw new Error("Katalog części wymaga konfiguracji Firebase. Uzupełnij NEXT_PUBLIC_FIREBASE_API_KEY w ustawieniach aplikacji.");
  }

  let components: RawCatalogComponent[];
  try {
    // Fetch the full public directory; filtering is done locally by category.
    const { data } = await listComponents(dataConnect);
    components = data.components as RawCatalogComponent[];
  } catch {
    throw new Error("Nie udało się pobrać katalogu z Firebase Data Connect. Sprawdź połączenie, klucz API oraz publiczny dostęp do zapytania ListComponents.");
  }

  return components.flatMap((component) => {
    const category = normalizeCategory(component.componentType);
    if (!category || !configurableCategories.includes(category)) return [];
    if (!Number.isFinite(component.price) || component.price < 0) {
      throw new Error(`Katalog zawiera nieprawidłową cenę dla produktu „${component.name}”. Popraw cenę w bazie przed dodaniem części do zestawu.`);
    }
    return [{
        id: component.id,
        name: component.name,
        category,
        manufacturer: normalizeText(component.manufacturer),
        description: normalizeText(component.description),
        price: component.price,
        // The current Data Connect query returns basic component fields only.
        // Technical specifications can be filled once that query includes them.
        socket: "",
        memoryType: "",
      }];
  });
}
