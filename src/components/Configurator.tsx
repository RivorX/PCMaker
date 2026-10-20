"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getCompatibilityChecks, type CompatibilityState } from "@/lib/compatibility";

const categoryOptions = Object.entries(componentCategoryLabels) as [ComponentCategory, string][];

const blankComponent = (): ManualComponent => ({
  id: createComponentId(),
  category: "cpu",
  name: "",
  socket: "",
  memoryType: "",
  note: "",
});

function CheckIcon({ state }: { state: CompatibilityState }) {
  return <span className={`check-symbol ${state}`} aria-hidden="true">{state === "compatible" ? "✓" : state === "warning" ? "!" : "?"}</span>;
}

export default function Configurator() {
  const [draft, setDraft] = useState<ConfigurationDraft>(emptyConfigurationDraft);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [componentForm, setComponentForm] = useState<ManualComponent>(blankComponent);

  useEffect(() => {
    const stored = readConfigurationDraft();
    if (stored) setDraft(stored);
    setHydrated(true);
  }, []);

  const checks = useMemo(() => getCompatibilityChecks(draft.components), [draft.components]);
  const readiness = checks.length > 0 && checks.every((check) => check.state === "compatible") ? "sprawdzone reguły zgodne" : "wymaga sprawdzenia";

  const updateDraft = (update: Partial<ConfigurationDraft>) => {
    setDraft((current) => ({ ...current, ...update, updatedAt: new Date().toISOString() }));
    setSavedAt(null);
    setSaveError(null);
  };

  const persistDraft = () => {
    const next = { ...draft, updatedAt: new Date().toISOString() };
    setDraft(next);
    if (!hydrated) return;
    if (saveConfigurationDraft(next)) {
      setSavedAt(next.updatedAt);
      setSaveError(null);
    } else {
      setSavedAt(null);
      setSaveError("Nie udało się zapisać draftu. Sprawdź, czy przeglądarka nie blokuje localStorage.");
    }
  };

  const submitComponent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!componentForm.name.trim()) return;
    const normalized = { ...componentForm, name: componentForm.name.trim(), socket: componentForm.socket.trim(), memoryType: componentForm.memoryType.trim(), note: componentForm.note.trim() };
    updateDraft({ components: editingId ? draft.components.map((item) => item.id === editingId ? normalized : item) : [...draft.components, normalized] });
    setComponentForm(blankComponent());
    setEditingId(null);
    setShowForm(false);
  };

  const editComponent = (component: ManualComponent) => {
    setComponentForm(component);
    setEditingId(component.id);
    setShowForm(true);
    window.setTimeout(() => document.getElementById("component-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const removeComponent = (id: string) => updateDraft({ components: draft.components.filter((item) => item.id !== id) });

  return (
    <div className="page-stack">
      <section className="page-heading split-heading">
        <div><p className="eyebrow">KONFIGURATOR / WERSJA ROBOCZA</p><h1>Zbuduj swój komputer</h1><p className="lede">Zapisz własne propozycje podzespołów i sprawdź podstawowe zależności techniczne.</p></div>
        <div className="draft-actions"><span className="draft-state"><span className="status-dot" /> {hydrated ? "Draft lokalny" : "Ładowanie draftu"}</span><button className="button primary" disabled={!hydrated} onClick={persistDraft} type="button">Zapisz draft</button></div>
      </section>
      {savedAt && <div className="toast" role="status">Draft zapisany lokalnie · {displayDate(savedAt)}</div>}
      {saveError && <div className="toast error" role="alert">{saveError}</div>}
      <div className="workspace-grid">
        <div className="workspace-main">
          <section className="card configuration-card">
            <div className="card-heading"><div><span className="section-kicker">01 / ZESTAW</span>{editingTitle ? <div className="title-edit"><input aria-label="Nazwa konfiguracji" autoFocus maxLength={80} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") setEditingTitle(false); }} /><button className="text-button" type="button" onClick={() => setEditingTitle(false)}>Gotowe</button></div> : <h2>{draft.title}</h2>}</div>{!editingTitle && <button className="text-button" type="button" onClick={() => setEditingTitle(true)}>Zmień nazwę</button>}</div>
            <div className="configuration-summary"><div className="summary-number">{draft.components.length.toString().padStart(2, "0")}</div><div><strong>ręcznie opisanych elementów</strong><span>Nie korzystamy jeszcze z katalogu ani cen sklepów.</span></div><span className={`readiness-badge ${readiness === "sprawdzone reguły zgodne" ? "good" : "neutral"}`}>{readiness}</span></div>
            {draft.components.length === 0 ? <div className="empty-state"><div className="empty-icon">＋</div><strong>Dodaj pierwszy element</strong><p>Wpisz model lub własny opis. Ceny i dostępność pojawią się dopiero po podłączeniu źródła ofert.</p><button className="button secondary" onClick={() => setShowForm(true)} type="button">Dodaj komponent</button></div> : <div className="component-list">{draft.components.map((component) => <article className="component-row" key={component.id}><div className="component-type-icon">{componentCategoryLabels[component.category].slice(0, 2).toUpperCase()}</div><div className="component-content"><div className="component-title"><strong>{component.name}</strong><span>{componentCategoryLabels[component.category]}</span></div><div className="component-meta">{component.socket && <span>Socket <b>{component.socket}</b></span>}{component.memoryType && <span>Pamięć <b>{component.memoryType}</b></span>}{component.note && <span>{component.note}</span>}{!component.socket && !component.memoryType && !component.note && <span className="muted">Brak dodatkowych parametrów</span>}</div></div><div className="component-actions"><button className="icon-button" onClick={() => editComponent(component)} aria-label={`Edytuj ${component.name}`} type="button">✎</button><button className="icon-button danger" onClick={() => removeComponent(component.id)} aria-label={`Usuń ${component.name}`} type="button">×</button></div></article>)}</div>}
          </section>
          {showForm && <section className="card form-card" id="component-form"><div className="card-heading"><div><span className="section-kicker">02 / DANE RĘCZNE</span><h2>{editingId ? "Edytuj element" : "Dodaj komponent"}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); setEditingId(null); setComponentForm(blankComponent()); }} aria-label="Zamknij formularz" type="button">×</button></div><form onSubmit={submitComponent}><div className="form-grid"><label>Rodzaj<select value={componentForm.category} onChange={(event) => setComponentForm({ ...componentForm, category: event.target.value as ComponentCategory })}>{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="wide-field">Nazwa / model<input required maxLength={120} placeholder="np. Ryzen 7 7800X3D" value={componentForm.name} onChange={(event) => setComponentForm({ ...componentForm, name: event.target.value })} /></label><label>Socket <span className="optional">opcjonalnie</span><input maxLength={32} placeholder="np. AM5" value={componentForm.socket} onChange={(event) => setComponentForm({ ...componentForm, socket: event.target.value })} /></label><label>Typ pamięci <span className="optional">opcjonalnie</span><input maxLength={32} placeholder="np. DDR5" value={componentForm.memoryType} onChange={(event) => setComponentForm({ ...componentForm, memoryType: event.target.value })} /></label><label className="wide-field">Notatka <span className="optional">opcjonalnie</span><input maxLength={160} placeholder="np. posiadam już ten element" value={componentForm.note} onChange={(event) => setComponentForm({ ...componentForm, note: event.target.value })} /></label></div><div className="form-footer"><span className="form-hint">Pola techniczne są dobrowolne. Brak danych pokażemy jako „nieznane”.</span><button className="button primary" type="submit">{editingId ? "Zapisz zmiany" : "Dodaj do zestawu"}</button></div></form></section>}
          {!showForm && draft.components.length > 0 && <button className="add-row-button" onClick={() => setShowForm(true)} type="button"><span>＋</span> Dodaj kolejny element</button>}
        </div>
        <aside className="workspace-side"><section className="card check-card"><div className="card-heading"><div><span className="section-kicker">03 / KONTROLA</span><h2>Kompatybilność</h2></div><span className="info-badge">beta</span></div><div className="check-list">{checks.map((check) => <div className="check-row" key={check.title}><CheckIcon state={check.state} /><div><strong>{check.title}</strong><p>{check.detail}</p></div></div>)}</div><div className="check-legend"><span><i className="legend-dot compatible" /> zgodne</span><span><i className="legend-dot warning" /> sprawdź</span><span><i className="legend-dot unknown" /> nieznane</span></div><p className="check-scope">Sprawdzamy tylko socket CPU/płyty i typ DDR. BIOS, moc PSU, format obudowy oraz pozostałe zależności wymagają kolejnych reguł.</p></section><section className="card insight-card"><span className="insight-icon">✦</span><div><strong>Oferty pojawią się później</strong><p>Nie pokazujemy fikcyjnych cen. Po uzyskaniu dostępu do API sklepów połączymy ten draft z aktualnymi ofertami w PLN.</p><a href="/api/v1/integrations">Sprawdź stan integracji <span>↗</span></a></div></section></aside>
      </div>
    </div>
  );
}
