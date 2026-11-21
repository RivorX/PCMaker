import type { CatalogComponent, CatalogSpecificationProvenance } from "../types/catalog.ts";

export interface CpuSpecificationPilotEntry {
  manufacturer: string;
  model: string;
  specifications: Record<string, string>;
  provenance: Record<string, CatalogSpecificationProvenance>;
}

const AMD_SOURCE = "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800X3d.html";
const AMD_7600_SOURCE = "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html";
const INTEL_SOURCE = "https://www.intel.com/content/www/us/en/products/sku/236799/intel-core-i5-processor-14600k-24m-cache-up-to-5-30-ghz/specifications.html";

const pilot = (
  manufacturer: string,
  model: string,
  sourceUrl: string,
  specifications: Record<string, string>,
): CpuSpecificationPilotEntry => ({
  manufacturer,
  model,
  specifications,
  provenance: Object.fromEntries(Object.keys(specifications).map((name) => [name, { sourceLabel: `${manufacturer} — strona producenta`, sourceUrl }])),
});

export const CPU_SPECIFICATION_PILOT: readonly CpuSpecificationPilotEntry[] = [
  pilot("AMD", "Ryzen 7 7800X3D", AMD_SOURCE, {
    Socket: "AM5",
    Pamięć: "DDR5",
    Rdzenie: "8",
    Wątki: "16",
    "Default TDP": "120 W",
  }),
  pilot("AMD", "Ryzen 5 7600", AMD_7600_SOURCE, {
    Socket: "AM5",
    Pamięć: "DDR5",
    Rdzenie: "6",
    Wątki: "12",
    TDP: "65 W",
  }),
  pilot("Intel", "Core i5-14600K", INTEL_SOURCE, {
    Socket: "LGA1700",
    Pamięć: "DDR4 / DDR5",
    Rdzenie: "14",
    Wątki: "20",
    "Processor Base Power": "125 W",
    "Maximum Turbo Power": "181 W",
  }),
];

const identity = (value: string): string => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

const findPilotEntry = (component: Pick<CatalogComponent, "category" | "manufacturer" | "model">): CpuSpecificationPilotEntry | undefined => {
  if (component.category !== "cpu") return undefined;
  const manufacturer = identity(component.manufacturer);
  const model = identity(component.model);
  return CPU_SPECIFICATION_PILOT.find((entry) => identity(entry.manufacturer) === manufacturer && identity(entry.model) === model);
};

const equivalentFields: Record<string, string> = {
  Socket: "socket",
  Pamięć: "memoryType",
  Rdzenie: "cores",
  Wątki: "threads",
  "Default TDP": "tdp",
  TDP: "tdp",
};

export const supplementCpuSpecifications = (component: CatalogComponent): CatalogComponent => {
  const entry = findPilotEntry(component);
  if (!entry) return component;
  const specifications = { ...component.specifications };
  const provenance = { ...(component.specificationProvenance ?? {}) };
  for (const [name, value] of Object.entries(entry.specifications)) {
    if (Object.hasOwn(specifications, name) || (equivalentFields[name] && Object.hasOwn(specifications, equivalentFields[name]))) continue;
    specifications[name] = value;
    provenance[name] = entry.provenance[name];
  }
  return {
    ...component,
    specifications,
    ...(Object.keys(provenance).length > 0 ? { specificationProvenance: provenance } : {}),
  };
};

export const supplementFirebaseCpuSpecifications = (components: CatalogComponent[]): CatalogComponent[] =>
  components.map(supplementCpuSpecifications);

