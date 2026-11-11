# PCMaker

PCMaker łączy konfigurator komputerów z przygotowaniem zgłoszenia serwisowego. Pierwszy przyrost jest frontendowym szkieletem Next.js: można ręcznie opisać podzespoły, sprawdzić podstawowe zależności socket/DDR oraz zapisać wersję roboczą lokalnie w przeglądarce. Formularz serwisowy działa tak samo i nie udaje wysłanego zgłoszenia.

Katalog podzespołów korzysta domyślnie z małego, jawnie oznaczonego zbioru przykładowego. Rekordy opisują modele i specyfikacje, ale ceny pozostają `null`, dopóki nie uzyskamy legalnego źródła ofert. `GET /api/v1/components` udostępnia wyszukiwanie, filtrowanie i paginację, a importer UserBenchmark CSV działa offline według [docs/catalog.md](docs/catalog.md). Lokalny snapshot można włączyć przez serwerową zmienną `CATALOG_DATA_FILE`; niepoprawny wskazany plik daje `503 catalog_unavailable`, bez cichego fallbacku do próbek. Źródło ofert Alternate obsługuje jawne wyszukiwanie i lookup produktu, ale wymaga serwerowego `EVERYDATA_API_KEY`; bez klucza endpointy zwracają `503 source_not_configured`. Kwota PLN jest oznaczona jako orientacyjna i oparta na stałej `EUR_PLN_RATE` (domyślnie 4.30), bez zewnętrznego API kursów. Logowanie i baza danych nie są jeszcze podłączone. Stan integracji jest dostępny pod `GET /api/v1/integrations`. Kontrakty opisano w [docs/api-contract.md](docs/api-contract.md).

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

---

**ALBO**

### 💻 Opcja: uruchomienie ręczne

Wymagany **Node.js 20.9+**.

```bash
npm install
npm run dev
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
