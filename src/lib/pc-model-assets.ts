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

export async function loadPcModelParts(manager: THREE.LoadingManager): Promise<LoadedPcPart[]> {
  const loader = new GLTFLoader(manager);
  const results = await Promise.allSettled(Object.entries(pcModelPaths).map(async ([category, path]) => {
    const gltf = await loader.loadAsync(path);
    const partRoot = new THREE.Group();
    partRoot.name = `${category}-asset`;
    partRoot.add(gltf.scene);
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
