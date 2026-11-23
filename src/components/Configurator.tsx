"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PcPreview, { type PcPreviewPart } from "@/components/PcPreview";
import PartCategoryIcon from "@/components/PartCategoryIcon";
import { fetchCatalog, type ConfiguratorCatalogComponent } from "@/lib/catalog-client";
import {
  componentCategoryLabels,
  createComponentId,
  displayDate,
  emptyConfigurationDraft,
  MAX_CONFIGURATION_DESCRIPTION_LENGTH,
  type ComponentCategory,
  type ConfigurationDraft,
  type ManualComponent,
} from "@/lib/drafts";
import {
  configurationContentKey,
  configurationSnapshot,
  MAX_SAVED_CONFIGURATIONS,
  normalizeConfigurationName,
  parseSavedConfigurationLibrary,
  type ConfigurationSnapshot,
  type SavedConfiguration,
} from "@/lib/saved-configurations";
import {
  clearGuestConfigurationDraft,
  clearConfigurationHandoff,
  CONFIGURATION_HANDOFF_KEY,
  readGuestConfigurationDraft,
  readConfigurationHandoff,
  writeGuestConfigurationDraft,
} from "@/lib/configuration-handoff";
import { getCompatibilityChecks } from "@/lib/compatibility";
import styles from "./Configurator.module.css";

const categories: ComponentCategory[] = ["cpu", "motherboard", "memory", "gpu", "storage", "psu", "case", "cooling"];
const categoryIcons: Record<ComponentCategory, string> = {
  cpu: "CPU", motherboard: "MB", memory: "RAM", gpu: "GPU", storage: "SSD", psu: "PSU", case: "CASE", cooling: "FAN", other: "PC",
};
type ConfigurableCategory = Exclude<ComponentCategory, "other">;
type SavedConfigurationDialogState = { type: "details" | "delete"; saved: SavedConfiguration } | null;
const categoryDescriptions: Record<ConfigurableCategory, string> = {
  cpu: "Wykonuje obliczenia i uruchamia programy. Socket procesora musi pasować do płyty głównej.",
  motherboard: "Łączy podzespoły i udostępnia gniazda dla procesora, pamięci oraz kart rozszerzeń.",
  memory: "Przechowuje dane używane w danej chwili przez system i aplikacje. Typ pamięci musi pasować do płyty.",
  gpu: "Renderuje obraz i przyspiesza zadania graficzne, 3D oraz obliczenia równoległe.",
  storage: "Przechowuje system, programy i pliki. Dobierz pojemność oraz format do swoich potrzeb.",
  psu: "Dostarcza energię wszystkim podzespołom. Dobierz moc zasilacza do poboru prądu zestawu.",
  case: "Mieści i chroni podzespoły oraz pomaga utrzymać właściwy przepływ powietrza.",
  cooling: "Odprowadza ciepło z procesora, aby utrzymać jego stabilną temperaturę podczas pracy.",
};

const asDraftComponent = (part: ConfiguratorCatalogComponent): ManualComponent => ({
  id: part.id,
  category: part.category,
  source: "catalog",
  name: part.name,
  manufacturer: part.manufacturer || "",
  description: part.description || "",
  price: typeof part.price === "number" && Number.isFinite(part.price) ? part.price : null,
  socket: part.socket || "",
  memoryType: part.memoryType || "",
  note: "",
});

const comparableCatalogId = (id: string): string => {
  if (/^[0-9a-f]{32}$/i.test(id)) return id.toLowerCase();
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return id.replace(/-/g, "").toLowerCase();
  return id;
};

const findCatalogComponent = (items: ConfiguratorCatalogComponent[], id: string): ConfiguratorCatalogComponent | undefined => {
  const targetId = comparableCatalogId(id);
  return items.find((item) => comparableCatalogId(item.id) === targetId);
};

const money = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(value);
const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const canRestoreStoredDraft = (current: ConfigurationDraft, stored: ConfigurationDraft): boolean => {
  const currentKey = configurationContentKey(configurationSnapshot(current));
  return currentKey === configurationContentKey(configurationSnapshot(emptyConfigurationDraft()))
    || currentKey === configurationContentKey(configurationSnapshot(stored));
};

const prepareDraftForSave = (source: ConfigurationDraft): ConfigurationDraft => ({
  ...source,
  title: normalizeConfigurationName(source.title),
  description: (source.description ?? "").trim().slice(0, MAX_CONFIGURATION_DESCRIPTION_LENGTH),
  updatedAt: new Date().toISOString(),
});

type LibraryAccess = "loading" | "guest" | "ready" | "account-required" | "error";

const parseConfiguration = (value: unknown): SavedConfiguration | null => {
  const parsed = parseSavedConfigurationLibrary(JSON.stringify({
    version: 1,
    configurations: [value],
  }));
  return parsed.status === "valid" ? parsed.value.configurations[0] ?? null : null;
};

const readConfigurationsResponse = (value: unknown): SavedConfiguration[] | null => {
  if (!value || typeof value !== "object" || !Array.isArray((value as { configurations?: unknown }).configurations)) return null;
  const configurations = (value as { configurations: unknown[] }).configurations.map(parseConfiguration);
  return configurations.every((item): item is SavedConfiguration => item !== null) ? configurations : null;
};

export default function Configurator() {
  const [draft, setDraft] = useState<ConfigurationDraft>(emptyConfigurationDraft);
  const [savedConfigurations, setSavedConfigurations] = useState<SavedConfiguration[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ConfigurationSnapshot>(() => configurationSnapshot(emptyConfigurationDraft()));
  const [libraryAccess, setLibraryAccess] = useState<LibraryAccess>("loading");
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
  const [restoredHandoff, setRestoredHandoff] = useState(false);
  const [hasLocalGuestDraft, setHasLocalGuestDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{ type: "new" } | { type: "load"; id: string } | null>(null);
  const [savedConfigurationDialog, setSavedConfigurationDialog] = useState<SavedConfigurationDialogState>(null);
  const [savedDialogError, setSavedDialogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ConfiguratorCatalogComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ComponentCategory>("cpu");
  const [categoryThumbnails, setCategoryThumbnails] = useState<Partial<Record<ConfigurableCategory, string>>>({});
  const categoryThumbnailsRef = useRef<Partial<Record<ConfigurableCategory, string>>>({});
  const libraryRequestIdRef = useRef(0);
  const draftRef = useRef(draft);
  const createRequestRef = useRef<{ key: string; id: string } | null>(null);
  const saveRequestInFlightRef = useRef(false);
  const deleteRequestRef = useRef(false);
  const savedDialogRef = useRef<HTMLDialogElement>(null);
  const savedDialogTriggerRef = useRef<HTMLElement | null>(null);
  const savedDialogWasOpenRef = useRef(false);
  const backdropPointerRef = useRef(false);
  const [search, setSearch] = useState("");

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    const dialog = savedDialogRef.current;
    if (savedConfigurationDialog) {
      if (dialog && !dialog.open) dialog.showModal();
      savedDialogWasOpenRef.current = true;
      return;
    }
    if (dialog?.open) dialog.close();
    if (savedDialogWasOpenRef.current) {
      savedDialogWasOpenRef.current = false;
      const trigger = savedDialogTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      else document.getElementById("saved-configurations-title")?.focus();
      savedDialogTriggerRef.current = null;
    }
  }, [savedConfigurationDialog]);

  useEffect(() => {
    if (!savedConfigurationDialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [savedConfigurationDialog]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setCatalogError(null);
    try {
      const items = await fetchCatalog();
      setCatalog(items);
      setDraft((current) => ({
        ...current,
        components: current.components.map((saved) => {
          if (saved.source === "own") return saved;
          const fresh = findCatalogComponent(items, saved.id);
          return fresh ? { ...saved, ...asDraftComponent(fresh), source: saved.source ?? "catalog" } : saved;
        }),
      }));
    } catch {
      setCatalogError("Nie udało się teraz pobrać części. Spróbuj ponownie za chwilę.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedConfigurations = useCallback(async () => {
    const requestId = ++libraryRequestIdRef.current;
    setLibraryAccess("loading");
    const restoreGuestSlot = (consume: boolean): boolean => {
      const storage = browserStorage();
      const guestSlot = storage ? readGuestConfigurationDraft(storage) : null;
      if (!storage || !guestSlot) {
        setHasLocalGuestDraft(false);
        return false;
      }
      setHasLocalGuestDraft(true);
      if (!canRestoreStoredDraft(draftRef.current, guestSlot.draft)) return false;
      setDraft(guestSlot.draft);
      setActiveSavedId(null);
      setBaseline(configurationSnapshot(emptyConfigurationDraft()));
      if (consume) {
        const cleared = clearGuestConfigurationDraft(storage, guestSlot.raw);
        setHasLocalGuestDraft(!cleared && readGuestConfigurationDraft(storage) !== null);
        setRestoredHandoff(true);
      } else {
        setRestoredHandoff(false);
        setLibraryNotice("Przywrócono lokalny zestaw. Zapisz go na koncie po zalogowaniu.");
      }
      return true;
    };
    try {
      const response = await fetch("/api/v1/configurations", { cache: "no-store" });
      if (requestId !== libraryRequestIdRef.current) return;
      if (response.status === 401) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("guest");
        restoreGuestSlot(false);
        return;
      }
      if (response.status === 403) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("account-required");
        const storage = browserStorage();
        setHasLocalGuestDraft(Boolean(storage && readGuestConfigurationDraft(storage)));
        return;
      }
      if (!response.ok) throw new Error("Nie udało się pobrać zestawów z konta.");

      const body: unknown = await response.json();
      if (requestId !== libraryRequestIdRef.current) return;
      const configurations = readConfigurationsResponse(body);
      if (!configurations) throw new Error("Serwer zwrócił nieprawidłową listę zestawów.");

      let sessionResponse: Response | null = null;
      try {
        sessionResponse = await fetch("/api/v1/auth/session", { cache: "no-store" });
      } catch {
        // Loading the account library does not depend on profile details.
      }
      if (requestId !== libraryRequestIdRef.current) return;
      if (sessionResponse?.status === 401) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("guest");
        restoreGuestSlot(false);
        return;
      }
      if (sessionResponse?.status === 403) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("account-required");
        const storage = browserStorage();
        setHasLocalGuestDraft(Boolean(storage && readGuestConfigurationDraft(storage)));
        return;
      }
      if (sessionResponse?.ok) {
        try {
          const sessionBody = await sessionResponse.json() as { user?: { canSaveConfigurations?: unknown } };
          if (requestId !== libraryRequestIdRef.current) return;
          if (sessionBody.user?.canSaveConfigurations === false) {
            setSavedConfigurations([]);
            setActiveSavedId(null);
            setBaseline(configurationSnapshot(emptyConfigurationDraft()));
            setLibraryAccess("account-required");
            const storage = browserStorage();
            setHasLocalGuestDraft(Boolean(storage && readGuestConfigurationDraft(storage)));
            return;
          }
        } catch {
          // The account library remains available when profile details are unavailable.
        }
      }

      setSavedConfigurations(configurations);
      setLibraryAccess("ready");

      const guestSlotRestored = restoreGuestSlot(true);
      try {
        const storage = window.sessionStorage;
        if (guestSlotRestored) {
          if (storage.getItem(CONFIGURATION_HANDOFF_KEY) !== null) clearConfigurationHandoff(storage);
        } else {
          const handoff = readConfigurationHandoff(storage);
          if (handoff && canRestoreStoredDraft(draftRef.current, handoff.draft)) {
            setDraft(handoff.draft);
            setActiveSavedId(null);
            setBaseline(configurationSnapshot(emptyConfigurationDraft()));
            setRestoredHandoff(true);
            clearConfigurationHandoff(storage);
          } else if (!handoff && storage.getItem(CONFIGURATION_HANDOFF_KEY) !== null) {
            clearConfigurationHandoff(storage);
          }
        }
      } catch {
        // The cloud library remains available when browser storage is disabled.
      }
    } catch {
      if (requestId !== libraryRequestIdRef.current) return;
      restoreGuestSlot(false);
      setLibraryAccess("error");
      setLibraryNotice("Nie udało się pobrać zestawów z Firebase. Bieżący konfigurator pozostaje otwarty.");
    }
  }, []);

  useEffect(() => {
    void loadSavedConfigurations();
    void loadCatalog();
  }, [loadCatalog, loadSavedConfigurations]);
  const selected = useMemo(() => new Map(draft.components.map((part) => [part.category, part])), [draft.components]);
  const currentContent = useMemo(() => configurationSnapshot(draft), [draft]);
  const isDirty = configurationContentKey(currentContent) !== configurationContentKey(baseline);
  const sortedSavedConfigurations = useMemo(
    () => [...savedConfigurations].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    [savedConfigurations],
  );
  const activeSavedConfiguration = savedConfigurations.find((item) => item.id === activeSavedId);
  const primarySaveLabel = libraryAccess === "guest"
    ? hasLocalGuestDraft ? "Nadpisz szkic" : "Zapisz szkic"
    : activeSavedId !== null ? "Nadpisz zestaw" : "Zapisz nowy zestaw";
  const saveStatusText = isDirty
    ? "Niezapisane zmiany"
    : libraryAccess === "loading"
      ? "Ładowanie zapisów…"
      : libraryAccess === "guest"
        ? hasLocalGuestDraft ? "Szkic zapisany lokalnie" : "Zaloguj się, aby zapisywać"
        : libraryAccess === "account-required"
          ? "Wymagane konto użytkownika"
          : libraryAccess === "error"
            ? "Biblioteka niedostępna"
            : activeSavedConfiguration
              ? `Zapisano ${displayDate(activeSavedConfiguration.updatedAt)}`
              : activeSavedId
                ? "Zapis nie jest dostępny"
                : "Niezapisany zestaw";
  const activePart = selected.get(activeCategory);
  const activeVisualCategory: ConfigurableCategory = activeCategory === "other" ? "cpu" : activeCategory;
  const listedParts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pl-PL");
    return catalog.filter((part) => part.category === activeCategory && (!query || `${part.name} ${part.manufacturer} ${part.description}`.toLocaleLowerCase("pl-PL").includes(query)));
  }, [catalog, activeCategory, search]);
  const selectedParts = useMemo(() => [...selected.values()].map((part) => ({
    id: part.id,
    category: part.category,
    source: part.source ?? "catalog",
    name: part.name,
    manufacturer: part.manufacturer,
    socket: part.socket,
    memoryType: part.memoryType,
    note: part.note,
  })), [selected]);
  const previewParts = useMemo<PcPreviewPart[]>(() => categories.flatMap((category) => {
    const part = selected.get(category);
    return part ? [{ category, name: part.source === "own" ? "Mam własną część" : part.name, manufacturer: part.source === "own" ? "" : part.manufacturer || "", source: part.source ?? "catalog" }] : [];
  }), [selected]);
  const checks = useMemo(() => getCompatibilityChecks(selectedParts), [selectedParts]);
  const ownCount = [...selected.values()].filter((part) => part.source === "own" && categories.includes(part.category)).length;
  const priced = [...selected.values()].filter((part) => part.source !== "own" && categories.includes(part.category) && !loading && !catalogError && catalog.some((item) => item.id === part.id) && typeof part.price === "number" && Number.isFinite(part.price));
  const total = priced.reduce((sum, part) => sum + (part.price ?? 0), 0);
  const representedCategories = categories.filter((category) => selected.has(category)).length;
  const missingPrices = representedCategories - priced.length - ownCount;

  const updateParts = (components: ManualComponent[]) => {
    setDraft((current) => ({ ...current, components, updatedAt: new Date().toISOString() }));
    setLibraryNotice(null);
  };

  const choosePart = (part: ConfiguratorCatalogComponent) => {
    const chosen = asDraftComponent(part);
    updateParts([...draft.components.filter((item) => item.category !== part.category), chosen]);
  };

  const chooseOwnPart = (category: ComponentCategory) => {
    setActiveCategory(category);
    setSearch("");
    const current = selected.get(category);
    if (current?.source === "own") {
      updateParts(draft.components.filter((part) => part.category !== category));
      return;
    }
    updateParts([
      ...draft.components.filter((part) => part.category !== category),
      {
        id: createComponentId(),
        category,
        source: "own",
        name: "Mam własną część",
        manufacturer: "",
        description: "",
        price: null,
        socket: "",
        memoryType: "",
        note: "",
      },
    ]);
  };

  const requestSignIn = () => {
    const next = prepareDraftForSave(draft);
    const localStorage = browserStorage();
    if (!localStorage || !writeGuestConfigurationDraft(localStorage, next)) {
      setLibraryNotice("Nie udało się zachować lokalnego szkicu. Zestaw nadal jest otwarty; sprawdź ustawienia pamięci przeglądarki.");
      return;
    }
    setHasLocalGuestDraft(true);
    window.location.assign("/?returnTo=%2Fkonfigurator");
  };

  const saveDraft = async (mode: "update" | "copy" = "update") => {
    if (saveRequestInFlightRef.current || deleteRequestRef.current || saving || libraryAccess === "loading") return;
    if (libraryAccess === "guest") {
      const localDraft = prepareDraftForSave(draft);
      const storage = browserStorage();
      if (!storage || !writeGuestConfigurationDraft(storage, localDraft)) {
        setLibraryNotice("Nie udało się zapisać lokalnego szkicu. Zestaw nadal jest otwarty; sprawdź ustawienia pamięci przeglądarki.");
        return;
      }
      setDraft((current) => configurationContentKey(configurationSnapshot(current)) === configurationContentKey(configurationSnapshot(draft)) ? localDraft : current);
      setHasLocalGuestDraft(true);
      setLibraryNotice("Zestaw zapisano jako jeden lokalny szkic. Zaloguj się, aby otworzyć go na koncie.");
      return;
    }
    if (libraryAccess === "account-required") {
      setLibraryNotice("Ta sesja nie jest powiązana z kontem klienta. Wyloguj się i zaloguj na konto użytkownika.");
      return;
    }
    if (libraryAccess !== "ready" || !navigator.onLine) {
      setLibraryNotice("Nie udało się połączyć z Firebase. Spróbuj ponownie, gdy połączenie będzie dostępne.");
      return;
    }

    const next = prepareDraftForSave(draft);
    const snapshotKey = configurationContentKey(configurationSnapshot(next));
    const requestGeneration = libraryRequestIdRef.current;
    const isUpdate = mode === "update" && activeSavedId !== null;
    if (!isUpdate && savedConfigurations.length >= MAX_SAVED_CONFIGURATIONS) {
      setLibraryNotice(`Osiągnięto limit ${MAX_SAVED_CONFIGURATIONS} zapisanych zestawów. Usuń jeden, aby dodać nowy.`);
      return;
    }
    let url = "/api/v1/configurations";
    let method = "POST";
    const body: Record<string, unknown> = { title: next.title, description: next.description, components: next.components };

    if (isUpdate) {
      url += "/" + encodeURIComponent(activeSavedId as string);
      method = "PUT";
    } else {
      const key = mode + ":" + configurationContentKey(configurationSnapshot(next));
      if (!createRequestRef.current || createRequestRef.current.key !== key) {
        createRequestRef.current = { key, id: crypto.randomUUID() };
      }
      body.requestId = createRequestRef.current.id;
    }

    saveRequestInFlightRef.current = true;
    setSaving(true);
    try {
      const response = await fetch(url, {
        method,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (requestGeneration !== libraryRequestIdRef.current) return;
      const payload: unknown = await response.json().catch(() => null);
      if (requestGeneration !== libraryRequestIdRef.current) return;
      if (response.status === 401) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("guest");
        setLibraryNotice("Sesja wygasła. Zaloguj się ponownie, aby zapisać zestaw.");
        return;
      }
      if (response.status === 403) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("account-required");
        setLibraryNotice("Ta sesja nie jest powiązana z kontem klienta. Zaloguj się na konto użytkownika.");
        return;
      }
      if (response.status === 404 && isUpdate) {
        setSavedConfigurations((current) => current.filter((item) => item.id !== activeSavedId));
        setActiveSavedId(null);
        setLibraryNotice("Tego zapisu nie ma już na koncie. Możesz zapisać nowy zestaw.");
        return;
      }
      if (!response.ok) {
        const error = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Nie udało się zapisać zestawu w Firebase. Spróbuj ponownie.";
        setLibraryNotice(error);
        return;
      }

      const saved = parseConfiguration(payload && typeof payload === "object" ? (payload as { configuration?: unknown }).configuration : null);
      if (!saved) {
        setLibraryNotice("Firebase odpowiedział bez prawidłowego zapisu. Odśwież bibliotekę przed kolejną próbą.");
        return;
      }

      setSavedConfigurations((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
      });
      const savedDraft: ConfigurationDraft = {
        version: 1,
        title: saved.title,
        description: saved.description ?? "",
        components: saved.components,
        updatedAt: saved.updatedAt,
      };
      setDraft((current) => configurationContentKey(configurationSnapshot(current)) === snapshotKey ? savedDraft : current);
      setActiveSavedId(saved.id);
      setBaseline(configurationSnapshot(savedDraft));
      setLibraryAccess("ready");
      setRestoredHandoff(false);
      setLibraryNotice(mode === "copy" ? "Zapisano kopię zestawu na koncie." : "Nadpisano zestaw na koncie.");
      if (!isUpdate) createRequestRef.current = null;
    } catch {
      if (requestGeneration === libraryRequestIdRef.current) {
        setLibraryNotice("Nie udało się połączyć z Firebase. Zestaw pozostał w edytorze, spróbuj ponownie.");
      }
    } finally {
      saveRequestInFlightRef.current = false;
      setSaving(false);
    }
  };

  const refreshPartsFromCatalog = (components: ManualComponent[]) => components.map((saved) => {
    if (saved.source === "own") return saved;
    const fresh = findCatalogComponent(catalog, saved.id);
    return fresh ? { ...saved, ...asDraftComponent(fresh), source: saved.source ?? "catalog" as const } : saved;
  });

  const loadSavedConfiguration = (id: string) => {
    const saved = savedConfigurations.find((item) => item.id === id);
    if (!saved) return;
    const savedDraft: ConfigurationDraft = {
      version: 1,
      title: saved.title,
      description: saved.description ?? "",
      components: saved.components,
      updatedAt: saved.updatedAt,
    };
    setDraft({ ...savedDraft, components: refreshPartsFromCatalog(saved.components) });
    setActiveSavedId(saved.id);
    setBaseline(configurationSnapshot(savedDraft));
    setPendingTransition(null);
    setRestoredHandoff(false);
    setLibraryNotice(null);
  };

  const startNewConfiguration = () => {
    const next = emptyConfigurationDraft();
    setDraft(next);
    setActiveSavedId(null);
    setBaseline(configurationSnapshot(next));
    setPendingTransition(null);
    setRestoredHandoff(false);
    setLibraryNotice(null);
  };

  const requestLoadSavedConfiguration = (id: string) => {
    if (saving || saveRequestInFlightRef.current) return;
    if (isDirty) setPendingTransition({ type: "load", id });
    else loadSavedConfiguration(id);
  };

  const openSavedConfigurationDialog = (type: "details" | "delete", saved: SavedConfiguration, trigger: HTMLElement) => {
    if (saving || saveRequestInFlightRef.current || deleteRequestRef.current) return;
    savedDialogTriggerRef.current = trigger;
    setSavedDialogError(null);
    setSavedConfigurationDialog({ type, saved });
  };

  const closeSavedConfigurationDialog = () => {
    setSavedDialogError(null);
    setSavedConfigurationDialog(null);
  };

  const confirmDeleteSavedConfiguration = async (id: string): Promise<boolean> => {
    if (deleteRequestRef.current || saveRequestInFlightRef.current) return false;
    deleteRequestRef.current = true;
    setDeleting(true);
    const requestGeneration = libraryRequestIdRef.current;
    setSavedDialogError(null);
    try {
      const response = await fetch("/api/v1/configurations/" + encodeURIComponent(id), {
        method: "DELETE",
        cache: "no-store",
      });
      if (requestGeneration !== libraryRequestIdRef.current) return false;
      if (response.status === 401) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("guest");
        const message = "Sesja wygasła. Zaloguj się ponownie, aby zarządzać zapisanymi zestawami.";
        setSavedDialogError(message);
        return false;
      }
      if (response.status === 403) {
        setSavedConfigurations([]);
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        setLibraryAccess("account-required");
        const message = "Ta sesja nie jest powiązana z kontem klienta.";
        setSavedDialogError(message);
        return false;
      }
      if (response.status === 404) {
        setSavedConfigurations((current) => current.filter((item) => item.id !== id));
        if (activeSavedId === id) {
          setActiveSavedId(null);
          setBaseline(configurationSnapshot(emptyConfigurationDraft()));
        }
        setLibraryNotice("Ten zestaw nie istnieje już w bibliotece.");
        return true;
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        if (requestGeneration !== libraryRequestIdRef.current) return false;
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Nie udało się usunąć zestawu z Firebase. Spróbuj ponownie.";
        setSavedDialogError(message);
        setLibraryNotice(message);
        return false;
      }

      setSavedConfigurations((current) => current.filter((item) => item.id !== id));
      if (activeSavedId === id) {
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
      }
      setLibraryNotice("Usunięto zestaw z konta.");
      return true;
    } catch {
      if (requestGeneration === libraryRequestIdRef.current) {
        const message = "Nie udało się potwierdzić usunięcia. Spróbuj ponownie.";
        setSavedDialogError(message);
        setLibraryNotice(message);
      }
      return false;
    } finally {
      deleteRequestRef.current = false;
      setDeleting(false);
    }
  };
  const requestNewConfiguration = () => {
    if (saving || saveRequestInFlightRef.current) return;
    if (isDirty) setPendingTransition({ type: "new" });
    else startNewConfiguration();
  };

  const continuePendingTransition = () => {
    if (saving || saveRequestInFlightRef.current) return;
    if (pendingTransition?.type === "new") startNewConfiguration();
    else if (pendingTransition?.type === "load") loadSavedConfiguration(pendingTransition.id);
  };

  const activateCategory = (category: ComponentCategory) => {
    setActiveCategory(category);
    setSearch("");
  };

  const focusCatalog = () => document.getElementById("parts-catalog")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const receiveCategoryThumbnail = useCallback((category: ConfigurableCategory, image: string) => {
    if (categoryThumbnailsRef.current[category] === image) return;
    const next = { ...categoryThumbnailsRef.current, [category]: image };
    categoryThumbnailsRef.current = next;
    setCategoryThumbnails(next);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>PCMAKER <span>/</span> BUDOWANIE ZESTAWU</p><h1>Konfigurator komputera</h1><p className={styles.lede}>Wybierz części z katalogu i kliknij element komputera, żeby zobaczyć jego status.</p></div>
        <div className={styles.saveBox}><span><i className={styles.liveDot} />{saveStatusText}</span></div>
      </header>
      <section className={styles.savedLibrary} aria-labelledby="saved-configurations-title">
        <div className={styles.libraryTopline}>
          <div className={styles.libraryHeading}>
            <span className={styles.libraryIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5v-15Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M5 6h11M8.5 9.5h7M8.5 12.5h7M5 20.5A2.5 2.5 0 0 1 7.5 18H19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <div><p className={styles.eyebrow}>TWOJA KOLEKCJA</p><h2 id="saved-configurations-title" tabIndex={-1}>Zapisane zestawy</h2></div>
            <span className={styles.libraryCount} title={`Limit ${MAX_SAVED_CONFIGURATIONS} zestawów`} aria-label={libraryAccess === "ready" ? `${savedConfigurations.length} z ${MAX_SAVED_CONFIGURATIONS} zapisanych zestawów` : "Liczba zapisanych zestawów nieznana"}>{libraryAccess === "ready" ? `${savedConfigurations.length} / ${MAX_SAVED_CONFIGURATIONS}` : "—"}</span>
          </div>
          <span className={styles.localStorageNote}><i className={styles.liveDot} />{libraryAccess === "ready" ? "Zapisane na koncie" : libraryAccess === "guest" ? hasLocalGuestDraft ? "Szkic lokalny" : "Wymagane logowanie" : libraryAccess === "account-required" ? "Konto użytkownika" : libraryAccess === "error" ? "Firebase niedostępne" : "Ładowanie zapisów…"}</span>
        </div>
        <div className={styles.libraryEditor}>
          <label className={styles.configurationName}><span>Nazwa aktualnego zestawu</span><input value={draft.title} maxLength={80} onChange={(event) => { setDraft((current) => ({ ...current, title: event.target.value, updatedAt: new Date().toISOString() })); setLibraryNotice(null); }} placeholder="Mój zestaw" /></label>
          <div className={styles.libraryButtons}>
            <button type="button" className={styles.libraryPrimary} disabled={saving || libraryAccess === "loading" || (libraryAccess === "ready" && savedConfigurations.length >= MAX_SAVED_CONFIGURATIONS && !activeSavedId)} onClick={() => { void saveDraft(); }}>{saving ? "Zapisywanie…" : primarySaveLabel}</button>
            {libraryAccess === "ready" && activeSavedConfiguration && <button type="button" disabled={saving || savedConfigurations.length >= MAX_SAVED_CONFIGURATIONS} onClick={() => { void saveDraft("copy"); }}>Zapisz jako kopię</button>}
            <button type="button" onClick={requestNewConfiguration}>Nowy zestaw</button>
          </div>
          <label className={styles.configurationDescription}><span>Krótki opis zestawu</span><textarea value={draft.description ?? ""} maxLength={MAX_CONFIGURATION_DESCRIPTION_LENGTH} rows={2} onChange={(event) => { setDraft((current) => ({ ...current, description: event.target.value, updatedAt: new Date().toISOString() })); setLibraryNotice(null); }} placeholder="Na przykład: komputer do pracy i gier" /></label>
        </div>
        {libraryNotice && <p className={styles.libraryMessage + " " + (libraryNotice.startsWith("Nie") || libraryNotice.startsWith("Wybrany") || libraryNotice.startsWith("Ten zestaw") || libraryNotice.startsWith("Ta sesja") || libraryNotice.startsWith("Sesja wygasła") || libraryNotice.startsWith("Osiągnięto limit") ? styles.libraryError : styles.librarySuccess)} role="status">{libraryNotice}</p>}
        {libraryAccess === "ready" && savedConfigurations.length >= MAX_SAVED_CONFIGURATIONS && <p className={styles.libraryWarning} role="status">{savedConfigurations.length === MAX_SAVED_CONFIGURATIONS ? `Masz już ${MAX_SAVED_CONFIGURATIONS} z ${MAX_SAVED_CONFIGURATIONS} zapisów. Możesz tworzyć robocze szkice, edytować lub usuwać zapisane zestawy; aby zapisać kolejny na koncie, usuń jeden.` : `Biblioteka zawiera ${savedConfigurations.length} zapisów, czyli więcej niż obecny limit ${MAX_SAVED_CONFIGURATIONS}. Możesz tworzyć szkice oraz edytować i usuwać istniejące zestawy.`}</p>}
        {hasLocalGuestDraft && libraryAccess === "error" && <p className={styles.libraryWarning} role="status">Lokalny szkic pozostał w tej przeglądarce i jest otwarty. Po przywróceniu połączenia możesz zalogować się, aby zapisać go na koncie.</p>}
        {libraryAccess === "guest" && <div className={styles.accountPrompt}>
          <div><strong>Zaloguj się, aby otworzyć zestaw na koncie</strong><span>{hasLocalGuestDraft ? "Lokalny szkic otworzy się po zalogowaniu. Zapis na koncie potwierdzisz osobno." : "Zapisz lokalny szkic jednym kliknięciem; po zalogowaniu otworzy się w konfiguratorze, a zapis na koncie potwierdzisz osobno."}</span></div>
          <button type="button" onClick={requestSignIn}>Zaloguj się lub utwórz konto</button>
        </div>}
        {libraryAccess === "account-required" && <p className={styles.libraryWarning} role="status">Ta sesja nie jest powiązana z kontem klienta. Wyloguj się i zaloguj na konto użytkownika, aby zapisywać zestawy.</p>}
        {libraryAccess === "error" && <p className={styles.libraryError} role="alert">Nie udało się pobrać zestawów z Firebase. <button type="button" onClick={() => { void loadSavedConfigurations(); }}>Spróbuj ponownie</button></p>}
        {restoredHandoff && <p className={styles.librarySuccess} role="status">Przywróciłem szkic sprzed logowania. {hasLocalGuestDraft ? "Nowszy szkic zapisany w innej karcie pozostał w przeglądarce." : ""}Gdy będziesz gotowy, użyj przycisku „{primarySaveLabel}”, aby zapisać go na koncie.</p>}
        {hasLocalGuestDraft && libraryAccess === "ready" && !restoredHandoff && <p className={styles.libraryWarning} role="status">Pozostał lokalny szkic z innej karty; bieżący zestaw jest nadal otwarty i niczego nie usunąłem.</p>}
        {pendingTransition && <div className={styles.discardConfirm} role="alert"><span>Masz niezapisane zmiany. {pendingTransition.type === "new" ? "Rozpoczęcie nowego zestawu" : "Wczytanie innego zestawu"} je odrzuci.</span><div><button type="button" className={styles.discardAction} onClick={continuePendingTransition}>Odrzuć i kontynuuj</button><button type="button" onClick={() => setPendingTransition(null)}>Zostań przy tym zestawie</button></div></div>}
        {libraryAccess === "ready" && <div className={styles.savedConfigurationList} aria-label="Lista zapisanych konfiguracji">
          {sortedSavedConfigurations.length === 0 ? <div className={styles.emptySavedList}><span className={styles.emptySavedIcon} aria-hidden="true">＋</span><strong>Twoja kolekcja czeka na pierwszy zestaw</strong><span>Zapisz bieżący komputer, aby wrócić do niego później.</span></div> : sortedSavedConfigurations.map((saved) => <article className={`${styles.savedConfiguration} ${saved.id === activeSavedId ? styles.savedConfigurationActive : ""}`} key={saved.id}>
            <div className={styles.savedCardHeader}>
              <span className={styles.savedPcIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M7 8h5M7 11h5M7 14h5M7 17h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M18 8h2.5v8H18a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="18.8" cy="12" r=".7" fill="currentColor"/></svg></span>
              <div className={styles.savedConfigurationInfo}><strong title={saved.title}>{saved.title}</strong><span>{displayDate(saved.updatedAt)} <i>·</i> {saved.components.length} {saved.components.length === 1 ? "część" : "części"}</span></div>
              {saved.id === activeSavedId && <span className={styles.currentConfiguration}><i />Aktywny</span>}
            </div>
            <div className={styles.savedCardActions}>
              <button type="button" className={styles.savedPartsButton} aria-label={`Podgląd części zestawu ${saved.title}`} title={`Podgląd części zestawu ${saved.title}`} onClick={(event) => openSavedConfigurationDialog("details", saved, event.currentTarget)}>Podgląd</button>
              <button type="button" className={styles.savedLoadButton} aria-label={`${saved.id === activeSavedId ? "Wczytaj ponownie" : "Wczytaj zestaw"} ${saved.title}`} title={`${saved.id === activeSavedId ? "Wczytaj ponownie" : "Wczytaj zestaw"} ${saved.title}`} onClick={() => requestLoadSavedConfiguration(saved.id)}>{saved.id === activeSavedId ? "Wczytaj ponownie" : "Wczytaj"}</button>
              <button type="button" className={styles.savedDeleteButton} aria-label={`Usuń zestaw ${saved.title}`} title={`Usuń zestaw ${saved.title}`} onClick={(event) => openSavedConfigurationDialog("delete", saved, event.currentTarget)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9 7V4.5h6V7m-8.5 0 .8 12h9.4l.8-12M10 10.5v5.5m4-5.5v5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            </div>
          </article>)}
        </div>}
      </section>

      <dialog
        ref={savedDialogRef}
        className={`${styles.savedDialog} ${savedConfigurationDialog?.type === "delete" ? styles.savedDeleteDialog : ""}`}
        aria-labelledby="saved-dialog-title"
        onCancel={(event) => { event.preventDefault(); closeSavedConfigurationDialog(); }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          backdropPointerRef.current = event.target === event.currentTarget
            && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
        }}
        onPointerUp={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const endedOnBackdrop = event.target === event.currentTarget
            && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
          const shouldClose = backdropPointerRef.current && endedOnBackdrop;
          backdropPointerRef.current = false;
          if (shouldClose) closeSavedConfigurationDialog();
        }}
      >
        {savedConfigurationDialog && <>
          <header className={styles.savedDialogHeader}>
            <div className={styles.savedDialogHeaderCopy}>
              <span className={styles.savedDialogEyebrow}>{savedConfigurationDialog.type === "details" ? "PODSUMOWANIE ZAPISU" : "USUWANIE ZAPISU"}</span>
              <h2 id="saved-dialog-title">{savedConfigurationDialog.type === "details" ? savedConfigurationDialog.saved.title : "Usunąć zapisany zestaw?"}</h2>
              {savedConfigurationDialog.type === "details" && <p>{categories.filter((category) => savedConfigurationDialog.saved.components.some((part) => part.category === category)).length} z 8 kategorii uzupełnionych</p>}
            </div>
            <button type="button" className={styles.savedDialogClose} aria-label="Zamknij okno" onClick={closeSavedConfigurationDialog}>×</button>
          </header>
          {savedConfigurationDialog.type === "details" ? <>
            <div className={styles.savedDialogBody}>
              {savedConfigurationDialog.saved.description?.trim() && <p className={styles.savedDescription}>{savedConfigurationDialog.saved.description}</p>}
              <ul className={styles.savedPartsList}>{categories.map((category) => {
                const part = savedConfigurationDialog.saved.components.find((item) => item.category === category);
                return <li key={category} className={part ? styles.savedDialogPart : styles.savedDialogMissing}>
                  <span>{componentCategoryLabels[category]}</span>
                  <strong>{!part ? "Nie wybrano" : part.source === "own" ? "Mam własną część" : part.name}</strong>
                </li>;
              })}</ul>
            </div>
            <footer className={styles.savedDialogFooter}><button type="button" className={styles.savedDialogNeutral} onClick={closeSavedConfigurationDialog}>Zamknij</button></footer>
          </> : <>
            <div className={styles.savedDialogBody}>
              {savedDialogError && <p className={styles.savedDialogError} role="alert">{savedDialogError}</p>}
              <p className={styles.savedDeleteDialogName}>„{savedConfigurationDialog.saved.title}”</p>
              <p className={styles.savedDeleteDialogCopy}>Usuniemy ten zapis z biblioteki. Bieżący zestaw w edytorze pozostanie bez zmian.</p>
            </div>
            <footer className={styles.savedDialogFooter}>
              <button type="button" className={styles.savedDialogNeutral} onClick={closeSavedConfigurationDialog}>Anuluj</button>
              <button type="button" className={styles.savedDialogDeleteAction} disabled={deleting || saving} onClick={() => { void confirmDeleteSavedConfiguration(savedConfigurationDialog.saved.id).then((deleted) => { if (deleted) closeSavedConfigurationDialog(); }); }}>{deleting ? "Usuwanie…" : "Usuń zestaw"}</button>
            </footer>
          </>}
        </>}
      </dialog>

      <section className={styles.studio} aria-label="Interaktywny podgląd komputera">
        <div className={styles.previewPane}><PcPreview selectedParts={previewParts} activeCategory={activeCategory} onSelectCategory={activateCategory} onCategoryThumbnail={receiveCategoryThumbnail} /></div>
        <aside className={styles.stageInspector} aria-live="polite">
          <div className={styles.inspectorHeader}><p className={styles.eyebrow}>AKTYWNY ELEMENT</p><span className={`${styles.inspectorBadge} ${activePart ? styles.inspectorBadgeChosen : ""}`}>{activePart ? "W ZESTAWIE" : "DO WYBORU"}</span></div>
          <h2 className={styles.inspectorTitle}>{componentCategoryLabels[activeCategory]}</h2>
          {activePart ? <><div className={`${styles.inspectorProduct} ${activePart.source === "own" ? styles.ownPartCard : ""}`}><span className={styles.productIcon}>{categoryIcons[activeCategory]}</span><div><small>{activePart.source === "own" ? "MAM WŁASNĄ CZĘŚĆ" : "WYBRANO"}</small><strong>{activePart.source === "own" ? `Własna część · ${componentCategoryLabels[activeCategory]}` : activePart.name}</strong>{activePart.source === "own" ? <span>Poza katalogiem i sumą ceny. Sprawdź parametry przed zakupem.</span> : activePart.manufacturer && <span>{activePart.manufacturer}</span>}</div></div><div className={styles.inspectorActions}><button type="button" className={styles.inspectorPrimary} onClick={focusCatalog}>Zobacz opcje z katalogu <span>↓</span></button><button type="button" className={styles.removePart} onClick={() => updateParts(draft.components.filter((part) => part.category !== activeCategory))}>Usuń wybraną część ×</button></div></> : <><div className={styles.inspectorEmpty}><span className={styles.focusPlus}>＋</span><div><strong>Jeszcze nie wybrano</strong><span>Kliknij model albo wybierz część z katalogu.</span></div></div><button type="button" className={styles.inspectorPrimary} onClick={() => chooseOwnPart(activeCategory)}>Mam własną część</button><button type="button" className={styles.inspectorPrimary} onClick={focusCatalog}>Dobierz {componentCategoryLabels[activeCategory].toLocaleLowerCase("pl-PL")} z katalogu <span>↓</span></button></>}
          <div className={styles.categoryInfo} data-active-category={activeCategory}>
            <div className={styles.categoryInfoArt}>
              {categoryThumbnails[activeVisualCategory] ? <img src={categoryThumbnails[activeVisualCategory]} alt={`Poglądowy model kategorii: ${componentCategoryLabels[activeVisualCategory]}`} className={styles.categoryInfoModel} draggable={false} /> : <PartCategoryIcon category={activeVisualCategory} className={styles.categoryInfoIcon} />}
              <span className={styles.categoryInfoHint}>MODEL POGLĄDOWY</span>
            </div>
            <div className={styles.categoryInfoCopy}>
              <span>FUNKCJA CZĘŚCI</span>
              <p>{categoryDescriptions[activeVisualCategory]}</p>
            </div>
          </div>
          <div className={styles.modelLegend}><span><i className={styles.legendBright} /> Wybrano</span><span><i className={styles.legendDim} /> Do wyboru</span></div>
        </aside>
      </section>

      <section className={styles.builder}>
        <div className={styles.builderMain}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>01 / PODZESPOŁY</p><h2>Wybierz część</h2></div><span className={styles.progress}>{representedCategories} <i>/ 8</i></span></div>
          <div className={styles.categoryGrid} role="group" aria-label="Kategorie podzespołów">
            {categories.map((category) => {
              const part = selected.get(category);
              return <button key={category} type="button" aria-pressed={activeCategory === category} className={`${styles.category} ${activeCategory === category ? styles.categoryActive : ""} ${part ? styles.categoryChosen : ""}`} onClick={() => activateCategory(category)}>
                <span className={styles.categoryIcon}>{categoryIcons[category]}</span><span className={styles.categoryText}><strong>{componentCategoryLabels[category]}</strong><small>{part ? (part.source === "own" ? "Mam własną część" : part.name) : "Nie wybrano"}</small></span><span className={styles.categoryArrow}>{part ? "✓" : "＋"}</span>
              </button>;
            })}
          </div>

          <div className={styles.catalogPanel} id="parts-catalog">
            <div className={styles.catalogHead}><div><p className={styles.eyebrow}>KATALOG CZĘŚCI</p><h3>{componentCategoryLabels[activeCategory]}</h3></div><label className={styles.search}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj modelu" aria-label="Szukaj części" /></label></div>
            <div className={`${styles.ownCatalogRow} ${activePart?.source === "own" ? styles.ownCatalogRowSelected : ""}`}>
              <span className={styles.ownCatalogIcon}><PartCategoryIcon category={activeVisualCategory} /></span>
              <span className={styles.ownCatalogCopy}><strong>Własna część</strong><small>Użyj posiadanego podzespołu. Nie doliczamy go do ceny zestawu.</small></span>
              {activePart?.source === "own" ? <><span className={styles.ownCatalogStatus}>Mam własną ✓</span><button type="button" className={styles.ownCatalogRemove} onClick={() => updateParts(draft.components.filter((part) => part.category !== activeCategory))}>Usuń</button></> : <button type="button" className={styles.ownCatalogChoose} onClick={() => chooseOwnPart(activeCategory)}>Mam własną część</button>}
            </div>
            {loading ? <div className={styles.state}><span className={styles.spinner} /><strong>Pobieramy części z bazy</strong><span>Za chwilę pokażemy dostępne modele.</span></div> : catalogError ? <div className={styles.state}><span className={styles.stateIcon}>!</span><strong>Katalog jest chwilowo niedostępny</strong><span>{catalogError}</span><button type="button" className={styles.retry} onClick={() => void loadCatalog()}>Spróbuj ponownie ↗</button></div> : listedParts.length === 0 ? <div className={styles.state}><span className={styles.stateIcon}>⌕</span><strong>{catalog.length ? "Brak pasujących części" : "Baza nie zawiera jeszcze części"}</strong><span>{catalog.length ? "Zmień wyszukiwaną frazę albo wybierz inną kategorię." : "Gdy dodasz produkty do bazy, pojawią się tutaj."}</span></div> : <div className={styles.productList}>
              {listedParts.map((part) => {
                const isSelected = activePart?.id === part.id;
                return <article key={part.id} className={`${styles.product} ${isSelected ? styles.productSelected : ""}`}><span className={styles.productIcon}>{categoryIcons[part.category]}</span><div className={styles.productInfo}><span className={styles.maker}>{part.manufacturer || componentCategoryLabels[part.category]}</span><strong>{part.name}</strong><p>{part.description || [part.socket && `Socket ${part.socket}`, part.memoryType].filter(Boolean).join(" · ") || "Szczegóły produktu nie są dostępne"}</p></div><div className={styles.productBuy}>{typeof part.price === "number" && Number.isFinite(part.price) ? <strong>{money(part.price)}</strong> : <strong className={styles.unknownPrice}>Brak ceny</strong>}<button type="button" onClick={() => choosePart(part)}>{isSelected ? "Wybrano ✓" : activePart ? "Zamień" : "Wybierz"}</button></div></article>;
              })}
            </div>}
          </div>
        </div>

        <aside className={styles.summary}>
          <div className={styles.summaryTop}><p className={styles.eyebrow}>02 / TWÓJ ZESTAW</p><span className={styles.countBadge}>{representedCategories} / 8</span></div>
          <h2>Podsumowanie</h2>
          <p className={styles.summaryIntro}>Wybrane podzespoły, suma cen i wstępna kontrola zestawu.</p>
          <div className={styles.summaryRule} />
          <div className={styles.totalRow}><span>Suma części z ceną</span><strong>{money(total)}</strong></div>
          {(ownCount > 0 || missingPrices > 0) && <p className={styles.priceNote}>{[ownCount > 0 ? `Niewliczone: ${ownCount === 1 ? "część własna" : "części własne"}.` : "", missingPrices > 0 ? catalogError ? "Ceny zapisanych części są nieaktualne i nie są teraz wliczane." : `${missingPrices} ${missingPrices === 1 ? "część bez aktualnej ceny" : "części bez aktualnej ceny"} nie jest wliczana.` : ""].filter(Boolean).join(" ")}</p>}
          <div className={styles.progressBlock}><div><span>Kompletność</span><strong>{Math.round(representedCategories / categories.length * 100)}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${representedCategories / categories.length * 100}%` }} /></div><div className={styles.progressCaption}>{representedCategories === 8 ? "Wszystkie główne części dodane" : `Dodaj jeszcze ${8 - representedCategories} ${representedCategories === 7 ? "część" : "części"}`}</div></div>
          <div className={styles.checks}><div className={styles.checkHead}><span>Wstępna kontrola</span><span className={styles.beta}>BETA</span></div>{checks.map((check) => <div key={check.title} className={styles.checkRow}><i className={`${styles.checkDot} ${check.state === "compatible" ? styles.checkGood : check.state === "warning" ? styles.checkWarn : ""}`} /><div><strong>{check.title}</strong><span>{check.detail}</span></div></div>)}<p className={styles.checkDisclaimer}>Kontrola obejmuje socket procesora i typ pamięci. Pozostałe parametry sprawdź przed zakupem.</p></div>
        </aside>
      </section>
      <p className={styles.footnote}>Ceny i dostępność pochodzą z katalogu bazy danych. Model komputera jest wizualizacją poglądową.</p>
    </div>
  );
}
