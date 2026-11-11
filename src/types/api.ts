export type IntegrationState = "configured" | "not_configured";

export type IntegrationKey = "offers" | "auth" | "database";

export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  state: IntegrationState;
  message: string;
}

export interface IntegrationsResponse {
  data: IntegrationStatus[];
  generatedAt: string;
}

export interface OffersQuery {
  action?: "lookup" | "search";
  productId?: string;
  query?: string;
  category?: string;
  page?: number;
  sortBy?: string;
  limit?: number;
}

export interface ApiErrorBody {
  error: "source_not_configured" | "invalid_query" | "offer_not_found" | "rate_limited" | "upstream_timeout" | "upstream_unavailable" | "upstream_invalid";
  message: string;
  source: "offers";
}
