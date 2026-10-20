import type { IntegrationsResponse } from "@/types/api";

export function GET() {
  const body: IntegrationsResponse = {
    data: [
      { key: "offers", label: "Oferty sklepów", state: "not_configured", message: "Brak przyznanego dostępu do źródła ofert." },
      { key: "auth", label: "Logowanie", state: "not_configured", message: "Moduł uwierzytelniania zostanie podłączony w kolejnym etapie." },
      { key: "database", label: "Baza danych", state: "not_configured", message: "Połączenie z bazą nie jest jeszcze aktywne." },
    ],
    generatedAt: new Date().toISOString(),
  };
  return Response.json(body);
}
