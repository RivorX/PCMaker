import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ComponentCategory } from "@/lib/drafts";

export type PcModelCategory = Exclude<ComponentCategory, "other">;

export const pcModelPaths: Record<PcModelCategory, string> = {
  case: "/models/pc/case.glb",
  motherboard: "/models/pc/motherboard.glb",
  cpu: "/models/pc/cpu.glb",
  memory: "/models/pc/memory.glb",
  gpu: "/models/pc/gpu.glb",
  storage: "/models/pc/storage.glb",
  psu: "/models/pc/psu.glb",
  cooling: "/models/pc/cooling.glb",
};

export type LoadedPcPart = {
  category: PcModelCategory;
  root: THREE.Group;
};

const perforationPitch = 0.0024;
const perforationHoleRadius = 0.0005;
const perforationRowStep = perforationPitch * Math.sqrt(3) / 2;
const perforationTileWidth = perforationPitch * 3;
const perforationTileHeight = perforationRowStep * 2;

const createPerforationTileMap = (): THREE.DataTexture => {
  // The repeated staggered tile makes the grille a single lightweight surface.
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    const localY = ((y + 0.5) / size) * perforationTileHeight;
    const row = Math.round(localY / perforationRowStep);
    const centerY = row * perforationRowStep;
    const rowOffset = Math.abs(row % 2) === 1 ? perforationPitch / 2 : 0;

    for (let x = 0; x < size; x += 1) {
      const localX = ((x + 0.5) / size) * perforationTileWidth;
      const column = Math.round((localX - rowOffset) / perforationPitch);
      let dx = localX - (rowOffset + column * perforationPitch);
      // Use the nearest periodic copy so holes crossing tile edges remain seamless.
      dx -= Math.round(dx / perforationTileWidth) * perforationTileWidth;
      const dy = localY - centerY;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = dx * dx + dy * dy <= perforationHoleRadius * perforationHoleRadius ? 0 : 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.channel = 1;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

type FanFootprint = { center: THREE.Vector2; radius: number };

const getObjectBoundsInLocalFrame = (object: THREE.Mesh, localFrame: THREE.Object3D): THREE.Box3 | undefined => {
  if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
  const bounds = object.geometry.boundingBox;
  if (!bounds) return undefined;

  const localBounds = new THREE.Box3().makeEmpty();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld);
        localFrame.worldToLocal(point);
        localBounds.expandByPoint(point);
      }
    }
  }
  return localBounds;
};

const createFrontFanGrille = (
  bounds: THREE.Box3,
  fans: FanFootprint[],
): { solid: THREE.BufferGeometry; perforated: THREE.BufferGeometry } => {
  const minX = bounds.min.x;
  const maxX = bounds.max.x;
  const minY = bounds.min.y;
  const maxY = bounds.max.y;
  const z = (bounds.min.z + bounds.max.z) / 2;
  const frontOffset = z + 0.00008;

  const shape = new THREE.Shape();
  shape.moveTo(minX, minY);
  shape.lineTo(maxX, minY);
  shape.lineTo(maxX, maxY);
  shape.lineTo(minX, maxY);
  shape.closePath();
  for (const fan of fans) {
    const opening = new THREE.Path();
    opening.absarc(fan.center.x, fan.center.y, fan.radius, 0, Math.PI * 2, true);
    shape.holes.push(opening);
  }
  const solid = new THREE.ShapeGeometry(shape, 48);
  solid.translate(0, 0, frontOffset);
  solid.computeBoundingBox();

  // Merge the three fan disks into one small geometry/material draw. A shared
  // tiled mask keeps the fine round perforations out of the continuous cover.
  const diskPositions: number[] = [];
  const diskNormals: number[] = [];
  const diskUvs: number[] = [];
  const diskIndices: number[] = [];
  const circleSegments = 48;
  for (const fan of fans) {
    const circle = new THREE.CircleGeometry(fan.radius, circleSegments);
    const positions = circle.getAttribute("position");
    const firstVertex = diskPositions.length / 3;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index) + fan.center.x;
      const y = positions.getY(index) + fan.center.y;
      diskPositions.push(x, y, frontOffset);
      diskNormals.push(0, 0, 1);
      diskUvs.push((x - minX) / perforationTileWidth, (y - minY) / perforationTileHeight);
    }
    for (const index of circle.getIndex()?.array ?? []) diskIndices.push(firstVertex + index);
    circle.dispose();
  }

  const perforated = new THREE.BufferGeometry();
  perforated.setAttribute("position", new THREE.Float32BufferAttribute(diskPositions, 3));
  perforated.setAttribute("normal", new THREE.Float32BufferAttribute(diskNormals, 3));
  perforated.setAttribute("uv1", new THREE.Float32BufferAttribute(diskUvs, 2));
  perforated.setIndex(diskIndices);
  perforated.computeBoundingBox();
  return { solid, perforated };
};

const addFrontFanGrille = (root: THREE.Group): void => {
  let panel: THREE.Mesh | undefined;
  const fanFrames: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
    const normalizedMaterial = mesh.material.name.replace(/[_-]+/g, " ");
    const normalizedMeshName = mesh.name.replace(/[_-]+/g, " ");
    if (/hexagonal mesh steel/i.test(normalizedMaterial)) panel = mesh;
    if (/front fan \d+ frame/i.test(normalizedMeshName)) fanFrames.push(mesh);
  });

  const frontPanel = panel;
  if (!frontPanel?.parent || fanFrames.length === 0) return;
  root.updateMatrixWorld(true);
  frontPanel.geometry.computeBoundingBox();
  const panelBounds = frontPanel.geometry.boundingBox;
  if (!panelBounds) return;

  const fans = fanFrames.flatMap((frame) => {
    const bounds = getObjectBoundsInLocalFrame(frame, frontPanel);
    if (!bounds) return [];
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.min(size.x, size.y) * 0.49;
    if (!Number.isFinite(radius) || radius <= 0) return [];
    const center = bounds.getCenter(new THREE.Vector3());
    return [{ center: new THREE.Vector2(center.x, center.y), radius }];
  });
  if (fans.length === 0) return;

  const geometries = createFrontFanGrille(panelBounds, fans);
  const solid = new THREE.MeshStandardMaterial({
    name: "Front fan surrounding steel",
    color: 0x171b1e,
    metalness: 0.16,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const perforated = new THREE.MeshStandardMaterial({
    name: "Front fan perforated steel",
    color: 0x171b1e,
    metalness: 0.24,
    roughness: 0.84,
    side: THREE.DoubleSide,
    alphaMap: createPerforationTileMap(),
    alphaTest: 0.02,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
  });
  const panelParts = [
    { geometry: geometries.solid, material: solid, name: "Front fan solid steel surround" },
    { geometry: geometries.perforated, material: perforated, name: "Front fan perforated steel disks" },
  ];
  for (const { geometry, material, name } of panelParts) {
    const grille = new THREE.Mesh(geometry, material);
    grille.name = name;
    grille.position.copy(frontPanel.position);
    grille.quaternion.copy(frontPanel.quaternion);
    grille.scale.copy(frontPanel.scale);
    grille.renderOrder = frontPanel.renderOrder;
    grille.castShadow = frontPanel.castShadow;
    grille.receiveShadow = frontPanel.receiveShadow;
    frontPanel.parent.add(grille);
  }
  frontPanel.visible = false;
};

const createRearFanApertureMap = (center: THREE.Vector2, radius: number): THREE.DataTexture => {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  data.fill(255);

  const apertureRadiusSquared = radius * radius;

  for (let y = 0; y < size; y += 1) {
    const pointY = center.y - radius + ((y + 0.5) / size) * radius * 2;
    const row = Math.round((pointY - center.y) / perforationRowStep);
    const rowCenterY = center.y + row * perforationRowStep;
    const rowOffset = Math.abs(row % 2) === 1 ? perforationPitch / 2 : 0;

    for (let x = 0; x < size; x += 1) {
      const pointX = center.x - radius + ((x + 0.5) / size) * radius * 2;
      const dx = pointX - center.x;
      const dy = pointY - center.y;
      if (dx * dx + dy * dy > apertureRadiusSquared) continue;

      const column = Math.round((pointX - center.x - rowOffset) / perforationPitch);
      const cellX = center.x + rowOffset + column * perforationPitch;
      const cellY = rowCenterY;
      const localX = pointX - cellX;
      const localY = pointY - cellY;
      if (localX * localX + localY * localY <= perforationHoleRadius * perforationHoleRadius) {
        data[(y * size + x) * 4 + 1] = 0;
      }
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.channel = 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

const addRearFanAperture = (root: THREE.Group): void => {
  let rearPanel: THREE.Mesh | undefined;
  let rearFanFrame: THREE.Mesh | undefined;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
    const normalizedMaterialName = mesh.material.name.replace(/[_-]+/g, " ");
    const normalizedMeshName = mesh.name.replace(/[_-]+/g, " ");
    if (/rear panel with honeycomb exhaust grille/i.test(normalizedMaterialName)) rearPanel = mesh;
    if (/rear fan frame/i.test(normalizedMeshName)) rearFanFrame = mesh;
  });

  if (!rearPanel || !rearFanFrame) return;

  root.updateMatrixWorld(true);
  if (!rearFanFrame.geometry.boundingBox) rearFanFrame.geometry.computeBoundingBox();
  const fanBounds = rearFanFrame.geometry.boundingBox;
  if (!fanBounds) return;

  const fanCenterWorld = fanBounds.getCenter(new THREE.Vector3()).applyMatrix4(rearFanFrame.matrixWorld);
  const fanCenterLocal = rearPanel.worldToLocal(fanCenterWorld);
  const fanWorldBounds = new THREE.Box3().setFromObject(rearFanFrame);
  const fanWorldSize = fanWorldBounds.getSize(new THREE.Vector3());
  const apertureRadius = Math.min(fanWorldSize.x, fanWorldSize.y) * 0.47;
  if (!Number.isFinite(apertureRadius) || apertureRadius <= 0) return;

  const positions = rearPanel.geometry.getAttribute("position");
  const projectedUvs = new Float32Array(positions.count * 2);
  const diameter = apertureRadius * 2;
  for (let index = 0; index < positions.count; index += 1) {
    projectedUvs[index * 2] = (positions.getX(index) - (fanCenterLocal.x - apertureRadius)) / diameter;
    projectedUvs[index * 2 + 1] = (positions.getY(index) - (fanCenterLocal.y - apertureRadius)) / diameter;
  }
  rearPanel.geometry.setAttribute("uv1", new THREE.BufferAttribute(projectedUvs, 2));

  const material = rearPanel.material as THREE.MeshStandardMaterial;
  material.alphaMap = createRearFanApertureMap(new THREE.Vector2(fanCenterLocal.x, fanCenterLocal.y), apertureRadius);
  // The scene dims non-selected case parts to 5%; this threshold still passes
  // those solid pixels while fully discarding the zero-alpha openings.
  material.alphaTest = Math.max(material.alphaTest, 0.025);
  material.transparent = true;
  material.depthWrite = false;
  material.forceSinglePass = true;
  material.needsUpdate = true;
};

export async function loadPcModelParts(manager: THREE.LoadingManager): Promise<LoadedPcPart[]> {
  const loader = new GLTFLoader(manager);
  const results = await Promise.allSettled(Object.entries(pcModelPaths).map(async ([category, path]) => {
    const gltf = await loader.loadAsync(path);
    const partRoot = new THREE.Group();
    partRoot.name = `${category}-asset`;
    partRoot.add(gltf.scene);
    if (category === "case") {
      addFrontFanGrille(partRoot);
      addRearFanAperture(partRoot);
    }
    return { category: category as PcModelCategory, root: partRoot };
  }));
  const loaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failed = results.some((result) => result.status === "rejected");
  if (failed) {
    disposePcModelRoots(loaded.map((part) => part.root));
    throw new Error("pc-model-load-failed");
  }
  return loaded;
}

/** Dispose GLB resources, including texture bitmaps, after an interrupted load or scene teardown. */
export function disposePcModelRoots(roots: Iterable<THREE.Object3D>): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const imageBitmaps = new Set<{ close?: () => void }>();
  for (const root of roots) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry);
      const materialList = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materialList) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
          else if (Array.isArray(value)) {
            for (const nested of value) if (nested instanceof THREE.Texture) textures.add(nested);
          }
        }
      }
    });
  }

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    const image = texture.source.data as { close?: () => void } | undefined;
    if (image?.close) imageBitmaps.add(image);
    texture.dispose();
  }
  for (const image of imageBitmaps) image.close?.();
}
