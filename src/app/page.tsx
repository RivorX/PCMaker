
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AuthMode = "login" | "register" | "forgot" | "reset" | "checking";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState("");

  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activation = params.get("activation");
    const token = params.get("resetToken");

    const activationMessages: Record<string, string> = {
      success: "Konto zostało aktywowane. Możesz się zalogować.",
      expired: "Link aktywacyjny wygasł. Poproś o nowy link.",
      used: "Ten link aktywacyjny został już wykorzystany.",
      invalid: "Link aktywacyjny jest nieprawidłowy.",
      error: "Nie udało się aktywować konta. Spróbuj ponownie później.",
    };

    if (activation && activationMessages[activation]) {
      setMessage(activationMessages[activation]);
    }

    if (!token) return;

    let cancelled = false;

    setMode("checking");
    setResetToken(token);
    setMessage("");

    async function validateToken() {
      try {
        const response = await fetch("/api/v1/auth/validate-reset-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (cancelled) return;

        if (!response.ok || !result.valid) {
          window.history.replaceState({}, "", "/");
          setResetToken("");
          setMode("login");
          setMessage(
            result.error ?? "Link resetowania hasła jest nieprawidłowy."
          );
          return;
        }

        setMode("reset");
      } catch {
        if (cancelled) return;

        window.history.replaceState({}, "", "/");
        setResetToken("");
        setMode("login");
        setMessage("Nie udało się zweryfikować linku. Spróbuj ponownie.");
      }
    }

    validateToken();

    return () => {
      cancelled = true;
    };
  }, []);

  function changeMode(newMode: "login" | "register") {
    setMode(newMode);
    setMessage("");
  }

  function openForgotMode() {
    setMode("forgot");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (isSubmitting || mode === "checking") return;

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

        setMessage(
          "Konto zostało utworzone. Sprawdź swoją skrzynkę e-mail i aktywuj konto, aby móc się zalogować."
        );
        return;
      }

      if (mode === "forgot") {
        const email = String(formData.get("email") ?? "").trim();

        const response = await fetch("/api/v1/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });

        const result = await response.json();

        if (!response.ok) {
          setMessage(result.error ?? "Nie udało się wysłać wiadomości.");
          return;
        }

        setMessage(
          result.message ??
            "Jeśli konto z podanym adresem istnieje, wysłaliśmy wiadomość z instrukcją resetowania hasła."
        );
        return;
      }

      if (mode === "reset") {
        const password = String(formData.get("password") ?? "");
        const confirmPassword = String(
          formData.get("confirm-password") ?? ""
        );

        if (password !== confirmPassword) {
          setMessage("Podane hasła nie są identyczne.");
          return;
        }

        if (!resetToken) {
          setMessage("Brak prawidłowego tokenu resetowania hasła.");
          return;
        }

        const response = await fetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: resetToken,
            password,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          setMessage(result.error ?? "Nie udało się zmienić hasła.");
          return;
        }

        window.history.replaceState({}, "", "/");
        setResetToken("");
        setMode("login");
        setMessage(
          result.message ?? "Hasło zostało zmienione. Możesz się zalogować."
        );

        event.currentTarget.reset();

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
        setMessage(result.error ?? "Nieprawidłowy e-mail lub hasło.");
        return;
      }

      router.replace(result.role === "ADMIN" ? "/admin" : "/home");
      router.refresh();
    } catch {
      setMessage("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isChecking = mode === "checking";

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
              {isLogin
                ? "WITAJ PONOWNIE"
                : isRegister
                  ? "DOŁĄCZ DO PCMAKER"
                  : isForgot
                    ? "ODZYSKIWANIE DOSTĘPU"
                    : isReset
                      ? "NOWE HASŁO"
                      : "WERYFIKACJA LINKU"}
            </p>

            <h2>
              {isLogin
                ? "Zaloguj się."
                : isRegister
                  ? "Utwórz konto."
                  : isForgot
                    ? "Resetuj hasło."
                    : isReset
                      ? "Ustaw nowe hasło."
                      : "Sprawdzanie linku."}
            </h2>

            <p>
              {isLogin
                ? "Zaloguj się, aby przejść do swojego workspace."
                : isRegister
                  ? "Utwórz konto, aby w przyszłości korzystać ze wszystkich funkcji PCMaker."
                  : isForgot
                    ? "Podaj adres e-mail przypisany do konta. Wyślemy na niego link do zmiany hasła."
                    : isReset
                      ? "Wprowadź nowe hasło do swojego konta."
                      : "Trwa sprawdzanie poprawności linku resetowania hasła."}
            </p>
          </div>

          {(isLogin || isRegister) && (
            <div className="auth-switch" aria-label="Wybierz formularz">
              <button
                type="button"
                className={isLogin ? "active" : ""}
                aria-pressed={isLogin}
                onClick={() => changeMode("login")}
              >
                Logowanie
              </button>

              <button
                type="button"
                className={isRegister ? "active" : ""}
                aria-pressed={isRegister}
                onClick={() => changeMode("register")}
              >
                Rejestracja
              </button>
            </div>
          )}

          {isChecking ? (
            <p className="auth-message" role="status">
              Weryfikowanie linku resetowania hasła...
            </p>
          ) : (
            <form
              key={mode}
              className="auth-form"
              onSubmit={handleSubmit}
            >
              {isLogin && (
                <div className="auth-field">
                  <label htmlFor="identifier">
                    Login lub adres e-mail
                  </label>

                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    inputMode="email"
                    placeholder="login lub e-mail"
                    autoComplete="email"
                    required
                  />
                </div>
              )}

              {isRegister && (
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

              {isForgot && (
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
              )}

              {(isLogin || isRegister || isReset) && (
                <div className="auth-field">
                  <label htmlFor="password">
                    {isReset ? "Nowe hasło" : "Hasło"}
                  </label>

                  <input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={
                      isReset ? "Wprowadź nowe hasło" : "Wprowadź hasło"
                    }
                    autoComplete={
                      isLogin ? "current-password" : "new-password"
                    }
                    minLength={isRegister || isReset ? 8 : undefined}
                    required
                  />
                </div>
              )}

              {(isRegister || isReset) && (
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

              {isLogin && (
                <div className="auth-form-options">
                  <label className="auth-checkbox">
                    <input type="checkbox" />
                    <span>Zapamiętaj mnie</span>
                  </label>

                  <button
                    type="button"
                    className="auth-muted"
                    onClick={openForgotMode}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    Nie pamiętasz hasła?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? isLogin
                    ? "Sprawdzanie..."
                    : isRegister
                      ? "Tworzenie konta..."
                      : isForgot
                        ? "Wysyłanie..."
                        : "Zmienianie hasła..."
                  : isLogin
                    ? "Zaloguj się"
                    : isRegister
                      ? "Utwórz konto"
                      : isForgot
                        ? "Wyślij link"
                        : "Zmień hasło"}

                <span>→</span>
              </button>

              {message && (
                <p className="auth-message" role="alert">
                  {message}
                </p>
              )}
            </form>
          )}

          {isLogin && (
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
            {isLogin ? (
              <>
                Nie masz jeszcze konta?{" "}
                <button
                  type="button"
                  onClick={() => changeMode("register")}
                >
                  Zarejestruj się
                </button>
              </>
            ) : isRegister ? (
              <>
                Masz już konto?{" "}
                <button
                  type="button"
                  onClick={() => changeMode("login")}
                >
                  Zaloguj się
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => changeMode("login")}
              >
                ← Wróć do logowania
              </button>
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
