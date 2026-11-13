# PCMaker

PCMaker łączy konfigurator komputerów z przygotowaniem zgłoszenia serwisowego. Pierwszy przyrost jest frontendowym szkieletem Next.js: można ręcznie opisać podzespoły, sprawdzić podstawowe zależności socket/DDR oraz zapisać wersję roboczą lokalnie w przeglądarce. Formularz serwisowy działa tak samo i nie udaje wysłanego zgłoszenia.

Źródła ofert sklepów, logowanie i baza danych nie są jeszcze podłączone. Aplikacja celowo nie pokazuje przykładowych cen ani fikcyjnych sklepów. Stan integracji jest dostępny pod `GET /api/v1/integrations`, a `GET /api/v1/offers` zwraca `503 source_not_configured` do czasu uzyskania prawdziwego dostępu do API. Kontrakty opisano w [docs/api-contract.md](docs/api-contract.md).

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
