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

Dla pięciu pobranych plików można uruchomić bezpieczny batch:

```bash
npm run import:userbenchmark-batch
```

Bez argumentów skrypt czyta `.local/catalog/raw/CPU_UserBenchmarks.csv`, `GPU_UserBenchmarks.csv`, `SSD_UserBenchmarks.csv`, `HDD_UserBenchmarks.csv` i `RAM_UserBenchmarks.csv`. Można podać własną listę plików CSV jako argumenty. Każdy niepusty fizyczny wiersz przechodzi przez ten sam ścisły importer co pojedynczy plik; batch nie naprawia cudzysłowów ani nie scala rekordów wielowierszowych. Błędne wiersze trafiają do lokalnej kwarantanny z nazwą pliku, numerem wiersza i oryginalnym tekstem. Dokładne duplikaty są odrzucane z licznikiem, natomiast wszystkie rekordy w konflikcie stabilnego ID albo w niejednoznacznej grupie `manufacturer/model` są odrzucane razem.

Batch zapisuje `.local/catalog/userbenchmark.components.json`, `.local/catalog/userbenchmark.batch.report.json` i `.local/catalog/userbenchmark.quarantine.json`. Snapshot ma `version: 1`, wspólne `importedAt` i `source: "UserBenchmark CSV"`; raport podaje `rawRead`, `parsed`, `accepted`, `deduplicatedIdentical`, `quarantined`, grupy konfliktów i wyniki per plik. Kwarantanna zachowuje oryginalne rekordy lokalnie. Nie ma cen ani zgadywanych specyfikacji; metryki UserBenchmark pozostają w `sourceMetrics`.

Wygenerowany plik jest snapshotem. Aby przygotować lokalny, niepublikowany podgląd mapowania do pól Firebase `Component`, uruchom:

```bash
node --experimental-strip-types scripts/prepare-firebase-catalog.mjs .\\data\\userbenchmark.components.json
```

Narzędzie przyjmuje wyłącznie snapshot `version: 1` z tablicą `components` (czyli wynik importera, a nie surowy alternatywny format `components.sample.json`). Zapisuje domyślnie `.local/catalog/firebase-import.preview.json`, tworzy katalog wyjściowy i ustawia `readyToWrite: false`. Podgląd zawiera wyłącznie pola `Component`, ceny i wyniki wydajności pozostawia jako `null`, a źródłową tożsamość, czas i metryki zachowuje w osobnym `manifest`. Identyfikatory są deterministycznymi UUID opartymi o `sourceIdentity` albo istniejące ID katalogu, więc ponowienie przygotowania nie losuje nowych rekordów. Błędne rekordy, nieznane kategorie, duplikaty ID oraz powtórzone pary `manufacturer`/`model` kończą się błędem zamiast cichego nadpisania.

Podgląd jest celowo zablokowany: obecny schemat wymaga nie-null `Component.price`, a repozytorium nie ma zatwierdzonej operacji zapisu katalogu. Skrypt nie wykonuje sieci, SQL ani mutacji Firebase. Aby obejrzeć snapshot lokalnie, ustaw `CATALOG_SOURCE=file` i `CATALOG_DATA_FILE` na jego ścieżkę; po zakończeniu lokalnego sprawdzenia przywróć `CATALOG_SOURCE=firebase`. Pliki `.local/`, wygenerowany snapshot oraz rozpoznawalne surowe CSV UserBenchmark i pliki service-account są ignorowane przez Git, ale katalog `data/` jako całość pozostaje śledzony.

Aby lokalny serwer używał snapshotu jako źródła katalogu, ustaw po stronie serwera `CATALOG_DATA_FILE` na ścieżkę tego pliku i uruchom ponownie aplikację. Gdy zmienna nie jest ustawiona, endpoint korzysta z `components.sample.json`. Gdy jest ustawiona, ale plik jest niedostępny lub nie przejdzie walidacji, endpoint zwraca `503 catalog_unavailable` i nie przełącza się po cichu na zbiór przykładowy. Ścieżka nie jest zwracana klientowi.

Snapshot nie modyfikuje bazy ani nie pobiera sieci podczas żądania. Dla aplikacji opisanej w README (Node 20+) importer/testy używają `node --experimental-strip-types`, dlatego wymagają Node 24+ albo wcześniejszego skompilowania pliku TypeScript.

### Firebase Data Connect (odczyt)

Po ustawieniu `CATALOG_SOURCE=firebase` katalog wykonuje serwerowy, wyłącznie read-only request `ListComponents` do Firebase Data Connect. Klucz `NEXT_PUBLIC_FIREBASE_API_KEY` jest używany tylko w nagłówku backendowego requestu i nie jest zwracany w odpowiedzi. Odczyt ma limit czasu około 8 sekund, limit rozmiaru odpowiedzi i pamięć podręczną procesu przez 60 sekund; błąd źródła zwraca `503 catalog_unavailable` bez fallbacku do próbki. Puste, poprawne `data.components` jest poprawnym wynikiem.

Mapowane są wyłącznie znane typy (`CPU`, `GPU`, `Motherboard`, `RAM`/`Memory`, `SSD`/`HDD`/`Storage`, `PSU`, `Case`, `Cooling`). Nieznany typ lub niepoprawny rekord powoduje `503`, zamiast cichego pominięcia. `specifications` pozostaje `{}`, a `price` i `performanceScore` są `null`, ponieważ kontrakt zapytania nie potwierdza waluty ani jednostek benchmarku. `source.kind` ma wartość `database`, a `source.provider` — `firebase-sql-connect`; `capturedAt` oznacza czas odczytu, nie czas aktualizacji rekordu w bazie.

Domyślne zapytanie pobiera najwyżej 100 rekordów. `meta.total` oznacza liczbę rekordów zwróconych przez to zapytanie po filtrach, a nie gwarantowaną liczbę wszystkich rekordów w bazie.

Weryfikacja 2026-11-11: rzeczywisty `ListComponents` i lokalny `GET /api/v1/components` zwróciły HTTP 200 oraz pustą listę z `source: "database"`. Sprawdzono również endpoint kategorii, stan konfiguracji bazy i odpowiedzi 400/404. Testy kontrolowanych odpowiedzi obejmują niepuste rekordy; nie potwierdzono jeszcze odczytu niepustego katalogu zdalnego. Przeszło 16 testów katalogu, sprawdzenie TypeScript i kompilacja produkcyjna. Nie wykonywano mutacji ani wdrożenia schematu.

## API

- `GET /api/v1/components` — listuje katalog; parametry `q`/`query`, `category`, `manufacturer`, `page` (1–1000) i `limit` (1–50).
- `GET /api/v1/components/:id` — zwraca szczegóły albo `404`.
- `GET /api/v1/components/categories` — zwraca kategorie i producentów obecnego źródła.

Lista jest deterministycznie sortowana po nazwie. Nieznana kategoria, zbyt długie wyszukiwanie i błędna paginacja zwracają `400`. Dane pozostają publiczne na potrzeby demonstracji; po podłączeniu bazy i autoryzacji zasady dostępu ustala właściciel tych modułów.

## Przejście do bazy i ofert

Istniejący Firebase Data Connect ma `components` i `component_specifications`, lecz jego `Component.price` jest wymagane, a obecny typ jest `Float`. Dla katalogu produkcyjnego cena powinna należeć do oferty, a nie do kanonicznego produktu. Proponowane tabele i ograniczenia są w [database/catalog-reference.sql](../database/catalog-reference.sql). Plik jest dokumentem referencyjnym, nie uruchomioną migracją.

Projekt obejmuje komponenty, specyfikacje, źródła, identyfikatory zewnętrzne, obserwacje benchmarków, oferty oraz historię cen. `components.public_id` przechowuje identyfikator używany przez REST/importer; wewnętrzny UUID bazy pozostaje osobnym kluczem. Metryki UserBenchmark zachowują własne źródło i czas importu. Oferta i historia mają kwoty w groszach, osobny koszt dostawy i walutę PLN. Nieznany koszt dostawy jest `NULL`, nie oznacza darmowej wysyłki.

## Sprawdzenie

Weryfikacja lokalnego katalogu 2026-11-11: pobrano CSV dla CPU, GPU, SSD, HDD i RAM. Z 5029 wierszy zaakceptowano 4578 komponentów: 1427 CPU, 1148 GPU, 1915 dysków i 88 pamięci RAM. Usunięto 5 identycznych powtórzeń; 446 wierszy przeniesiono do raportu kwarantanny, w tym 98 błędnie zapisanych. Dane i raporty są wyłącznie lokalne w ignorowanym `.local/catalog/`.

Lokalne `CATALOG_SOURCE=file` i `CATALOG_DATA_FILE=./.local/catalog/userbenchmark.components.json` uruchamiają ten katalog. Sprawdzono HTTP listy, kategorii, wyszukiwanie `7800X3D`, szczegóły i rozłączne strony wyników. Interfejs pokazał 4578 rekordów. Podgląd importu zawiera 4578 części i `readyToWrite: false`; nie wykonano zapisu do Firebase. Przeszły 24 testy oraz sprawdzenie TypeScript. Ten etap nie zmieniał kodu aplikacji Next.js i nie wymagał ponownej kompilacji produkcyjnej.

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
