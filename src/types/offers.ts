export type ShoppingCurrency = "PLN" | "EUR";

export interface ShoppingPrice {
  original: { amountCents: number; currency: ShoppingCurrency } | null;
  estimatedPLN:
    | { amountCents: number; currency: "PLN"; isEstimate: true; eurPlnRate: number }
    | { amountCents: number; currency: "PLN"; isEstimate: false }
    | null;
  sourceText: string | null;
}

export interface SerpApiShoppingResult {
  provider: "serpapi-google-shopping";
  providerProductId: string | null;
  title: string;
  source: string | null;
  price: ShoppingPrice;
  link: string | null;
  thumbnail: string | null;
  sponsored: boolean;
}

export interface SerpApiSearchResponse {
  data: SerpApiShoppingResult[];
  meta: {
    source: "serpapi-google-shopping";
    query: string;
    expectedCategory: string | null;
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    queriedAt: string;
    cache: "hit" | "miss";
  };
}

export type OffersErrorCode =
  | "source_not_configured"
  | "invalid_query"
  | "rate_limited"
  | "upstream_timeout"
  | "upstream_unavailable"
  | "upstream_invalid";

export interface OffersErrorResponse {
  error: OffersErrorCode;
  message: string;
  source: "offers";
}
