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

`state` przyjmuje `configured` albo `not_configured`. Dla `offers` wartość `configured` oznacza wyłącznie obecność serwerowej zmiennej `SERPAPI_API_KEY`; dostępność dostawcy jest sprawdzana dopiero przy jawnym żądaniu. Nie ujawniamy klucza ani nie wykonujemy połączenia podczas odczytu tego endpointu.

## `GET /api/v1/offers`

Wyszukiwanie Google Shopping przez SerpAPI wykonuje się wyłącznie po jawnym zatwierdzeniu formularza:

`GET /api/v1/offers?action=search&keyword=ssd&category=storage&page=1&limit=12`

`keyword` ma długość 1–120 znaków, `category` jest opcjonalną kategorią katalogu, `page` mieści się w zakresie 1–1000, a `limit` w zakresie 1–50. SerpAPI nie dostaje fikcyjnego offsetu — jeden zwalidowany snapshot wyników jest lokalnie dzielony na strony. `meta.hasNext` wynika wyłącznie z rzeczywistej liczby wyników po normalizacji.

Odpowiedź zwraca ograniczony, znormalizowany zestaw pól (`title`, `source`, bezpieczny link, identyfikator, cena), a nie surowe `search_metadata`, `search_parameters`, `json_endpoint` ani odpowiedź dostawcy:

```json
{
  "data": [{
    "provider": "serpapi-google-shopping",
    "providerProductId": "123",
    "title": "AMD Ryzen 7 7800X3D",
    "source": "Przykładowy sklep",
    "price": {
      "original": { "amountCents": 149900, "currency": "PLN" },
      "estimatedPLN": { "amountCents": 149900, "currency": "PLN", "isEstimate": false },
      "sourceText": "1 499,00 zł"
    },
    "link": "https://www.google.com/shopping/product/123",
    "thumbnail": null,
    "sponsored": false
  }],
  "meta": {
    "source": "serpapi-google-shopping",
    "query": "ssd",
    "expectedCategory": "storage",
    "page": 1,
    "limit": 12,
    "total": 1,
    "hasNext": false,
    "cache": "miss",
    "queriedAt": "2026-11-11T12:00:00.000Z"
  }
}
```

Waluta jest rozpoznawana z tekstu `price`, nie zakładamy PLN wyłącznie na podstawie `gl=pl`. PLN pozostaje kwotą źródłową; EUR może zostać przeliczone stałą `EUR_PLN_RATE=4.30` i jest oznaczone `isEstimate: true`; USD oraz nierozpoznane waluty pozostają bez ceny. W interfejsie każda pokazana kwota PLN ma komunikat „Cena orientacyjna, może się różnić”.

Bez `SERPAPI_API_KEY` endpoint zwraca `503 Service Unavailable`:

```json
{
  "error": "source_not_configured",
  "message": "Źródło ofert nie jest jeszcze skonfigurowane.",
  "source": "offers"
}
```

`400 invalid_query` oznacza brak/niepoprawną akcję albo parametry. Błąd dostawcy lub niezgodna odpowiedź zwracają `502` z `upstream_unavailable` albo `upstream_invalid`; limit dostawcy zwraca sanitizowany `429 rate_limited`, a timeout `504 upstream_timeout`. Odpowiedź nie zawiera surowego komunikatu dostawcy, klucza API ani linku do endpointu API. Cache jest lokalny dla procesu, ma ograniczoną liczbę wpisów i TTL jednej godziny; nie zastępuje trwałego cache ani globalnego limitu dostawcy. Dla zapytania CPU odfiltrowywane są oczywiste zestawy komputerowe/bundle, gdy można je rozpoznać po tytule; nie jest to gwarancja semantycznego dopasowania.

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
