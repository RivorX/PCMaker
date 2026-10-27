
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const navItems = [
  { href: "/home", label: "Przegląd", icon: "⌂" },
  { href: "/konfigurator", label: "Konfigurator", icon: "▦" },
  { href: "/serwis", label: "Serwis sprzętu", icon: "♧" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [isAdminSession, setIsAdminSession] = useState(
    () => pathname.startsWith("/admin")
  );

  useEffect(() => {
    if (pathname === "/") {
      setIsAdminSession(false);
      return;
    }

    const controller = new AbortController();

    fetch("/api/v1/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;

        setIsAdminSession(
          data?.authenticated === true &&
          data?.user?.role === "admin"
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsAdminSession(false);
        }
      });

    return () => controller.abort();
  }, [pathname]);

  const isAdminMode =
    pathname.startsWith("/admin") || isAdminSession;

  const currentNavItems = navItems.map((item) =>
    item.href === "/home" && isAdminMode
      ? {
          ...item,
          href: "/admin",
          label: "Panel administratora",
        }
      : item
  );

  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>
            <strong>PCMaker</strong>
            <small>centrum sprzętu</small>
          </span>
        </div>

        <div className="sidebar-label">Workspace</div>

        <nav className="main-nav" aria-label="Główna nawigacja">
          {currentNavItems.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={active ? "nav-link active" : "nav-link"}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {active && (
                  <span className="nav-dot" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className="status-dot" />
            <div>
              <strong>
                {isAdminMode ? "Sesja administratora" : "Tryb roboczy"}
              </strong>
              <small>
                {isAdminMode ? "Uwierzytelnianie JWT" : "Dane lokalne, bez konta"}
              </small>
            </div>
          </div>

          <div className="profile-chip">
            <span className="avatar">{isAdminMode ? "AD" : "TY"}</span>
            <span>
              <strong>
                {isAdminMode ? "Administrator" : "Twój workspace"}
              </strong>
              <small>
                {isAdminMode ? "PCMaker Admin" : "wersja demonstracyjna"}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            PCMaker <span>/</span>{" "}
            {pathname === "/admin"
              ? "Panel administratora"
              : pathname === "/home"
                ? "Przegląd"
                : pathname.startsWith("/serwis")
                  ? "Serwis sprzętu"
                  : "Konfigurator"}
          </div>

          <div className="topbar-actions">
            <span className="environment-pill">
              <span className="status-dot" /> szkic lokalny
            </span>

            <form
              className="shell-logout-form"
              action="/api/v1/auth/logout"
              method="post"
            >
              <button
                type="submit"
                className="shell-logout-button"
                title="Zakończ sesję i wróć do logowania"
              >
                <span aria-hidden="true">↪</span>
                Wyloguj się
              </button>
            </form>
          </div>
        </header>

        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
