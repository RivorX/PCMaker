# PCMaker

PCMaker łączy konfigurator komputerów z przygotowaniem zgłoszenia serwisowego. Pierwszy przyrost jest frontendowym szkieletem Next.js: można ręcznie opisać podzespoły, sprawdzić podstawowe zależności socket/DDR oraz zapisać wersję roboczą lokalnie w przeglądarce. Formularz serwisowy działa tak samo i nie udaje wysłanego zgłoszenia.

Katalog podzespołów korzysta domyślnie z małego, jawnie oznaczonego zbioru przykładowego. Rekordy opisują modele i specyfikacje, ale ceny pozostają `null`, dopóki nie uzyskamy legalnego źródła oferty. `GET /api/v1/components` udostępnia wyszukiwanie, filtrowanie i paginację, a importer UserBenchmark CSV działa offline według [docs/catalog.md](docs/catalog.md). Lokalny snapshot można włączyć przez serwerową zmienną `CATALOG_DATA_FILE`; niepoprawny wskazany plik daje `503 catalog_unavailable`, bez cichego fallbacku do próbek. Oferty Google Shopping są pobierane przez SerpAPI dopiero po jawnym wysłaniu formularza i wymagają serwerowego `SERPAPI_API_KEY`; bez klucza endpoint zwraca `503 source_not_configured`. Kwota PLN jest oznaczona jako orientacyjna; ceny EUR mogą korzystać ze stałej `EUR_PLN_RATE` (domyślnie 4.30), bez zewnętrznego API kursów, a USD pozostaje bez ceny. Logowanie i baza danych nie są jeszcze podłączone. Stan integracji jest dostępny pod `GET /api/v1/integrations`. Kontrakty opisano w [docs/api-contract.md](docs/api-contract.md).

## Uruchomienie

> **Wybierz tylko jedną opcję: Docker ALBO uruchomienie ręczne.**
> Wykonaj wyłącznie instrukcję z wybranej sekcji.

Komendy wykonaj w katalogu projektu. W obu wariantach aplikacja działa pod **<http://localhost:3000>**.

### 🐳 Opcja: Docker

Uruchom Docker Desktop i wykonaj:

```bash
docker compose up -d --build
```

Później: **Docker Desktop → Containers → pcmaker → ▶ Start / ■ Stop**. Po zmianach w kodzie powtórz komendę powyżej.

### Lokalne poświadczenia Firebase Admin SDK

Logowanie korzysta po stronie serwera z Firebase Admin SDK. Każdy członek
zespołu powinien pobrać własny klucz konta usługi Firebase i zapisać go lokalnie
jako `secrets/firebase-admin.json`. Katalog i pliki JSON w nim są ignorowane
przez Git oraz wykluczone z obrazu Dockera. Podczas uruchomienia Docker Compose
montuje plik wyłącznie jako sekret wewnątrz kontenera.

Do uruchomienia bez Dockera ustaw w `.env.local`:

```env
GOOGLE_APPLICATION_CREDENTIALS="./secrets/firebase-admin.json"
FIREBASE_PROJECT_ID="pcmaker-b0b0a"
```

---

**ALBO**

### 💻 Opcja: uruchomienie ręczne

Wymagany **Node.js 20.9+**.

```bash
npm install
npm run dev
```

## Wymagana aktualizacja bezpieczeństwa Next.js

Projekt korzysta z **Next.js 16.4.6**. Po pobraniu zmian z gałęzi wykonaj
`npm install`, aby lokalne zależności były zgodne z `package-lock.json`, a
następnie uruchom `npm run typecheck` i `npm run build`.

Nie cofaj wersji Next.js w `package.json` ani nie pomijaj aktualizacji
lockfile'a. Gdy Next.js wyświetli komunikat o aktualizacji bezpieczeństwa,
zaktualizuj projekt razem z lockfile'em i sprawdź build przed wysłaniem zmian.

```bash
npx next upgrade
npm install
npm run typecheck
npm run build
```

## Struktura pierwszego przyrostu

```text
src/app/                 routing, shell i endpointy API
src/components/          interfejs konfiguratora i serwisu
src/lib/drafts.ts        wersjonowane, walidowane drafty localStorage
src/lib/compatibility.ts czyste reguły socket i typu pamięci
src/types/api.ts         wspólne typy kontraktów HTTP
docs/api-contract.md     kontrakt dla przyszłego backendu ofert
docs/catalog.md          katalog, import CSV i granice źródeł danych
database/catalog-reference.sql  referencyjny projekt tabel katalogu i ofert
```

Draft ma wersję w kluczu `pcmaker:configuration-draft:v1` albo `pcmaker:service-draft:v1`. Odczyt odrzuca uszkodzony, niezgodny lub nadmiernie duży kształt danych, a zapis lokalny jest sygnalizowany użytkownikowi. Nie jest to jeszcze zapis serwerowy.

## Granice odpowiedzialności

Ten przyrost nie instaluje SDK Firebase, nie modyfikuje modelu bazy, nie dodaje logowania i nie tworzy endpointów mutujących. Te granice pozostają do uzgodnienia z osobami odpowiedzialnymi za bazę, uwierzytelnianie, testy i deployment.
