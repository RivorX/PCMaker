# API handoff — etap 01

Kontrakty poniżej opisują granicę aplikacji przed podłączeniem autoryzacji, bazy oraz źródła ofert. Endpointy nie zwracają fikcyjnych danych.

## `GET /api/v1/integrations`

Zwraca stan połączeń potrzebnych aplikacji.

```json
{
  "data": [
    {
      "key": "offers",
      "label": "Oferty sklepów",
      "state": "not_configured",
      "message": "Brak przyznanego dostępu do źródła ofert."
    }
  ],
  "generatedAt": "2026-10-20T12:00:00.000Z"
}
```

`state` przyjmuje `configured` albo `not_configured`. Dla `offers` wartość `configured` oznacza wyłącznie obecność serwerowej zmiennej `EVERYDATA_API_KEY`; dostępność dostawcy jest sprawdzana dopiero przy jawnym żądaniu. Nie ujawniamy klucza ani nie wykonujemy połączenia podczas odczytu tego endpointu.

## `GET /api/v1/offers`

Lookup pojedynczego produktu Alternate wykonuje się jawnie:

`GET /api/v1/offers?action=lookup&productId=1108895`

`productId` musi być niepustym identyfikatorem liczbowym (maksymalnie 40 cyfr). Endpoint nie jest wywoływany przy otwarciu katalogu ani podczas wpisywania tekstu. Odpowiedź sukcesu zachowuje kwoty źródłowe w EUR oraz osobno wyliczoną, oznaczoną jako szacunkowa kwotę PLN:

```json
{
  "data": {
    "provider": "everydata-alternate",
    "providerProductId": "1108895",
    "productTitle": "Demo GPU",
    "manufacturer": "Demo",
    "price": {
      "originalEUR": { "amountCents": 7590, "currency": "EUR" },
      "estimatedPLN": { "amountCents": 32637, "currency": "PLN", "eurPlnRate": 4.3, "isEstimate": true }
    },
    "shipping": {
      "originalEUR": { "amountCents": 799, "currency": "EUR" },
      "estimatedPLN": { "amountCents": 3436, "currency": "PLN", "eurPlnRate": 4.3, "isEstimate": true }
    }
  },
  "meta": { "source": "everydata-alternate", "cache": "miss", "queriedAt": "2026-11-03T12:00:00.000Z" }
}
```

`EUR_PLN_RATE` jest stałą konfigurowalną stawką roboczą i domyślnie wynosi `4.30`; aplikacja nie pobiera kursu z zewnętrznego API. Kwoty są zaokrąglane do groszy. W interfejsie użytkownik widzi przy PLN wyłącznie komunikat „Cena orientacyjna, może się różnić”.

Wyszukiwanie ofert również wymaga jawnego submitu:

`GET /api/v1/offers?action=search&keyword=ssd&page=1&sortBy=relevance`

`keyword` ma długość 1–120 znaków, `page` mieści się w zakresie 1–1000, a `sortBy` przyjmuje `relevance`, `popularity`, `price-asc`, `price-desc`, `rating`, `newest` albo `discount`. Odpowiedź mapuje dokładny kontrakt dostawcy: `searchProductDetails` staje się listą `data`, a `resultCount`, `nextPage` i `lastPage` trafiają do `meta`. Cena wyszukiwania nie jest automatycznie przypisywana do rekordu katalogu; użytkownik wybiera konkretną ofertę. Zweryfikowany `dpUrl` jest linkiem do sklepu Alternate.

Bez `EVERYDATA_API_KEY` endpoint zwraca `503 Service Unavailable`:

```json
{
  "error": "source_not_configured",
  "message": "Źródło ofert nie jest jeszcze skonfigurowane.",
  "source": "offers"
}
```

`400 invalid_query` oznacza brak/niepoprawną akcję albo parametry. `404 offer_not_found` oznacza brak produktu u dostawcy. Błąd dostawcy lub niezgodna odpowiedź zwracają `502` z `upstream_unavailable` albo `upstream_invalid`; limit dostawcy zwraca sanitizowany `429 rate_limited`, a timeout `504 upstream_timeout`. Odpowiedź nie zawiera surowego komunikatu dostawcy ani klucza API. Cache jest lokalny dla procesu, ma ograniczoną liczbę wpisów i TTL jednej godziny; nie zastępuje trwałego cache ani globalnego limitu dostawcy.

W tym etapie nie ma endpointów mutujących, zapisu konfiguracji ani tworzenia zgłoszeń. Te operacje wymagają najpierw kontraktu auth i modelu danych przygotowanych przez właścicieli tych modułów.

## Katalog podzespołów

### `GET /api/v1/components`

Endpoint katalogu zwraca opis produktu, bez udawania aktualnej ceny sklepowej. Parametry:

- `q` albo `query` — literalne wyszukiwanie po nazwie, producencie, modelu, kategorii, opisie i znanych specyfikacjach, maksymalnie 120 znaków;
- `category` — `cpu`, `gpu`, `motherboard`, `memory`, `storage`, `psu`, `case` albo `cooling`;
- `manufacturer` — dokładne filtrowanie po producencie, maksymalnie 80 znaków;
- `page` — od 1 do 1000, domyślnie 1;
- `limit` — od 1 do 50, domyślnie 12.

Odpowiedź zawiera `data` oraz `meta.total`, `meta.page`, `meta.limit`, `meta.source` i opcjonalnie `meta.provider`. Bez `CATALOG_DATA_FILE` `meta.source` ma wartość `sample`; po poprawnym załadowaniu snapshotu ma wartość `external`. `price` i `performanceScore` mogą być `null`, a `source.kind` informuje o pochodzeniu rekordu. Sortowanie po nazwie jest deterministyczne.

Jeśli `CATALOG_DATA_FILE` jest ustawione i plik jest niepoprawny, lista, szczegół rekordu oraz lista kategorii zwracają `503`:

```json
{
  "error": "catalog_unavailable",
  "message": "Katalog danych jest obecnie niedostępny.",
  "source": "components"
}
```

### `GET /api/v1/components/:id`

Zwraca pojedynczy rekord albo `404` z `error: "not_found"`. `GET /api/v1/components/categories` zwraca listę kategorii i producentów. Import pliku UserBenchmark jest narzędziem offline opisanym w [docs/catalog.md](catalog.md); endpoint nie pobiera sieci podczas żądania.
