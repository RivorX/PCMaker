
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  function changeMode(newMode: "login" | "register") {
    setMode(newMode);
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);

    setIsSubmitting(true);

    try {
      if (mode === "register") {
        const firstName = String(formData.get("firstName") ?? "").trim();
        const lastName = String(formData.get("lastName") ?? "").trim();
        const email = String(formData.get("email") ?? "").trim();
        const password = String(formData.get("password") ?? "");
        const confirmPassword = String(
          formData.get("confirm-password") ?? ""
        );

        if (password !== confirmPassword) {
          setMessage("Podane hasła nie są identyczne.");
          return;
        }

        const response = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            password,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          setMessage(result.error ?? "Nie udało się utworzyć konta.");
          return;
        }

        setMessage("Konto zostało utworzone. Możesz teraz się zalogować.");
        return;
      }

      const identifier = String(formData.get("identifier") ?? "").trim();
      const password = String(formData.get("password") ?? "");

      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Nieprawidłowy login lub hasło.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link href="/" className="auth-brand">
          <span className="auth-brand-icon">PC</span>
          <span>
            PC<span className="auth-brand-accent">maker</span>
          </span>
        </Link>

        <div className="auth-visual-content">
          <p className="eyebrow">PCMAKER / WARSZTAT</p>

          <h1>
            Twój warsztat.
            <br />
            <em>Czeka.</em>
          </h1>

          <p>
            Konfiguracje, drafty i zgłoszenia serwisowe
            są zapisane — gotowe, gdy wrócisz.
          </p>

          <div className="auth-workspace-preview" aria-hidden="true">
            <div className="auth-workspace-head">
              <span className="auth-workspace-badge">TWÓJ WARSZTAT</span>
              <span className="auth-workspace-live">
                <span className="auth-workspace-live-dot" />
                online
              </span>
            </div>

            <ul className="auth-workspace-list">
              <li>
                <span className="auth-workspace-status status-teal" />
                <div className="auth-workspace-text">
                  <strong>Konfiguracja · Setup do gier</strong>
                  <small>3 podzespoły · gotowe</small>
                </div>
              </li>
              <li>
                <span className="auth-workspace-status status-amber" />
                <div className="auth-workspace-text">
                  <strong>Zgłoszenie serwis · Dysk SSD</strong>
                  <small>Draft · edytowany 2 dni temu</small>
                </div>
              </li>
              <li>
                <span className="auth-workspace-status status-muted" />
                <div className="auth-workspace-text">
                  <strong>Serwis</strong>
                  <small>Brak aktywnych zgłoszeń</small>
                </div>
              </li>
            </ul>

            <div className="auth-workspace-foot">
              Zapisane — czekają na Ciebie
              <span>→</span>
            </div>
          </div>
        </div>

        <p className="auth-footer-note">
          TWÓJ WARSZTAT · TWOJE PROJEKTY CZEKAJĄ
        </p>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-container">
          <div className="auth-mobile-brand">
            <span className="auth-brand-icon">PC</span>
            <span>
              PC<span className="auth-brand-accent">maker</span>
            </span>
          </div>

          <div className="auth-heading">
            <p className="eyebrow">
              {mode === "login"
                ? "WITAJ PONOWNIE"
                : "DOŁĄCZ DO PCMAKER"}
            </p>

            <h2>
              {mode === "login" ? "Zaloguj się." : "Utwórz konto."}
            </h2>

            <p>
              {mode === "login"
                ? "Zaloguj się, aby przejść do swojego workspace."
                : "Utwórz konto, aby w przyszłości korzystać ze wszystkich funkcji PCMaker."}
            </p>
          </div>

          <div className="auth-switch" aria-label="Wybierz formularz">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              aria-pressed={mode === "login"}
              onClick={() => changeMode("login")}
            >
              Logowanie
            </button>

            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              aria-pressed={mode === "register"}
              onClick={() => changeMode("register")}
            >
              Rejestracja
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "login" ? (
              <div className="auth-field">
                <label htmlFor="identifier">
                  Login lub adres e-mail
                </label>

                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  placeholder="Wprowadź login lub e-mail"
                  autoComplete="username"
                  required
                />
              </div>
            ) : (
              <>
                <div className="auth-field">
                  <label htmlFor="firstName">Imię</label>

                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="Jan"
                    autoComplete="given-name"
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="lastName">Nazwisko</label>

                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Kowalski"
                    autoComplete="family-name"
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="email">Adres e-mail</label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jan@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </>
            )}

            <div className="auth-field">
              <label htmlFor="password">Hasło</label>

              <input
                id="password"
                name="password"
                type="password"
                placeholder="Wprowadź hasło"
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={mode === "register" ? 8 : undefined}
                required
              />
            </div>

            {mode === "register" && (
              <div className="auth-field">
                <label htmlFor="confirm-password">
                  Powtórz hasło
                </label>

                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  placeholder="Wpisz hasło ponownie"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            )}

            {mode === "login" && (
              <div className="auth-form-options">
                <label className="auth-checkbox">
                  <input type="checkbox" />
                  <span>Zapamiętaj mnie</span>
                </label>

                <span className="auth-muted">
                  Odzyskiwanie hasła wkrótce
                </span>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === "login"
                  ? "Sprawdzanie..."
                  : "Tworzenie konta..."
                : mode === "login"
                  ? "Zaloguj się"
                  : "Utwórz konto"}

              <span>→</span>
            </button>

            {message && (
              <p className="auth-message" role="alert">
                {message}
              </p>
            )}
          </form>

          {mode === "login" && (
            <div className="auth-guest">
              <div className="auth-guest-divider">
                <span>lub</span>
              </div>

              <Link href="/home" className="auth-guest-button">
                Kontynuuj bez logowania <span>→</span>
              </Link>

              <p className="auth-guest-note">
                Tryb testowy — wejście bez uwierzytelniania.
              </p>
            </div>
          )}

          <div className="auth-bottom">
            {mode === "login" ? (
              <>
                Nie masz jeszcze konta?{" "}
                <button
                  type="button"
                  onClick={() => changeMode("register")}
                >
                  Zarejestruj się
                </button>
              </>
            ) : (
              <>
                Masz już konto?{" "}
                <button
                  type="button"
                  onClick={() => changeMode("login")}
                >
                  Zaloguj się
                </button>
              </>
            )}
          </div>

          <p className="auth-legal">
            PCMAKER <span>·</span> KONFIGURATOR I SERWIS SPRZĘTU
          </p>
        </div>
      </section>
    </main>
  );
}
