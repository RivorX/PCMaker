"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Przegląd", icon: "⌂" },
  { href: "/konfigurator", label: "Konfigurator", icon: "▦" },
  { href: "/serwis", label: "Serwis sprzętu", icon: "♧" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={active ? "nav-link active" : "nav-link"} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {active && <span className="nav-dot" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className="status-dot" />
            <div>
              <strong>Tryb roboczy</strong>
              <small>Dane lokalne, bez konta</small>
            </div>
          </div>
          <div className="profile-chip">
            <span className="avatar">TY</span>
            <span><strong>Twój workspace</strong><small>wersja demonstracyjna</small></span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">PCMaker <span>/</span> {pathname === "/" ? "Przegląd" : pathname.includes("serwis") ? "Serwis sprzętu" : "Konfigurator"}</div>
          <div className="topbar-actions"><span className="environment-pill"><span className="status-dot" /> szkic lokalny</span></div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
