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

`state` przyjmuje `configured` albo `not_configured`. W aktualnym etapie wszystkie trzy pozycje (`offers`, `auth`, `database`) są `not_configured`.

## `GET /api/v1/offers`

Parametry opcjonalne:

- `query` — wyszukiwana nazwa, maksymalnie 120 znaków;
- `category` — kategoria komponentu;
- `limit` — liczba wyników od 1 do 100.

Do czasu uzyskania dostępu do prawdziwego API sklepów endpoint zwraca `503 Service Unavailable`:

```json
{
  "error": "source_not_configured",
  "message": "Źródło ofert nie jest jeszcze skonfigurowane. Endpoint nie zwraca danych zastępczych.",
  "source": "offers"
}
```

Błędny `limit` albo zbyt długie `query` zwracają `400` z `error: "invalid_query"`. W tym etapie nie ma endpointów mutujących, zapisu konfiguracji ani tworzenia zgłoszeń. Te operacje wymagają najpierw kontraktu auth i modelu danych przygotowanych przez właścicieli tych modułów.
