
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    redirect("/");
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="eyebrow">PCMAKER / ADMINISTRATION</p>
        <h1>Panel administratora</h1>
        <p className="lede">
          Zarządzaj aplikacją i przechodź do jej poszczególnych
          modułów. To początkowa wersja panelu administracyjnego.
        </p>
      </section>

      <section className="admin-welcome card">
        <div className="admin-avatar">AD</div>
        <div className="admin-welcome-content">
          <span className="section-kicker">ZALOGOWANY UŻYTKOWNIK</span>
          <h2>{session.username}</h2>
          <p>
            Rola: administrator. Sesja została poprawnie
            zweryfikowana przez serwer.
          </p>
        </div>
        <span className="admin-session-badge">
          <span className="status-dot" />
          Sesja aktywna
        </span>
      </section>

      <section className="page-heading admin-section-heading">
        <span className="section-kicker">OBSZARY APLIKACJI</span>
        <h2>Dostępne moduły</h2>
      </section>

      <section className="overview-grid">
        <article className="overview-card accent-card">
          <div className="overview-icon">⌂</div>
          <div>
            <span className="section-kicker">WORKSPACE</span>
            <h2>Strona główna</h2>
            <p>
              Przejdź do głównego widoku PCMaker i sprawdź
              aktualnie dostępne funkcje.
            </p>
            <Link href="/home">
              Otwórz workspace <span>→</span>
            </Link>
          </div>
        </article>

        <article className="overview-card">
          <div className="overview-icon">▦</div>
          <div>
            <span className="section-kicker">KONFIGURATOR</span>
            <h2>Konfigurator PC</h2>
            <p>
              Testuj dodawanie podzespołów i sprawdzanie
              podstawowej kompatybilności.
            </p>
            <Link href="/konfigurator">
              Otwórz konfigurator <span>→</span>
            </Link>
          </div>
        </article>

        <article className="overview-card">
          <div className="overview-icon teal">♧</div>
          <div>
            <span className="section-kicker">SERWIS</span>
            <h2>Zgłoszenia serwisowe</h2>
            <p>
              Przejdź do formularza przygotowania zgłoszenia
              dotyczącego usterki sprzętu.
            </p>
            <Link href="/serwis">
              Otwórz serwis <span>→</span>
            </Link>
          </div>
        </article>

        <article className="overview-card">
          <div className="overview-icon">⚙</div>
          <div>
            <span className="section-kicker">KONFIGURACJA</span>
            <h2>Ustawienia systemu</h2>
            <p>
              Miejsce na przyszłe ustawienia aplikacji,
              użytkowników i uprawnień.
            </p>
            <span className="admin-coming-soon">
              Dostępne w kolejnych etapach
            </span>
          </div>
        </article>
      </section>

      <section className="status-strip">
        <div>
          <span className="status-dot" />
          <strong>Środowisko testowe</strong>
          <span>bez bazy danych</span>
        </div>
        <span className="status-strip-note">
          Uwierzytelnianie: <strong>JWT</strong>
        </span>
      </section>

      <section className="admin-logout-section">
        <div>
          <strong>Zakończ sesję administratora</strong>
          <p>
            Wylogowanie usunie ciasteczko sesji i przeniesie
            Cię do ekranu logowania.
          </p>
        </div>

        <form action="/api/v1/auth/logout" method="post">
          <button type="submit" className="button secondary">
            Wyloguj się
          </button>
        </form>
      </section>
    </div>
  );
}
