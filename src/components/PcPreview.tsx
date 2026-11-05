"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { componentCategoryLabels, type ComponentCategory } from "@/lib/drafts";
import { createPcPreviewScene, PcPreviewSceneError, type PcPreviewRuntime } from "@/lib/pc-preview-scene";
import styles from "./PcPreview.module.css";

type PcPreviewProps = {
  selectedCategories: ComponentCategory[];
  activeCategory: ComponentCategory;
  onSelectCategory: (category: ComponentCategory) => void;
};

type SceneCategory = Exclude<ComponentCategory, "other">;
const categories: SceneCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];
const assembledDirection = () => new THREE.Vector3(4.55, 2.81, 5.2).normalize();
const frontDirection = () => new THREE.Vector3(0, 0.03, 1).normalize();
const smoothStep = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export default function PcPreview({ selectedCategories, activeCategory, onSelectCategory }: PcPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PcPreviewRuntime | null>(null);
  const selectedRef = useRef(selectedCategories);
  const activeRef = useRef(activeCategory);
  const callbackRef = useRef(onSelectCategory);
  const layoutTargetRef = useRef(0);
  const autoFramingRef = useRef(true);
  const labelsRef = useRef(new Map<SceneCategory, HTMLDivElement>());
  const fullPreviewRef = useRef(false);
  const [layoutProgress, setLayoutProgress] = useState(0);
  const [fullPreview, setFullPreview] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<"webgl" | "assets" | null>(null);

  useEffect(() => { selectedRef.current = selectedCategories; }, [selectedCategories]);
  useEffect(() => { activeRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { callbackRef.current = onSelectCategory; }, [onSelectCategory]);
  useEffect(() => { fullPreviewRef.current = fullPreview; }, [fullPreview]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const abortController = new AbortController();
    const manager = new THREE.LoadingManager();
    let runtime: PcPreviewRuntime | null = null;
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);

    void createPcPreviewScene(host, {
      signal: abortController.signal,
      layoutTarget: () => layoutTargetRef.current,
      isAutoFraming: () => autoFramingRef.current,
      selectedCategories: () => selectedRef.current,
      activeCategory: () => activeRef.current,
      fullPreview: () => fullPreviewRef.current,
      labelForCategory: (category) => labelsRef.current.get(category) ?? null,
      onSelectCategory: (category) => callbackRef.current(category),
      onOrbitStart: () => { autoFramingRef.current = false; },
      onFramingSettled: () => { autoFramingRef.current = false; },
    }, manager).then((created) => {
      if (cancelled || abortController.signal.aborted) {
        created.dispose();
        return;
      }
      runtime = created;
      runtimeRef.current = created;
      created.applyAppearance(selectedRef.current, activeRef.current, fullPreviewRef.current);
      setLoadState("ready");
    }).catch((error: unknown) => {
      if (cancelled || abortController.signal.aborted) return;
      setLoadError(error instanceof PcPreviewSceneError ? error.kind : "assets");
      setLoadState("error");
    });

    return () => {
      cancelled = true;
      abortController.abort();
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [loadAttempt]);

  useEffect(() => {
    runtimeRef.current?.applyAppearance(selectedCategories, activeCategory, fullPreview);
  }, [selectedCategories, activeCategory, fullPreview]);

  const setLayout = (value: number) => {
    const next = THREE.MathUtils.clamp(Math.round(value), 0, 100);
    layoutTargetRef.current = next;
    autoFramingRef.current = true;
    setLayoutProgress(next);
    runtimeRef.current?.invalidate();
  };

  const chooseView = (view: "front" | "side" | "reset") => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    autoFramingRef.current = false;
    const direction = view === "front"
      ? new THREE.Vector3(0.08, 0.08, 1).normalize()
      : view === "side"
        ? new THREE.Vector3(1, 0.12, 0.16).normalize()
        : assembledDirection().lerp(frontDirection(), smoothStep(layoutTargetRef.current / 28)).normalize();
    runtime.camera.position.copy(runtime.focus).addScaledVector(direction, runtime.currentDistance);
    runtime.controls.target.copy(runtime.focus);
    runtime.controls.update();
    runtime.currentDistance = runtime.camera.position.distanceTo(runtime.controls.target);
    if (view === "reset") runtime.zoomMultiplier = 1;
    runtime.invalidate();
  };

  const changeZoom = (direction: 1 | -1) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const nextZoom = THREE.MathUtils.clamp(runtime.zoomMultiplier * (direction === 1 ? 0.86 : 1.16), 0.62, 1.8);
    if (!autoFramingRef.current) {
      const cameraDirection = runtime.camera.position.clone().sub(runtime.controls.target).normalize();
      runtime.currentDistance = THREE.MathUtils.clamp(runtime.currentDistance * (nextZoom / runtime.zoomMultiplier), 0.3, 55);
      runtime.camera.position.copy(runtime.controls.target).addScaledVector(cameraDirection, runtime.currentDistance);
      runtime.controls.update();
    }
    runtime.zoomMultiplier = nextZoom;
    runtime.invalidate();
  };

  const activeSelected = selectedCategories.includes(activeCategory);
  const errorMessage = loadError === "webgl"
    ? "Ta przeglądarka nie udostępnia WebGL. Włącz akcelerację sprzętową, aby obejrzeć model 3D."
    : "Nie udało się wczytać modelu komputera. Sprawdź połączenie i spróbuj ponownie.";

  return (
    <div className={`${styles.preview} pc-layout-stage`} role="region" aria-label="Interaktywny, trójwymiarowy model komputera">
      <div ref={mountRef} className={styles.mount} />
      {loadState === "loading" ? <div className={styles.loading} role="status" aria-live="polite"><span className={styles.spinner} />Ładowanie modelu 3D…</div> : null}
      {loadState === "error" ? <div className={styles.webglFallback} role="alert"><span>3D</span><strong>Podgląd 3D jest niedostępny</strong><p>{errorMessage}</p><button type="button" className={styles.retry} onClick={() => setLoadAttempt((value) => value + 1)}>Spróbuj ponownie</button></div> : null}
      <div className={styles.activeReadout} aria-live="polite" aria-atomic="true">
        <span className={styles.readoutOverline}>AKTYWNY ELEMENT</span>
        <strong>{componentCategoryLabels[activeCategory]}</strong>
        <span className={activeSelected ? styles.readoutChosen : styles.readoutEmpty}>{activeSelected ? "Dodano do zestawu" : "Wybierz model z katalogu"}</span>
      </div>
      <div className={styles.controls} aria-label="Sterowanie widokiem 3D">
        <button type="button" disabled={loadState !== "ready"} onClick={() => chooseView("front")} aria-label="Pokaż komputer od przodu">Przód</button>
        <button type="button" disabled={loadState !== "ready"} onClick={() => chooseView("side")} aria-label="Pokaż komputer z boku">Bok</button>
        <span className={styles.controlDivider} />
        <button type="button" disabled={loadState !== "ready"} className={styles.zoomButton} onClick={() => changeZoom(1)} aria-label="Przybliż">+</button>
        <button type="button" disabled={loadState !== "ready"} className={styles.zoomButton} onClick={() => changeZoom(-1)} aria-label="Oddal">−</button>
        <button type="button" disabled={loadState !== "ready"} onClick={() => chooseView("reset")} aria-label="Przywróć widok">Reset</button>
      </div>
      <button type="button" className={`${styles.previewToggle} ${fullPreview ? styles.previewToggleOn : ""}`} aria-pressed={fullPreview} disabled={loadState !== "ready"} onClick={() => setFullPreview((value) => !value)}>
        {fullPreview ? "Podgląd pełny" : "Pełny podgląd"}
      </button>
      <div className={styles.gridLabels} aria-hidden="true">
        {categories.map((category) => <div key={category} ref={(element) => { if (element) labelsRef.current.set(category, element); else labelsRef.current.delete(category); }} data-part-label={category} className={`${styles.gridLabel} ${selectedCategories.includes(category) ? styles.gridLabelSelected : ""}`}>
          <span>{componentCategoryLabels[category]}</span><span className={styles.gridLabelCheck}>{selectedCategories.includes(category) ? "✓" : "·"}</span>
        </div>)}
      </div>
      <div className={`${styles.interactionHint} ${layoutProgress > 5 ? styles.interactionHintHidden : ""}`}><span className={styles.dragGlyph}>↗</span><span>Przeciągnij, aby obrócić · kółko, aby przybliżyć</span></div>
      <div className={styles.layoutFooter}>
        <div className={styles.layoutHeading}><label htmlFor="pc-layout-range">WIDOK ELEMENTÓW</label><output htmlFor="pc-layout-range">{layoutProgress}%</output></div>
        <div className={styles.layoutSliderRow}><span className={styles.layoutEndpoint}>Złożony komputer</span><input id="pc-layout-range" className={styles.layoutRange} type="range" min="0" max="100" value={layoutProgress} onChange={(event) => setLayout(Number(event.currentTarget.value))} aria-label="Rozłożenie elementów komputera" style={{ background: `linear-gradient(90deg, #50cfc2 0%, #50cfc2 ${layoutProgress}%, rgba(196, 215, 226, .2) ${layoutProgress}%, rgba(196, 215, 226, .2) 100%)` }} disabled={loadState !== "ready"} /><span className={styles.layoutEndpoint}>Siatka części</span></div>
      </div>
    </div>
  );
}
