export const COMPONENT_CATEGORIES = [
  "cpu",
  "gpu",
  "motherboard",
  "memory",
  "storage",
  "psu",
  "case",
  "cooling",
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export interface CatalogSource {
  kind: "sample" | "database" | "external";
  label: string;
  capturedAt: string;
  url: string | null;
  provider?: string;
}

export interface CatalogComponent {
  id: string;
  category: ComponentCategory;
  name: string;
  manufacturer: string;
  model: string;
  description: string;
  specifications: Record<string, string>;
  performanceScore: number | null;
  price: number | null;
  currency: "PLN";
  source: CatalogSource;
  sourceIdentity?: {
    provider: string;
    externalId: string;
    externalType: string;
  };
  sourceMetrics?: {
    metric: "userbenchmark";
    rank: number;
    benchmark: number;
    samples: number;
  };
}

export interface CatalogListResponse {
  data: CatalogComponent[];
  meta: {
    query: string | null;
    category: ComponentCategory | null;
    manufacturer: string | null;
    page: number;
    limit: number;
    total: number;
    source: "sample" | "external" | "database";
    provider?: string;
    generatedAt: string;
  };
}

export interface CatalogErrorResponse {
  error: "invalid_query" | "not_found" | "catalog_unavailable";
  message: string;
  source: "components";
}
