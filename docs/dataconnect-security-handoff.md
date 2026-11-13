# Data Connect — stan zabezpieczeń i dalsza integracja

## Co zostało zmienione

- `ListComponents` ma prawidłową składnię: selekcja `components { ... }` jest
  domknięta i zwraca katalog w stabilnej kolejności alfabetycznej. Parametr
  `type` pozostał opcjonalny, więc dotychczasowy kontrakt SDK nie zmienia się.
- Publiczna rejestracja nie przyjmuje już `role`. Nowe konto zawsze otrzymuje
  `CLIENT`, zatem klient nie może utworzyć konta `ADMIN` przez bezpośrednie
  wywołanie Data Connect.
- Operacje ujawniające zgłoszenia, hash hasła albo pozwalające wskazać
  właściciela/autora przez UUID mają `@auth(level: NO_ACCESS)`. Nie są dostępne
  dla SDK klienta; mogą wykonywać je wyłącznie zaufane procesy serwerowe.
- Publiczne pozostały tylko dane, które aplikacja może bezpiecznie pokazać bez
  logowania: katalog komponentów, jego szczegóły, typy usług i konfiguracje
  oznaczone jako publiczne.

`NO_ACCESS` jest celowe, a nie jest błędem wdrożenia. Uniemożliwia wyciek i
nie daje pozornego bezpieczeństwa opartego wyłącznie na UUID przekazanym przez
przeglądarkę.

## Dlaczego nie zamieniono od razu `clientId` / `userId` na `auth.uid`

Aktualne `User.id` oraz wszystkie klucze obce do użytkownika mają typ `UUID`
(`dataconnect/schema/schema.gql`). Firebase Authentication przekazuje przez
`auth.uid` tekstowy identyfikator użytkownika. Bez migracji modelu takie
podstawienie jest niezgodne typowo, a nawet gdyby zostało obejściowo rzutowane,
nie wiązałoby istniejących kont z tożsamością Firebase.

## Miejsca, które trzeba zmienić przed włączeniem zapisu i odczytu użytkownika

1. `dataconnect/schema/schema.gql` — wybierz jeden model tożsamości:
   - rekomendowany: zmień `User.id` i relacje do użytkownika na tekstowy UID
     Firebase (oraz wykonaj migrację danych), albo
   - zachowaj UUID: dodaj tabelę mapującą `firebaseUid` (unikalny) na `User`
     i wykonuj kontrolę właściciela przez tę mapę.

2. `dataconnect/connector/mutations.gql` — po migracji usuń argumenty
   `clientId`, `authorId` i `userId` z operacji dostępnych użytkownikowi i
   wpisuj właściciela wyrażeniem `<pole>_expr: "auth.uid"`. Zmień wtedy
   `NO_ACCESS` na `@auth(level: USER)` oraz dodaj filtry/`@check` porównujące
   właściciela z `auth.uid`. `isInternal` musi ustawiać wyłącznie operacja
   technika/administratora.

3. `dataconnect/connector/queries.gql` — dla zgłoszeń użyj filtru właściciela
   (lub kontroli roli dla technika), nigdy `$id` albo `$userId` przekazanego z
   przeglądarki jako jedynej ochrony. Query użytkownika po e-mailu nie powinno
   zwracać pola `password`; bieżący endpoint logowania w ogóle go nie używa.

4. `src/app/api/v1/auth/register/route.ts` i `src/lib/firebase.ts` — obecna
   rejestracja woła publiczną operację przez webowy SDK Firebase. Przy modelu
   `auth.uid` należy najpierw utworzyć/użyć użytkownika Firebase Authentication
   i przesłać jego token albo przenieść uprzywilejowane wywołanie do Firebase
   Admin SDK uruchamianego wyłącznie na serwerze. Nadawanie ról administracyjnych
   powinno być osobną, serwerową ścieżką.

5. `src/components/Configurator.tsx`, `src/lib/drafts.ts` oraz
   `src/components/ServiceDesk.tsx` — to są jedyne aktualne miejsca zapisu
   konfiguracji i zgłoszenia; świadomie używają `localStorage`. Po ukończeniu
   punktów 1–4 podłącz tu chronione endpointy aplikacji, a lokalny draft zostaw
   jedynie jako wersję roboczą/offline cache.

6. `src/app/api/v1/integrations/route.ts` — obecny endpoint uczciwie sygnalizuje
   etap „nie skonfigurowano”, ale nie wykonuje testu połączenia. Gdy powstanie
   serwerowy klient Data Connect, wykonaj tam krótki, uwierzytelniony health
   check z timeoutem i zwracaj jego rzeczywisty wynik; nie używaj klientowego
   SDK ani danych uwierzytelniających w przeglądarce.

Po zmianie operacji uruchom ponownie generator SDK:

```powershell
firebase dataconnect:sdk:generate --service pcmaker-service --location europe-central2
```

Następnie sprawdź aplikację poleceniami `npm run typecheck` i `npm run build`.
