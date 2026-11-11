export interface OfferMoney {
  originalEUR: { amountCents: number; currency: "EUR" } | null;
  estimatedPLN: { amountCents: number; currency: "PLN"; eurPlnRate: number; isEstimate: true } | null;
}

export interface AlternateOffer {
  provider: "everydata-alternate";
  providerProductId: string;
  productTitle: string;
  manufacturer: string | null;
  ean: string | null;
  mpn: string | null;
  categories: string[];
  price: OfferMoney;
  shipping: OfferMoney;
  available: boolean | null;
  warehouseAvailability: string | null;
  sourceUrl: string | null;
}

export interface AlternateSearchCandidate extends AlternateOffer {
  productDescription: string | null;
  retailPrice: OfferMoney;
  productRating: string | null;
  deliveryMessage: string | null;
  highlights: string[];
  used: boolean | null;
}

export interface OffersLookupResponse {
  data: AlternateOffer;
  meta: {
    source: "everydata-alternate";
    queriedAt: string;
    cache: "hit" | "miss";
  };
}

export interface OffersSearchResponse {
  data: AlternateSearchCandidate[];
  meta: {
    source: "everydata-alternate";
    keyword: string;
    page: number;
    sortBy: string;
    resultCount: number;
    nextPage: number | null;
    lastPage: number | null;
    queriedAt: string;
    cache: "hit" | "miss";
  };
}

export type OffersErrorCode =
  | "source_not_configured"
  | "invalid_query"
  | "offer_not_found"
  | "rate_limited"
  | "upstream_timeout"
  | "upstream_unavailable"
  | "upstream_invalid";

export interface OffersErrorResponse {
  error: OffersErrorCode;
  message: string;
  source: "offers";
}
