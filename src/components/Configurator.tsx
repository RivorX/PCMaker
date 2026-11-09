"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PcPreview, { type PcPreviewPart } from "@/components/PcPreview";
import PartCategoryIcon from "@/components/PartCategoryIcon";
import { fetchCatalog, type CatalogComponent } from "@/lib/catalog";
import {
  componentCategoryLabels,
  createComponentId,
  displayDate,
  emptyConfigurationDraft,
  readConfigurationDraft,
  type ComponentCategory,
  type ConfigurationDraft,
  type ManualComponent,
} from "@/lib/drafts";
import {
  configurationContentKey,
  configurationSnapshot,
  deleteConfigurationFromLibrary,
  loadSavedConfigurationLibrary,
  normalizeConfigurationName,
  readWorkingConfiguration,
  saveConfigurationToLibrary,
  saveWorkingConfiguration,
  type ConfigurationSnapshot,
  type SavedConfiguration,
  type WorkingConfigurationState,
} from "@/lib/saved-configurations";
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

const asDraftComponent = (part: CatalogComponent): ManualComponent => ({
  id: part.id,
  category: part.category,
  source: "catalog",
  name: part.name,
  manufacturer: part.manufacturer || "",
  description: part.description || "",
  price: Number.isFinite(part.price) ? part.price : null,
  socket: part.socket || "",
  memoryType: part.memoryType || "",
  note: "",
});

const money = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(value);
const savedConfigurationCountLabel = (count: number) => {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const noun = count === 1
    ? "zestaw"
    : lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)
      ? "zestawy"
      : "zestawów";
  return `${count} ${noun}`;
};

const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export default function Configurator() {
  const [draft, setDraft] = useState<ConfigurationDraft>(emptyConfigurationDraft);
  const [savedConfigurations, setSavedConfigurations] = useState<SavedConfiguration[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ConfigurationSnapshot>(() => configurationSnapshot(emptyConfigurationDraft()));
  const [storageInitialized, setStorageInitialized] = useState(false);
  const [libraryIssue, setLibraryIssue] = useState<"corrupt" | "unavailable" | null>(null);
  const [legacyWarning, setLegacyWarning] = useState(false);
  const [workingCacheIssue, setWorkingCacheIssue] = useState<"corrupt" | "unavailable" | null>(null);
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{ type: "new" } | { type: "load"; id: string } | null>(null);
  const [savedConfigurationDialog, setSavedConfigurationDialog] = useState<SavedConfigurationDialogState>(null);
  const [savedDialogError, setSavedDialogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ComponentCategory>("cpu");
  const [categoryThumbnails, setCategoryThumbnails] = useState<Partial<Record<ConfigurableCategory, string>>>({});
  const categoryThumbnailsRef = useRef<Partial<Record<ConfigurableCategory, string>>>({});
  const storageInitializationRef = useRef(false);
  const savedDialogRef = useRef<HTMLDialogElement>(null);
  const savedDialogTriggerRef = useRef<HTMLElement | null>(null);
  const savedDialogWasOpenRef = useRef(false);
  const backdropPointerRef = useRef(false);
  const [search, setSearch] = useState("");

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
          const fresh = items.find((item) => item.id === saved.id);
          return fresh ? { ...saved, ...asDraftComponent(fresh), source: saved.source ?? "catalog" } : saved;
        }),
      }));
    } catch {
      setCatalogError("Nie udało się teraz pobrać części. Spróbuj ponownie za chwilę.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (storageInitializationRef.current) return;
    storageInitializationRef.current = true;
    const storage = browserStorage();
    if (!storage) {
      setLibraryIssue("unavailable");
      setWorkingCacheIssue("unavailable");
      setStorageInitialized(true);
      void loadCatalog();
      return;
    }
    const library = loadSavedConfigurationLibrary(storage);
    setSavedConfigurations(library.configurations);
    setLibraryIssue(library.issue);
    setLegacyWarning(library.warning === "legacy-corrupt");

    const working = readWorkingConfiguration(storage);
    if (working.status === "valid") {
      const migratedRecord = library.migratedLegacyId
        ? library.configurations.find((item) => item.id === library.migratedLegacyId)
        : undefined;
      const emptyBaseline = configurationSnapshot(emptyConfigurationDraft());
      const recoverLegacyLink = !working.value.activeSavedId
        && migratedRecord
        && library.legacyDraft
        && working.value.draft.updatedAt === library.legacyDraft.updatedAt
        && configurationContentKey(configurationSnapshot(working.value.draft)) === configurationContentKey(configurationSnapshot(library.legacyDraft))
        && configurationContentKey(working.value.baseline) === configurationContentKey(emptyBaseline);
      const missingActiveLink = Boolean(working.value.activeSavedId)
        && library.issue === null
        && !library.configurations.some((item) => item.id === working.value.activeSavedId);
      const recoveredDraft = recoverLegacyLink && migratedRecord
        ? { ...working.value.draft, title: migratedRecord.title, components: migratedRecord.components, updatedAt: migratedRecord.updatedAt }
        : working.value.draft;
      setDraft(recoveredDraft);
      setActiveSavedId(missingActiveLink ? null : recoverLegacyLink && migratedRecord ? migratedRecord.id : working.value.activeSavedId);
      setBaseline(missingActiveLink
        ? emptyBaseline
        : recoverLegacyLink && migratedRecord
          ? configurationSnapshot(recoveredDraft)
          : working.value.baseline);
    } else {
      if (working.status === "corrupt" || working.status === "unavailable") {
        setWorkingCacheIssue(working.status);
      }
      const legacy = library.legacyDraft ?? (library.issue === "corrupt" ? readConfigurationDraft() : null);
      if (legacy) {
        const migratedRecord = library.migratedLegacyId
          ? library.configurations.find((item) => item.id === library.migratedLegacyId)
          : undefined;
        const initialDraft = migratedRecord
          ? { ...legacy, title: migratedRecord.title, components: migratedRecord.components, updatedAt: migratedRecord.updatedAt }
          : legacy;
        setDraft(initialDraft);
        setActiveSavedId(migratedRecord?.id ?? null);
        setBaseline(migratedRecord ? configurationSnapshot(initialDraft) : configurationSnapshot(emptyConfigurationDraft()));
      }
    }
    setStorageInitialized(true);
    void loadCatalog();
  }, [loadCatalog]);

  const workingState = useMemo<WorkingConfigurationState>(() => ({
    version: 1,
    draft,
    activeSavedId,
    baseline,
  }), [draft, activeSavedId, baseline]);

  useEffect(() => {
    if (!storageInitialized) return;
    const storage = browserStorage();
    if (!storage) {
      setWorkingCacheIssue("unavailable");
      return;
    }
    const saved = saveWorkingConfiguration(storage, workingState);
    setWorkingCacheIssue(saved.ok ? null : saved.issue);
  }, [storageInitialized, workingState]);

  const selected = useMemo(() => new Map(draft.components.map((part) => [part.category, part])), [draft.components]);
  const currentContent = useMemo(() => configurationSnapshot(draft), [draft]);
  const isDirty = configurationContentKey(currentContent) !== configurationContentKey(baseline);
  const sortedSavedConfigurations = useMemo(
    () => [...savedConfigurations].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    [savedConfigurations],
  );
  const activeSavedConfiguration = savedConfigurations.find((item) => item.id === activeSavedId);
  const saveStatusText = isDirty
    ? "Niezapisane zmiany"
    : libraryIssue
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

  const choosePart = (part: CatalogComponent) => {
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

  const saveDraft = (mode: "update" | "copy" = "update") => {
    const storage = browserStorage();
    if (!storage) {
      setLibraryIssue("unavailable");
      setLibraryNotice("Nie udało się zapisać zestawu. Przeglądarka blokuje pamięć lokalną.");
      return;
    }
    const next = { ...draft, title: normalizeConfigurationName(draft.title), updatedAt: new Date().toISOString() };
    const result = saveConfigurationToLibrary(storage, next, mode, activeSavedId);
    if (!result.ok) {
      if (result.issue === "corrupt" || result.issue === "unavailable") setLibraryIssue(result.issue);
      setLibraryNotice(result.issue === "corrupt"
        ? "Nie udało się odczytać zapisanych zestawów. Istniejące zapisy pozostały bez zmian."
        : result.issue === "missing"
          ? "Wybrany zapis nie jest już dostępny. Użyj „Zapisz jako nowy”."
          : "Nie udało się zapisać zestawu. Sprawdź wolne miejsce i ustawienia przeglądarki.");
      return;
    }
    setDraft({ ...next, updatedAt: result.saved.updatedAt });
    setSavedConfigurations(result.configurations);
    setActiveSavedId(result.saved.id);
    setBaseline(configurationSnapshot(next));
    setLibraryIssue(null);
    setLibraryNotice(mode === "copy" ? "Zapisano jako nowy zestaw." : "Zapisano zmiany w zestawie.");
  };

  const refreshPartsFromCatalog = (components: ManualComponent[]) => components.map((saved) => {
    if (saved.source === "own") return saved;
    const fresh = catalog.find((item) => item.id === saved.id);
    return fresh ? { ...saved, ...asDraftComponent(fresh), source: saved.source ?? "catalog" as const } : saved;
  });

  const loadSavedConfiguration = (id: string) => {
    const saved = savedConfigurations.find((item) => item.id === id);
    if (!saved) return;
    const savedDraft: ConfigurationDraft = {
      version: 1,
      title: saved.title,
      components: saved.components,
      updatedAt: saved.updatedAt,
    };
    setDraft({ ...savedDraft, components: refreshPartsFromCatalog(saved.components) });
    setActiveSavedId(saved.id);
    setBaseline(configurationSnapshot(savedDraft));
    setPendingTransition(null);
    setLibraryNotice(null);
  };

  const startNewConfiguration = () => {
    const next = emptyConfigurationDraft();
    setDraft(next);
    setActiveSavedId(null);
    setBaseline(configurationSnapshot(next));
    setPendingTransition(null);
    setLibraryNotice(null);
  };

  const requestLoadSavedConfiguration = (id: string) => {
    if (isDirty) setPendingTransition({ type: "load", id });
    else loadSavedConfiguration(id);
  };

  const openSavedConfigurationDialog = (type: "details" | "delete", saved: SavedConfiguration, trigger: HTMLElement) => {
    savedDialogTriggerRef.current = trigger;
    setSavedDialogError(null);
    setSavedConfigurationDialog({ type, saved });
  };

  const closeSavedConfigurationDialog = () => {
    setSavedDialogError(null);
    setSavedConfigurationDialog(null);
  };

  const confirmDeleteSavedConfiguration = (id: string): boolean => {
    const storage = browserStorage();
    if (!storage) {
      setLibraryIssue("unavailable");
      const message = "Nie udało się usunąć zestawu. Przeglądarka blokuje pamięć lokalną.";
      setLibraryNotice(message);
      setSavedDialogError(message);
      return false;
    }
    const result = deleteConfigurationFromLibrary(storage, id);
    if (result.ok) {
      setSavedConfigurations(result.configurations);
      if (activeSavedId === id) {
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
      }
      setLibraryIssue(null);
      setLibraryNotice("Usunięto zapisany zestaw.");
      return true;
    }
    if (result.issue === "missing") {
      setSavedConfigurations(result.configurations);
      if (activeSavedId === id && !result.configurations.some((item) => item.id === id)) {
        setActiveSavedId(null);
        setBaseline(configurationSnapshot(emptyConfigurationDraft()));
      }
      setLibraryNotice("Ten zestaw nie istnieje już w bibliotece. Lista została odświeżona.");
      return true;
    }
    setLibraryIssue(result.issue);
    const message = result.issue === "corrupt"
      ? "Nie udało się odczytać zapisanych zestawów. Istniejące zapisy pozostały bez zmian."
      : "Nie udało się usunąć zestawu. Sprawdź ustawienia pamięci przeglądarki.";
    setLibraryNotice(message);
    setSavedDialogError(message);
    return false;
  };

  const requestNewConfiguration = () => {
    if (isDirty) setPendingTransition({ type: "new" });
    else startNewConfiguration();
  };

  const continuePendingTransition = () => {
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
        <div className={styles.saveBox}><span><i className={styles.liveDot} />{saveStatusText}</span><button type="button" onClick={() => saveDraft()}>Zapisz zestaw <b>↗</b></button></div>
      </header>
      <section className={styles.savedLibrary} aria-labelledby="saved-configurations-title">
        <div className={styles.libraryTopline}>
          <div className={styles.libraryHeading}>
            <span className={styles.libraryIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5v-15Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M5 6h11M8.5 9.5h7M8.5 12.5h7M5 20.5A2.5 2.5 0 0 1 7.5 18H19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <div><p className={styles.eyebrow}>TWOJA KOLEKCJA</p><h2 id="saved-configurations-title" tabIndex={-1}>Zapisane zestawy</h2></div>
            <span className={styles.libraryCount}>{savedConfigurationCountLabel(savedConfigurations.length)}</span>
          </div>
          <span className={styles.localStorageNote}><i className={styles.liveDot} />Zapisane w tej przeglądarce</span>
        </div>
        <div className={styles.libraryEditor}>
          <label className={styles.configurationName}><span>Nazwa aktualnego zestawu</span><input value={draft.title} maxLength={80} onChange={(event) => { setDraft((current) => ({ ...current, title: event.target.value, updatedAt: new Date().toISOString() })); setLibraryNotice(null); }} placeholder="Mój zestaw" /></label>
          <div className={styles.libraryButtons}>
            <button type="button" className={styles.libraryPrimary} onClick={() => saveDraft()}>{activeSavedId ? "Zapisz zmiany" : "Zapisz zestaw"}</button>
            <button type="button" onClick={() => saveDraft("copy")}>Zapisz jako nowy</button>
            <button type="button" onClick={requestNewConfiguration}>Nowy zestaw</button>
          </div>
        </div>
        {libraryNotice && <p className={`${styles.libraryMessage} ${libraryNotice.startsWith("Nie udało") || libraryNotice.startsWith("Wybrany") || libraryNotice.startsWith("Ten zestaw nie istnieje") ? styles.libraryError : styles.librarySuccess}`} role="status">{libraryNotice}</p>}
        {libraryIssue === "corrupt" && <p className={styles.libraryError} role="alert">Nie udało się odczytać zapisanych zestawów. Istniejące zapisy pozostały bez zmian.</p>}
        {libraryIssue === "unavailable" && <p className={styles.libraryError} role="alert">Przeglądarka nie pozwoliła odczytać lub zapisać biblioteki. Bieżące zmiany pozostają w edytorze.</p>}
        {legacyWarning && <p className={styles.libraryWarning} role="status">Poprzedni zapis nie dał się odczytać. Zostawiłem go bez zmian.</p>}
        {workingCacheIssue && <p className={styles.libraryWarning} role="status">Nie udało się zachować roboczego szkicu. Zapis biblioteki działa niezależnie.</p>}
        {pendingTransition && <div className={styles.discardConfirm} role="alert"><span>Masz niezapisane zmiany. {pendingTransition.type === "new" ? "Rozpoczęcie nowego zestawu" : "Wczytanie innego zestawu"} je odrzuci.</span><div><button type="button" className={styles.discardAction} onClick={continuePendingTransition}>Odrzuć i kontynuuj</button><button type="button" onClick={() => setPendingTransition(null)}>Zostań przy tym zestawie</button></div></div>}
        <div className={styles.savedConfigurationList} aria-label="Lista zapisanych konfiguracji">
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
        </div>
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
              <button type="button" className={styles.savedDialogDeleteAction} onClick={() => { if (confirmDeleteSavedConfiguration(savedConfigurationDialog.saved.id)) closeSavedConfigurationDialog(); }}>Usuń zestaw</button>
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
                return <article key={part.id} className={`${styles.product} ${isSelected ? styles.productSelected : ""}`}><span className={styles.productIcon}>{categoryIcons[part.category]}</span><div className={styles.productInfo}><span className={styles.maker}>{part.manufacturer || componentCategoryLabels[part.category]}</span><strong>{part.name}</strong><p>{part.description || [part.socket && `Socket ${part.socket}`, part.memoryType].filter(Boolean).join(" · ") || "Szczegóły produktu nie są dostępne"}</p></div><div className={styles.productBuy}>{Number.isFinite(part.price) ? <strong>{money(part.price)}</strong> : <strong className={styles.unknownPrice}>Brak ceny</strong>}<button type="button" onClick={() => choosePart(part)}>{isSelected ? "Wybrano ✓" : activePart ? "Zamień" : "Wybierz"}</button></div></article>;
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
          <button type="button" className={styles.saveWide} onClick={() => saveDraft()}>Zapisz zestaw <span>↗</span></button>
        </aside>
      </section>
      <p className={styles.footnote}>Ceny i dostępność pochodzą z katalogu bazy danych. Model komputera jest wizualizacją poglądową.</p>
    </div>
  );
}
