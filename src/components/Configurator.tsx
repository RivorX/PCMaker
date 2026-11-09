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
  saveConfigurationDraft,
  type ComponentCategory,
  type ConfigurationDraft,
  type ManualComponent,
} from "@/lib/drafts";
import { getCompatibilityChecks } from "@/lib/compatibility";
import styles from "./Configurator.module.css";

const categories: ComponentCategory[] = ["cpu", "motherboard", "memory", "gpu", "storage", "psu", "case", "cooling"];
const categoryIcons: Record<ComponentCategory, string> = {
  cpu: "CPU", motherboard: "MB", memory: "RAM", gpu: "GPU", storage: "SSD", psu: "PSU", case: "CASE", cooling: "FAN", other: "PC",
};
type ConfigurableCategory = Exclude<ComponentCategory, "other">;
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

export default function Configurator() {
  const [draft, setDraft] = useState<ConfigurationDraft>(emptyConfigurationDraft);
  const [catalog, setCatalog] = useState<CatalogComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ComponentCategory>("cpu");
  const [categoryThumbnails, setCategoryThumbnails] = useState<Partial<Record<ConfigurableCategory, string>>>({});
  const categoryThumbnailsRef = useRef<Partial<Record<ConfigurableCategory, string>>>({});
  const [search, setSearch] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

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
    const saved = readConfigurationDraft();
    if (saved) setDraft(saved);
    void loadCatalog();
  }, [loadCatalog]);

  const selected = useMemo(() => new Map(draft.components.map((part) => [part.category, part])), [draft.components]);
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
    setSavedAt(null);
    setSaveError(false);
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

  const saveDraft = () => {
    const next = { ...draft, updatedAt: new Date().toISOString() };
    setDraft(next);
    if (saveConfigurationDraft(next)) {
      setSavedAt(next.updatedAt);
      setSaveError(false);
    } else {
      setSaveError(true);
      setSavedAt(null);
    }
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
        <div className={styles.saveBox}><span><i className={styles.liveDot} />{savedAt ? `Zapisano ${displayDate(savedAt)}` : "Twój zestaw"}</span><button type="button" onClick={saveDraft}>Zapisz zestaw <b>↗</b></button></div>
      </header>
      {saveError && <p className={styles.saveError} role="alert">Nie udało się zapisać zestawu w tej przeglądarce.</p>}

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
          <button type="button" className={styles.saveWide} onClick={saveDraft}>Zapisz zestaw <span>↗</span></button>
          {savedAt && <p className={styles.savedInfo}>Zestaw zapisany lokalnie · {displayDate(savedAt)}</p>}
        </aside>
      </section>
      <p className={styles.footnote}>Ceny i dostępność pochodzą z katalogu bazy danych. Model komputera jest wizualizacją poglądową.</p>
    </div>
  );
}
