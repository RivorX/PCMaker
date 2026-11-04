"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { componentCategoryLabels, type ComponentCategory } from "@/lib/drafts";
import styles from "./PcPreview.module.css";

type PcPreviewProps = {
  selectedCategories: ComponentCategory[];
  activeCategory: ComponentCategory;
  onSelectCategory: (category: ComponentCategory) => void;
};

type SceneCategory = Exclude<ComponentCategory, "other">;
const categories: SceneCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];

type PartScene = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  groups: Map<ComponentCategory, THREE.Group>;
  materials: Map<ComponentCategory, Set<THREE.Material>>;
  geometry: Map<ComponentCategory, PartGeometry>;
  activeOutline: THREE.Box3Helper;
  scene: THREE.Scene;
  focus: THREE.Vector3;
  currentDistance: number;
  zoomMultiplier: number;
};

type PartTransform = { position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 };
type PartGeometry = {
  localBounds: THREE.Box3;
  localCenter: THREE.Vector3;
  size: THREE.Vector3;
  assembled: PartTransform;
  exploded: PartTransform;
  grid: PartTransform;
};

const explodedCenters: Record<SceneCategory, [number, number, number]> = {
  case: [-2.85, 0, 0], motherboard: [0.45, 0, -1.85], cpu: [-1.32, 2.14, 0.55], memory: [0.2, 2.22, -0.2],
  gpu: [2.85, -0.7, 0.5], storage: [-1.55, -1.95, 0.3], psu: [0.65, -2.22, -0.5], cooling: [2.08, 1.9, 0.62],
};

const explodedAngles: Record<SceneCategory, [number, number, number]> = {
  case: [0, -0.12, 0], motherboard: [0.05, 0.14, 0], cpu: [0.13, -0.28, 0.06], memory: [0.08, 0.24, -0.04],
  gpu: [-0.08, -0.16, 0], storage: [0.12, 0.1, -0.12], psu: [0.04, 0.22, 0.04], cooling: [-0.12, 0.18, 0],
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};
const assembledViewDirection = () => new THREE.Vector3(4.55, 2.81, 5.2).normalize();
const frontViewDirection = () => new THREE.Vector3(0, 0.03, 1).normalize();

const darkPalette = {
  caseMetal: { color: 0x27364b, metalness: 0.72, roughness: 0.28 },
  caseEdge: { color: 0x73869a, metalness: 0.78, roughness: 0.24 },
  caseAccent: { color: 0x2caea9, metalness: 0.45, roughness: 0.24, emissive: 0x0c7773, emissiveIntensity: 0.6 },
  pcb: { color: 0x123d39, metalness: 0.18, roughness: 0.44 },
  pcbTrace: { color: 0x50b1a4, metalness: 0.4, roughness: 0.36, emissive: 0x0a3835, emissiveIntensity: 0.4 },
  black: { color: 0x101b28, metalness: 0.32, roughness: 0.34 },
  graphite: { color: 0x303d4e, metalness: 0.78, roughness: 0.25 },
  steel: { color: 0x91a4b4, metalness: 0.88, roughness: 0.22 },
  silver: { color: 0xb6c2cb, metalness: 0.82, roughness: 0.2 },
  gold: { color: 0xe1b467, metalness: 0.84, roughness: 0.2 },
  teal: { color: 0x54d7cb, metalness: 0.42, roughness: 0.24, emissive: 0x16827d, emissiveIntensity: 0.78 },
  cyan: { color: 0x87e3dc, metalness: 0.4, roughness: 0.25, emissive: 0x127b79, emissiveIntensity: 0.48 },
  red: { color: 0xc66f73, metalness: 0.38, roughness: 0.34 },
  fan: { color: 0x202b39, metalness: 0.55, roughness: 0.31 },
  cpu: { color: 0xd3c6a5, metalness: 0.84, roughness: 0.18 },
  ram: { color: 0x151e2b, metalness: 0.72, roughness: 0.24 },
  ramGlow: { color: 0x53d2c9, metalness: 0.54, roughness: 0.23, emissive: 0x147b78, emissiveIntensity: 0.65 },
  gpu: { color: 0x222d3d, metalness: 0.75, roughness: 0.23 },
  gpuTrim: { color: 0x818f9f, metalness: 0.86, roughness: 0.22 },
  drive: { color: 0x202d3a, metalness: 0.68, roughness: 0.26 },
  label: { color: 0x182632, metalness: 0.5, roughness: 0.32 },
} satisfies Record<string, THREE.MeshStandardMaterialParameters>;

export default function PcPreview({ selectedCategories, activeCategory, onSelectCategory }: PcPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PartScene | null>(null);
  const selectedRef = useRef(selectedCategories);
  const activeCategoryRef = useRef(activeCategory);
  const callbackRef = useRef(onSelectCategory);
  const gridLabelRefs = useRef(new Map<ComponentCategory, HTMLDivElement>());
  const layoutTargetRef = useRef(0);
  const autoGridViewRef = useRef(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [layoutProgress, setLayoutProgress] = useState(0);

  useEffect(() => { selectedRef.current = selectedCategories; }, [selectedCategories]);
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { callbackRef.current = onSelectCategory; }, [onSelectCategory]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;
    let pointerStart: { x: number; y: number; id: number; maxDistance: number } | null = null;
    const activePointers = new Set<number>();

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      // The camera backs out as the parts spread into a grid; fog in the old
      // tower-sized range made those distant parts disappear before the labels.
      const studioFog = new THREE.Fog(0x101c2d, 9, 20);
      scene.fog = studioFog;
      const camera = new THREE.PerspectiveCamera(36, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), 0.1, 120);
      camera.position.set(4.55, 2.75, 5.2);
      const orbit = new OrbitControls(camera, renderer.domElement);
      controls = orbit;
      orbit.target.set(0, -0.06, 0);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.055;
      orbit.screenSpacePanning = false;
      orbit.enablePan = true;
      orbit.minDistance = 3.9;
      orbit.maxDistance = 60;
      orbit.minPolarAngle = 0.14;
      orbit.maxPolarAngle = Math.PI - 0.14;
      orbit.update();
      orbit.saveState();
      const stopGridAutoView = () => { autoGridViewRef.current = false; };
      orbit.addEventListener("start", stopGridAutoView);

      scene.add(new THREE.HemisphereLight(0xc8e3f8, 0x152338, 1.9));
      const key = new THREE.DirectionalLight(0xf1f6ff, 3.0);
      key.position.set(4.5, 6.5, 5.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 5;
      key.shadow.camera.bottom = -4;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x50d4d0, 2.0);
      rim.position.set(-4.5, 2.8, -3.6);
      scene.add(rim);
      const warm = new THREE.PointLight(0xe1ab65, 38, 8, 2);
      warm.position.set(-2.5, 1.5, 3.2);
      scene.add(warm);

      const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x111e2f, metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.55 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.91;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new THREE.GridHelper(12, 32, 0x245367, 0x18364b);
      grid.position.y = -1.9;
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const gridMaterial of gridMaterials) {
        gridMaterial.transparent = true;
        gridMaterial.opacity = 0.27;
        gridMaterial.depthWrite = false;
      }
      scene.add(grid);

      const root = new THREE.Group();
      root.position.y = 0;
      scene.add(root);

      const groups = new Map<ComponentCategory, THREE.Group>();
      const materials = new Map<ComponentCategory, Set<THREE.Material>>();
      const materialCache = new Map<string, THREE.MeshStandardMaterial>();
      for (const category of categories) {
        const group = new THREE.Group();
        group.name = `${category}-part`;
        group.userData.category = category;
        root.add(group);
        groups.set(category, group);
        materials.set(category, new Set());
      }

      const getMaterial = (category: ComponentCategory, keyName: keyof typeof darkPalette) => {
        const keyId = `${category}:${keyName}`;
        let material = materialCache.get(keyId);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ ...darkPalette[keyName], side: THREE.DoubleSide });
          materialCache.set(keyId, material);
          materials.get(category)?.add(material);
        }
        return material;
      };
      const box = (
        category: ComponentCategory,
        keyName: keyof typeof darkPalette,
        size: [number, number, number],
        position: [number, number, number],
        parent = groups.get(category)!,
        bevel = false,
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), getMaterial(category, keyName));
        mesh.position.set(...position);
        mesh.castShadow = bevel;
        mesh.receiveShadow = bevel;
        mesh.userData.category = category;
        parent.add(mesh);
        if (bevel) {
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 32), new THREE.LineBasicMaterial({ color: 0x8394a7, transparent: true, opacity: 0.68 }));
          edge.position.copy(mesh.position);
          edge.userData.category = category;
          parent.add(edge);
          materials.get(category)?.add(edge.material as THREE.Material);
        }
        return mesh;
      };
      const cylinderZ = (
        category: ComponentCategory,
        keyName: keyof typeof darkPalette,
        radius: number,
        depth: number,
        position: [number, number, number],
        parent = groups.get(category)!,
        segments = 28,
      ) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), getMaterial(category, keyName));
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(...position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.category = category;
        parent.add(mesh);
        return mesh;
      };
      const tube = (
        category: ComponentCategory,
        keyName: keyof typeof darkPalette,
        points: [number, number, number][],
        radius: number,
        parent = groups.get(category)!,
        closed = false,
      ) => {
        const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), closed, "centripetal");
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(18, points.length * 8), radius, 7, false), getMaterial(category, keyName));
        mesh.castShadow = true;
        mesh.userData.category = category;
        parent.add(mesh);
        return mesh;
      };
      const instancedBoxes = (
        category: ComponentCategory,
        keyName: keyof typeof darkPalette,
        size: [number, number, number],
        positions: [number, number, number][],
        parent: THREE.Group,
      ) => {
        if (positions.length === 0) return;
        const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), getMaterial(category, keyName), positions.length);
        const transform = new THREE.Object3D();
        positions.forEach((position, index) => {
          transform.position.set(...position);
          transform.updateMatrix();
          instances.setMatrixAt(index, transform.matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
        instances.castShadow = false;
        instances.receiveShadow = false;
        instances.userData.category = category;
        parent.add(instances);
      };
      const fanBladeShape = new THREE.Shape();
      fanBladeShape.moveTo(0.014, 0.035);
      fanBladeShape.bezierCurveTo(0.055, 0.095, 0.19, 0.135, 0.205, 0.218);
      fanBladeShape.bezierCurveTo(0.214, 0.258, 0.155, 0.271, 0.105, 0.24);
      fanBladeShape.bezierCurveTo(0.035, 0.197, -0.018, 0.126, 0.014, 0.035);
      const fanBladeGeometry = new THREE.ShapeGeometry(fanBladeShape, 10);
      const makeFan = (
        category: ComponentCategory,
        x: number,
        y: number,
        z: number,
        radius: number,
        bladeKey: keyof typeof darkPalette = "fan",
        parent = groups.get(category)!,
      ) => {
        cylinderZ(category, "black", radius, 0.045, [x, y, z - 0.028], parent, 48);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.94, 0.012, 8, 48), getMaterial(category, "teal"));
        halo.position.set(x, y, z + 0.009);
        halo.userData.category = category;
        parent.add(halo);
        const blades = new THREE.InstancedMesh(fanBladeGeometry, getMaterial(category, bladeKey), 7);
        const transform = new THREE.Object3D();
        for (let index = 0; index < 7; index += 1) {
          transform.position.set(x, y, z + 0.014);
          transform.rotation.z = (Math.PI * 2 * index) / 7;
          transform.updateMatrix();
          blades.setMatrixAt(index, transform.matrix);
        }
        blades.instanceMatrix.needsUpdate = true;
        blades.computeBoundingSphere();
        blades.userData.category = category;
        parent.add(blades);
        cylinderZ(category, "graphite", radius * 0.31, 0.035, [x, y, z + 0.02], parent, 28);
        cylinderZ(category, "steel", radius * 0.1, 0.038, [x, y, z + 0.042], parent, 20);
        const rivet = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.76, 0.007, 5, 48), getMaterial(category, "steel"));
        rivet.position.set(x, y, z + 0.008);
        rivet.userData.category = category;
        parent.add(rivet);
      };
      const screw = (category: ComponentCategory, x: number, y: number, z: number) => {
        cylinderZ(category, "steel", 0.035, 0.018, [x, y, z], groups.get(category)!, 16);
        box(category, "black", [0.035, 0.006, 0.004], [x, y, z + 0.012]);
      };

      // Open tower chassis: a real three-dimensional frame with a clear side view.
      const caseGroup = groups.get("case")!;
      for (const x of [-1.22, 1.22]) {
        for (const z of [-0.72, 0.72]) {
          box("case", "caseMetal", [0.095, 3.38, 0.095], [x, 0, z], caseGroup, true);
          box("case", "caseEdge", [0.105, 0.075, 0.105], [x, 1.64, z]);
          box("case", "caseEdge", [0.105, 0.075, 0.105], [x, -1.64, z]);
        }
      }
      for (const y of [-1.67, 1.67]) {
        box("case", "caseMetal", [2.48, 0.11, 0.12], [0, y, 0.72], caseGroup, true);
        box("case", "caseMetal", [2.48, 0.11, 0.12], [0, y, -0.72], caseGroup, true);
        box("case", "caseEdge", [0.09, 0.1, 1.42], [-1.22, y, 0]);
        box("case", "caseEdge", [0.09, 0.1, 1.42], [1.22, y, 0]);
      }
      for (const x of [-1.22, 1.22]) {
        box("case", "caseMetal", [0.08, 3.28, 0.08], [x, 0, -0.72]);
      }

      // Perforated side intake and vented roof make the open chassis read as a finished tower.
      // This face sits on +X; the component-access side at +Z stays completely open.
      const sideFascia = new THREE.Group();
      sideFascia.name = "vented-side-fascia";
      sideFascia.userData.category = "case";
      sideFascia.userData.raycastIgnored = true;
      caseGroup.add(sideFascia);
      for (const z of [-0.67, 0.67]) {
        box("case", "caseEdge", [0.052, 2.66, 0.052], [1.25, 0.06, z], sideFascia, true);
      }
      for (const y of [-1.27, 1.39]) {
        box("case", "caseMetal", [0.052, 0.075, 1.34], [1.25, y, 0], sideFascia, true);
      }
      // Three real intake fan assemblies, oriented outward along the +X normal.
      for (const y of [0.7, 0.06, -0.58]) {
        const intake = new THREE.Group();
        intake.position.set(1.27, y, 0.04);
        intake.rotation.y = Math.PI / 2;
        intake.userData.category = "case";
        intake.userData.raycastIgnored = true;
        sideFascia.add(intake);
        makeFan("case", 0, 0, 0, 0.255, "fan", intake);
      }
      const sideVents: [number, number, number][] = [];
      const sideAccents: [number, number, number][] = [];
      for (let vent = 0; vent < 21; vent += 1) {
        const y = -1.12 + vent * 0.115;
        (vent % 3 === 0 ? sideAccents : sideVents).push([1.285, y, 0]);
      }
      instancedBoxes("case", "caseMetal", [0.023, 0.018, 1.19], sideVents, sideFascia);
      instancedBoxes("case", "caseEdge", [0.026, 0.034, 1.19], sideAccents, sideFascia);
      box("case", "caseAccent", [0.025, 0.16, 0.09], [1.29, 1.08, -0.49], sideFascia);
      box("case", "black", [0.022, 0.055, 0.032], [1.31, 1.08, -0.49], sideFascia);

      const roof = new THREE.Group();
      roof.name = "vented-roof";
      roof.userData.category = "case";
      roof.userData.raycastIgnored = true;
      caseGroup.add(roof);
      box("case", "caseEdge", [2.32, 0.045, 0.055], [0, 1.72, -0.65], roof, true);
      box("case", "caseEdge", [2.32, 0.045, 0.055], [0, 1.72, 0.65], roof, true);
      const roofVents: [number, number, number][] = [];
      const roofAccents: [number, number, number][] = [];
      for (let vent = 0; vent < 17; vent += 1) {
        const z = -0.58 + vent * 0.0725;
        (vent % 4 === 0 ? roofAccents : roofVents).push([0, 1.72, z]);
      }
      instancedBoxes("case", "caseMetal", [2.27, 0.027, 0.032], roofVents, roof);
      instancedBoxes("case", "caseEdge", [2.27, 0.038, 0.032], roofAccents, roof);
      // A fine edge defines the removable glass side without putting a click-blocking pane in front of components.
      for (const y of [-1.48, 1.48]) {
        box("case", "caseAccent", [0.018, 0.026, 0.018], [1.222, y, 0.09]);
      }
      box("case", "black", [0.84, 0.045, 0.055], [0.72, 1.57, 0.77]);
      cylinderZ("case", "caseAccent", 0.042, 0.03, [0.98, 1.57, 0.81]);
      for (const x of [-0.96, 0.96]) {
        for (const z of [-0.57, 0.57]) {
          box("case", "black", [0.22, 0.12, 0.24], [x, -1.75, z]);
        }
      }
      // Removable expansion-slot covers on the back edge.
      for (let index = 0; index < 7; index += 1) {
        const y = -0.8 + index * 0.13;
        box("case", "graphite", [0.36, 0.09, 0.018], [-1.15, y, -0.77]);
        cylinderZ("case", "steel", 0.013, 0.015, [-1.0, y, -0.78], caseGroup, 12);
      }

      // Full-size motherboard, connectors and silk-screen traces.
      box("motherboard", "pcb", [2.08, 3.02, 0.095], [0, -0.08, -0.42], groups.get("motherboard"), true);
      box("motherboard", "graphite", [0.09, 2.72, 0.12], [-0.965, -0.08, -0.34]);
      for (const x of [-0.92, 0.92]) {
        for (const y of [-1.46, 1.3]) screw("motherboard", x, y, -0.345);
      }
      // Four-layer VRM heatsinks and caps above the CPU socket.
      for (let index = 0; index < 8; index += 1) {
        const x = -0.62 + (index % 4) * 0.13;
        const y = 1.18 - Math.floor(index / 4) * 0.18;
        cylinderZ("motherboard", index % 2 ? "silver" : "steel", 0.044, 0.12, [x, y, -0.335], groups.get("motherboard"), 18);
      }
      box("motherboard", "steel", [0.18, 0.72, 0.13], [-0.9, 1.03, -0.31]);
      for (let index = 0; index < 8; index += 1) {
        const y = 0.71 + index * 0.088;
        box("motherboard", "caseMetal", [0.205, 0.018, 0.16], [-0.9, y, -0.23]);
      }
      // DIMM sockets and gold contacts.
      for (let index = 0; index < 4; index += 1) {
        const x = 0.53 + index * 0.13;
        box("motherboard", "black", [0.035, 1.2, 0.035], [x, 0.47, -0.327]);
        for (let contact = 0; contact < 7; contact += 1) {
          box("motherboard", "gold", [0.026, 0.018, 0.013], [x, -0.18 + contact * 0.13, -0.306]);
        }
      }
      // PCIe and accessory slots sit behind the removable GPU.
      box("motherboard", "black", [1.45, 0.08, 0.04], [0, -0.82, -0.31]);
      box("motherboard", "gold", [1.26, 0.016, 0.02], [0, -0.82, -0.284]);
      for (let index = 0; index < 4; index += 1) {
        box("motherboard", index % 2 ? "black" : "steel", [0.74, 0.045, 0.026], [-0.05 + index * 0.06, -1.04 - index * 0.1, -0.31]);
      }
      // Chipset heatsink, firmware chip and I/O cluster.
      box("motherboard", "graphite", [0.45, 0.38, 0.105], [0.63, -0.24, -0.31], groups.get("motherboard"), true);
      for (let index = 0; index < 7; index += 1) {
        box("motherboard", "steel", [0.025, 0.34, 0.014], [0.47 + index * 0.052, -0.24, -0.243]);
      }
      box("motherboard", "black", [0.22, 0.14, 0.045], [0.72, -0.65, -0.31]);
      for (const [index, color] of (["black", "steel", "gold", "red"] as (keyof typeof darkPalette)[]).entries()) {
        box("motherboard", color, [0.22, 0.18, 0.3], [-1.07, 0.82 - index * 0.24, -0.26], groups.get("motherboard"), true);
      }
      const tracePaths: [number, number, number][][] = [
        [[-0.88, 0.3, -0.25], [-0.62, 0.3, -0.25], [-0.48, 0.45, -0.25]],
        [[0.37, 0.45, -0.25], [0.41, 0.2, -0.25], [0.72, 0.02, -0.25]],
        [[-0.76, -0.26, -0.25], [-0.58, -0.42, -0.25], [-0.43, -0.42, -0.25]],
        [[0.72, -0.48, -0.25], [0.82, -0.75, -0.25], [0.56, -0.99, -0.25]],
        [[-0.8, 0.96, -0.25], [-0.49, 0.83, -0.25], [-0.43, 0.7, -0.25]],
      ];
      for (const path of tracePaths) tube("motherboard", "pcbTrace", path, 0.008);

      // CPU sits on its own exposed socket, just clear of the adjacent tower cooler.
      box("motherboard", "steel", [0.57, 0.57, 0.035], [-0.39, 0.48, -0.342], groups.get("motherboard"), true);
      box("motherboard", "black", [0.48, 0.48, 0.03], [-0.39, 0.48, -0.311], groups.get("motherboard"));
      for (let index = 0; index < 18; index += 1) {
        const x = -0.6 + (index % 6) * 0.08;
        const y = 0.3 + Math.floor(index / 6) * 0.12;
        box("motherboard", "gold", [0.015, 0.015, 0.008], [x, y, -0.29]);
      }
      const cpuGroup = groups.get("cpu")!;
      box("cpu", "black", [0.38, 0.38, 0.055], [-0.39, 0.48, -0.247], cpuGroup, true);
      box("cpu", "cpu", [0.33, 0.33, 0.045], [-0.39, 0.48, -0.196], cpuGroup, true);
      box("cpu", "silver", [0.18, 0.18, 0.007], [-0.39, 0.48, -0.17]);
      for (const dx of [-0.12, 0.12]) {
        for (const dy of [-0.12, 0.12]) box("cpu", "gold", [0.035, 0.035, 0.009], [-0.39 + dx, 0.48 + dy, -0.166]);
      }

      // Twin-slot DDR modules with spreaders, PCB and individual chips.
      const ramGroup = groups.get("memory")!;
      for (const x of [0.73, 0.91]) {
        box("memory", "black", [0.11, 1.07, 0.048], [x, 0.49, -0.19], ramGroup, true);
        box("memory", "ram", [0.105, 0.92, 0.035], [x, 0.51, -0.154], ramGroup, true);
        box("memory", "ramGlow", [0.112, 0.025, 0.038], [x, 0.99, -0.148]);
        for (let chip = 0; chip < 7; chip += 1) {
          box("memory", chip % 2 ? "graphite" : "black", [0.062, 0.074, 0.012], [x, 0.17 + chip * 0.108, -0.129]);
        }
        for (let contact = 0; contact < 6; contact += 1) {
          box("memory", "gold", [0.09, 0.018, 0.009], [x, -0.1 + contact * 0.027, -0.119]);
        }
      }

      // Tower cooler: machined heatsink fins, heatpipes and an illuminated fan.
      const coolingGroup = groups.get("cooling")!;
      for (let fin = 0; fin < 13; fin += 1) {
        const y = 0.13 + fin * 0.061;
        box("cooling", fin % 2 ? "silver" : "steel", [0.5, 0.025, 0.33], [0.25, y, 0.01], coolingGroup);
      }
      for (const x of [0.09, 0.23, 0.37, 0.51]) {
        tube("cooling", "gold", [[x, -0.02, 0.1], [x - 0.08, 0.36, 0.11], [x, 0.82, 0.1]], 0.024, coolingGroup);
      }
      box("cooling", "black", [0.54, 0.8, 0.07], [0.25, 0.49, 0.17]);
      makeFan("cooling", 0.25, 0.49, 0.222, 0.265, "fan", coolingGroup);
      tube("cooling", "caseAccent", [[0.1, 0.51, 0.04], [0.19, 0.65, 0.05], [0.25, 0.6, 0.06]], 0.027, coolingGroup);
      tube("cooling", "gold", [[0.1, 0.45, 0.04], [0.2, 0.31, 0.05], [0.3, 0.36, 0.06]], 0.022, coolingGroup);
      coolingGroup.position.x = -0.64;

      // M.2 NVMe module and its small controller/memory components.
      const driveGroup = groups.get("storage")!;
      box("storage", "drive", [0.76, 0.18, 0.045], [-0.19, -0.18, -0.213], driveGroup, true);
      box("storage", "graphite", [0.21, 0.12, 0.026], [-0.4, -0.18, -0.176]);
      box("storage", "ramGlow", [0.18, 0.1, 0.02], [-0.12, -0.18, -0.176]);
      box("storage", "gold", [0.11, 0.12, 0.025], [0.18, -0.18, -0.176]);
      cylinderZ("storage", "steel", 0.025, 0.016, [0.21, -0.18, -0.15], driveGroup, 16);

      // Triple-slot graphics card with a deep shroud, three complete axial fans and edge details.
      // In a normal horizontal PCIe mount the card lies flat; its fan faces point
      // toward the case floor rather than out through the side window.
      const gpuGroup = groups.get("gpu")!;
      const gpuAssembly = new THREE.Group();
      gpuAssembly.name = "horizontal-pcie-graphics-card";
      gpuAssembly.rotation.x = Math.PI / 2;
      const gpuSourceCenter = new THREE.Vector3(0, -0.71, 0.025).applyQuaternion(gpuAssembly.quaternion);
      gpuAssembly.position.set(0, -0.71, 0.2).sub(gpuSourceCenter);
      gpuGroup.add(gpuAssembly);
      box("gpu", "black", [1.99, 0.85, 0.18], [0, -0.71, 0.025], gpuAssembly, true);
      box("gpu", "gpu", [1.91, 0.85, 0.09], [0, -0.69, 0.138], gpuAssembly, true);
      box("gpu", "gpuTrim", [1.82, 0.035, 0.025], [0, -0.43, 0.2], gpuAssembly);
      box("gpu", "black", [1.48, 0.07, 0.055], [0, -0.989, 0.03], gpuAssembly);
      box("gpu", "gold", [1.2, 0.018, 0.022], [0, -1.18, 0.055], gpuAssembly);
      for (const x of [-0.57, 0, 0.57]) makeFan("gpu", x, -0.68, 0.196, 0.205, "fan", gpuAssembly);
      for (let fin = 0; fin < 12; fin += 1) {
        const x = -0.68 + fin * 0.12;
        box("gpu", fin % 2 ? "steel" : "graphite", [0.022, 0.39, 0.13], [x, -0.71, -0.06], gpuAssembly);
      }
      for (let port = 0; port < 3; port += 1) {
        box("gpu", "steel", [0.17, 0.09, 0.05], [-0.86 + port * 0.2, -1.12, 0.09], gpuAssembly);
        box("gpu", "black", [0.115, 0.055, 0.057], [-0.86 + port * 0.2, -1.115, 0.12], gpuAssembly);
      }
      box("gpu", "caseAccent", [0.025, 0.2, 0.04], [0.94, -0.69, 0.14], gpuAssembly);
      for (let index = 0; index < 8; index += 1) {
        box("gpu", "gold", [0.022, 0.055, 0.02], [0.25 + index * 0.055, -0.69, 0.195], gpuAssembly);
      }

      // Bottom-mounted power supply with perforated grille, fan and separate sleeved cable runs.
      const psuGroup = groups.get("psu")!;
      box("psu", "black", [1.15, 0.46, 0.77], [0, -1.36, -0.02], psuGroup, true);
      box("psu", "graphite", [1.06, 0.37, 0.07], [0, -1.36, 0.385], psuGroup, true);
      makeFan("psu", -0.24, -1.36, 0.43, 0.15, "fan", psuGroup);
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          cylinderZ("psu", "black", 0.013, 0.012, [0.12 + column * 0.09, -1.47 + row * 0.075, 0.43], psuGroup, 10);
        }
      }
      for (let index = 0; index < 4; index += 1) {
        box("psu", "caseAccent", [0.035, 0.03, 0.02], [-0.16 + index * 0.11, -1.19, 0.43]);
      }
      tube("psu", "black", [[0.48, -1.2, 0.24], [0.78, -1.12, 0.35], [0.91, -0.82, 0.28], [0.7, -0.5, 0.14], [0.77, 0.47, -0.08]], 0.038, psuGroup);
      tube("psu", "caseAccent", [[0.51, -1.21, 0.25], [0.82, -1.09, 0.36], [0.96, -0.81, 0.29], [0.75, -0.47, 0.14], [0.82, 0.54, -0.06]], 0.012, psuGroup);
      tube("psu", "black", [[0.34, -1.2, 0.26], [0.6, -1.16, 0.39], [0.61, -0.86, 0.39], [0.54, -0.74, 0.31]], 0.026, psuGroup);
      tube("psu", "red", [[0.34, -1.22, 0.27], [0.58, -1.17, 0.4], [0.59, -0.85, 0.4], [0.5, -0.73, 0.32]], 0.011, psuGroup);

      const activeOutline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x56e1d5));
      const outlineMaterial = activeOutline.material as THREE.LineBasicMaterial;
      outlineMaterial.transparent = true;
      outlineMaterial.opacity = 0.92;
      outlineMaterial.depthTest = true;
      outlineMaterial.depthWrite = false;
      outlineMaterial.toneMapped = false;
      scene.add(activeOutline);

      // Each mesh carries its semantic part category for exact raycast selection.
      for (const [componentCategory, group] of groups) {
        const category = componentCategory as SceneCategory;
        group.traverse((object) => { object.userData.category = category; });
        const selected = selectedRef.current.includes(category);
        for (const material of materials.get(category) ?? []) {
          material.transparent = !selected;
          material.opacity = selected ? 1 : 0.1;
          material.depthWrite = selected;
          material.needsUpdate = true;
        }
      }

      // Keep the exact assembled transforms; every scrub re-interpolates from this baseline.
      root.updateMatrixWorld(true);
      const geometry = new Map<ComponentCategory, PartGeometry>();
      for (const [componentCategory, group] of groups) {
        const category = componentCategory as SceneCategory;
        const worldBounds = new THREE.Box3().setFromObject(group);
        const inverse = group.matrixWorld.clone().invert();
        const localBounds = new THREE.Box3().makeEmpty();
        for (const x of [worldBounds.min.x, worldBounds.max.x]) {
          for (const y of [worldBounds.min.y, worldBounds.max.y]) {
            for (const z of [worldBounds.min.z, worldBounds.max.z]) {
              localBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
            }
          }
        }
        const assembled: PartTransform = {
          position: group.position.clone(),
          rotation: new THREE.Quaternion().setFromEuler(group.rotation),
          scale: group.scale.clone(),
        };
        const localCenter = localBounds.getCenter(new THREE.Vector3());
        const size = localBounds.getSize(new THREE.Vector3());
        const explodedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...explodedAngles[category]));
        const explodedCenter = new THREE.Vector3(...explodedCenters[category]);
        const explodedOffset = localCenter.clone().multiply(assembled.scale).applyQuaternion(explodedRotation);
        const exploded: PartTransform = {
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
          grid: {
            position: assembled.position.clone(),
            rotation: assembled.rotation.clone(),
            scale: assembled.scale.clone(),
          },
        });
      }
      const setGridTargets = (width: number) => {
        const columns = width < 760 ? 2 : 4;
        const rows = Math.ceil(categories.length / columns);
        const cellWidth = columns === 4 ? 2.3 : 2.28;
        const cellHeight = columns === 4 ? 1.8 : 1.75;
        const gapX = columns === 4 ? 0.48 : 0.38;
        const gapY = columns === 4 ? 0.5 : 0.55;
        categories.forEach((category, index) => {
          const part = geometry.get(category)!;
          const column = index % columns;
          const row = Math.floor(index / columns);
          const center = new THREE.Vector3(
            (column - (columns - 1) / 2) * (cellWidth + gapX),
            ((rows - 1) / 2 - row) * (cellHeight + gapY),
            0,
          );
          const gridRotation = category === "gpu"
            ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2).multiply(part.assembled.rotation)
            : part.assembled.rotation.clone();
          const gridBounds = part.localBounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(gridRotation));
          const gridSize = gridBounds.getSize(new THREE.Vector3());
          const scale = Math.min(2.25, (cellWidth - 0.24) / Math.max(gridSize.x, 0.01), (cellHeight - 0.2) / Math.max(gridSize.y, 0.01), 1.08 / Math.max(gridSize.z, 0.01));
          const scaledCenter = part.localCenter.clone().multiplyScalar(scale).applyQuaternion(gridRotation);
          part.grid.position.copy(center).sub(scaledCenter);
          part.grid.rotation.copy(gridRotation);
          part.grid.scale.copy(part.assembled.scale).multiplyScalar(scale);
        });
        return columns;
      };
      let gridColumns = setGridTargets(Math.max(1, host.clientWidth));
      const initialGroup = groups.get(activeCategory) ?? groups.get("cpu")!;
      const initialBounds = new THREE.Box3().setFromObject(initialGroup);
      activeOutline.box.copy(initialBounds);
      activeOutline.visible = true;
      activeOutline.updateMatrixWorld(true);

      const raycaster = new THREE.Raycaster();
      raycaster.params.Line = { threshold: 0.055 };
      const pointer = new THREE.Vector2();
      const findCategory = (event: PointerEvent) => {
        const rect = renderer!.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...groups.values()], true);
        return hits.find((hit) => {
          let current: THREE.Object3D | null = hit.object;
          while (current && current !== root) {
            if (current.userData.raycastIgnored) return false;
            current = current.parent;
          }
          return !!hit.object.userData.category;
        })?.object.userData.category as ComponentCategory | undefined;
      };
      const onPointerDown = (event: PointerEvent) => {
        activePointers.add(event.pointerId);
        if (!event.isPrimary || activePointers.size > 1) {
          pointerStart = null;
          return;
        }
        if (event.button !== 0) return;
        pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, maxDistance: 0 };
      };
      const onPointerUp = (event: PointerEvent) => {
        activePointers.delete(event.pointerId);
        const start = pointerStart;
        pointerStart = null;
        if (!start || start.id !== event.pointerId || activePointers.size > 0 || !event.isPrimary) return;
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (Math.max(start.maxDistance, distance) < 7) {
          const category = findCategory(event);
          if (category) callbackRef.current(category);
        }
      };
      const onPointerMove = (event: PointerEvent) => {
        if (pointerStart && pointerStart.id === event.pointerId) {
          pointerStart.maxDistance = Math.max(pointerStart.maxDistance, Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y));
          return;
        }
        renderer!.domElement.style.cursor = findCategory(event) ? "pointer" : "grab";
      };
      const onPointerLeave = () => {
        pointerStart = null;
        renderer!.domElement.style.cursor = "grab";
      };
      const onPointerCancel = (event: PointerEvent) => {
        activePointers.delete(event.pointerId);
        pointerStart = null;
      };
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerleave", onPointerLeave);
      renderer.domElement.addEventListener("pointercancel", onPointerCancel);

      const resize = () => {
        if (!renderer || !host.isConnected) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        gridColumns = setGridTargets(width);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      const cameraDirection = new THREE.Vector3();
      const cameraRight = new THREE.Vector3();
      const cameraUp = new THREE.Vector3();
      const frontDirection = frontViewDirection();
      const assembledDirection = camera.position.clone().sub(orbit.target).normalize();
      const focus = new THREE.Vector3();
      const worldBounds = new THREE.Box3();
      const partBounds = new THREE.Box3();
      const worldCenter = new THREE.Vector3();
      const worldSize = new THREE.Vector3();
      const anchor = new THREE.Vector3();
      const cameraFov = THREE.MathUtils.degToRad(camera.fov / 2);
      let frameTime = performance.now();
      let currentProgress = 0;
      const initialDistance = camera.position.distanceTo(orbit.target);
      let lastAppliedDistance = initialDistance;

      const updateTransform = (current: THREE.Group, from: PartTransform, to: PartTransform, amount: number) => {
        current.position.lerpVectors(from.position, to.position, amount);
        current.quaternion.slerpQuaternions(from.rotation, to.rotation, amount);
        current.scale.lerpVectors(from.scale, to.scale, amount);
      };

      renderer.setAnimationLoop((time) => {
        const delta = Math.min(0.06, Math.max(0.001, (time - frameTime) / 1000));
        frameTime = time;
        const easing = 1 - Math.exp(-delta * 8.5);
        const destination = layoutTargetRef.current;
        const progressGap = destination - currentProgress;
        currentProgress = Math.abs(progressGap) < 0.05 ? destination : currentProgress + progressGap * easing;
        if (currentProgress < 0.02) currentProgress = 0;
        if (currentProgress > 99.98) currentProgress = 100;
        const normalized = currentProgress / 100;
        const explodedProgress = smoothStep(normalized / 0.66);
        const gridProgress = smoothStep((normalized - 0.66) / 0.34);
        const studioFade = 1 - smoothStep((gridProgress - 0.68) / 0.32);
        floorMaterial.opacity = 0.55 * studioFade;
        for (const gridMaterial of gridMaterials) gridMaterial.opacity = 0.27 * studioFade;

        const width = Math.max(1, host.clientWidth);
        const nextColumns = width < 760 ? 2 : 4;
        if (nextColumns !== gridColumns) gridColumns = setGridTargets(width);

        for (const category of categories) {
          const group = groups.get(category)!;
          const part = geometry.get(category)!;
          if (normalized <= 0.66) {
            updateTransform(group, part.assembled, part.exploded, explodedProgress);
          } else {
            updateTransform(group, part.exploded, part.grid, gridProgress);
          }
        }

        root.updateMatrixWorld(true);
        worldBounds.makeEmpty();
        const boundsByCategory = new Map<ComponentCategory, THREE.Box3>();
        for (const category of categories) {
          const group = groups.get(category)!;
          const bounds = partBounds.copy(geometry.get(category)!.localBounds).applyMatrix4(group.matrixWorld).clone();
          boundsByCategory.set(category, bounds);
          worldBounds.union(bounds);
        }

        const activeBounds = boundsByCategory.get(activeCategoryRef.current);
        if (activeBounds) {
          activeOutline.box.copy(activeBounds);
          activeOutline.visible = true;
          activeOutline.updateMatrixWorld(true);
        }

        // Keep controls live while the user drags. A deliberate slider change resumes
        // automatic framing; until then preserve the user's orbit and pan exactly.
        orbit.update();
        const liveDistance = camera.position.distanceTo(orbit.target);
        const runtime = runtimeRef.current;
        const previousDistance = runtime?.currentDistance ?? initialDistance;
        if (previousDistance > 0 && Math.abs(liveDistance - previousDistance) > Math.max(0.04, previousDistance * 0.006)) {
          const zoomMultiplier = runtime?.zoomMultiplier ?? 1;
          if (runtime) runtime.zoomMultiplier = THREE.MathUtils.clamp(zoomMultiplier * (liveDistance / previousDistance), 0.62, 1.8);
        }
        if (runtime) runtime.currentDistance = liveDistance;
        if (autoGridViewRef.current) {
          worldBounds.getCenter(focus);
          worldBounds.getSize(worldSize);
          cameraDirection.copy(camera.position).sub(orbit.target).normalize();
          const frontBlend = smoothStep(normalized / 0.28);
          const desiredDirection = assembledDirection.clone().lerp(frontDirection, frontBlend).normalize();
          cameraDirection.lerp(desiredDirection, 1 - Math.exp(-delta * 5.5)).normalize();
          cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
          cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
          const projectedWidth = Math.abs(cameraRight.x) * worldSize.x + Math.abs(cameraRight.y) * worldSize.y + Math.abs(cameraRight.z) * worldSize.z;
          const projectedHeight = Math.abs(cameraUp.x) * worldSize.x + Math.abs(cameraUp.y) * worldSize.y + Math.abs(cameraUp.z) * worldSize.z;
          const halfVerticalFov = Math.atan(Math.tan(cameraFov) / camera.zoom);
          const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
          const screenHeight = Math.max(1, host.clientHeight);
          const safeTop = 124;
          const safeBottom = 115;
          const safeVerticalFraction = Math.max(0.42, (screenHeight - safeTop - safeBottom) / screenHeight);
          const safeHorizontalFraction = Math.max(0.65, (width - 36) / width);
          const fitDistance = Math.max(
            projectedWidth / (2 * Math.tan(halfHorizontalFov) * safeHorizontalFraction),
            projectedHeight / (2 * Math.tan(halfVerticalFov) * safeVerticalFraction),
            worldSize.z * 0.75,
            3.9,
          ) * 1.14;
          const fittedDistance = THREE.MathUtils.clamp(fitDistance * (runtime?.zoomMultiplier ?? 1), 3.9, 55);
          const boundsDepth = worldSize.length();
          studioFog.near = fittedDistance + boundsDepth * 0.62;
          studioFog.far = studioFog.near + boundsDepth * 1.4;
          const verticalWorldSpan = 2 * fittedDistance * Math.tan(halfVerticalFov);
          const safeCenterOffset = (safeTop - safeBottom) / 2;
          const framingFocus = focus.clone().addScaledVector(cameraUp, safeCenterOffset * verticalWorldSpan / screenHeight);
          camera.position.copy(framingFocus).addScaledVector(cameraDirection, fittedDistance);
          orbit.target.copy(framingFocus);
          orbit.update();
          camera.updateMatrixWorld(true);
          lastAppliedDistance = camera.position.distanceTo(orbit.target);
          if (runtime) {
            runtime.currentDistance = lastAppliedDistance;
            runtime.focus.copy(framingFocus);
          }
          if (Math.abs(currentProgress - destination) < 0.1 && cameraDirection.distanceTo(desiredDirection) < 0.012) {
            autoGridViewRef.current = false;
          }
        } else {
          // Keep a manually controlled camera stable while parts continue moving.
          camera.updateMatrixWorld(true);
        }

        const revealLabels = smoothStep(gridProgress / 0.65);
        for (const category of categories) {
          const label = gridLabelRefs.current.get(category);
          const bounds = boundsByCategory.get(category);
          if (!label || !bounds) continue;
          if (revealLabels < 0.01) {
            label.style.opacity = "0";
            label.style.visibility = "hidden";
            continue;
          }
          bounds.getCenter(anchor);
          anchor.y = bounds.min.y - 0.12;
          anchor.project(camera);
          label.style.left = `${((anchor.x + 1) / 2) * width}px`;
          label.style.top = `${((1 - anchor.y) / 2) * Math.max(1, host.clientHeight)}px`;
          label.style.opacity = String(revealLabels);
          label.style.visibility = "visible";
        }

        renderer!.render(scene, camera);
      });
      runtimeRef.current = { renderer, camera, controls: orbit, groups, materials, geometry, activeOutline, scene, focus, currentDistance: lastAppliedDistance, zoomMultiplier: 1 };

      return () => {
        disposed = true;
        resizeObserver?.disconnect();
        orbit.removeEventListener("start", stopGridAutoView);
        renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer?.domElement.removeEventListener("pointerup", onPointerUp);
        renderer?.domElement.removeEventListener("pointermove", onPointerMove);
        renderer?.domElement.removeEventListener("pointerleave", onPointerLeave);
        renderer?.domElement.removeEventListener("pointercancel", onPointerCancel);
        orbit.dispose();
        renderer?.setAnimationLoop(null);
        const geometries = new Set<THREE.BufferGeometry>();
        const disposableMaterials = new Set<THREE.Material>();
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry);
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => disposableMaterials.add(material));
          else if (mesh.material) disposableMaterials.add(mesh.material);
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of disposableMaterials) material.dispose();
        renderer?.renderLists.dispose();
        renderer?.dispose();
        renderer?.domElement.remove();
        runtimeRef.current = null;
      };
    } catch {
      if (!disposed) setWebglError("Ta przeglądarka nie udostępnia WebGL. Włącz akcelerację sprzętową, aby obejrzeć model 3D.");
      renderer?.dispose();
      renderer?.domElement.remove();
      return () => { disposed = true; controls?.dispose(); renderer?.dispose(); };
    }
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const category of categories) {
      const chosen = selectedCategories.includes(category);
      for (const material of runtime.materials.get(category) ?? []) {
        material.transparent = !chosen;
        material.opacity = chosen ? 1 : 0.1;
        material.depthWrite = chosen;
        material.needsUpdate = true;
      }
    }
  }, [selectedCategories]);

  const setLayout = (value: number) => {
    const next = THREE.MathUtils.clamp(Math.round(value), 0, 100);
    layoutTargetRef.current = next;
    autoGridViewRef.current = true;
    setLayoutProgress(next);
  };

  const chooseView = (view: "front" | "side" | "reset") => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { camera, controls } = runtime;
    autoGridViewRef.current = false;
    if (view === "reset") {
      const distance = runtime.currentDistance;
      camera.zoom = 1;
      const direction = assembledViewDirection().lerp(frontViewDirection(), smoothStep(layoutTargetRef.current / 28)).normalize();
      camera.position.copy(runtime.focus).addScaledVector(direction, distance);
      controls.target.copy(runtime.focus);
      controls.update();
      runtime.zoomMultiplier = 1;
      runtime.currentDistance = camera.position.distanceTo(controls.target);
      camera.updateProjectionMatrix();
      return;
    }
    const distance = runtime.currentDistance;
    const direction = view === "front"
      ? new THREE.Vector3(0.08, 0.08, 1).normalize()
      : new THREE.Vector3(1, 0.12, 0.16).normalize();
    camera.position.copy(runtime.focus).addScaledVector(direction, distance);
    controls.target.copy(runtime.focus);
    controls.update();
    runtime.currentDistance = camera.position.distanceTo(controls.target);
  };

  const changeZoom = (direction: 1 | -1) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const scale = direction === 1 ? 0.86 : 1.16;
    const nextZoom = THREE.MathUtils.clamp(runtime.zoomMultiplier * scale, 0.62, 1.8);
    if (!autoGridViewRef.current) {
      const cameraDirection = runtime.camera.position.clone().sub(runtime.controls.target).normalize();
      runtime.currentDistance = THREE.MathUtils.clamp(runtime.currentDistance * (nextZoom / runtime.zoomMultiplier), 3.9, 55);
      runtime.camera.position.copy(runtime.controls.target).addScaledVector(cameraDirection, runtime.currentDistance);
      runtime.controls.update();
    }
    runtime.zoomMultiplier = nextZoom;
  };

  const activeSelected = selectedCategories.includes(activeCategory);

  return (
    <div className={`${styles.preview} pc-layout-stage`} role="region" aria-label="Interaktywny, trójwymiarowy model komputera">
      <div ref={mountRef} className={styles.mount} />
      {webglError ? <div className={styles.webglFallback} role="status"><span>3D</span><strong>Podgląd 3D jest niedostępny</strong><p>{webglError}</p></div> : null}
      <div className={styles.activeReadout} aria-live="polite" aria-atomic="true">
        <span className={styles.readoutOverline}>AKTYWNY ELEMENT</span>
        <strong>{componentCategoryLabels[activeCategory]}</strong>
        <span className={activeSelected ? styles.readoutChosen : styles.readoutEmpty}>{activeSelected ? "Dodano do zestawu" : "Wybierz model z katalogu"}</span>
      </div>
      <div className={styles.controls} aria-label="Sterowanie widokiem 3D">
        <button type="button" disabled={!!webglError} onClick={() => chooseView("front")} aria-label="Pokaż komputer od przodu">Przód</button>
        <button type="button" disabled={!!webglError} onClick={() => chooseView("side")} aria-label="Pokaż komputer z boku">Bok</button>
        <span className={styles.controlDivider} />
        <button type="button" disabled={!!webglError} className={styles.zoomButton} onClick={() => changeZoom(1)} aria-label="Przybliż">+</button>
        <button type="button" disabled={!!webglError} className={styles.zoomButton} onClick={() => changeZoom(-1)} aria-label="Oddal">−</button>
        <button type="button" disabled={!!webglError} onClick={() => chooseView("reset")} aria-label="Przywróć widok początkowy">Reset</button>
      </div>
      <div className={styles.gridLabels} aria-hidden="true">
        {categories.map((category) => (
          <div
            key={category}
            data-part-label={category}
            ref={(element) => { if (element) gridLabelRefs.current.set(category, element); else gridLabelRefs.current.delete(category); }}
            className={`${styles.gridLabel} ${selectedCategories.includes(category) ? styles.gridLabelSelected : ""}`}
          >
            <span className={styles.gridLabelCheck}>{selectedCategories.includes(category) ? "✓" : "·"}</span>
            {componentCategoryLabels[category]}
          </div>
        ))}
      </div>
      <div className={`${styles.interactionHint} ${layoutProgress >= 67 ? styles.interactionHintHidden : ""}`}>
        <span className={styles.dragGlyph}>⤢</span><span>Przeciągnij, aby obrócić · kliknij część, aby wybrać</span>
      </div>
      <div className={styles.layoutFooter} role="group" aria-label="Płynna zmiana ułożenia komputera">
        <div className={styles.layoutHeading}>
          <label htmlFor="pc-layout-range">UŁOŻENIE PODZESPOŁÓW</label>
          <output htmlFor="pc-layout-range" aria-live="polite">{layoutProgress}%</output>
        </div>
        <div className={styles.layoutSliderRow}>
          <span id="pc-layout-start" className={styles.layoutEndpoint}>Złożony komputer</span>
          <input
            id="pc-layout-range"
            className={styles.layoutRange}
            type="range"
            min="0"
            max="100"
            step="1"
            value={layoutProgress}
            onChange={(event) => setLayout(Number(event.target.value))}
            aria-label="Rozłożenie komputera"
            aria-valuetext={layoutProgress === 0 ? "Złożony komputer" : layoutProgress === 100 ? "Siatka części" : `${layoutProgress}% rozłożenia`}
            aria-describedby="pc-layout-start pc-layout-end"
            disabled={!!webglError}
            style={{ background: `linear-gradient(90deg,#54d6c9 0%,#54d6c9 ${layoutProgress}%,rgba(124,155,176,.22) ${layoutProgress}%,rgba(124,155,176,.22) 100%)` }}
          />
          <span id="pc-layout-end" className={styles.layoutEndpoint}>Siatka części</span>
        </div>
      </div>
    </div>
  );
}
