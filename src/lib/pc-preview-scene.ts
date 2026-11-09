import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ComponentCategory } from "@/lib/drafts";
import {
  disposePcModelRoots,
  loadPcModelParts,
  type LoadedPcPart,
  type PcModelCategory,
} from "@/lib/pc-model-assets";
import {
  applyPcMechanicalLayout,
  preparePcMechanicalLayout,
  type PcMechanicalDiagnostics,
  type PcMechanicalPlan,
  type PcMechanicalPose,
} from "@/lib/pc-mechanical-layout";

export type PcPreviewTransform = PcMechanicalPose;

export type PcPreviewGeometry = {
  localBounds: THREE.Box3;
  localCenter: THREE.Vector3;
  size: THREE.Vector3;
  assembled: PcPreviewTransform;
  grid: PcPreviewTransform;
};

type ModelMaterialState = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: THREE.Color | null;
  emissiveIntensity: number;
  isGlass: boolean;
  thumbnailOpacity: number;
  thumbnailTransparent: boolean;
  thumbnailDepthWrite: boolean;
  thumbnailSide: THREE.Side;
  thumbnailColor: THREE.Color | null;
  thumbnailEmissive: THREE.Color | null;
  thumbnailEmissiveIntensity: number;
};

export type PcPreviewRuntime = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  groups: Map<PcModelCategory, THREE.Group>;
  materials: Map<PcModelCategory, Map<THREE.Material, ModelMaterialState>>;
  geometry: Map<PcModelCategory, PcPreviewGeometry>;
  mechanicalDiagnostics: PcMechanicalDiagnostics;
  scene: THREE.Scene;
  focus: THREE.Vector3;
  nominalFitDistance: number;
  currentDistance: number;
  zoomMultiplier: number;
  setZoomMultiplier: (value: number, minimum?: number) => void;
  invalidate: () => void;
  getCategoryThumbnail: (category: ComponentCategory) => string | null;
  applyAppearance: (selected: ComponentCategory[], active: ComponentCategory, fullPreview: boolean) => void;
  dispose: () => void;
};

export type PcPreviewSceneOptions = {
  signal: AbortSignal;
  layoutTarget: () => number;
  isAutoFraming: () => boolean;
  selectedCategories: () => ComponentCategory[];
  activeCategory: () => ComponentCategory;
  fullPreview: () => boolean;
  isManualCamera: () => boolean;
  labelForCategory: (category: PcModelCategory) => HTMLDivElement | null;
  onSelectCategory: (category: ComponentCategory) => void;
  onOrbitStart: () => void;
  onFramingSettled: () => void;
};

export class PcPreviewSceneError extends Error {
  constructor(readonly kind: "webgl" | "assets") {
    super(kind);
    this.name = "PcPreviewSceneError";
  }
}

const categories: PcModelCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];
const minZoomMultiplier = 0.62;
const maxZoomMultiplier = 1.35;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

function disposeSceneResources(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<{ close?: () => void }>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
        else if (Array.isArray(value)) for (const entry of value) if (entry instanceof THREE.Texture) textures.add(entry);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    const image = texture.source.data as { close?: () => void } | undefined;
    if (image?.close) bitmaps.add(image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close?.();
}

function findNamedObject(root: THREE.Object3D, pattern: RegExp): THREE.Object3D | null {
  let match: THREE.Object3D | null = null;
  root.traverse((object) => {
    if (!match && pattern.test(object.name)) match = object;
  });
  return match;
}

function boundsOf(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root);
}

function centeredAsset(part: LoadedPcPart, rotation: THREE.Quaternion, unitScale: number): THREE.Box3 {
  part.root.position.set(0, 0, 0);
  part.root.quaternion.copy(rotation);
  part.root.scale.set(unitScale, part.category === "gpu" ? -unitScale : unitScale, unitScale);
  part.root.updateMatrixWorld(true);
  const bounds = boundsOf(part.root);
  part.root.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
  part.root.updateMatrixWorld(true);
  return boundsOf(part.root);
}

function markMaterials(
  root: THREE.Object3D,
  category: PcModelCategory,
  materialStates: Map<THREE.Material, ModelMaterialState>,
): void {
  const visit = (object: THREE.Object3D, insideGlass = false) => {
    const isGlass = insideGlass || (category === "case" && /glass|window|tempered/i.test(object.name));
    object.userData.category = category;
    if (isGlass) object.userData.raycastIgnored = true;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (!materialStates.has(material)) {
          const physical = material as THREE.MeshStandardMaterial;
          const hasEmissive = physical.emissive instanceof THREE.Color;
          const thumbnailOpacity = material.opacity;
          const thumbnailTransparent = material.transparent;
          const thumbnailDepthWrite = material.depthWrite;
          const thumbnailSide = material.side;
          const thumbnailColor = physical.color instanceof THREE.Color ? physical.color.clone() : null;
          const thumbnailEmissive = hasEmissive ? physical.emissive.clone() : null;
          const thumbnailEmissiveIntensity = hasEmissive ? physical.emissiveIntensity : 0;
          if (category === "memory" && /ram-stick_body/i.test(object.name) && physical.color instanceof THREE.Color) {
            physical.color.multiply(new THREE.Color(0.5, 0.57, 0.6));
          }
          if (category === "memory" && /light.bar.rgb/i.test(object.name) && physical.color instanceof THREE.Color) {
            physical.color.lerp(new THREE.Color(0x47bdb2), 0.72);
            if (hasEmissive) {
              physical.emissive.lerp(new THREE.Color(0x198981), 0.7);
              physical.emissiveIntensity = Math.max(physical.emissiveIntensity, 0.3);
            }
          }
          const state: ModelMaterialState = {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            emissive: hasEmissive ? physical.emissive.clone() : null,
            emissiveIntensity: hasEmissive ? physical.emissiveIntensity : 0,
            isGlass,
            thumbnailOpacity,
            thumbnailTransparent,
            thumbnailDepthWrite,
            thumbnailSide,
            thumbnailColor,
            thumbnailEmissive,
            thumbnailEmissiveIntensity,
          };
          if (isGlass) {
            state.opacity = Math.min(state.opacity, 0.16);
            state.transparent = true;
            state.depthWrite = false;
            material.side = THREE.DoubleSide;
          }
          materialStates.set(material, state);
        }
      }
    }
    for (const child of object.children) visit(child, isGlass);
  };
  visit(root);
}

export async function createPcPreviewScene(
  host: HTMLElement,
  options: PcPreviewSceneOptions,
  manager: THREE.LoadingManager,
): Promise<PcPreviewRuntime> {
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  let scene: THREE.Scene | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  let roomEnvironment: RoomEnvironment | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let loadedParts: LoadedPcPart[] = [];
  let modelsAttached = false;
  let isDisposed = false;
  let pointerStart: { x: number; y: number; id: number; maxDistance: number } | null = null;
  let animationFrameId: number | null = null;
  let requestRender: () => void = () => {};
  let orbitChangePending = false;
  let orbitChangeHandler: (() => void) | null = null;
  let renderingFrame = false;
  let visibilityHandler: (() => void) | null = null;
  const activePointers = new Set<number>();
  const pointerCleanups: Array<() => void> = [];
  let orbitStartHandler: (() => void) | null = null;
  let resizeFitPending = false;
  let resizeLimitsPending = false;

  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    resizeObserver?.disconnect();
    if (controls && orbitStartHandler) controls.removeEventListener("start", orbitStartHandler);
    if (controls && orbitChangeHandler) controls.removeEventListener("change", orbitChangeHandler);
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    for (const remove of pointerCleanups) remove();
    controls?.dispose();
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    if (scene) disposeSceneResources(scene);
    if (!modelsAttached) disposePcModelRoots(loadedParts.map((part) => part.root));
    environmentTarget?.dispose();
    pmrem?.dispose();
    roomEnvironment?.dispose();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  };

  try {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      throw new PcPreviewSceneError("webgl");
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const studioFog = new THREE.Fog(0x101c2d, 1, 8);
    scene.fog = studioFog;
    const camera = new THREE.PerspectiveCamera(36, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), 0.001, 120);
    const assembledDirection = new THREE.Vector3(4.55, 2.81, 5.2).normalize();
    camera.position.copy(assembledDirection).multiplyScalar(1.8);
    const orbit = new OrbitControls(camera, renderer.domElement);
    controls = orbit;
    orbit.target.set(0, 0, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.055;
    orbit.screenSpacePanning = false;
    orbit.enablePan = true;
    const initialDistance = camera.position.distanceTo(orbit.target);
    orbit.minDistance = 0.3;
    orbit.maxDistance = initialDistance * maxZoomMultiplier;
    orbit.minPolarAngle = 0.14;
    orbit.maxPolarAngle = Math.PI - 0.14;
    orbit.update();
    orbit.saveState();
    orbitStartHandler = () => { options.onOrbitStart(); requestRender(); };
    orbit.addEventListener("start", orbitStartHandler);

    scene.add(new THREE.HemisphereLight(0xdce9f6, 0x182230, 1.2));
    const key = new THREE.DirectionalLight(0xf4f6fa, 2.4);
    key.position.set(3.5, 5.5, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.5;
    key.shadow.camera.right = 1.5;
    key.shadow.camera.top = 1.5;
    key.shadow.camera.bottom = -1.5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x83c9c5, 0.9);
    rim.position.set(-3, 2.2, -3.2);
    scene.add(rim);
    const warm = new THREE.PointLight(0xe6b77d, 1.2, 2.5, 2);
    warm.position.set(-0.27, 0.2, 0.42);
    scene.add(warm);

    pmrem = new THREE.PMREMGenerator(renderer);
    roomEnvironment = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.72;
    roomEnvironment.dispose();
    roomEnvironment = null;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0d1723, metalness: 0.18, roughness: 0.68, transparent: true, opacity: 0.45 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.27;
    floor.receiveShadow = true;
    scene.add(floor);
    const stageGrid = new THREE.GridHelper(6, 48, 0x214356, 0x172a3b);
    stageGrid.position.y = -0.268;
    const stageGridMaterials = Array.isArray(stageGrid.material) ? stageGrid.material : [stageGrid.material];
    for (const material of stageGridMaterials) {
      material.transparent = true;
      material.opacity = 0.16;
      material.depthWrite = false;
    }
    scene.add(stageGrid);

    const sceneRoot = new THREE.Group();
    scene.add(sceneRoot);
    const groups = new Map<PcModelCategory, THREE.Group>();
    const materials = new Map<PcModelCategory, Map<THREE.Material, ModelMaterialState>>();
    for (const category of categories) {
      const group = new THREE.Group();
      group.name = `${category}-part`;
      group.userData.category = category;
      sceneRoot.add(group);
      groups.set(category, group);
      materials.set(category, new Map());
    }

    loadedParts = await loadPcModelParts(manager);
    if (options.signal.aborted) throw new PcPreviewSceneError("assets");

    const loadedByCategory = new Map(loadedParts.map((part) => [part.category, part]));
    const rotations = new Map<PcModelCategory, THREE.Quaternion>();
    const around = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
    rotations.set("case", around(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    rotations.set("motherboard", around(new THREE.Vector3(0, 0, 1), Math.PI / 2).multiply(around(new THREE.Vector3(1, 0, 0), Math.PI / 2)));
    rotations.set("cpu", rotations.get("motherboard")!.clone());
    rotations.set("memory", around(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    // Mirror only local Y: fans face down while the card body exits toward the +Z glass side.
    rotations.set("gpu", new THREE.Quaternion());
    rotations.set("storage", rotations.get("motherboard")!.clone());
    // Keep the PSU upright; orient its inlet toward the rear of the case.
    rotations.set("psu", around(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
    rotations.set("cooling", rotations.get("motherboard")!.clone());

    const casePart = loadedByCategory.get("case")!;
    casePart.root.quaternion.copy(rotations.get("case")!);
    casePart.root.scale.setScalar(1);
    casePart.root.updateMatrixWorld(true);
    const caseSourceBounds = boundsOf(casePart.root);
    const unitScale = 0.492 / Math.max(caseSourceBounds.getSize(new THREE.Vector3()).y, 0.001);

    const localBoundsByCategory = new Map<PcModelCategory, THREE.Box3>();
    for (const part of loadedParts) {
      const group = groups.get(part.category)!;
      const bounds = centeredAsset(part, rotations.get(part.category)!, unitScale);
      group.add(part.root);
      localBoundsByCategory.set(part.category, bounds.clone());
      markMaterials(part.root, part.category, materials.get(part.category)!);
    }
    modelsAttached = true;

    const memoryGroup = groups.get("memory")!;
    const secondMemory = loadedByCategory.get("memory")!.root.clone(true);
    secondMemory.name = "memory-stick-secondary";
    memoryGroup.add(secondMemory);
    const mechanicalPlan: PcMechanicalPlan = preparePcMechanicalLayout(groups, localBoundsByCategory);
    sceneRoot.updateMatrixWorld(true);
    const geometry = new Map<PcModelCategory, PcPreviewGeometry>();
    const gridPoses = new Map<PcModelCategory, PcMechanicalPose>();
    for (const category of categories) {
      const group = groups.get(category)!;
      const worldBounds = boundsOf(group);
      const inverse = group.matrixWorld.clone().invert();
      const localBounds = new THREE.Box3().makeEmpty();
      for (const x of [worldBounds.min.x, worldBounds.max.x]) {
        for (const y of [worldBounds.min.y, worldBounds.max.y]) {
          for (const z of [worldBounds.min.z, worldBounds.max.z]) localBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
        }
      }
      const assembled = mechanicalPlan.assembled.get(category)!;
      const localCenter = localBounds.getCenter(new THREE.Vector3());
      const size = localBounds.getSize(new THREE.Vector3());
      const grid: PcMechanicalPose = { position: assembled.position.clone(), rotation: assembled.rotation.clone(), scale: assembled.scale.clone() };
      gridPoses.set(category, grid);
      geometry.set(category, {
        localBounds,
        localCenter,
        size,
        assembled,
        grid,
      });
    }

    const setGridTargets = (width: number, height: number) => {
      const aspect = width / Math.max(1, height);
      const columns = width < 760 || aspect < 1.08 ? 2 : 4;
      const rows = Math.ceil(categories.length / columns);
      const cellWidth = columns === 4 ? 2.12 : 2.08;
      const cellHeight = columns === 4 ? 1.62 : 1.5;
      const gapX = columns === 4 ? 0.34 : 0.34;
      const gapY = columns === 4 ? 0.44 : 0.38;
      const inspectionRotations = new Map<PcModelCategory, THREE.Quaternion>([
        ["memory", around(new THREE.Vector3(0, 1, 0), Math.PI / 2)],
        ["gpu", around(new THREE.Vector3(1, 0, 0), -Math.PI / 2)],
        ["psu", around(new THREE.Vector3(1, 0, 0), Math.PI / 2)],
        ["cooling", around(new THREE.Vector3(0, 1, 0), -Math.PI / 2)],
      ]);
      categories.forEach((category, index) => {
        const part = geometry.get(category)!;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const center = new THREE.Vector3((column - (columns - 1) / 2) * (cellWidth + gapX), ((rows - 1) / 2 - row) * (cellHeight + gapY), 0);
        const inspectionRotation = inspectionRotations.get(category) ?? new THREE.Quaternion();
        const gridRotation = inspectionRotation.multiply(part.assembled.rotation);
        const gridBounds = part.localBounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(gridRotation));
        const gridSize = gridBounds.getSize(new THREE.Vector3());
        const scale = Math.min(30, (cellWidth - 0.26) / Math.max(gridSize.x, 0.01), (cellHeight - 0.22) / Math.max(gridSize.y, 0.01));
        const scaledCenter = part.localCenter.clone().multiplyScalar(scale).applyQuaternion(gridRotation);
        part.grid.position.copy(center).sub(scaledCenter);
        part.grid.rotation.copy(gridRotation);
        part.grid.scale.copy(part.assembled.scale).multiplyScalar(scale);
      });
      return columns;
    };

    let gridColumns = setGridTargets(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.01 };
    const pointer = new THREE.Vector2();
    const raycastRoots = [...groups.values()];
    const findCategoryAt = (clientX: number, clientY: number) => {
      const rect = renderer!.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(raycastRoots, true);
      return hits.find((hit) => {
        let current: THREE.Object3D | null = hit.object;
        while (current && current !== sceneRoot) {
          if (current.userData.raycastIgnored) return false;
          current = current.parent;
        }
        return !!hit.object.userData.category;
      })?.object.userData.category as ComponentCategory | undefined;
    };
    let hoverPending = false;
    let hoverX = 0;
    let hoverY = 0;
    const onPointerDown = (event: PointerEvent) => {
      activePointers.add(event.pointerId);
      if (!event.isPrimary || activePointers.size > 1) { pointerStart = null; return; }
      if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, maxDistance: 0 };
    };
    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      const start = pointerStart;
      pointerStart = null;
      if (!start || start.id !== event.pointerId || activePointers.size > 0 || !event.isPrimary) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (Math.max(start.maxDistance, distance) < 7) {
        const category = findCategoryAt(event.clientX, event.clientY);
        if (category) options.onSelectCategory(category);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerStart && pointerStart.id === event.pointerId) {
        pointerStart.maxDistance = Math.max(pointerStart.maxDistance, Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y));
        return;
      }
      hoverX = event.clientX;
      hoverY = event.clientY;
      hoverPending = true;
      requestRender();
    };
    const onPointerLeave = () => { pointerStart = null; hoverPending = false; renderer!.domElement.style.cursor = "grab"; };
    const onPointerCancel = (event: PointerEvent) => { activePointers.delete(event.pointerId); pointerStart = null; };
    const addPointerHandler = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      renderer!.domElement.addEventListener(type, handler as EventListener);
      pointerCleanups.push(() => renderer!.domElement.removeEventListener(type, handler as EventListener));
    };
    addPointerHandler("pointerdown", onPointerDown);
    addPointerHandler("pointerup", onPointerUp);
    addPointerHandler("pointermove", onPointerMove);
    addPointerHandler("pointerleave", onPointerLeave);
    addPointerHandler("pointercancel", onPointerCancel);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer!.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      gridColumns = setGridTargets(width, height);
      if (options.isManualCamera()) {
        resizeLimitsPending = true;
        resizeFitPending = false;
      } else {
        resizeFitPending = true;
        resizeLimitsPending = false;
      }
      requestRender();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const cameraDirection = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const frontDirection = new THREE.Vector3(0, 0.03, 1).normalize();
    const initialDirection = new THREE.Vector3(4.55, 2.81, 5.2).normalize();
    const focus = new THREE.Vector3();
    const fitPoint = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const worldBounds = new THREE.Box3();
    const partBounds = new THREE.Box3();
    const worldSize = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    const desiredDirection = new THREE.Vector3();
    const framingFocus = new THREE.Vector3();
    const previousCameraPosition = new THREE.Vector3();
    const previousOrbitTarget = new THREE.Vector3();
    const boundsByCategory = new Map<PcModelCategory, THREE.Box3>(categories.map((category) => [category, new THREE.Box3()]));
    const cameraHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const measureFitDistance = (direction: THREE.Vector3, width: number, screenHeight: number, normalized: number) => {
      worldBounds.getCenter(focus);
      worldBounds.getSize(worldSize);
      cameraRight.crossVectors(worldUp, direction).normalize();
      cameraUp.crossVectors(direction, cameraRight).normalize();
      const halfVerticalFov = Math.atan(Math.tan(cameraHalfFov) / camera.zoom);
      const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
      const inGrid = normalized >= 0.48;
      const maxLabelWidth = inGrid ? Math.max(0, ...categories.map((category) => options.labelForCategory(category)?.getBoundingClientRect().width ?? 0)) : 0;
      const maxLabelHeight = inGrid ? Math.max(0, ...categories.map((category) => options.labelForCategory(category)?.getBoundingClientRect().height ?? 0)) : 0;
      const safeTop = inGrid ? 102 : 68;
      const safeBottom = inGrid ? 18 + maxLabelHeight * 0.58 : 22;
      const safeVerticalFraction = Math.max(0.34, (screenHeight - safeTop - safeBottom) / screenHeight);
      const safeHorizontalFraction = Math.max(0.44, (width - (inGrid ? maxLabelWidth + 30 : 28)) / width);
      const tanHalfHorizontal = Math.tan(halfHorizontalFov) * safeHorizontalFraction;
      const tanHalfVertical = Math.tan(halfVerticalFov) * safeVerticalFraction;
      const verticalOffsetRatio = Math.tan(halfVerticalFov) * (safeTop - safeBottom) / screenHeight;
      let fitDistance = 0.45;
      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
        fitPoint.set(
          cornerIndex & 1 ? worldBounds.max.x : worldBounds.min.x,
          cornerIndex & 2 ? worldBounds.max.y : worldBounds.min.y,
          cornerIndex & 4 ? worldBounds.max.z : worldBounds.min.z,
        ).sub(focus);
        const depth = fitPoint.dot(direction);
        const horizontal = Math.abs(fitPoint.dot(cameraRight));
        const vertical = fitPoint.dot(cameraUp);
        fitDistance = Math.max(
          fitDistance,
          depth + 0.05,
          depth + horizontal / Math.max(tanHalfHorizontal, 0.001),
          (vertical + tanHalfVertical * depth) / Math.max(tanHalfVertical + verticalOffsetRatio, 0.001),
          (-vertical + tanHalfVertical * depth) / Math.max(tanHalfVertical - verticalOffsetRatio, 0.001),
        );
      }
      return {
        fitDistance: Math.max(fitDistance, worldSize.length() * 0.5) * 1.08,
        halfVerticalFov,
        safeTop,
        safeBottom,
      };
    };
    let frameTime = performance.now();
    let currentProgress = 0;
    let lastAppliedDistance = camera.position.distanceTo(orbit.target);
    let nominalFitDistance = Math.max(lastAppliedDistance, 0.45);
    let zoomMultiplier = 1;
    const autoFrameDirection = initialDirection.clone();
    let frameCallback: FrameRequestCallback = () => {};
    requestRender = () => {
      if (animationFrameId !== null || document.visibilityState === "hidden" || isDisposed) return;
      animationFrameId = requestAnimationFrame(frameCallback);
    };
    orbitChangeHandler = () => {
      orbitChangePending = true;
      if (!renderingFrame) requestRender();
    };
    orbit.addEventListener("change", orbitChangeHandler);
    visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      } else requestRender();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    const activeEmissive = new THREE.Color(0x176d68);
    const applyAppearance = (selected: ComponentCategory[], active: ComponentCategory, fullPreview: boolean) => {
      for (const category of categories) {
        const visible = fullPreview || selected.includes(category);
        for (const [material, state] of materials.get(category)!) {
          material.opacity = visible ? state.opacity : Math.min(state.opacity, 0.05);
          material.transparent = state.transparent || !visible || state.isGlass;
          material.depthWrite = state.isGlass ? false : visible ? state.depthWrite : false;
          const standard = material as THREE.MeshStandardMaterial;
          if (state.emissive && standard.emissive instanceof THREE.Color) {
            standard.emissive.copy(state.emissive);
            standard.emissiveIntensity = state.emissiveIntensity;
            if (category === active && visible && !state.isGlass) {
              standard.emissive.lerp(activeEmissive, 0.14);
              standard.emissiveIntensity = Math.max(standard.emissiveIntensity, 0.12);
            }
          }
          material.needsUpdate = true;
        }
      }
      renderer!.shadowMap.needsUpdate = true;
      requestRender();
    };
    const thumbnailCache = new Map<PcModelCategory, string>();
    const getCategoryThumbnail = (requestedCategory: ComponentCategory): string | null => {
      const category = requestedCategory === "other" ? "cpu" : requestedCategory;
      if (!categories.includes(category)) return null;
      const cached = thumbnailCache.get(category);
      if (cached) return cached;
      const source = groups.get(category);
      const assembled = mechanicalPlan.assembled.get(category);
      if (!source || !assembled) return null;

      const thumbnailWidth = 512;
      const thumbnailHeight = 384;
      const thumbnailScene = new THREE.Scene();
      thumbnailScene.environment = scene!.environment;
      thumbnailScene.environmentIntensity = scene!.environmentIntensity;
      const thumbnailModel = source.clone(true);
      thumbnailModel.position.copy(assembled.position);
      thumbnailModel.quaternion.copy(assembled.rotation);
      thumbnailModel.scale.copy(assembled.scale);
      const materialClones = new Map<THREE.Material, THREE.Material>();
      thumbnailModel.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const cloneMaterial = (material: THREE.Material) => {
          let clone = materialClones.get(material);
          if (!clone) {
            clone = material.clone();
            const state = materials.get(category)?.get(material);
            if (state) {
              clone.opacity = state.thumbnailOpacity;
              clone.transparent = state.thumbnailTransparent;
              clone.depthWrite = state.thumbnailDepthWrite;
              clone.side = state.thumbnailSide;
              const physical = clone as THREE.MeshStandardMaterial;
              if (state.thumbnailColor && physical.color instanceof THREE.Color) physical.color.copy(state.thumbnailColor);
              if (state.thumbnailEmissive && physical.emissive instanceof THREE.Color) physical.emissive.copy(state.thumbnailEmissive);
              if (physical.emissive instanceof THREE.Color) physical.emissiveIntensity = state.thumbnailEmissiveIntensity;
            }
            materialClones.set(material, clone);
          }
          return clone;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });

      if (category === "case") {
        const clonedPanel = thumbnailModel.getObjectByName(mechanicalPlan.panel.object.name);
        if (clonedPanel) {
          clonedPanel.position.copy(mechanicalPlan.panel.closed.position);
          clonedPanel.quaternion.copy(mechanicalPlan.panel.closed.rotation);
          clonedPanel.scale.copy(mechanicalPlan.panel.closed.scale);
        }
      }
      thumbnailScene.add(thumbnailModel);
      scene!.children.forEach((child) => {
        if (!(child as THREE.Light).isLight) return;
        const light = child.clone() as THREE.Light;
        light.castShadow = false;
        thumbnailScene.add(light);
      });

      thumbnailModel.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(thumbnailModel);
      const center = bounds.getCenter(new THREE.Vector3());
      thumbnailModel.position.sub(center);
      bounds.translate(center.negate());
      thumbnailModel.updateMatrixWorld(true);

      const camera = new THREE.PerspectiveCamera(32, thumbnailWidth / thumbnailHeight, 0.001, 100);
      const viewDirection = category === "gpu"
        ? new THREE.Vector3(4.2, -3.1, 5.1).normalize()
        : category === "case"
          ? new THREE.Vector3(4.5, 2.8, 5.2).normalize()
          : new THREE.Vector3(4.1, 3.0, 5.1).normalize();
      const cameraRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewDirection).normalize();
      const cameraUp = new THREE.Vector3().crossVectors(viewDirection, cameraRight).normalize();
      const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const tanVertical = Math.tan(halfVertical) * 0.88;
      const tanHorizontal = tanVertical * camera.aspect;
      let distance = 0.01;
      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
        const corner = new THREE.Vector3(
          cornerIndex & 1 ? bounds.max.x : bounds.min.x,
          cornerIndex & 2 ? bounds.max.y : bounds.min.y,
          cornerIndex & 4 ? bounds.max.z : bounds.min.z,
        );
        const depth = corner.dot(viewDirection);
        distance = Math.max(
          distance,
          depth + Math.abs(corner.dot(cameraRight)) / tanHorizontal,
          depth + Math.abs(corner.dot(cameraUp)) / tanVertical,
          depth + 0.01,
        );
      }
      distance *= 1.04;
      camera.position.copy(viewDirection).multiplyScalar(distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      const target = new THREE.WebGLRenderTarget(thumbnailWidth, thumbnailHeight, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      target.texture.generateMipmaps = false;
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      const previousTarget = renderer!.getRenderTarget();
      const previousViewport = renderer!.getViewport(new THREE.Vector4());
      const previousScissor = renderer!.getScissor(new THREE.Vector4());
      const previousScissorTest = renderer!.getScissorTest();
      const previousClearColor = renderer!.getClearColor(new THREE.Color()).clone();
      const previousClearAlpha = renderer!.getClearAlpha();
      const previousAutoClear = renderer!.autoClear;
      const previousToneMapping = renderer!.toneMapping;
      const previousToneMappingExposure = renderer!.toneMappingExposure;
      const previousShadowEnabled = renderer!.shadowMap.enabled;
      const previousShadowAutoUpdate = renderer!.shadowMap.autoUpdate;
      const previousShadowNeedsUpdate = renderer!.shadowMap.needsUpdate;

      try {
        renderer!.shadowMap.enabled = false;
        renderer!.shadowMap.autoUpdate = false;
        renderer!.setRenderTarget(target);
        renderer!.setViewport(0, 0, thumbnailWidth, thumbnailHeight);
        renderer!.setScissorTest(false);
        renderer!.autoClear = true;
        renderer!.setClearColor(0x000000, 0);
        renderer!.clear(true, true, true);
        renderer!.render(thumbnailScene, camera);
        const pixels = new Uint8Array(thumbnailWidth * thumbnailHeight * 4);
        renderer!.readRenderTargetPixels(target, 0, 0, thumbnailWidth, thumbnailHeight, pixels);
        const canvas = document.createElement("canvas");
        canvas.width = thumbnailWidth;
        canvas.height = thumbnailHeight;
        const context = canvas.getContext("2d");
        if (!context) return null;
        const image = context.createImageData(thumbnailWidth, thumbnailHeight);
        for (let y = 0; y < thumbnailHeight; y += 1) {
          const sourceStart = (thumbnailHeight - 1 - y) * thumbnailWidth * 4;
          image.data.set(pixels.subarray(sourceStart, sourceStart + thumbnailWidth * 4), y * thumbnailWidth * 4);
        }
        context.putImageData(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        thumbnailCache.set(category, dataUrl);
        return dataUrl;
      } finally {
        renderer!.setRenderTarget(previousTarget);
        renderer!.setViewport(previousViewport);
        renderer!.setScissor(previousScissor);
        renderer!.setScissorTest(previousScissorTest);
        renderer!.setClearColor(previousClearColor, previousClearAlpha);
        renderer!.autoClear = previousAutoClear;
        renderer!.toneMapping = previousToneMapping;
        renderer!.toneMappingExposure = previousToneMappingExposure;
        renderer!.shadowMap.enabled = previousShadowEnabled;
        renderer!.shadowMap.autoUpdate = previousShadowAutoUpdate;
        renderer!.shadowMap.needsUpdate = previousShadowNeedsUpdate;
        target.dispose();
        materialClones.forEach((material) => material.dispose());
        thumbnailModel.removeFromParent();
      }
    };
    const runtime: PcPreviewRuntime = {
      renderer,
      camera,
      controls: orbit,
      groups,
      materials,
      geometry,
      mechanicalDiagnostics: mechanicalPlan.diagnostics,
      scene,
      focus: new THREE.Vector3(),
      nominalFitDistance,
      currentDistance: lastAppliedDistance,
      zoomMultiplier,
      setZoomMultiplier: (value, minimum = minZoomMultiplier) => { zoomMultiplier = THREE.MathUtils.clamp(value, minimum, maxZoomMultiplier); },
      invalidate: requestRender,
      getCategoryThumbnail,
      applyAppearance,
      dispose,
    };
    frameCallback = (time) => {
      animationFrameId = null;
      if (isDisposed) return;
      renderingFrame = true;
      orbitChangePending = false;
      const delta = Math.min(0.06, Math.max(0.001, (time - frameTime) / 1000));
      frameTime = time;
      const destination = options.layoutTarget();
      const progressGap = destination - currentProgress;
      const previousProgress = currentProgress;
      const easing = 1 - Math.exp(-delta * 8.5);
      currentProgress = Math.abs(progressGap) < 0.05 ? destination : currentProgress + progressGap * easing;
      if (currentProgress < 0.02) currentProgress = 0;
      if (currentProgress > 99.98) currentProgress = 100;
      const normalized = currentProgress / 100;
      const gridProgress = smoothStep((normalized - 0.75) / 0.25);
      const layoutPending = Math.abs(destination - currentProgress) >= 0.05;
      const layoutChanged = currentProgress !== previousProgress;
      const floorOpacity = 0.45 * (1 - smoothStep((gridProgress - 0.68) / 0.32));
      floorMaterial.opacity = floorOpacity;
      for (const material of stageGridMaterials) material.opacity = 0.16 * (floorOpacity / 0.45);

      const width = Math.max(1, host.clientWidth);
      const screenHeight = Math.max(1, host.clientHeight);
      if ((width < 760 || width / screenHeight < 1.08 ? 2 : 4) !== gridColumns) gridColumns = setGridTargets(width, screenHeight);
      applyPcMechanicalLayout(groups, mechanicalPlan, gridPoses, normalized);
      if (layoutChanged) renderer!.shadowMap.needsUpdate = true;

      sceneRoot.updateMatrixWorld(true);
      worldBounds.makeEmpty();
      for (const category of categories) {
        const group = groups.get(category)!;
        const bounds = boundsByCategory.get(category)!;
        if (category === "case") bounds.setFromObject(group);
        else bounds.copy(partBounds.copy(geometry.get(category)!.localBounds).applyMatrix4(group.matrixWorld));
        worldBounds.union(bounds);
      }

      orbit.update();
      let liveDistance = camera.position.distanceTo(orbit.target);
      if (resizeLimitsPending && options.isManualCamera()) {
        cameraDirection.copy(camera.position).sub(orbit.target).normalize();
        nominalFitDistance = Math.max(measureFitDistance(cameraDirection, width, screenHeight, normalized).fitDistance, 0.45);
        orbit.maxDistance = nominalFitDistance * maxZoomMultiplier;
        const boundedDistance = THREE.MathUtils.clamp(liveDistance, orbit.minDistance, orbit.maxDistance);
        if (Math.abs(boundedDistance - liveDistance) > 0.001) {
          camera.position.copy(orbit.target).addScaledVector(cameraDirection, boundedDistance);
          orbit.update();
          liveDistance = camera.position.distanceTo(orbit.target);
        }
        zoomMultiplier = Math.min(liveDistance / nominalFitDistance, maxZoomMultiplier);
        resizeLimitsPending = false;
      }
      if (lastAppliedDistance > 0 && Math.abs(liveDistance - lastAppliedDistance) > Math.max(0.04, lastAppliedDistance * 0.006)) {
        zoomMultiplier = Math.min(liveDistance / nominalFitDistance, maxZoomMultiplier);
      }

      if (options.isAutoFraming() || resizeFitPending) {
        worldBounds.getCenter(focus);
        worldBounds.getSize(worldSize);
        desiredDirection.copy(initialDirection).lerp(frontDirection, smoothStep(normalized / 0.28)).normalize();
        cameraDirection.copy(camera.position).sub(orbit.target).normalize();
        cameraDirection.lerp(desiredDirection, 1 - Math.exp(-delta * 5.5)).normalize();
        const { fitDistance, halfVerticalFov, safeTop, safeBottom } = measureFitDistance(cameraDirection, width, screenHeight, normalized);
        nominalFitDistance = Math.max(fitDistance, 0.45);
        zoomMultiplier = THREE.MathUtils.clamp(zoomMultiplier, minZoomMultiplier, maxZoomMultiplier);
        orbit.minDistance = 0.3;
        orbit.maxDistance = nominalFitDistance * maxZoomMultiplier;
        const fittedDistance = nominalFitDistance * zoomMultiplier;
        studioFog.near = fittedDistance + worldSize.length() * 0.62;
        studioFog.far = studioFog.near + worldSize.length() * 1.4;
        floor.position.y = worldBounds.min.y - 0.018;
        stageGrid.position.y = worldBounds.min.y - 0.016;
        const verticalWorldSpan = 2 * fittedDistance * Math.tan(halfVerticalFov);
        const safeCenterOffset = (safeTop - safeBottom) / 2;
        framingFocus.copy(focus).addScaledVector(cameraUp, safeCenterOffset * verticalWorldSpan / screenHeight);
        camera.position.copy(framingFocus).addScaledVector(cameraDirection, fittedDistance);
        orbit.target.copy(framingFocus);
        orbit.update();
        camera.updateMatrixWorld(true);
        lastAppliedDistance = camera.position.distanceTo(orbit.target);
        zoomMultiplier = THREE.MathUtils.clamp(lastAppliedDistance / nominalFitDistance, minZoomMultiplier, maxZoomMultiplier);
        runtime.focus.copy(framingFocus);
        runtime.nominalFitDistance = nominalFitDistance;
        runtime.currentDistance = lastAppliedDistance;
        runtime.zoomMultiplier = zoomMultiplier;
        if (Math.abs(currentProgress - destination) < 0.1 && cameraDirection.distanceTo(desiredDirection) < 0.012) {
          options.onFramingSettled();
          resizeFitPending = false;
        }
      } else {
        camera.updateMatrixWorld(true);
        lastAppliedDistance = liveDistance;
        runtime.nominalFitDistance = nominalFitDistance;
        runtime.currentDistance = liveDistance;
        runtime.zoomMultiplier = zoomMultiplier;
        runtime.focus.copy(orbit.target);
      }

      const revealLabels = smoothStep(gridProgress / 0.65);
      const labelAnchors = categories.map((category) => {
        const bounds = boundsByCategory.get(category);
        if (!bounds) return { x: width / 2, y: screenHeight / 2 };
        bounds.getCenter(anchor);
        anchor.y = bounds.min.y - Math.max(0.012, worldSize.y * 0.008);
        anchor.project(camera);
        return { x: ((anchor.x + 1) / 2) * width, y: ((1 - anchor.y) / 2) * screenHeight };
      });
      for (const [index, category] of categories.entries()) {
        const label = options.labelForCategory(category);
        if (!label) continue;
        if (revealLabels < 0.01) {
          label.style.opacity = "0";
          label.style.visibility = "hidden";
          continue;
        }
        const column = index % gridColumns;
        const neighborIndex = column > 0 ? index - 1 : index + 1;
        const neighborGap = Math.abs(labelAnchors[index].x - (labelAnchors[neighborIndex]?.x ?? labelAnchors[index].x));
        const labelWidth = Math.max(56, Math.min(176, neighborGap - 10));
        label.style.width = `${labelWidth}px`;
        label.style.minWidth = "0";
        const halfLabel = Math.min(labelWidth / 2, width / 2 - 5);
        const left = THREE.MathUtils.clamp(labelAnchors[index].x, halfLabel + 4, width - halfLabel - 4);
        label.style.left = `${left}px`;
        label.style.top = `${labelAnchors[index].y}px`;
        label.style.opacity = String(revealLabels);
        label.style.visibility = "visible";
      }
      if (hoverPending) {
        hoverPending = false;
        renderer!.domElement.style.cursor = findCategoryAt(hoverX, hoverY) ? "pointer" : "grab";
      }
      renderer!.render(scene!, camera);
      const cameraStillAutoFraming = (options.isAutoFraming() || resizeFitPending)
        && (layoutPending || cameraDirection.distanceToSquared(desiredDirection) > 0.00008);
      const shouldContinue = layoutPending || cameraStillAutoFraming || orbitChangePending;
      renderingFrame = false;
      if (shouldContinue) requestRender();
    };
    applyAppearance(options.selectedCategories(), options.activeCategory(), options.fullPreview());
    if (options.signal.aborted) throw new PcPreviewSceneError("assets");
    requestRender();

    return runtime;
  } catch (error) {
    dispose();
    if (error instanceof PcPreviewSceneError) throw error;
    throw new PcPreviewSceneError(loadedParts.length ? "assets" : "webgl");
  }
}
