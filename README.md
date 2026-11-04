# PCMaker

PCMaker łączy konfigurator komputerów z przygotowaniem zgłoszenia serwisowego. Konfigurator pokazuje podzespoły z katalogu Data Connect, pozwala ułożyć lokalny zestaw i sprawdzić podstawowe zależności socket/DDR. Formularz serwisowy zapisuje wersję roboczą i nie udaje wysłanego zgłoszenia.

Konfigurator pobiera katalog komponentów z Firebase Data Connect przez publiczne zapytanie `ListComponents`. Wymaga to działającego projektu, tabeli `components` z danymi, klucza `NEXT_PUBLIC_FIREBASE_API_KEY` oraz wdrożonego konektora. Po zmianie `dataconnect/connector/queries.gql` wdroż konektor, aby serwer zwracał pełny katalog zamiast filtrować go po typie. Pola socketu i typu pamięci pozostają puste, dopóki zapytanie nie pobiera specyfikacji komponentów.

Źródła ofert sklepów nie są jeszcze podłączone. Aplikacja celowo nie pokazuje przykładowych produktów ani fikcyjnych ofert. Stan integracji jest dostępny pod `GET /api/v1/integrations`, a `GET /api/v1/offers` zwraca `503 source_not_configured` do czasu uzyskania prawdziwego dostępu do API sklepów. Kontrakty opisano w [docs/api-contract.md](docs/api-contract.md).

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

Docker buduje aplikację z wartościami `NEXT_PUBLIC_*` z lokalnego `.env.local`, korzystając z tymczasowego sekretu BuildKit. Plik pozostaje poza obrazem. Jeśli zmienisz publiczne ustawienia Firebase w `.env.local`, przebuduj bez cache:

```bash
docker compose build --no-cache
docker compose up -d
```

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
```

Draft ma wersję w kluczu `pcmaker:configuration-draft:v1` albo `pcmaker:service-draft:v1`. Odczyt odrzuca uszkodzony, niezgodny lub nadmiernie duży kształt danych, a zapis lokalny jest sygnalizowany użytkownikowi. Nie jest to jeszcze zapis serwerowy.

## Granice odpowiedzialności

Ten przyrost nie instaluje SDK Firebase, nie modyfikuje modelu bazy, nie dodaje logowania i nie tworzy endpointów mutujących. Te granice pozostają do uzgodnienia z osobami odpowiedzialnymi za bazę, uwierzytelnianie, testy i deployment.
