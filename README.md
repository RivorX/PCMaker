# PCMaker

PCMaker łączy konfigurator komputerów z przygotowaniem zgłoszenia serwisowego. Pierwszy przyrost jest frontendowym szkieletem Next.js: można ręcznie opisać podzespoły, sprawdzić podstawowe zależności socket/DDR oraz zapisać wersję roboczą lokalnie w przeglądarce. Formularz serwisowy działa tak samo i nie udaje wysłanego zgłoszenia.

Źródła ofert sklepów, logowanie i baza danych nie są jeszcze podłączone. Aplikacja celowo nie pokazuje przykładowych cen ani fikcyjnych sklepów. Stan integracji jest dostępny pod `GET /api/v1/integrations`, a `GET /api/v1/offers` zwraca `503 source_not_configured` do czasu uzyskania prawdziwego dostępu do API. Kontrakty opisano w [docs/api-contract.md](docs/api-contract.md).

## Uruchomienie

Wymagany jest Node.js 20.9 lub nowszy.

```bash
npm install
npm run dev
```

Otwórz <http://localhost:3000>. Kontrole jakości:

```bash
npm run typecheck
npm run build
```

## Docker

Zbuduj obraz z katalogu głównego projektu:

```bash
docker build -t pcmaker .
```

Utwórz i uruchom kontener z mapowaniem portu `3000`:

```bash
docker run -d --name pcmaker -p 3000:3000 pcmaker
```

Aplikacja będzie dostępna pod adresem <http://localhost:3000>. Logi sprawdzisz poleceniem `docker logs -f pcmaker`, a kontener zatrzymasz przez `docker stop pcmaker`. Aby go później usunąć, użyj `docker rm pcmaker`.

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
