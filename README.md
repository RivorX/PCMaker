# PCMaker

Szkielet aplikacji Next.js do zarządzania zgłoszeniami awarii i serwisem sprzętu.

```text
src/
  app/          # strona startowa, układ i style
  components/   # komponenty interfejsu
  lib/          # wspólne funkcje
  types/        # typy TypeScript
public/         # pliki statyczne
database/       # przyszłe pliki związane z bazą danych
```

## Uruchomienie

Wymagany Node.js 20.9 lub nowszy.

```bash
npm install
npm run dev
```

Otwórz <http://localhost:3000>. `npm run build` tworzy wersję produkcyjną, a `npm start` ją uruchamia.

PostgreSQL nie jest jeszcze podłączony. `.env.example` zawiera wyłącznie wzór serwerowej zmiennej `DATABASE_URL`.
