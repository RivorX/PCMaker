# Katalog podzespołów — etap 02

Katalog rozdziela opis produktu od ofert handlowych. Rekord `CatalogComponent` zawiera nazwę, kategorię, producenta, model i znane specyfikacje. `price` jest nullable i w obecnym zbiorze przykładowym ma wartość `null`; nie jest to cena sklepu.

## Źródło danych

Porównanie dostępnych źródeł ofert, ograniczeń licencyjnych i wyniku researchu znajduje się w [docs/catalog-sources.md](catalog-sources.md).

Domyślnie API używa małego pliku `src/data/components.sample.json`. Rekordy mają `source.kind: "sample"`, więc UI może uczciwie oznaczyć je jako dane demonstracyjne. Nie są automatycznie pobierane ani odświeżane podczas żądania HTTP.

Po otrzymaniu pliku CSV z UserBenchmark można uruchomić importer:

```bash
node --experimental-strip-types scripts/import-userbenchmark.mjs .\UserBenchmarks.csv .\data\userbenchmark.components.json
```

Importer wymaga dokładnie kolumn `Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL`. Obsługuje BOM, CRLF, pola w cudzysłowie, przecinki w nazwach i powtórzone cudzysłowy. Obsługiwane typy to `CPU`, `GPU`, `SSD`, `HDD` i `RAM`; pozostałe są raportowane jako pominięte. URL-e importowanych rekordów muszą być HTTPS i należeć do `userbenchmark.com` lub jego subdomen. Nie wylicza socketu, typu pamięci, ceny ani uniwersalnego wyniku wydajności. `Benchmark`, `Rank` i `Samples` są zachowane jako metryka źródła `userbenchmark`, a `Part Number` trafia do `sourceIdentity.externalId`.

Wygenerowany plik jest snapshotem. Aby lokalny serwer używał go jako źródła katalogu, ustaw po stronie serwera `CATALOG_DATA_FILE` na ścieżkę tego pliku i uruchom ponownie aplikację. Gdy zmienna nie jest ustawiona, endpoint korzysta z `components.sample.json`. Gdy jest ustawiona, ale plik jest niedostępny lub nie przejdzie walidacji, endpoint zwraca `503 catalog_unavailable` i nie przełącza się po cichu na zbiór przykładowy. Ścieżka nie jest zwracana klientowi.

Snapshot nie modyfikuje bazy ani nie pobiera sieci podczas żądania. Dla aplikacji opisanej w README (Node 20+) importer/testy używają `node --experimental-strip-types`, dlatego wymagają Node 24+ albo wcześniejszego skompilowania pliku TypeScript.

## API

- `GET /api/v1/components` — listuje katalog; parametry `q`/`query`, `category`, `manufacturer`, `page` (1–1000) i `limit` (1–50).
- `GET /api/v1/components/:id` — zwraca szczegóły albo `404`.
- `GET /api/v1/components/categories` — zwraca kategorie i producentów obecnego źródła.

Lista jest deterministycznie sortowana po nazwie. Nieznana kategoria, zbyt długie wyszukiwanie i błędna paginacja zwracają `400`. Dane pozostają publiczne na potrzeby demonstracji; po podłączeniu bazy i autoryzacji zasady dostępu ustala właściciel tych modułów.

## Przejście do bazy i ofert

Istniejący Firebase Data Connect ma `components` i `component_specifications`, lecz jego `Component.price` jest wymagane, a obecny typ jest `Float`. Dla katalogu produkcyjnego cena powinna należeć do oferty, a nie do kanonicznego produktu. Proponowane tabele i ograniczenia są w [database/catalog-reference.sql](../database/catalog-reference.sql). Plik jest dokumentem referencyjnym, nie uruchomioną migracją.

Projekt obejmuje komponenty, specyfikacje, źródła, identyfikatory zewnętrzne, obserwacje benchmarków, oferty oraz historię cen. `components.public_id` przechowuje identyfikator używany przez REST/importer; wewnętrzny UUID bazy pozostaje osobnym kluczem. Metryki UserBenchmark zachowują własne źródło i czas importu. Oferta i historia mają kwoty w groszach, osobny koszt dostawy i walutę PLN. Nieznany koszt dostawy jest `NULL`, nie oznacza darmowej wysyłki.

## Sprawdzenie

```bash
npm run test:catalog
npm run typecheck
npm run build
```

Podczas weryfikacji 2026-11-03 oficjalny CSV CPU dał 1427 rekordów bez pominiętych typów i duplikatów. Sprawdzono przepływ CSV → snapshot → REST z `meta.source: "external"`, `provider: "userbenchmark"` i cenami `null`. Sprawdzono także HTTP listy, szczegółów, kategorii, filtrów, paginacji i odpowiedzi 400/404 na danych przykładowych. Domyślny katalog nadal zawiera 9 rekordów przykładowych; pełny plik zewnętrzny nie jest dołączony do repozytorium.

Końcowe sprawdzenia: 5 testów `test:catalog`, TypeScript i build produkcyjny przeszły. Pakowanie istniejącego trybu `standalone` wymagało uruchomienia buildu poza sandboxem z powodu blokady zapisu plików przez Windows. Projekt SQL nie był wykonywany na bazie; żadne zmiany nie zostały wdrożone do Firebase.

## Oferty Google Shopping przez SerpAPI

Adapter ofert jest oddzielony od katalogu kanonicznych modeli. Jawne `GET /api/v1/offers?action=search&keyword=...` pobiera wyniki Google Shopping przez serwerowy `SERPAPI_API_KEY`; żadne żądanie nie jest wykonywane przy otwarciu katalogu ani przy wpisywaniu tekstu. Znormalizowane wyniki mogą pochodzić z płaskiego `shopping_results`, grup `categorized_shopping_results` albo sponsorowanych `inline_shopping_results`. Surowe metadane SerpAPI nie opuszczają backendu.

Waluta jest rozpoznawana z tekstu ceny. PLN zachowuje kwotę źródłową, EUR może zostać przeliczone stałą `EUR_PLN_RATE=4.30` i jest oznaczone jako estymacja, a USD i nieznane waluty pozostają bez ceny. Brak ceny jest `null`, nigdy nie oznacza zera. Wyszukiwanie CPU odrzuca oczywiste zestawy PC/bundle, jeśli tytuł zawiera wystarczające sygnały; nie jest to uniwersalne dopasowanie kategorii.

Wyniki są kandydatami i nie są automatycznie przypisywane do modelu katalogowego. Link jest używany tylko po walidacji HTTPS, bez poświadczeń, parametrów kluczy ani linków do SerpAPI. Brak klucza daje `503 source_not_configured`, limit dostawcy `429 rate_limited`, timeout `504 upstream_timeout`, a inny błąd lub niepoprawna odpowiedź dostawcy sanitizowany `502`. Cache jest ograniczony do procesu, 100 wpisów i TTL jednej godziny.
