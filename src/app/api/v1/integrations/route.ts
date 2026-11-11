import type { IntegrationsResponse } from "@/types/api";

export function GET() {
  const offersConfigured = Boolean(process.env.EVERYDATA_API_KEY?.trim());
  const body: IntegrationsResponse = {
    data: [
      {
        key: "offers",
        label: "Oferty sklepów",
        state: offersConfigured ? "configured" : "not_configured",
        message: offersConfigured
          ? "Klucz API jest ustawiony; połączenie jest sprawdzane dopiero przy jawnym żądaniu oferty."
          : "Brak przyznanego dostępu do źródła ofert.",
      },
      { key: "auth", label: "Logowanie", state: "not_configured", message: "Moduł uwierzytelniania zostanie podłączony w kolejnym etapie." },
      { key: "database", label: "Baza danych", state: "not_configured", message: "Połączenie z bazą nie jest jeszcze aktywne." },
    ],
    generatedAt: new Date().toISOString(),
  };
  return Response.json(body);
}
