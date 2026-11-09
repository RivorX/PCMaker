import {
  CONFIGURATION_DRAFT_VERSION,
  CONFIGURATION_STORAGE_KEY,
  parseConfigurationDraft,
  type ConfigurationDraft,
  type ManualComponent,
} from "@/lib/drafts";

export const SAVED_CONFIGURATION_LIBRARY_VERSION = 1;
export const SAVED_CONFIGURATION_LIBRARY_KEY = "pcmaker:saved-configurations:v1";
export const WORKING_CONFIGURATION_KEY = "pcmaker:configuration-working:v1";
export const MAX_CONFIGURATION_NAME_LENGTH = 80;

export interface SavedConfiguration {
  id: string;
  version: typeof SAVED_CONFIGURATION_LIBRARY_VERSION;
  title: string;
  components: ManualComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedConfigurationLibrary {
  version: typeof SAVED_CONFIGURATION_LIBRARY_VERSION;
  configurations: SavedConfiguration[];
  updatedAt: string;
}

export interface ConfigurationSnapshot {
  title: string;
  components: ManualComponent[];
}

export interface WorkingConfigurationState {
  version: typeof SAVED_CONFIGURATION_LIBRARY_VERSION;
  draft: ConfigurationDraft;
  activeSavedId: string | null;
  baseline: ConfigurationSnapshot;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type LibraryIssue = "corrupt" | "unavailable";

export type LibraryLoadResult = {
  configurations: SavedConfiguration[];
  issue: LibraryIssue | null;
  warning: "legacy-corrupt" | null;
  legacyDraft: ConfigurationDraft | null;
  migratedLegacyId: string | null;
};

export type LibraryWriteResult =
  | { ok: true; configurations: SavedConfiguration[]; saved: SavedConfiguration }
  | { ok: false; issue: LibraryIssue | "missing" };

export type LibraryDeleteResult =
  | { ok: true; configurations: SavedConfiguration[] }
  | { ok: false; issue: "corrupt" | "unavailable" }
  | { ok: false; issue: "missing"; configurations: SavedConfiguration[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isValidDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(new Date(value).getTime());

const parseDraftPayload = (title: unknown, components: unknown, updatedAt: unknown): ConfigurationDraft | null => {
  if (!isString(title) || !Array.isArray(components)) return null;
  return parseConfigurationDraft(JSON.stringify({
    version: CONFIGURATION_DRAFT_VERSION,
    title,
    components,
    updatedAt: isValidDate(updatedAt) ? updatedAt : new Date().toISOString(),
  }));
};

export function normalizeConfigurationName(value: string): string {
  return value.trim().slice(0, MAX_CONFIGURATION_NAME_LENGTH) || "Mój zestaw";
}

export function parseSavedConfigurationLibrary(raw: string | null):
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "valid"; value: SavedConfigurationLibrary } {
  if (raw === null) return { status: "missing" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVED_CONFIGURATION_LIBRARY_VERSION || !Array.isArray(parsed.configurations)) {
      return { status: "corrupt" };
    }
    const ids = new Set<string>();
    const configurations: SavedConfiguration[] = [];
    for (const item of parsed.configurations) {
      if (!isRecord(item) || item.version !== SAVED_CONFIGURATION_LIBRARY_VERSION || !isString(item.id) || !item.id.trim()
        || !isValidDate(item.createdAt) || !isValidDate(item.updatedAt)) return { status: "corrupt" };
      const draft = parseDraftPayload(item.title, item.components, item.updatedAt);
      if (!draft || ids.has(item.id)) return { status: "corrupt" };
      ids.add(item.id);
      configurations.push({
        id: item.id,
        version: SAVED_CONFIGURATION_LIBRARY_VERSION,
        title: normalizeConfigurationName(draft.title),
        components: draft.components,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }
    return {
      status: "valid",
      value: {
        version: SAVED_CONFIGURATION_LIBRARY_VERSION,
        configurations,
        updatedAt: isValidDate(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
      },
    };
  } catch {
    return { status: "corrupt" };
  }
}

export function parseWorkingConfiguration(raw: string | null):
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "valid"; value: WorkingConfigurationState } {
  if (raw === null) return { status: "missing" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVED_CONFIGURATION_LIBRARY_VERSION) return { status: "corrupt" };
    const draft = isRecord(parsed.draft)
      ? parseDraftPayload(parsed.draft.title, parsed.draft.components, parsed.draft.updatedAt)
      : null;
    if (!draft || !(parsed.activeSavedId === null || isString(parsed.activeSavedId)) || !isRecord(parsed.baseline)) {
      return { status: "corrupt" };
    }
    const baselineDraft = parseDraftPayload(parsed.baseline.title, parsed.baseline.components, draft.updatedAt);
    if (!baselineDraft) return { status: "corrupt" };
    return {
      status: "valid",
      value: {
        version: SAVED_CONFIGURATION_LIBRARY_VERSION,
        draft,
        activeSavedId: parsed.activeSavedId,
        baseline: { title: baselineDraft.title, components: baselineDraft.components },
      },
    };
  } catch {
    return { status: "corrupt" };
  }
}

function legacyId(draft: ConfigurationDraft): string {
  const value = JSON.stringify({ title: draft.title, components: draft.components, updatedAt: draft.updatedAt });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function legacyRecord(draft: ConfigurationDraft): SavedConfiguration {
  const timestamp = isValidDate(draft.updatedAt) ? draft.updatedAt : new Date().toISOString();
  return {
    id: legacyId(draft),
    version: SAVED_CONFIGURATION_LIBRARY_VERSION,
    title: normalizeConfigurationName(draft.title),
    components: draft.components,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function loadSavedConfigurationLibrary(storage: StorageLike): LibraryLoadResult {
  try {
    const raw = storage.getItem(SAVED_CONFIGURATION_LIBRARY_KEY);
    if (raw !== null) {
      const parsed = parseSavedConfigurationLibrary(raw);
      if (parsed.status !== "valid") {
        return { configurations: [], issue: "corrupt", warning: null, legacyDraft: null, migratedLegacyId: null };
      }
      const legacyDraft = parseConfigurationDraft(storage.getItem(CONFIGURATION_STORAGE_KEY));
      const migratedLegacyId = legacyDraft ? legacyId(legacyDraft) : null;
      const migrated = migratedLegacyId && parsed.value.configurations.some((item) => item.id === migratedLegacyId);
      return {
        configurations: parsed.value.configurations,
        issue: null,
        warning: null,
        legacyDraft: migrated ? legacyDraft : null,
        migratedLegacyId: migrated ? migratedLegacyId : null,
      };
    }

    const legacyRaw = storage.getItem(CONFIGURATION_STORAGE_KEY);
    const legacyDraft = parseConfigurationDraft(legacyRaw);
    if (!legacyDraft) {
      return {
        configurations: [],
        issue: null,
        warning: legacyRaw ? "legacy-corrupt" : null,
        legacyDraft: null,
        migratedLegacyId: null,
      };
    }
    const record = legacyRecord(legacyDraft);
    const library: SavedConfigurationLibrary = {
      version: SAVED_CONFIGURATION_LIBRARY_VERSION,
      configurations: [record],
      updatedAt: record.updatedAt,
    };
    try {
      storage.setItem(SAVED_CONFIGURATION_LIBRARY_KEY, JSON.stringify(library));
      return { configurations: [record], issue: null, warning: null, legacyDraft, migratedLegacyId: record.id };
    } catch {
      // Keep the in-memory legacy configuration available; retry persistence on the next save.
      return { configurations: [record], issue: "unavailable", warning: null, legacyDraft, migratedLegacyId: record.id };
    }
  } catch {
    return { configurations: [], issue: "unavailable", warning: null, legacyDraft: null, migratedLegacyId: null };
  }
}

export function readWorkingConfiguration(storage: StorageLike):
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "unavailable" }
  | { status: "valid"; value: WorkingConfigurationState } {
  try {
    const result = parseWorkingConfiguration(storage.getItem(WORKING_CONFIGURATION_KEY));
    return result;
  } catch {
    return { status: "unavailable" };
  }
}

export function saveWorkingConfiguration(storage: StorageLike, value: WorkingConfigurationState):
  | { ok: true }
  | { ok: false; issue: "corrupt" | "unavailable" } {
  try {
    const current = parseWorkingConfiguration(storage.getItem(WORKING_CONFIGURATION_KEY));
    if (current.status === "corrupt") return { ok: false, issue: "corrupt" };
    storage.setItem(WORKING_CONFIGURATION_KEY, JSON.stringify(value));
    return { ok: true };
  } catch {
    return { ok: false, issue: "unavailable" };
  }
}

export function saveConfigurationToLibrary(
  storage: StorageLike,
  draft: ConfigurationDraft,
  mode: "update" | "copy",
  activeId: string | null,
): LibraryWriteResult {
  try {
    const raw = storage.getItem(SAVED_CONFIGURATION_LIBRARY_KEY);
    const current = parseSavedConfigurationLibrary(raw);
    if (current.status === "corrupt") return { ok: false, issue: "corrupt" };
    let configurations = current.status === "valid" ? current.value.configurations : [];
    if (current.status === "missing") {
      const legacy = parseConfigurationDraft(storage.getItem(CONFIGURATION_STORAGE_KEY));
      if (legacy) configurations = [legacyRecord(legacy)];
    }

    const now = new Date().toISOString();
    const title = normalizeConfigurationName(draft.title);
    let id = mode === "update" ? activeId : null;
    let previous: SavedConfiguration | undefined;
    if (id) {
      previous = configurations.find((item) => item.id === id);
      if (!previous) return { ok: false, issue: "missing" };
    } else {
      do {
        id = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `configuration-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      } while (configurations.some((item) => item.id === id));
    }
    const saved: SavedConfiguration = {
      id,
      version: SAVED_CONFIGURATION_LIBRARY_VERSION,
      title,
      components: draft.components,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    configurations = previous
      ? configurations.map((item) => item.id === id ? saved : item)
      : [...configurations, saved];
    const library: SavedConfigurationLibrary = {
      version: SAVED_CONFIGURATION_LIBRARY_VERSION,
      configurations,
      updatedAt: now,
    };
    storage.setItem(SAVED_CONFIGURATION_LIBRARY_KEY, JSON.stringify(library));
    return { ok: true, configurations, saved };
  } catch {
    return { ok: false, issue: "unavailable" };
  }
}

export function deleteConfigurationFromLibrary(storage: StorageLike, id: string): LibraryDeleteResult {
  try {
    const parsed = parseSavedConfigurationLibrary(storage.getItem(SAVED_CONFIGURATION_LIBRARY_KEY));
    if (parsed.status === "corrupt") return { ok: false, issue: "corrupt" };
    if (parsed.status === "missing") return { ok: false, issue: "missing", configurations: [] };
    const configurations = parsed.value.configurations.filter((item) => item.id !== id);
    if (configurations.length === parsed.value.configurations.length) {
      return { ok: false, issue: "missing", configurations: parsed.value.configurations };
    }
    const now = new Date().toISOString();
    const library: SavedConfigurationLibrary = {
      version: SAVED_CONFIGURATION_LIBRARY_VERSION,
      configurations,
      updatedAt: now,
    };
    storage.setItem(SAVED_CONFIGURATION_LIBRARY_KEY, JSON.stringify(library));
    return { ok: true, configurations };
  } catch {
    return { ok: false, issue: "unavailable" };
  }
}

export function configurationSnapshot(draft: ConfigurationDraft): ConfigurationSnapshot {
  return {
    title: normalizeConfigurationName(draft.title),
    components: [...draft.components]
      .map((part) => ({ ...part, source: part.source ?? "catalog" }))
      .sort((first, second) => first.category.localeCompare(second.category)),
  };
}

export function configurationContentKey(value: ConfigurationSnapshot): string {
  const components = value.components.map((part) => part.source === "own"
    ? { id: part.id, category: part.category, source: "own", name: part.name }
    : { id: part.id, category: part.category, source: "catalog" });
  return JSON.stringify({ title: normalizeConfigurationName(value.title), components });
}
