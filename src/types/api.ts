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
  query?: string;
  category?: string;
  limit?: number;
}

export interface ApiErrorBody {
  error: "source_not_configured" | "invalid_query";
  message: string;
  source: "offers";
}
