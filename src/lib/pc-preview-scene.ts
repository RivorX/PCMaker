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
import { batchPcPreviewMeshes } from "@/lib/pc-preview-batching";

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

function updateCameraDepthRange(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  margin: number,
  point: THREE.Vector3,
  direction: THREE.Vector3,
  minimumFar = 0,
): void {
  camera.getWorldDirection(direction);
  let nearestDepth = Number.POSITIVE_INFINITY;
  let farthestDepth = Number.NEGATIVE_INFINITY;

  for (let corner = 0; corner < 8; corner += 1) {
    point.set(
      corner & 1 ? bounds.max.x : bounds.min.x,
      corner & 2 ? bounds.max.y : bounds.min.y,
      corner & 4 ? bounds.max.z : bounds.min.z,
    ).sub(camera.position);
    const depth = point.dot(direction);
    nearestDepth = Math.min(nearestDepth, depth);
    farthestDepth = Math.max(farthestDepth, depth);
  }

  const near = Math.max(0.001, nearestDepth - margin);
  const far = Math.max(near + 0.1, farthestDepth + margin, minimumFar);
  if (Math.abs(camera.near - near) < 0.001 && Math.abs(camera.far - far) < 0.01) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

const categories: PcModelCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];
const minZoomMultiplier = 0.62;
const maxZoomMultiplier = 1.35;
const dielectricSurfaceHints = /plastic|rubber|powder.?coat|coated steel|pcb|solder|fr.?4|laminate|label|sticker|cavity|diffuser|fan blades|frosted|paint|nylon/i;
const metalSurfaceHints = /steel|alumin(?:ium|um)|copper|nickel|zinc|brass|gold|plated|metal|contacts?|screws?|heat pipes?|fins?|heatsink|capacitor can/i;
const glassSurfaceHints = /glass|window|tempered|transmissive/i;

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
    const normalizedName = object.name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    pattern.lastIndex = 0;
    if (!match && pattern.test(normalizedName)) match = object;
  });
  return match;
}

function boundsOf(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root);
}

/** Split the one expansion blank aligned with the GPU I/O block out of the case's merged mesh. */
function splitGpuSlotCover(caseGroup: THREE.Group, gpuGroup: THREE.Group): THREE.Mesh | null {
  const cover = findNamedObject(caseGroup, /^Expansion slot covers 1$/i) as THREE.Mesh | null;
  const outputs = findNamedObject(gpuGroup, /^Display output receptacles$/i);
  const position = cover?.geometry.getAttribute("position");
  const index = cover?.geometry.index;
  if (!cover?.parent || !position || !index || !outputs) return null;

  const outputCenterY = boundsOf(outputs).getCenter(new THREE.Vector3()).y;
  const coverIndices: number[] = [];
  const remainingIndices: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const world = cover.matrixWorld;
  // Adjacent blank rows are about 20 mm apart; this window keeps the target
  // row's folded edges while leaving every neighboring row in the case mesh.
  const rowHalfHeight = 0.012;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset)).applyMatrix4(world);
    b.fromBufferAttribute(position, index.getX(offset + 1)).applyMatrix4(world);
    c.fromBufferAttribute(position, index.getX(offset + 2)).applyMatrix4(world);
    const rowAligned = Math.abs((a.y + b.y + c.y) / 3 - outputCenterY) <= rowHalfHeight;
    const destination = rowAligned ? coverIndices : remainingIndices;
    destination.push(index.getX(offset), index.getX(offset + 1), index.getX(offset + 2));
  }
  if (!coverIndices.length || !remainingIndices.length) return null;

  const makeGeometry = (indices: number[]) => {
    const geometry = cover.geometry.clone();
    const values = index.array.slice(0, indices.length);
    indices.forEach((value, index) => { values[index] = value; });
    geometry.setIndex(new THREE.BufferAttribute(values, 1));
    geometry.clearGroups();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  const originalGeometry = cover.geometry;
  cover.geometry = makeGeometry(remainingIndices);
  const row = cover.clone(false);
  row.name = "Expansion slot GPU cover row";
  row.geometry = makeGeometry(coverIndices);
  cover.parent.add(row);
  originalGeometry.dispose();
  return row;
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
    const isGlass = insideGlass || (category === "case" && glassSurfaceHints.test(object.name));
    object.userData.category = category;
    if (isGlass) object.userData.raycastIgnored = true;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (!materialStates.has(material)) {
          const physical = material as THREE.MeshStandardMaterial;
          const hasStandardSurface = physical.isMeshStandardMaterial === true;
          const hasEmissive = physical.emissive instanceof THREE.Color;
          const materialName = `${object.name} ${material.name}`;
          const materialIsGlass = isGlass || (category === "case" && glassSurfaceHints.test(material.name));
          if (materialIsGlass) object.userData.raycastIgnored = true;
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
          if (hasStandardSurface) {
            if (materialIsGlass) {
              physical.metalness = 0;
              physical.roughness = Math.max(physical.roughness, 0.42);
              if ("transmission" in physical) physical.transmission = 0;
            } else if ((category === "motherboard" || category === "gpu") && /pcb|fr.?4|laminate|solder mask/i.test(materialName)) {
              // Board finishes and solder masks are matte; their source roughness
              // values are too low for a studio-lit assembled preview.
              physical.metalness = 0;
              physical.roughness = Math.max(physical.roughness, 0.8);
            } else if ((category === "motherboard" || category === "gpu") && /gold.?plated contacts?/i.test(materialName)) {
              // Keep connector contacts metallic while softening sharp glints.
              physical.metalness = Math.min(physical.metalness, 0.42);
              physical.roughness = Math.max(physical.roughness, 0.4);
            } else if ((category === "motherboard" || category === "gpu") && metalSurfaceHints.test(materialName)) {
              // Brushed backplates and heatsinks should read as metal without
              // reflecting the studio as bright, mirror-like streaks.
              physical.metalness = Math.min(physical.metalness, 0.2);
              physical.roughness = Math.max(physical.roughness, 0.6);
            } else if (category === "motherboard" || category === "gpu") {
              // Connector housings, shrouds, fan parts, and chip packages are
              // mostly molded or coated surfaces rather than polished metal.
              physical.metalness = 0;
              physical.roughness = Math.max(physical.roughness, 0.7);
            } else if (dielectricSurfaceHints.test(materialName)) {
              physical.metalness = 0;
              physical.roughness = Math.max(physical.roughness, 0.62);
            } else if (metalSurfaceHints.test(materialName)) {
              physical.metalness = Math.min(physical.metalness, 0.34);
              physical.roughness = Math.max(physical.roughness, 0.52);
            } else {
              physical.metalness = 0;
              physical.roughness = Math.max(physical.roughness, 0.62);
            }
          }
          const state: ModelMaterialState = {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            emissive: hasEmissive ? physical.emissive.clone() : null,
            emissiveIntensity: hasEmissive ? physical.emissiveIntensity : 0,
            isGlass: materialIsGlass,
          };
          if (materialIsGlass) {
            state.opacity = Math.min(state.opacity, 0.1);
            state.transparent = true;
            state.depthWrite = false;
            if (material.side !== THREE.DoubleSide) {
              material.side = THREE.DoubleSide;
              material.needsUpdate = true;
            }
          }
          materialStates.set(material, state);
        }
      }
    }
    for (const child of object.children) visit(child, isGlass);
  };
  visit(root);
}

async function waitForPreviewVisibility(host: HTMLElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new PcPreviewSceneError("assets");
  if (typeof IntersectionObserver === "undefined") return;

  await new Promise<void>((resolve, reject) => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.target === host && entry.isIntersecting)) finish();
    });
    const abort = () => {
      observer.disconnect();
      reject(new PcPreviewSceneError("assets"));
    };
    const finish = () => {
      observer.disconnect();
      signal.removeEventListener("abort", abort);
      resolve();
    };
    signal.addEventListener("abort", abort, { once: true });
    observer.observe(host);
  });
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
  let intersectionObserver: IntersectionObserver | null = null;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  let roomEnvironment: RoomEnvironment | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let loadedParts: LoadedPcPart[] = [];
  let modelsAttached = false;
  let isDisposed = false;
  let pointerStart: { x: number; y: number; id: number; maxDistance: number } | null = null;
  let animationFrameId: number | null = null;
  let requestRender: () => void = () => {};
  let isInViewport = true;
  let orbitChangePending = false;
  let orbitChangeHandler: (() => void) | null = null;
  let renderingFrame = false;
  let visibilityHandler: (() => void) | null = null;
  const activePointers = new Set<number>();
  const pointerCleanups: Array<() => void> = [];
  let orbitStartHandler: (() => void) | null = null;
  let resizeFitPending = false;
  let resizeLimitsPending = false;
  let viewportWidth = 1;
  let viewportHeight = 1;

  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
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
    await waitForPreviewVisibility(host, options.signal);
    viewportWidth = Math.max(1, host.clientWidth);
    viewportHeight = Math.max(1, host.clientHeight);
    const isMobileQuality = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobileQuality, powerPreference: "high-performance" });
    } catch {
      throw new PcPreviewSceneError("webgl");
    }
    renderer.setPixelRatio(isMobileQuality ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(viewportWidth, viewportHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = !isMobileQuality;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = !isMobileQuality;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const studioFog = new THREE.Fog(0x101c2d, 1, 8);
    scene.fog = studioFog;
    const camera = new THREE.PerspectiveCamera(36, viewportWidth / viewportHeight, 0.001, 120);
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

    scene.add(new THREE.HemisphereLight(0xdce9f6, 0x182230, isMobileQuality ? 1.05 : 1.1));
    const key = new THREE.DirectionalLight(0xf4f6fa, 2);
    key.position.set(3.5, 5.5, 4.5);
    key.castShadow = !isMobileQuality;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.5;
    key.shadow.camera.right = 1.5;
    key.shadow.camera.top = 1.5;
    key.shadow.camera.bottom = -1.5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x83c9c5, isMobileQuality ? 0.4 : 0.48);
    rim.position.set(-3, 2.2, -3.2);
    scene.add(rim);
    const warm = new THREE.PointLight(0xe6b77d, isMobileQuality ? 0.45 : 0.55, 2.5, 2);
    warm.position.set(-0.27, 0.2, 0.42);
    scene.add(warm);

    if (!isMobileQuality) {
      pmrem = new THREE.PMREMGenerator(renderer);
      roomEnvironment = new RoomEnvironment();
      environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
      scene.environment = environmentTarget.texture;
      roomEnvironment.dispose();
      roomEnvironment = null;
    }
    scene.environmentIntensity = isMobileQuality ? 0 : 0.28;

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
    const gpuSlotCoverRow = splitGpuSlotCover(groups.get("case")!, groups.get("gpu")!);
    sceneRoot.updateMatrixWorld(true);
    const hasShadowCasters = [...groups.values()].some((group) => {
      let foundCaster = false;
      group.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.castShadow) foundCaster = true;
      });
      return foundCaster;
    });
    if (isMobileQuality || !hasShadowCasters) {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.needsUpdate = false;
      key.castShadow = false;
      floor.receiveShadow = false;
    }
    const setCategoryBatched = batchPcPreviewMeshes(groups, [
      mechanicalPlan.panel.object,
      ...(gpuSlotCoverRow ? [gpuSlotCoverRow] : []),
    ]);
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

    let gridColumns = setGridTargets(viewportWidth, viewportHeight);
    let gridLayoutDirty = false;
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
    let hoverFrameId: number | null = null;
    const cancelHoverFrame = () => {
      if (hoverFrameId === null) return;
      cancelAnimationFrame(hoverFrameId);
      hoverFrameId = null;
    };
    pointerCleanups.push(cancelHoverFrame);
    const scheduleHover = () => {
      if (hoverFrameId !== null || animationFrameId !== null || renderingFrame || !isInViewport || document.visibilityState === "hidden" || isDisposed) return;
      hoverFrameId = requestAnimationFrame(() => {
        hoverFrameId = null;
        if (isDisposed || !isInViewport || document.visibilityState === "hidden") return;
        if (animationFrameId !== null || renderingFrame) return;
        if (!hoverPending) return;
        hoverPending = false;
        renderer!.domElement.style.cursor = findCategoryAt(hoverX, hoverY) ? "pointer" : "grab";
      });
    };
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
      scheduleHover();
    };
    const onPointerLeave = () => { pointerStart = null; hoverPending = false; cancelHoverFrame(); renderer!.domElement.style.cursor = "grab"; };
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
      const width = viewportWidth = Math.max(1, host.clientWidth);
      const height = viewportHeight = Math.max(1, host.clientHeight);
      renderer!.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const nextGridColumns = setGridTargets(width, height);
      if (nextGridColumns !== gridColumns) gridLayoutDirty = true;
      gridColumns = nextGridColumns;
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
    const cameraClipPoint = new THREE.Vector3();
    const cameraClipDirection = new THREE.Vector3();
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
    const layoutSnapEpsilon = 0.18;
    const layoutEasingRate = 15;
    const autoFramingFollowRate = 9;
    let hasAppliedLayout = false;
    let hasMeasuredWorldBounds = false;
    let labelPositionsInitialized = false;
    let lastAppliedDistance = camera.position.distanceTo(orbit.target);
    let nominalFitDistance = Math.max(lastAppliedDistance, 0.45);
    let zoomMultiplier = 1;
    const autoFrameDirection = initialDirection.clone();
    let frameCallback: FrameRequestCallback = () => {};
    requestRender = () => {
      if (animationFrameId !== null || !isInViewport || document.visibilityState === "hidden" || isDisposed) return;
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
        cancelHoverFrame();
      } else {
        frameTime = performance.now();
        requestRender();
        scheduleHover();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver((entries) => {
        const isVisible = entries.some((entry) => entry.target === host && entry.isIntersecting);
        isInViewport = isVisible;
        if (isVisible) {
          frameTime = performance.now();
          requestRender();
          scheduleHover();
        } else if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
          cancelHoverFrame();
        }
      });
      intersectionObserver.observe(host);
    }
    const activeEmissive = new THREE.Color(0x176d68);
    const desiredEmissive = new THREE.Color();
    const appliedVisibility = new Map<PcModelCategory, boolean>();
    const appliedHighlight = new Map<PcModelCategory, boolean>();
    const applyAppearance = (selected: ComponentCategory[], active: ComponentCategory, fullPreview: boolean) => {
      const selectedSet = new Set(selected);
      let appearanceChanged = false;
      const gpuVisible = fullPreview || selectedSet.has("gpu");
      const slotCoverVisible = !gpuVisible;
      if (gpuSlotCoverRow && gpuSlotCoverRow.visible !== slotCoverVisible) {
        gpuSlotCoverRow.visible = slotCoverVisible;
        gpuSlotCoverRow.userData.raycastIgnored = gpuVisible;
        appearanceChanged = true;
      }
      for (const category of categories) {
        const visible = fullPreview || selectedSet.has(category);
        const highlighted = visible && category === active;
        const visibilityChanged = appliedVisibility.get(category) !== visible;
        const highlightChanged = appliedHighlight.get(category) !== highlighted;
        if (!visibilityChanged && !highlightChanged) continue;

        appearanceChanged = true;
        if (visibilityChanged) setCategoryBatched(category, visible);
        for (const [material, state] of materials.get(category)!) {
          if (visibilityChanged) {
            const opacity = visible ? state.opacity : Math.min(state.opacity, 0.05);
            const transparent = state.transparent || !visible || state.isGlass;
            const depthWrite = state.isGlass ? false : visible ? state.depthWrite : false;
            if (material.opacity !== opacity) material.opacity = opacity;
            if (material.transparent !== transparent) {
              material.transparent = transparent;
              material.needsUpdate = true;
            }
            if (material.depthWrite !== depthWrite) material.depthWrite = depthWrite;
          }
          const standard = material as THREE.MeshStandardMaterial;
          if ((visibilityChanged || highlightChanged) && state.emissive && standard.emissive instanceof THREE.Color) {
            const shouldGlow = highlighted && !state.isGlass;
            desiredEmissive.copy(state.emissive);
            let emissiveIntensity = visible ? state.emissiveIntensity : 0;
            if (shouldGlow) {
              desiredEmissive.lerp(activeEmissive, 0.14);
              emissiveIntensity = Math.max(emissiveIntensity, 0.12);
            }
            if (!standard.emissive.equals(desiredEmissive)) standard.emissive.copy(desiredEmissive);
            if (standard.emissiveIntensity !== emissiveIntensity) standard.emissiveIntensity = emissiveIntensity;
          }
        }
        appliedVisibility.set(category, visible);
        appliedHighlight.set(category, highlighted);
      }
      if (appearanceChanged) requestRender();
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
      applyAppearance,
      dispose,
    };
    frameCallback = (time) => {
      animationFrameId = null;
      if (isDisposed) return;
      renderingFrame = true;
      const cameraChanged = orbitChangePending;
      orbitChangePending = false;
      const delta = Math.min(0.2, Math.max(0.001, (time - frameTime) / 1000));
      frameTime = time;
      const destination = options.layoutTarget();
      const progressGap = destination - currentProgress;
      const previousProgress = currentProgress;
      const easing = 1 - Math.exp(-delta * layoutEasingRate);
      currentProgress = Math.abs(progressGap) <= layoutSnapEpsilon ? destination : currentProgress + progressGap * easing;
      if (currentProgress < 0.02) currentProgress = 0;
      if (currentProgress > 99.98) currentProgress = 100;
      const normalized = currentProgress / 100;
      const gridProgress = smoothStep((normalized - 0.75) / 0.25);
      const layoutPending = Math.abs(destination - currentProgress) > layoutSnapEpsilon;
      const layoutChanged = currentProgress !== previousProgress;
      const width = viewportWidth;
      const screenHeight = viewportHeight;
      const nextGridColumns = width < 760 || width / screenHeight < 1.08 ? 2 : 4;
      if (nextGridColumns !== gridColumns) {
        gridColumns = setGridTargets(width, screenHeight);
        gridLayoutDirty = true;
      }
      const layoutUpdateNeeded = layoutChanged || gridLayoutDirty || !hasAppliedLayout;
      if (layoutUpdateNeeded) {
        hasAppliedLayout = true;
        gridLayoutDirty = false;
        applyPcMechanicalLayout(groups, mechanicalPlan, gridPoses, normalized);
        const floorOpacity = 0.45 * (1 - smoothStep((gridProgress - 0.68) / 0.32));
        floorMaterial.opacity = floorOpacity;
        for (const material of stageGridMaterials) material.opacity = 0.16 * (floorOpacity / 0.45);
        if (!isMobileQuality && !layoutPending) renderer!.shadowMap.needsUpdate = true;
      }

      if (layoutUpdateNeeded || !hasMeasuredWorldBounds) {
        hasMeasuredWorldBounds = true;
        sceneRoot.updateMatrixWorld(true);
        worldBounds.makeEmpty();
        for (const category of categories) {
          const group = groups.get(category)!;
          const bounds = boundsByCategory.get(category)!;
          if (category === "case") bounds.setFromObject(group);
          else bounds.copy(partBounds.copy(geometry.get(category)!.localBounds).applyMatrix4(group.matrixWorld));
          worldBounds.union(bounds);
        }
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
        cameraDirection.lerp(desiredDirection, 1 - Math.exp(-delta * autoFramingFollowRate)).normalize();
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
        lastAppliedDistance = liveDistance;
        runtime.nominalFitDistance = nominalFitDistance;
        runtime.currentDistance = liveDistance;
        runtime.zoomMultiplier = zoomMultiplier;
        runtime.focus.copy(orbit.target);
      }

      updateCameraDepthRange(
        camera,
        worldBounds,
        Math.max(0.003, worldSize.length() * 0.015),
        cameraClipPoint,
        cameraClipDirection,
        camera.position.distanceTo(floor.position) + 15,
      );

      const shouldUpdateLabels = layoutUpdateNeeded || cameraChanged || options.isAutoFraming() || resizeFitPending || !labelPositionsInitialized;
      if (shouldUpdateLabels) {
        const revealLabels = smoothStep(gridProgress / 0.65);
        if (revealLabels < 0.01) {
          if (labelPositionsInitialized) {
            for (const category of categories) {
              const label = options.labelForCategory(category);
              if (!label || label.style.visibility === "hidden") continue;
              label.style.opacity = "0";
              label.style.visibility = "hidden";
            }
          }
          labelPositionsInitialized = true;
        } else {
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
          labelPositionsInitialized = true;
        }
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
