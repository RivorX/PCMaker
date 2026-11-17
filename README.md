# PCMaker

PCMaker łączy konfigurator komputera z katalogiem podzespołów i przygotowaniem zgłoszenia serwisowego. Konfigurator oraz formularz serwisowy są obecnie interfejsami z lokalnym draftem w `localStorage`: draft jest walidowany, ale zgłoszenie nie jest wysyłane do serwera i nie ma jeszcze historii, komentarzy, plików, SLA ani raportów.

## Aktualny stan

- Aplikacja używa Next.js `16.4.6`, React `19.3.1`, TypeScript `5.9.3`, Firebase `13.1.0`, Firebase Admin `14.5.1` i obrazu Node 24.
- Katalog może korzystać ze źródła `sample`, `file` albo `firebase`. Przy braku konfiguracji domyślnie używa małego zbioru przykładowego; ustawienie `CATALOG_DATA_FILE` bez `CATALOG_SOURCE` zachowuje tryb plikowy.
- Katalog Firebase zawiera 1030 części z importu UserBenchmark, uzupełnionych o specyfikacje z BuildCores OpenDB. Szczegóły części pokazują źródło i licencję danych. Pierwotny import obejmował 4578 rekordów.
- Odczyt Firebase Data Connect jest read-only. `ListCatalogPage` pobiera strony po 500 rekordów, a adapter buduje kompletny snapshot, cache’owany w procesie przez 60 sekund (maksymalnie 100 000 rekordów). Błąd strony zwraca `503`, bez fallbacku do próbek i bez cache częściowego.
- Ceny katalogowe pozostają `null`. Oferty SerpAPI są kandydatami i nie są zapisywane do rekordu komponentu.

Szczegółowe granice źródeł i importu opisuje [docs/catalog.md](docs/catalog.md), a kontrakty REST — [docs/api-contract.md](docs/api-contract.md).

## Uruchomienie lokalne

Zalecany jest Node.js 24+, ponieważ skrypty importu używają `--experimental-strip-types`. Przy pierwszym uruchomieniu skopiuj `.env.example` do `.env.local`, uzupełnij potrzebne wartości z opisu poniżej, a następnie zainstaluj zależności i uruchom aplikację. Poniższa komenda kopiowania zachowuje istniejący plik konfiguracji.

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Aplikacja działa pod <http://localhost:3000>. Nie nadpisuj istniejącego `.env.local`; wpisz sekrety ręcznie i nie umieszczaj ich w repozytorium.

Minimalne zmienne do katalogu Firebase:

```env
CATALOG_SOURCE="firebase"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="pcmaker-b0b0a"
NEXT_PUBLIC_FIREBASE_API_KEY="..."
FIREBASE_DATACONNECT_LOCATION="europe-central2"
FIREBASE_DATACONNECT_SERVICE="pcmaker-service"
FIREBASE_DATACONNECT_CONNECTOR="default"
```

Bez `CATALOG_SOURCE="firebase"` świeży checkout nie przełącza się sam na bazę. Do lokalnego podglądu snapshotu można użyć `CATALOG_SOURCE="file"` i `CATALOG_DATA_FILE`. Brak pliku albo błędny snapshot nie powoduje cichego powrotu do próbek.

Poświadczenia serwerowe są potrzebne do operacji administracyjnych i logowania, nie do publicznego read-only katalogu:

```env
SESSION_SECRET="losowy-sekret-majacy-co-najmniej-32-znaki"
GOOGLE_APPLICATION_CREDENTIALS="./secrets/firebase-admin.json"
FIREBASE_PROJECT_ID="pcmaker-b0b0a"
```

`ADMIN_USERNAME`, `ADMIN_PASSWORD` i `ADMIN_EMAIL` są opcjonalnym lokalnym loginem administracyjnym. `SERPAPI_API_KEY` jest opcjonalny; bez niego ręczne wyszukiwanie ofert zwraca `503`. `EUR_PLN_RATE="4.30"` jest techniczną stałą dla orientacyjnego przeliczenia EUR, a nie kursem live. USD i nieznane waluty pozostają bez ceny.

## Docker

Zamierzony sposób uruchomienia po przygotowaniu obrazu:

```powershell
docker compose -f compose.yaml up -d --build
```

Compose ładuje `.env.local` i montuje `./secrets/firebase-admin.json` jako sekret kontenera. Nie wykonywano aktualnie weryfikacji buildu Docker. Obecny etap zależności obrazu kopiuje `package.json` i lockfile przed `npm ci`, ale pakiet lokalny `@pcmaker/dataconnect` znajduje się w `src/lib/dataconnect-generated`; Dockerfile wymaga najpierw uwzględnienia tego katalogu w etapie zależności. Do czasu tej poprawki używaj uruchomienia ręcznego. Nie wkładaj klucza service account do obrazu ani do repozytorium.

## Katalog i API

Podstawowe endpointy:

- `GET /api/v1/components` — wyszukiwanie (`q`/`query`), kategoria, producent i paginacja;
- `GET /api/v1/components/:id` — szczegóły komponentu;
- `GET /api/v1/components/categories` — kategorie i producenci;
- `GET /api/v1/components/:id/offers` — automatyczne dopasowanie ofert tylko dla wybranego, obsługiwanego CPU;
- `GET /api/v1/offers?action=search&keyword=...` — jawne, ręczne wyszukiwanie Google Shopping dla wszystkich kategorii;
- `GET /api/v1/integrations` — stan konfiguracji wybranych połączeń.

Automatyczne wyszukiwanie uruchamia się po wybraniu CPU w katalogu, z opóźnieniem i ochroną przed wyścigiem żądań. Obsługiwane są rozpoznane rodziny AMD Ryzen, Intel Core i Intel Core Ultra. Dopasowanie po tytule sprawdza pełny model i przyrostek (`7800X` nie pasuje do `7800X3D`, `14600K` nie pasuje do `14600KF`), odrzuca zestawy, akcesoria, multipaki, kompletne komputery i tytuły z wieloma kodami CPU. Starsze lub niejednoznaczne modele pozostają dostępne dla ręcznego wyszukiwania. Heurystyka tytułu nie potwierdza MPN/EAN i nie zapisuje ceny.

Ręczne oferty korzystają z serwerowego klucza SerpAPI, cache procesu z TTL jednej godziny i jawnego działania użytkownika. Cena PLN jest oznaczona jako orientacyjna. Brak klucza daje `503 source_not_configured`, limit dostawcy `429`, timeout `504`, a niepoprawna odpowiedź `502`; surowe odpowiedzi i sekrety nie są zwracane klientowi.

## Uwierzytelnianie

Kod zawiera endpointy rejestracji, logowania, sesji i wylogowania:

- rejestracja zapisuje skrót hasła bcrypt z kosztem 12;
- logowanie odczytuje użytkownika przez serwerowy Firebase Admin/Data Connect, porównuje hash i ustawia httpOnly cookie JWT;
- sesja trwa 8 godzin i niesie role `CLIENT`, `TECHNICIAN` albo `ADMIN`;
- opcjonalny lokalny login administratora korzysta z `ADMIN_USERNAME`/`ADMIN_EMAIL` i `ADMIN_PASSWORD`;
- middleware chroni ścieżkę `/admin` rolą `ADMIN`.

To nie jest OAuth ani Firebase Auth. Panel administracyjny ma obecnie podstawowe przejścia, a nie pełny workflow CRUD. Endpoint integracji może nadal pokazywać `auth: not_configured` jako status konfiguracji modułu; nie należy traktować tego pojedynczego pola jako pełnego opisu zaimplementowanych tras auth.

## Import i skrypty

Import nie jest wymagany do korzystania z istniejącego katalogu Firebase. Poniższy przepływ jest przeznaczony do przygotowania i dodawania danych; wymaga wcześniej pobranych plików CSV w `.local/catalog/raw/`, a odczyt administracyjny także lokalnych poświadczeń serwerowych.

```powershell
npm run import:userbenchmark-batch
npm run prepare:firebase-catalog -- .\.local\catalog\userbenchmark.components.json
npm run import:firebase-admin -- --limit 1
```

`import:userbenchmark-batch` czyta lokalne pliki CSV i zapisuje osobny raport błędnych lub sprzecznych wierszy. `prepare:firebase-catalog` tworzy podgląd danych bez wysyłania ich do bazy. `import:firebase-admin` jest narzędziem administracyjnym: domyślnie wykonuje tylko plan odczytowy; `--apply` dodaje rzeczywiste rekordy do Firebase i nie jest częścią zwykłego uruchomienia aplikacji. Pełny przepływ i ograniczenia opisuje [docs/catalog.md](docs/catalog.md).

## Struktura

```text
src/app/                    strony, layout i endpointy API
src/components/             konfigurator, katalog i serwis
src/lib/catalog.ts          wybór źródła i walidacja snapshotu katalogu
src/lib/firebase-catalog.ts read-only adapter Firebase Data Connect
src/lib/serpapi.ts          normalizacja i cache ofert Google Shopping
src/lib/compatibility.ts    lokalne reguły socket/DDR
scripts/                    import CSV, preview i jawny import administracyjny
dataconnect/                schemat bazy oraz zapytania i mutacje Data Connect
docs/                       kontrakty, katalog i granice źródeł
database/                   projekty SQL i kopia schematu; catalog-reference.sql jest referencyjny
```

Draft konfiguratora i serwisu jest wersjonowany, walidowany i przechowywany lokalnie w przeglądarce. Sprawdzanie kompatybilności jest pomocnicze: nie zastępuje pełnego doboru sprzętu.

## Sprawdzenia

```powershell
npm run test:catalog
npm run typecheck
npm run build
```

Ostatni przebieg dla zmian katalogu obejmował 40 testów i kontrolę TypeScript. Po uporządkowaniu bazy odczyt Firebase potwierdził 1030 części, 4894 wartości specyfikacji i 1030 linków do źródła. Automatyczne oferty CPU i build produkcyjny sprawdzono wcześniej. Nie przeprowadzano pełnego testu logowania i rejestracji ani buildu Docker.

Zmiany zależności wprowadzamy razem z `package-lock.json` i sprawdzamy powyższymi komendami przed scaleniem do wspólnej gałęzi.
