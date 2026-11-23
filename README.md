# PCMaker

PCMaker łączy konfigurator komputerów z katalogiem podzespołów i przygotowaniem zgłoszenia serwisowego. Konfigurator pozwala układać zestaw, sprawdza podstawową zgodność socketu i pamięci oraz zapisuje wersję roboczą lokalnie w przeglądarce. Formularz serwisowy także zapisuje draft i nie wysyła zgłoszenia na serwer.

## Uruchomienie lokalne

Wymagany jest Node.js 24 lub nowszy. Przy pierwszym uruchomieniu skopiuj `.env.example` do `.env.local`, uzupełnij potrzebne wartości i uruchom aplikację. Istniejący `.env.local` pozostaw bez zmian.

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Aplikacja działa pod <http://localhost:3000>.

## Docker

Uruchom Docker Desktop i wykonaj:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
docker compose up -d --build
```

Compose używa `.env.local` jako sekretu BuildKit przy budowaniu, a `./secrets/firebase-admin.json` montuje jako sekret runtime. Plik service account musi być przygotowany lokalnie do operacji administracyjnych i logowania. Nie dodawaj go do repozytorium.

## Konfiguracja katalogu

Katalog używa źródła `sample`, `file` albo `firebase`. Domyślnie aplikacja pokazuje niewielki zbiór przykładowy. Dla Firebase ustaw w `.env.local`:

```env
CATALOG_SOURCE="firebase"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="pcmaker-b0b0a"
NEXT_PUBLIC_FIREBASE_API_KEY="..."
FIREBASE_DATACONNECT_LOCATION="europe-central2"
FIREBASE_DATACONNECT_SERVICE="pcmaker-service"
FIREBASE_DATACONNECT_CONNECTOR="default"
```

Odczyt katalogu Data Connect jest tylko do odczytu. Szczegóły źródeł danych, importu i ofert znajdują się w [docs/catalog.md](docs/catalog.md), [docs/catalog-sources.md](docs/catalog-sources.md) oraz kontrakcie [docs/api-contract.md](docs/api-contract.md).

Operacje serwerowe wymagają dodatkowych ustawień, takich jak `SESSION_SECRET`, `FIREBASE_PROJECT_ID` i `GOOGLE_APPLICATION_CREDENTIALS`. Przykładowe wartości i pozostałe zmienne opisuje [.env.example](.env.example). `SERPAPI_API_KEY` jest opcjonalny. Bez niego wyszukiwanie ofert zwraca `503 source_not_configured`.

## API

- `GET /api/v1/components` wyszukuje części według frazy, kategorii i producenta z paginacją.
- `GET /api/v1/components/:id` zwraca szczegóły komponentu.
- `GET /api/v1/components/categories` zwraca dostępne kategorie i producentów.
- `GET /api/v1/components/:id/offers` dopasowuje oferty tylko dla obsługiwanych procesorów.
- `GET /api/v1/offers?action=search&keyword=...` wykonuje jawne wyszukiwanie ofert.
- `GET /api/v1/integrations` zwraca stan konfiguracji integracji.

Logowanie i rejestracja korzystają z Firebase Admin i sesyjnego cookie JWT. Panel administracyjny jest podstawowy i nie zawiera pełnego workflow CRUD.

## Import katalogu

Istniejący katalog Firebase nie wymaga lokalnego importu. Skrypty służą do przygotowania lub administracyjnego dodania danych. Pełny przepływ opisuje [docs/catalog.md](docs/catalog.md).

```powershell
npm run import:userbenchmark-batch
npm run prepare:firebase-catalog -- .\.local\catalog\userbenchmark.components.json
npm run import:firebase-admin -- --limit 1
```

## Sprawdzenia

```powershell
npm run test:catalog
npm run typecheck
```

Build produkcyjny można sprawdzić poleceniem `npm run build`. Build Docker wymaga Docker Desktop i lokalnego `.env.local`.
