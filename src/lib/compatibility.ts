import type { ManualComponent } from "@/lib/drafts";

export type CompatibilityState = "compatible" | "warning" | "unknown";

export interface CompatibilityCheck {
  state: CompatibilityState;
  title: string;
  detail: string;
}

const category = (components: ManualComponent[], name: ManualComponent["category"]) =>
  components.find((component) => component.category === name);

export const getCompatibilityChecks = (components: ManualComponent[]): CompatibilityCheck[] => {
  const checks: CompatibilityCheck[] = [];
  for (const [name, label] of [["cpu", "Procesor"], ["motherboard", "Płyta główna"], ["memory", "Pamięć RAM"]] as const) {
    const count = components.filter((component) => component.category === name).length;
    if (count > 1) {
      checks.push({
        state: "warning",
        title: `Wiele elementów: ${label}`,
        detail: `Znaleziono ${count} wpisy. Wybierz jeden główny element, aby potwierdzić zgodność.`,
      });
    }
  }
  const processor = category(components, "cpu");
  const motherboard = category(components, "motherboard");
  const memory = category(components, "memory");

  if (!processor || !motherboard) {
    checks.push({
      state: "unknown",
      title: "Socket procesora",
      detail: "Dodaj procesor i płytę główną, aby porównać socket.",
    });
  } else if (!processor.socket.trim() || !motherboard.socket.trim()) {
    checks.push({
      state: "unknown",
      title: "Socket procesora",
      detail: "Wpisz socket w obu elementach. Brak danych nie jest błędem kompatybilności.",
    });
  } else if (processor.socket.trim().toLowerCase() === motherboard.socket.trim().toLowerCase()) {
    checks.push({
      state: "compatible",
      title: "Socket procesora",
      detail: `Socket ${processor.socket.trim()} jest zgodny w podanych danych.`,
    });
  } else {
    checks.push({
      state: "warning",
      title: "Socket procesora",
      detail: `Procesor ma ${processor.socket.trim()}, a płyta ${motherboard.socket.trim()}. Sprawdź wybór.`,
    });
  }

  if (!motherboard || !memory) {
    checks.push({
      state: "unknown",
      title: "Typ pamięci RAM",
      detail: "Dodaj płytę główną i pamięć RAM, aby porównać typ pamięci.",
    });
  } else if (!motherboard.memoryType.trim() || !memory.memoryType.trim()) {
    checks.push({
      state: "unknown",
      title: "Typ pamięci RAM",
      detail: "Wpisz typ pamięci, np. DDR4 lub DDR5, w obu elementach.",
    });
  } else if (motherboard.memoryType.trim().toLowerCase() === memory.memoryType.trim().toLowerCase()) {
    checks.push({
      state: "compatible",
      title: "Typ pamięci RAM",
      detail: `Typ ${memory.memoryType.trim()} jest zgodny w podanych danych.`,
    });
  } else {
    checks.push({
      state: "warning",
      title: "Typ pamięci RAM",
      detail: `Płyta ma ${motherboard.memoryType.trim()}, a pamięć ${memory.memoryType.trim()}. Sprawdź wybór.`,
    });
  }

  return checks;
};
