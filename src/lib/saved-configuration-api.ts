import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { adminDataConnect } from "@/lib/firebase-admin";
import { normalizeUserId, SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  CONFIGURATION_DRAFT_VERSION,
  MAX_CONFIGURATION_DESCRIPTION_LENGTH,
  parseConfigurationDraft,
  type ManualComponent,
} from "@/lib/drafts";
import {
  MAX_CONFIGURATION_NAME_LENGTH,
  normalizeConfigurationName,
  SAVED_CONFIGURATION_LIBRARY_VERSION,
  type SavedConfiguration,
} from "@/lib/saved-configurations";

const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_SAVED_TOTAL_PRICE = 9_999_999_999.99;

type ConfigurationSnapshot = {
  version: typeof SAVED_CONFIGURATION_LIBRARY_VERSION;
  components: ManualComponent[];
};

type SavedConfigurationRow = {
  id: string;
  name: string;
  description?: string | null;
  totalPrice: number | string;
  savedSnapshot: unknown;
  createdAt: string;
  updatedAt?: string | null;
};

type SavedConfigurationQueryData = { pcConfigurations: SavedConfigurationRow[] };
type SavedConfigurationQueryVariables = { userId: string; offset: number };
type SavedConfigurationByIdQueryData = { pcConfigurations: SavedConfigurationRow[] };
type SavedConfigurationByIdQueryVariables = { id: string; userId: string };
type SavedConfigurationMutationData = {
  pcConfiguration_insert?: { id: string };
  pcConfiguration_updateMany?: number;
  pcConfiguration_deleteMany?: number;
};
type SavedConfigurationMutationVariables = {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  totalPrice: number;
  savedSnapshot: ConfigurationSnapshot;
};

type SavedConfigurationInput = {
  id?: string;
  name: string;
  description?: string | null;
  totalPrice: number;
  savedSnapshot: ConfigurationSnapshot;
  configuration: Omit<SavedConfiguration, "id" | "createdAt" | "updatedAt">;
};

export class SavedConfigurationRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SavedConfigurationRequestError";
  }
}

export async function getSavedConfigurationUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: "Zaloguj się, aby zapisywać zestawy." }, { status: 401, headers: privateHeaders }),
    };
  }

  if (!session.userId) {
    const isEnvironmentAdmin = session.role === "ADMIN";
    return {
      ok: false,
      response: Response.json(
        {
          error: isEnvironmentAdmin
            ? "To konto administratora nie jest powiązane z użytkownikiem Firebase i nie może zapisywać zestawów. Zaloguj się na konto użytkownika."
            : "Twoja sesja nie jest już powiązana z kontem. Zaloguj się ponownie, aby zapisać zestaw.",
        },
        { status: isEnvironmentAdmin ? 403 : 401, headers: privateHeaders },
      ),
    };
  }

  const userId = normalizeUserId(session.userId);
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Nie można ustalić konta użytkownika. Zaloguj się ponownie." }, { status: 401, headers: privateHeaders }),
    };
  }

  return { ok: true, userId };
}

export async function readSavedConfigurationInput(request: Request): Promise<SavedConfigurationInput> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
    throw new SavedConfigurationRequestError("Zestaw zawiera zbyt dużo danych.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new SavedConfigurationRequestError("Nie udało się odczytać danych zestawu.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new SavedConfigurationRequestError("Zestaw zawiera zbyt dużo danych.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SavedConfigurationRequestError("Nieprawidłowe dane zestawu.");
  }
  if (!isRecord(value) || typeof value.title !== "string" || !Array.isArray(value.components) || value.components.length > 30) {
    throw new SavedConfigurationRequestError("Nieprawidłowa nazwa lub lista części.");
  }
  if (value.title.length > MAX_CONFIGURATION_NAME_LENGTH) {
    throw new SavedConfigurationRequestError("Nazwa zestawu może mieć maksymalnie 80 znaków.");
  }
  if (value.description !== undefined && value.description !== null
    && typeof value.description !== "string") {
    throw new SavedConfigurationRequestError("Opis zestawu musi być tekstem.");
  }
  if (typeof value.description === "string" && value.description.length > MAX_CONFIGURATION_DESCRIPTION_LENGTH) {
    throw new SavedConfigurationRequestError(`Opis zestawu może mieć maksymalnie ${MAX_CONFIGURATION_DESCRIPTION_LENGTH} znaków.`);
  }
  if (value.requestId !== undefined && (typeof value.requestId !== "string" || !normalizeUserId(value.requestId))) {
    throw new SavedConfigurationRequestError("Nieprawidłowy identyfikator ponowienia zapisu.");
  }

  const draft = parseConfigurationDraft(JSON.stringify({
    version: CONFIGURATION_DRAFT_VERSION,
    title: value.title,
    components: value.components,
    updatedAt: new Date().toISOString(),
  }));
  if (!draft) {
    throw new SavedConfigurationRequestError("Zestaw zawiera nieprawidłowe dane części.");
  }

  const title = normalizeConfigurationName(draft.title);
  const description = typeof value.description === "string"
    ? value.description.trim() || null
    : value.description;
  const components = draft.components.map(cleanComponent);
  const totalPrice = Math.round(components.reduce((sum, component) => sum + (component.price ?? 0), 0) * 100) / 100;
  if (!Number.isFinite(totalPrice) || totalPrice > MAX_SAVED_TOTAL_PRICE) {
    throw new SavedConfigurationRequestError("Łączna cena zestawu jest nieprawidłowa.");
  }

  return {
    id: typeof value.requestId === "string" ? normalizeUserId(value.requestId) ?? undefined : undefined,
    name: title,
    description,
    totalPrice,
    savedSnapshot: { version: SAVED_CONFIGURATION_LIBRARY_VERSION, components },
    configuration: {
      version: SAVED_CONFIGURATION_LIBRARY_VERSION,
      title,
      ...(description ? { description } : {}),
      components,
    },
  };
}

export async function listSavedConfigurations(userId: string): Promise<SavedConfiguration[]> {
  const configurations: SavedConfiguration[] = [];
  const seenIds = new Set<string>();

  for (let offset = 0; ; offset += 100) {
    const { data } = await adminDataConnect.executeQuery<
      SavedConfigurationQueryData,
      SavedConfigurationQueryVariables
    >("ListUserSavedPcConfigurations", { userId, offset });
    const page = data.pcConfigurations ?? [];
    let addedCount = 0;

    for (const row of page) {
      if (row.savedSnapshot === null || row.savedSnapshot === undefined) continue;
      const configuration = toSavedConfiguration(row);
      if (seenIds.has(configuration.id)) continue;
      seenIds.add(configuration.id);
      configurations.push(configuration);
      addedCount += 1;
    }

    if (page.length < 100) return configurations;
    if (addedCount === 0) throw new Error("Firebase pagination did not advance.");
  }
}

export async function getSavedConfiguration(userId: string, id: string): Promise<SavedConfiguration | null> {
  const { data } = await adminDataConnect.executeQuery<
    SavedConfigurationByIdQueryData,
    SavedConfigurationByIdQueryVariables
  >("GetSavedPcConfiguration", { id, userId });
  const row = data.pcConfigurations?.[0];
  return row?.savedSnapshot === null || row?.savedSnapshot === undefined ? null : toSavedConfiguration(row);
}

export async function createSavedConfiguration(userId: string, input: SavedConfigurationInput): Promise<SavedConfiguration> {
  const id = input.id ?? randomUUID();
  let mutationSucceeded = false;
  try {
    await adminDataConnect.executeMutation<
      SavedConfigurationMutationData,
      SavedConfigurationMutationVariables
    >("CreateSavedPcConfiguration", {
      id,
      userId,
      name: input.name,
      description: input.description,
      totalPrice: input.totalPrice,
      savedSnapshot: input.savedSnapshot,
    });
    mutationSucceeded = true;
  } catch {
    // A request can reach Firebase while its response is lost. Read by the
    // same id and owner so a retry returns the row already created.
  }

  const existing = await getSavedConfiguration(userId, id);
  if (existing) {
    if (sameSnapshot(existing, input.configuration)) return existing;
    throw new SavedConfigurationRequestError("Ten identyfikator zapisu jest już używany przez inny zestaw.", 409);
  }

  if (mutationSucceeded) throw new Error("Nie udało się potwierdzić zapisu zestawu w Firebase.");
  throw new Error("Nie udało się zapisać zestawu w Firebase.");
}

export async function updateSavedConfiguration(userId: string, id: string, input: SavedConfigurationInput): Promise<SavedConfiguration | null> {
  const { data } = await adminDataConnect.executeMutation<
    SavedConfigurationMutationData,
    SavedConfigurationMutationVariables
  >("UpdateSavedPcConfiguration", {
    id,
    userId,
    name: input.name,
    description: input.description,
    totalPrice: input.totalPrice,
    savedSnapshot: input.savedSnapshot,
  });
  if (data.pcConfiguration_updateMany !== 1) return null;
  return getSavedConfiguration(userId, id);
}

export async function deleteSavedConfiguration(userId: string, id: string): Promise<boolean> {
  const { data } = await adminDataConnect.executeMutation<
    SavedConfigurationMutationData,
    { id: string; userId: string }
  >("DeleteSavedPcConfiguration", { id, userId });
  return data.pcConfiguration_deleteMany === 1;
}

export function parseConfigurationId(value: string): string | null {
  return normalizeUserId(value);
}

function toSavedConfiguration(row: SavedConfigurationRow): SavedConfiguration {
  const id = normalizeUserId(row.id);
  if (!id || typeof row.name !== "string" || !isValidDate(row.createdAt)) {
    throw new Error("Firebase zwrócił nieprawidłowy zapis zestawu.");
  }
  if (row.description !== undefined && row.description !== null && typeof row.description !== "string") {
    throw new Error("Firebase zwrócił nieprawidłowy opis zestawu.");
  }
  const snapshot = parseSnapshot(row.savedSnapshot);
  if (!snapshot) throw new Error("Firebase zwrócił nieprawidłowy zapis zestawu.");

  return {
    id,
    version: SAVED_CONFIGURATION_LIBRARY_VERSION,
    title: normalizeConfigurationName(row.name),
    ...(typeof row.description === "string" && row.description.trim()
      ? { description: row.description.slice(0, MAX_CONFIGURATION_DESCRIPTION_LENGTH).trim() }
      : {}),
    components: snapshot.components,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt && isValidDate(row.updatedAt) ? row.updatedAt : row.createdAt,
  };
}

function parseSnapshot(value: unknown): ConfigurationSnapshot | null {
  let snapshot: unknown = value;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      return null;
    }
  }
  if (!isRecord(snapshot) || snapshot.version !== SAVED_CONFIGURATION_LIBRARY_VERSION
    || !Array.isArray(snapshot.components) || snapshot.components.length > 30) return null;
  const draft = parseConfigurationDraft(JSON.stringify({
    version: CONFIGURATION_DRAFT_VERSION,
    title: "Mój zestaw",
    components: snapshot.components,
    updatedAt: new Date().toISOString(),
  }));
  if (!draft) return null;
  return {
    version: SAVED_CONFIGURATION_LIBRARY_VERSION,
    components: draft.components.map(cleanComponent),
  };
}

function cleanComponent(component: ManualComponent): ManualComponent {
  if (component.id.length > 255 || component.name.length > 200 || component.socket.length > 120
    || component.memoryType.length > 120 || component.note.length > 2_000
    || (component.manufacturer !== undefined && component.manufacturer.length > 100)
    || (component.description !== undefined && component.description.length > 10_000)) {
    throw new SavedConfigurationRequestError("Jedna z części zawiera zbyt długi opis.");
  }

  const clean: ManualComponent = {
    id: component.id,
    category: component.category,
    name: component.name,
    source: component.source ?? "catalog",
    socket: component.socket,
    memoryType: component.memoryType,
    note: component.note,
  };
  if (component.manufacturer !== undefined) clean.manufacturer = component.manufacturer;
  if (component.description !== undefined) clean.description = component.description;
  if (component.price !== undefined) clean.price = component.price;
  return clean;
}

function sameSnapshot(existing: SavedConfiguration, expected: SavedConfigurationInput["configuration"]): boolean {
  return existing.title === expected.title
    && (existing.description ?? "") === (expected.description ?? "")
    && JSON.stringify(existing.components) === JSON.stringify(expected.components);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const privateHeaders = { "Cache-Control": "private, no-store" };
