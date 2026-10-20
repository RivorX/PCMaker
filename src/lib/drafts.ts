export const CONFIGURATION_DRAFT_VERSION = 1;
export const SERVICE_DRAFT_VERSION = 1;
const CONFIGURATION_STORAGE_KEY = "pcmaker:configuration-draft:v1";
const SERVICE_STORAGE_KEY = "pcmaker:service-draft:v1";

export type ComponentCategory =
  | "cpu"
  | "motherboard"
  | "memory"
  | "gpu"
  | "storage"
  | "psu"
  | "case"
  | "cooling"
  | "other";

export const componentCategoryLabels: Record<ComponentCategory, string> = {
  cpu: "Procesor",
  motherboard: "Płyta główna",
  memory: "Pamięć RAM",
  gpu: "Karta graficzna",
  storage: "Dysk",
  psu: "Zasilacz",
  case: "Obudowa",
  cooling: "Chłodzenie",
  other: "Inny element",
};

export interface ManualComponent {
  id: string;
  category: ComponentCategory;
  name: string;
  socket: string;
  memoryType: string;
  note: string;
}

export interface ConfigurationDraft {
  version: typeof CONFIGURATION_DRAFT_VERSION;
  title: string;
  components: ManualComponent[];
  updatedAt: string;
}

export interface ServiceDraft {
  version: typeof SERVICE_DRAFT_VERSION;
  equipment: string;
  category: string;
  priority: "low" | "normal" | "high" | "critical";
  problem: string;
  updatedAt: string;
}

export const emptyConfigurationDraft = (): ConfigurationDraft => ({
  version: CONFIGURATION_DRAFT_VERSION,
  title: "Mój zestaw",
  components: [],
  updatedAt: new Date().toISOString(),
});

export const emptyServiceDraft = (): ServiceDraft => ({
  version: SERVICE_DRAFT_VERSION,
  equipment: "",
  category: "",
  priority: "normal",
  problem: "",
  updatedAt: new Date().toISOString(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isComponentCategory = (value: unknown): value is ComponentCategory =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(componentCategoryLabels, value);

const isString = (value: unknown): value is string => typeof value === "string";

const isManualComponent = (value: unknown): value is ManualComponent => {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isComponentCategory(value.category) &&
    isString(value.name) &&
    isString(value.socket) &&
    isString(value.memoryType) &&
    isString(value.note)
  );
};

export const parseConfigurationDraft = (raw: string | null): ConfigurationDraft | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== CONFIGURATION_DRAFT_VERSION) return null;
    if (!isString(parsed.title) || !Array.isArray(parsed.components)) return null;
    if (!parsed.components.every(isManualComponent)) return null;
    return {
      version: CONFIGURATION_DRAFT_VERSION,
      title: parsed.title.slice(0, 80),
      components: parsed.components.slice(0, 30),
      updatedAt: isString(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const isPriority = (value: unknown): value is ServiceDraft["priority"] =>
  value === "low" || value === "normal" || value === "high" || value === "critical";

export const parseServiceDraft = (raw: string | null): ServiceDraft | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SERVICE_DRAFT_VERSION) return null;
    if (
      !isString(parsed.equipment) ||
      !isString(parsed.category) ||
      !isString(parsed.problem) ||
      !isPriority(parsed.priority)
    ) {
      return null;
    }
    return {
      version: SERVICE_DRAFT_VERSION,
      equipment: parsed.equipment.slice(0, 120),
      category: parsed.category.slice(0, 80),
      priority: parsed.priority,
      problem: parsed.problem.slice(0, 2000),
      updatedAt: isString(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const readConfigurationDraft = (): ConfigurationDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    return parseConfigurationDraft(window.localStorage.getItem(CONFIGURATION_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const saveConfigurationDraft = (draft: ConfigurationDraft): boolean => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CONFIGURATION_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const readServiceDraft = (): ServiceDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    return parseServiceDraft(window.localStorage.getItem(SERVICE_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const saveServiceDraft = (draft: ServiceDraft): boolean => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const createComponentId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `component-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const displayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "przed chwilą";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date);
};
