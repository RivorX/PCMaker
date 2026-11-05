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

export type PcPreviewTransform = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
};

export type PcPreviewGeometry = {
  localBounds: THREE.Box3;
  localCenter: THREE.Vector3;
  size: THREE.Vector3;
  assembled: PcPreviewTransform;
  exploded: PcPreviewTransform;
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
  scene: THREE.Scene;
  focus: THREE.Vector3;
  currentDistance: number;
  zoomMultiplier: number;
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

const explodedCenters: Record<PcModelCategory, [number, number, number]> = {
  case: [-0.414, 0, 0], motherboard: [0.065, 0, -0.268], cpu: [-0.191, 0.310, 0.080], memory: [0.029, 0.322, -0.029],
  gpu: [0.413, -0.102, 0.073], storage: [-0.225, -0.283, 0.044], psu: [0.094, -0.322, -0.073], cooling: [0.302, 0.276, 0.090],
};

const explodedAngles: Record<PcModelCategory, [number, number, number]> = {
  case: [0, -0.12, 0], motherboard: [0.05, 0.14, 0], cpu: [0.13, -0.28, 0.06], memory: [0.08, 0.24, -0.04],
  gpu: [-0.08, -0.16, 0], storage: [0.12, 0.1, -0.12], psu: [0.04, 0.22, 0.04], cooling: [-0.12, 0.18, 0],
};

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
  part.root.scale.setScalar(unitScale);
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

function findBounds(root: THREE.Object3D, pattern: RegExp): THREE.Box3 | null {
  const object = findNamedObject(root, pattern);
  return object ? boundsOf(object) : null;
}

function transformedLocalBounds(group: THREE.Group, sourceBounds: THREE.Box3): THREE.Box3 {
  group.updateWorldMatrix(true, false);
  return sourceBounds.clone().applyMatrix4(group.matrixWorld);
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
  const activePointers = new Set<number>();
  const pointerCleanups: Array<() => void> = [];
  let orbitStartHandler: (() => void) | null = null;

  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    resizeObserver?.disconnect();
    if (controls && orbitStartHandler) controls.removeEventListener("start", orbitStartHandler);
    for (const remove of pointerCleanups) remove();
    controls?.dispose();
    renderer?.setAnimationLoop(null);
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
    orbit.minDistance = 0.3;
    orbit.maxDistance = 60;
    orbit.minPolarAngle = 0.14;
    orbit.maxPolarAngle = Math.PI - 0.14;
    orbit.update();
    orbit.saveState();
    orbitStartHandler = options.onOrbitStart;
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
    // The card's fans point down; yaw the rear bracket toward the case cutouts
    // while keeping its gold fingers aimed toward the motherboard.
    rotations.set("gpu", around(new THREE.Vector3(0, 1, 0), Math.PI).multiply(around(new THREE.Vector3(1, 0, 0), Math.PI)));
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

    sceneRoot.updateMatrixWorld(true);
    const caseRoot = groups.get("case")!;
    const caseBounds = boundsOf(caseRoot);
    const caseTrayBounds = findBounds(caseRoot, /motherboard tray/i);
    const motherboardBounds = localBoundsByCategory.get("motherboard")!;
    const boardCenter = caseTrayBounds?.getCenter(new THREE.Vector3()) ?? caseBounds.getCenter(new THREE.Vector3());
    boardCenter.z = (caseTrayBounds?.max.z ?? caseBounds.min.z + 0.025) + motherboardBounds.getSize(new THREE.Vector3()).z / 2 + 0.002;
    const rearIoPorts = findBounds(groups.get("motherboard")!, /audio jacks|lan jack/i);
    if (rearIoPorts) boardCenter.x += caseBounds.min.x + 0.013 - rearIoPorts.getCenter(new THREE.Vector3()).x;
    groups.get("motherboard")!.position.copy(boardCenter);
    sceneRoot.updateMatrixWorld(true);

    const motherboardRoot = groups.get("motherboard")!;
    const socketBounds = findBounds(motherboardRoot, /cpu socket|socket housing|load plate/i);
    const cpuBounds = localBoundsByCategory.get("cpu")!;
    const cpuCenter = socketBounds?.getCenter(new THREE.Vector3()) ?? boardCenter.clone().add(new THREE.Vector3(-0.02, 0.06, 0.02));
    cpuCenter.z = (socketBounds?.max.z ?? boardCenter.z + motherboardBounds.getSize(new THREE.Vector3()).z / 2) + cpuBounds.getSize(new THREE.Vector3()).z / 2 + 0.001;
    groups.get("cpu")!.position.copy(cpuCenter);

    const dimmA2 = findBounds(motherboardRoot, /dimm\s*a2/i);
    const dimmB2 = findBounds(motherboardRoot, /dimm\s*b2/i);
    const memorySlots = [dimmA2, dimmB2].filter((bounds): bounds is THREE.Box3 => !!bounds);
    const fallbackSlots = [
      cpuCenter.clone().add(new THREE.Vector3(0.06, 0, 0)),
      cpuCenter.clone().add(new THREE.Vector3(0.09, 0, 0)),
    ];
    const slotCenters = memorySlots.length >= 2
      ? memorySlots.map((bounds) => bounds.getCenter(new THREE.Vector3()).setZ(bounds.max.z + 0.006))
      : fallbackSlots;
    const memoryGroup = groups.get("memory")!;
    const memoryAsset = loadedByCategory.get("memory")!.root;
    const memoryCenter = slotCenters[0].clone().add(slotCenters[1]).multiplyScalar(0.5);
    memoryGroup.position.copy(memoryCenter);
    memoryAsset.position.copy(slotCenters[0]).sub(memoryCenter);
    const secondMemory = memoryAsset.clone(true);
    secondMemory.name = "memory-stick-secondary";
    secondMemory.position.copy(slotCenters[1]).sub(memoryCenter);
    memoryGroup.add(secondMemory);

    const pcieSlotBounds = findBounds(motherboardRoot, /pcie\s*x16\s*slot\s*1/i)
      ?? findBounds(motherboardRoot, /pcie.*x16/i);
    const gpuRoot = loadedByCategory.get("gpu")!.root;
    const gpuConnectorBounds = findBounds(gpuRoot, /gold.?finger|gold.?contact|pcie.?contact/i);
    const gpuCenter = pcieSlotBounds?.getCenter(new THREE.Vector3()) ?? boardCenter.clone().add(new THREE.Vector3(-0.06, -0.08, 0.03));
    if (gpuConnectorBounds && pcieSlotBounds) groups.get("gpu")!.position.copy(gpuCenter).sub(gpuConnectorBounds.getCenter(new THREE.Vector3()));
    else groups.get("gpu")!.position.copy(gpuCenter);

    const storageSlotBounds = findBounds(motherboardRoot, /m\.?2.*slot|m\.?2 connector/i);
    const storageGroup = groups.get("storage")!;
    if (storageSlotBounds) {
      const slotSize = storageSlotBounds.getSize(new THREE.Vector3());
      if (slotSize.y > slotSize.x) loadedByCategory.get("storage")!.root.quaternion.premultiply(around(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      storageGroup.position.copy(storageSlotBounds.getCenter(new THREE.Vector3()));
      const contacts = findBounds(loadedByCategory.get("storage")!.root, /gold.?finger|gold.?contact/i);
      if (contacts) storageGroup.position.sub(contacts.getCenter(new THREE.Vector3()));
    } else {
      storageGroup.position.copy(cpuCenter).add(new THREE.Vector3(0.08, -0.08, 0));
    }

    const psuBounds = localBoundsByCategory.get("psu")!;
    groups.get("psu")!.position.set(
      caseBounds.min.x + psuBounds.getSize(new THREE.Vector3()).x / 2 + 0.012,
      caseBounds.min.y + psuBounds.getSize(new THREE.Vector3()).y / 2 + 0.006,
      caseBounds.getCenter(new THREE.Vector3()).z,
    );

    const coolerBounds = localBoundsByCategory.get("cooling")!;
    const cpuTop = groups.get("cpu")!.position.z + cpuBounds.max.z;
    groups.get("cooling")!.position.set(cpuCenter.x, cpuCenter.y, cpuTop - coolerBounds.min.z + 0.002);

    sceneRoot.updateMatrixWorld(true);
    const geometry = new Map<PcModelCategory, PcPreviewGeometry>();
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
      const assembled: PcPreviewTransform = {
        position: group.position.clone(),
        rotation: group.quaternion.clone(),
        scale: group.scale.clone(),
      };
      const localCenter = localBounds.getCenter(new THREE.Vector3());
      const size = localBounds.getSize(new THREE.Vector3());
      const explodedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...explodedAngles[category]));
      const explodedCenter = new THREE.Vector3(...explodedCenters[category]);
      const explodedOffset = localCenter.clone().multiply(assembled.scale).applyQuaternion(explodedRotation);
      const exploded: PcPreviewTransform = {
        position: explodedCenter.sub(explodedOffset),
        rotation: explodedRotation,
        scale: assembled.scale.clone(),
      };
      geometry.set(category, {
        localBounds,
        localCenter,
        size,
        assembled,
        exploded,
        grid: { position: assembled.position.clone(), rotation: assembled.rotation.clone(), scale: assembled.scale.clone() },
      });
    }

    const setGridTargets = (width: number) => {
      const columns = width < 760 ? 2 : 4;
      const rows = Math.ceil(categories.length / columns);
      const cellWidth = columns === 4 ? 2.3 : 2.28;
      const cellHeight = columns === 4 ? 1.8 : 1.75;
      const gapX = columns === 4 ? 0.48 : 0.38;
      const gapY = columns === 4 ? 0.5 : 0.55;
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
        const scale = Math.min(30, (cellWidth - 0.28) / Math.max(gridSize.x, 0.01), (cellHeight - 0.24) / Math.max(gridSize.y, 0.01));
        const scaledCenter = part.localCenter.clone().multiplyScalar(scale).applyQuaternion(gridRotation);
        part.grid.position.copy(center).sub(scaledCenter);
        part.grid.rotation.copy(gridRotation);
        part.grid.scale.copy(part.assembled.scale).multiplyScalar(scale);
      });
      return columns;
    };

    let gridColumns = setGridTargets(Math.max(1, host.clientWidth));
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.01 };
    const pointer = new THREE.Vector2();
    const findCategory = (event: PointerEvent) => {
      const rect = renderer!.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...groups.values()], true);
      return hits.find((hit) => {
        let current: THREE.Object3D | null = hit.object;
        while (current && current !== sceneRoot) {
          if (current.userData.raycastIgnored) return false;
          current = current.parent;
        }
        return !!hit.object.userData.category;
      })?.object.userData.category as ComponentCategory | undefined;
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
        const category = findCategory(event);
        if (category) options.onSelectCategory(category);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerStart && pointerStart.id === event.pointerId) {
        pointerStart.maxDistance = Math.max(pointerStart.maxDistance, Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y));
        return;
      }
      renderer!.domElement.style.cursor = findCategory(event) ? "pointer" : "grab";
    };
    const onPointerLeave = () => { pointerStart = null; renderer!.domElement.style.cursor = "grab"; };
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
      gridColumns = setGridTargets(width);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const cameraDirection = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const frontDirection = new THREE.Vector3(0, 0.03, 1).normalize();
    const initialDirection = new THREE.Vector3(4.55, 2.81, 5.2).normalize();
    const focus = new THREE.Vector3();
    const worldBounds = new THREE.Box3();
    const partBounds = new THREE.Box3();
    const worldSize = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    const cameraHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    let frameTime = performance.now();
    let currentProgress = 0;
    let lastAppliedDistance = camera.position.distanceTo(orbit.target);
    let zoomMultiplier = 1;
    const autoFrameDirection = initialDirection.clone();
    const applyTransform = (group: THREE.Group, from: PcPreviewTransform, to: PcPreviewTransform, amount: number) => {
      group.position.lerpVectors(from.position, to.position, amount);
      group.quaternion.slerpQuaternions(from.rotation, to.rotation, amount);
      group.scale.lerpVectors(from.scale, to.scale, amount);
    };

    const applyAppearance = (selected: ComponentCategory[], active: ComponentCategory, fullPreview: boolean) => {
      for (const category of categories) {
        const visible = fullPreview || selected.includes(category);
        for (const [material, state] of materials.get(category)!) {
          material.opacity = state.isGlass ? state.opacity : state.opacity * (visible ? 1 : 0.1);
          material.transparent = state.transparent || !visible || state.isGlass;
          material.depthWrite = state.isGlass ? false : visible ? state.depthWrite : false;
          const standard = material as THREE.MeshStandardMaterial;
          if (state.emissive && standard.emissive instanceof THREE.Color) {
            standard.emissive.copy(state.emissive);
            standard.emissiveIntensity = state.emissiveIntensity;
            if (category === active && visible && !state.isGlass) {
              standard.emissive.lerp(new THREE.Color(0x176d68), 0.14);
              standard.emissiveIntensity = Math.max(standard.emissiveIntensity, 0.12);
            }
          }
          material.needsUpdate = true;
        }
      }
    };
    const runtime: PcPreviewRuntime = {
      renderer,
      camera,
      controls: orbit,
      groups,
      materials,
      geometry,
      scene,
      focus: new THREE.Vector3(),
      currentDistance: lastAppliedDistance,
      zoomMultiplier,
      applyAppearance,
      dispose,
    };
    applyAppearance(options.selectedCategories(), options.activeCategory(), options.fullPreview());

    renderer.setAnimationLoop((time) => {
      const delta = Math.min(0.06, Math.max(0.001, (time - frameTime) / 1000));
      frameTime = time;
      const destination = options.layoutTarget();
      const progressGap = destination - currentProgress;
      const easing = 1 - Math.exp(-delta * 8.5);
      currentProgress = Math.abs(progressGap) < 0.05 ? destination : currentProgress + progressGap * easing;
      if (currentProgress < 0.02) currentProgress = 0;
      if (currentProgress > 99.98) currentProgress = 100;
      const normalized = currentProgress / 100;
      const explodedProgress = smoothStep(normalized / 0.66);
      const gridProgress = smoothStep((normalized - 0.66) / 0.34);
      const floorOpacity = 0.45 * (1 - smoothStep((gridProgress - 0.68) / 0.32));
      floorMaterial.opacity = floorOpacity;
      for (const material of stageGridMaterials) material.opacity = 0.16 * (floorOpacity / 0.45);

      const width = Math.max(1, host.clientWidth);
      if ((width < 760 ? 2 : 4) !== gridColumns) gridColumns = setGridTargets(width);
      for (const category of categories) {
        const group = groups.get(category)!;
        const part = geometry.get(category)!;
        applyTransform(group, normalized <= 0.66 ? part.assembled : part.exploded, normalized <= 0.66 ? part.exploded : part.grid, normalized <= 0.66 ? explodedProgress : gridProgress);
      }

      sceneRoot.updateMatrixWorld(true);
      worldBounds.makeEmpty();
      const boundsByCategory = new Map<PcModelCategory, THREE.Box3>();
      for (const category of categories) {
        const group = groups.get(category)!;
        const bounds = partBounds.copy(geometry.get(category)!.localBounds).applyMatrix4(group.matrixWorld).clone();
        boundsByCategory.set(category, bounds);
        worldBounds.union(bounds);
      }

      orbit.update();
      const liveDistance = camera.position.distanceTo(orbit.target);
      if (lastAppliedDistance > 0 && Math.abs(liveDistance - lastAppliedDistance) > Math.max(0.04, lastAppliedDistance * 0.006)) {
        zoomMultiplier = THREE.MathUtils.clamp(zoomMultiplier * (liveDistance / lastAppliedDistance), 0.62, 1.8);
      }

      if (options.isAutoFraming()) {
        worldBounds.getCenter(focus);
        worldBounds.getSize(worldSize);
        const desiredDirection = initialDirection.clone().lerp(frontDirection, smoothStep(normalized / 0.28)).normalize();
        cameraDirection.copy(camera.position).sub(orbit.target).normalize();
        cameraDirection.lerp(desiredDirection, 1 - Math.exp(-delta * 5.5)).normalize();
        cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        const projectedWidth = Math.abs(cameraRight.x) * worldSize.x + Math.abs(cameraRight.y) * worldSize.y + Math.abs(cameraRight.z) * worldSize.z;
        const projectedHeight = Math.abs(cameraUp.x) * worldSize.x + Math.abs(cameraUp.y) * worldSize.y + Math.abs(cameraUp.z) * worldSize.z;
        const halfVerticalFov = Math.atan(Math.tan(cameraHalfFov) / camera.zoom);
        const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
        const screenHeight = Math.max(1, host.clientHeight);
        const inGrid = normalized >= 0.66;
        const safeTop = inGrid ? 124 : 46;
        const safeBottom = inGrid ? 115 : 112;
        const safeVerticalFraction = Math.max(0.42, (screenHeight - safeTop - safeBottom) / screenHeight);
        const safeHorizontalFraction = Math.max(0.65, (width - 36) / width);
        const fitDistance = Math.max(
          projectedWidth / (2 * Math.tan(halfHorizontalFov) * safeHorizontalFraction),
          projectedHeight / (2 * Math.tan(halfVerticalFov) * safeVerticalFraction),
          worldSize.z * 0.75,
          0.45,
        ) * 1.14;
        const fittedDistance = THREE.MathUtils.clamp(fitDistance * zoomMultiplier, 0.45, 55);
        studioFog.near = fittedDistance + worldSize.length() * 0.62;
        studioFog.far = studioFog.near + worldSize.length() * 1.4;
        floor.position.y = worldBounds.min.y - 0.018;
        stageGrid.position.y = worldBounds.min.y - 0.016;
        const verticalWorldSpan = 2 * fittedDistance * Math.tan(halfVerticalFov);
        const safeCenterOffset = (safeTop - safeBottom) / 2;
        const framingFocus = focus.clone().addScaledVector(cameraUp, safeCenterOffset * verticalWorldSpan / screenHeight);
        camera.position.copy(framingFocus).addScaledVector(cameraDirection, fittedDistance);
        orbit.target.copy(framingFocus);
        orbit.update();
        camera.updateMatrixWorld(true);
        lastAppliedDistance = camera.position.distanceTo(orbit.target);
        runtime.focus.copy(framingFocus);
        runtime.currentDistance = lastAppliedDistance;
        runtime.zoomMultiplier = zoomMultiplier;
        if (Math.abs(currentProgress - destination) < 0.1 && cameraDirection.distanceTo(desiredDirection) < 0.012) options.onFramingSettled();
      } else {
        camera.updateMatrixWorld(true);
        lastAppliedDistance = liveDistance;
        runtime.currentDistance = liveDistance;
        runtime.zoomMultiplier = zoomMultiplier;
        runtime.focus.copy(orbit.target);
      }

      const revealLabels = smoothStep(gridProgress / 0.65);
      for (const category of categories) {
        const label = options.labelForCategory(category);
        const bounds = boundsByCategory.get(category);
        if (!label || !bounds) continue;
        if (revealLabels < 0.01) {
          label.style.opacity = "0";
          label.style.visibility = "hidden";
          continue;
        }
        bounds.getCenter(anchor);
        anchor.y = bounds.min.y - Math.max(0.012, worldSize.y * 0.008);
        anchor.project(camera);
        label.style.left = `${((anchor.x + 1) / 2) * width}px`;
        label.style.top = `${((1 - anchor.y) / 2) * Math.max(1, host.clientHeight)}px`;
        label.style.opacity = String(revealLabels);
        label.style.visibility = "visible";
      }
      renderer!.render(scene!, camera);
    });

    return runtime;
  } catch (error) {
    dispose();
    if (error instanceof PcPreviewSceneError) throw error;
    throw new PcPreviewSceneError(loadedParts.length ? "assets" : "webgl");
  }
}
