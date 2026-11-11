import type { IntegrationsResponse } from "@/types/api";

export function GET() {
  const offersConfigured = Boolean(process.env.SERPAPI_API_KEY?.trim());
  const body: IntegrationsResponse = {
    data: [
      {
        key: "offers",
        label: "Google Shopping (SerpAPI)",
        state: offersConfigured ? "configured" : "not_configured",
        message: offersConfigured
          ? "Klucz API jest ustawiony; wyszukiwanie jest wykonywane dopiero po jawnym zatwierdzeniu."
          : "Brak przyznanego dostępu do źródła ofert.",
      },
      { key: "auth", label: "Logowanie", state: "not_configured", message: "Moduł uwierzytelniania zostanie podłączony w kolejnym etapie." },
      { key: "database", label: "Baza danych", state: "not_configured", message: "Połączenie z bazą nie jest jeszcze aktywne." },
    ],
    generatedAt: new Date().toISOString(),
  };
  return Response.json(body);
}
