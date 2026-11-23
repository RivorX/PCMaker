import type { IntegrationsResponse } from "@/types/api";

export function GET() {
  const offersConfigured = Boolean(process.env.SERPAPI_API_KEY?.trim());
  const firebaseCatalogSelected = process.env.CATALOG_SOURCE?.trim().toLocaleLowerCase("pl-PL") === "firebase";
  const databaseConfigured = firebaseCatalogSelected && Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  );
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
      {
        key: "database",
        label: "Baza danych",
        state: databaseConfigured ? "configured" : "not_configured",
        message: databaseConfigured
          ? "Konfiguracja Firebase Data Connect jest ustawiona; odczyt jest wykonywany przy żądaniu katalogu."
          : "Połączenie z bazą nie jest jeszcze skonfigurowane.",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
  return Response.json(body);
}
