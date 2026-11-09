"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { componentCategoryLabels, type ComponentCategory } from "@/lib/drafts";
import { createPcPreviewScene, PcPreviewSceneError, type PcPreviewRuntime } from "@/lib/pc-preview-scene";
import styles from "./PcPreview.module.css";

export type PcPreviewPart = {
  category: ComponentCategory;
  name: string;
  manufacturer: string;
  source: "catalog" | "own";
};

type PcPreviewProps = {
  selectedParts: PcPreviewPart[];
  activeCategory: ComponentCategory;
  onSelectCategory: (category: ComponentCategory) => void;
  onCategoryThumbnail: (category: Exclude<ComponentCategory, "other">, image: string) => void;
};

type SceneCategory = Exclude<ComponentCategory, "other">;
const categories: SceneCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];
const assembledDirection = () => new THREE.Vector3(4.55, 2.81, 5.2).normalize();
const frontDirection = () => new THREE.Vector3(0, 0.03, 1).normalize();
const smoothStep = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export default function PcPreview({ selectedParts, activeCategory, onSelectCategory, onCategoryThumbnail }: PcPreviewProps) {
  const selectedCategories = useMemo(() => selectedParts.map((part) => part.category), [selectedParts]);
  const selectedByCategory = useMemo(() => new Map(selectedParts.map((part) => [part.category, part])), [selectedParts]);
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PcPreviewRuntime | null>(null);
  const selectedRef = useRef(selectedCategories);
  const activeRef = useRef(activeCategory);
  const callbackRef = useRef(onSelectCategory);
  const thumbnailCallbackRef = useRef(onCategoryThumbnail);
  const layoutTargetRef = useRef(0);
  const autoFramingRef = useRef(true);
  const labelsRef = useRef(new Map<SceneCategory, HTMLDivElement>());
  const fullPreviewRef = useRef(false);
  const manualCameraRef = useRef(false);
  const [layoutProgress, setLayoutProgress] = useState(0);
  const [fullPreview, setFullPreview] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<"webgl" | "assets" | null>(null);

  useEffect(() => { selectedRef.current = selectedCategories; }, [selectedCategories]);
  useEffect(() => { activeRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { callbackRef.current = onSelectCategory; }, [onSelectCategory]);
  useEffect(() => { thumbnailCallbackRef.current = onCategoryThumbnail; }, [onCategoryThumbnail]);
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
      isManualCamera: () => manualCameraRef.current,
      labelForCategory: (category) => labelsRef.current.get(category) ?? null,
      onSelectCategory: (category) => callbackRef.current(category),
      onOrbitStart: () => { manualCameraRef.current = true; autoFramingRef.current = false; },
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

  useEffect(() => {
    if (loadState !== "ready") return;
    const category: SceneCategory = activeCategory === "other" ? "cpu" : activeCategory;
    const render = () => {
      try {
        const image = runtimeRef.current?.getCategoryThumbnail(category);
        if (image) thumbnailCallbackRef.current(category, image);
      } catch {
        // The SVG stays visible if an offscreen thumbnail cannot be rendered.
      }
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleHandle = idleWindow.requestIdleCallback(render, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(idleHandle);
    }
    const timeout = window.setTimeout(render, 300);
    return () => window.clearTimeout(timeout);
  }, [activeCategory, loadState, loadAttempt]);

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
    manualCameraRef.current = true;
    autoFramingRef.current = false;
    const direction = view === "front"
      ? new THREE.Vector3(0.08, 0.08, 1).normalize()
      : view === "side"
        ? new THREE.Vector3(1, 0.12, 0.16).normalize()
        : assembledDirection().lerp(frontDirection(), smoothStep(layoutTargetRef.current / 28)).normalize();
    const distance = view === "reset"
      ? runtime.nominalFitDistance
      : THREE.MathUtils.clamp(runtime.currentDistance, runtime.controls.minDistance, runtime.controls.maxDistance);
    runtime.camera.position.copy(runtime.focus).addScaledVector(direction, distance);
    runtime.controls.target.copy(runtime.focus);
    runtime.controls.update();
    runtime.currentDistance = runtime.camera.position.distanceTo(runtime.controls.target);
    const nextZoom = view === "reset"
      ? 1
      : Math.min(runtime.currentDistance / runtime.nominalFitDistance, 1.35);
    runtime.setZoomMultiplier(nextZoom, view === "reset" ? 0.62 : runtime.controls.minDistance / runtime.nominalFitDistance);
    runtime.zoomMultiplier = nextZoom;
    runtime.invalidate();
  };

  const changeZoom = (direction: 1 | -1) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    manualCameraRef.current = true;
    const minimumZoom = autoFramingRef.current ? 0.62 : runtime.controls.minDistance / runtime.nominalFitDistance;
    const nextZoom = THREE.MathUtils.clamp(runtime.zoomMultiplier * (direction === 1 ? 0.86 : 1.16), minimumZoom, 1.35);
    if (!autoFramingRef.current) {
      const cameraDirection = runtime.camera.position.clone().sub(runtime.controls.target).normalize();
      runtime.currentDistance = THREE.MathUtils.clamp(runtime.nominalFitDistance * nextZoom, runtime.controls.minDistance, runtime.controls.maxDistance);
      runtime.camera.position.copy(runtime.controls.target).addScaledVector(cameraDirection, runtime.currentDistance);
      runtime.controls.update();
      runtime.currentDistance = runtime.camera.position.distanceTo(runtime.controls.target);
      const actualZoom = Math.min(runtime.currentDistance / runtime.nominalFitDistance, 1.35);
      runtime.setZoomMultiplier(actualZoom, minimumZoom);
      runtime.zoomMultiplier = actualZoom;
    } else {
      runtime.setZoomMultiplier(nextZoom);
      runtime.zoomMultiplier = nextZoom;
    }
    runtime.invalidate();
  };

  const errorMessage = loadError === "webgl"
    ? "Ta przeglądarka nie udostępnia WebGL. Włącz akcelerację sprzętową, aby obejrzeć model 3D."
    : "Nie udało się wczytać modelu komputera. Sprawdź połączenie i spróbuj ponownie.";

  return (
    <div className={`${styles.preview} pc-layout-stage`} role="region" aria-label="Interaktywny, trójwymiarowy model komputera">
      <div className={styles.stage}>
        <div ref={mountRef} className={styles.mount} />
        {loadState === "loading" ? <div className={styles.loading} role="status" aria-live="polite"><span className={styles.spinner} />Ładowanie modelu 3D…</div> : null}
        {loadState === "error" ? <div className={styles.webglFallback} role="alert"><span>3D</span><strong>Podgląd 3D jest niedostępny</strong><p>{errorMessage}</p><button type="button" className={styles.retry} onClick={() => setLoadAttempt((value) => value + 1)}>Spróbuj ponownie</button></div> : null}
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
          {categories.map((category) => {
            const part = selectedByCategory.get(category);
            const productName = part?.source === "own"
              ? "Mam własną"
              : part
              ? [part.manufacturer && !part.name.toLocaleLowerCase("pl-PL").startsWith(part.manufacturer.toLocaleLowerCase("pl-PL")) ? part.manufacturer : "", part.name].filter(Boolean).join(" ")
              : "";
            return <div key={category} ref={(element) => { if (element) labelsRef.current.set(category, element); else labelsRef.current.delete(category); }} data-part-label={category} className={`${styles.gridLabel} ${part ? styles.gridLabelSelected : ""}`} title={productName || componentCategoryLabels[category]}>
              <span className={styles.gridLabelCategory}>{componentCategoryLabels[category]}</span>
              {part ? <span className={styles.gridLabelProduct}>{productName}</span> : null}
            </div>;
          })}
        </div>
        <div className={`${styles.interactionHint} ${layoutProgress > 5 ? styles.interactionHintHidden : ""}`}><span className={styles.dragGlyph}>↗</span><span>Przeciągnij, aby obrócić · kółko, aby przybliżyć</span></div>
      </div>
      <div className={styles.layoutFooter}>
        <div className={styles.layoutHeading}><label htmlFor="pc-layout-range">WIDOK ELEMENTÓW</label><output htmlFor="pc-layout-range">{layoutProgress}%</output></div>
        <div className={styles.layoutSliderRow}><span className={styles.layoutEndpoint}>Złożony komputer</span><input id="pc-layout-range" className={styles.layoutRange} type="range" min="0" max="100" value={layoutProgress} onChange={(event) => setLayout(Number(event.currentTarget.value))} aria-label="Rozłożenie elementów komputera" style={{ background: `linear-gradient(90deg, #50cfc2 0%, #50cfc2 ${layoutProgress}%, rgba(196, 215, 226, .2) ${layoutProgress}%, rgba(196, 215, 226, .2) 100%)` }} disabled={loadState !== "ready"} /><span className={styles.layoutEndpoint}>Siatka części</span></div>
      </div>
    </div>
  );
}
