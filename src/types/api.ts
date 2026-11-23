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
  action?: "search";
  keyword?: string;
  query?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface ApiErrorBody {
  error: "source_not_configured" | "invalid_query" | "rate_limited" | "upstream_timeout" | "upstream_unavailable" | "upstream_invalid";
  message: string;
  source: "offers";
}
