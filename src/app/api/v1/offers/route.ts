import type { ApiErrorBody, OffersQuery } from "@/types/api";

export function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  const query: OffersQuery = {
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    limit,
  };

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    const body: ApiErrorBody = { error: "invalid_query", message: "Parametr limit musi być liczbą całkowitą od 1 do 100.", source: "offers" };
    return Response.json(body, { status: 400 });
  }

  if (query.query !== undefined && query.query.length > 120) {
    const body: ApiErrorBody = { error: "invalid_query", message: "Parametr query może mieć maksymalnie 120 znaków.", source: "offers" };
    return Response.json(body, { status: 400 });
  }

  const body: ApiErrorBody = { error: "source_not_configured", message: "Źródło ofert nie jest jeszcze skonfigurowane. Endpoint nie zwraca danych zastępczych.", source: "offers" };
  return Response.json(body, { status: 503 });
}
