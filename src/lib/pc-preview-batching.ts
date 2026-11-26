import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PcModelCategory } from "@/lib/pc-model-assets";

type BatchEntry = {
  source: THREE.Mesh;
  visible: boolean;
  hadRaycastIgnored: boolean;
  raycastIgnored: unknown;
};

type GeometryBatch = {
  mesh: THREE.Mesh;
  sources: BatchEntry[];
  raycastIgnored: boolean;
};

type MeshCandidate = {
  mesh: THREE.Mesh;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  signature: string;
  mirrored: boolean;
};

const identity = new THREE.Matrix4();
const reflectionY = new THREE.Matrix4().makeScale(1, -1, 1);

function isVisibleThroughAncestors(mesh: THREE.Object3D, group: THREE.Group): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current && current !== group) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return current === group && group.visible;
}

function isUnderExcludedRoot(mesh: THREE.Object3D, excludedRoots: readonly THREE.Object3D[]): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    if (excludedRoots.includes(current)) return true;
    current = current.parent;
  }
  return false;
}

function hasIgnoredAncestor(mesh: THREE.Object3D, group: THREE.Group): boolean {
  let current = mesh.parent;
  while (current && current !== group) {
    if (current.userData.raycastIgnored) return true;
    current = current.parent;
  }
  return false;
}

function attributeSignature(geometry: THREE.BufferGeometry): string | null {
  const names = Object.keys(geometry.attributes).sort();
  if (!names.includes("position") || Object.keys(geometry.morphAttributes).length > 0) return null;

  const attributes: string[] = [];
  for (const name of names) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) return null;
    const interleaved = attribute as THREE.InterleavedBufferAttribute;
    const isInterleaved = interleaved.isInterleavedBufferAttribute === true;
    if ((attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute
      || (isInterleaved && (interleaved as THREE.InterleavedBufferAttribute & {
        isInstancedInterleavedBufferAttribute?: boolean;
      }).isInstancedInterleavedBufferAttribute)) return null;
    const sourceArray = isInterleaved ? interleaved.data.array : (attribute as THREE.BufferAttribute).array;
    const gpuType = isInterleaved ? THREE.FloatType : (attribute as THREE.BufferAttribute).gpuType;
    attributes.push([
      name,
      sourceArray.constructor.name,
      attribute.itemSize,
      attribute.normalized ? 1 : 0,
      gpuType,
    ].join(":"));
  }

  const index = geometry.getIndex();
  return `${index ? index.array.constructor.name : "non-indexed"}|${attributes.join("|")}`;
}

function clonePackedGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  for (const [name, rawAttribute] of Object.entries(geometry.attributes)) {
    const attribute = rawAttribute as THREE.InterleavedBufferAttribute;
    const isInterleaved = attribute.isInterleavedBufferAttribute;
    const bufferAttribute = rawAttribute as THREE.BufferAttribute;
    const array = isInterleaved ? attribute.data.array : bufferAttribute.array;
    const stride = isInterleaved ? attribute.data.stride : attribute.itemSize;
    const offset = isInterleaved ? attribute.offset : 0;
    const useDecodedFloatValues = attribute.normalized
      && !(array instanceof Float32Array)
      && !(array instanceof Float64Array);
    if (!isInterleaved && !useDecodedFloatValues) continue;

    const packed = useDecodedFloatValues
      ? new Float32Array(attribute.count * attribute.itemSize)
      : new (array.constructor as { new(length: number): typeof array })(attribute.count * attribute.itemSize);
    for (let vertex = 0; vertex < attribute.count; vertex += 1) {
      const sourceStart = vertex * stride + offset;
      const packedStart = vertex * attribute.itemSize;
      for (let component = 0; component < attribute.itemSize; component += 1) {
        packed[packedStart + component] = useDecodedFloatValues
          ? attribute.getComponent(vertex, component)
          : array[sourceStart + component];
      }
    }

    const packedAttribute = new THREE.BufferAttribute(packed, attribute.itemSize, useDecodedFloatValues ? false : attribute.normalized);
    packedAttribute.name = attribute.name;
    packedAttribute.setUsage(isInterleaved ? attribute.data.usage : bufferAttribute.usage);
    geometry.setAttribute(name, packedAttribute);
  }
  return geometry;
}

function meshStateSignature(mesh: THREE.Mesh): string | null {
  const material = mesh.material as THREE.Material;
  if (material.transparent || material.opacity !== 1 || material.depthWrite === false) return null;
  if ("alphaMap" in material && material.alphaMap) return null;
  if ("alphaTest" in material && material.alphaTest !== 0) return null;
  if ("alphaHash" in material && material.alphaHash) return null;
  if ("alphaToCoverage" in material && material.alphaToCoverage) return null;
  if (material.blending !== THREE.NormalBlending) return null;
  if (material.clippingPlanes?.length) return null;
  if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
    || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender
    || mesh.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow
    || mesh.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow) return null;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial || !mesh.matrixAutoUpdate || !mesh.matrixWorldAutoUpdate) return null;

  return [
    mesh.renderOrder,
    mesh.castShadow ? 1 : 0,
    mesh.receiveShadow ? 1 : 0,
    mesh.frustumCulled ? 1 : 0,
    mesh.layers.mask,
    mesh.userData.raycastIgnored ? 1 : 0,
  ].join(":");
}

function candidateFor(
  mesh: THREE.Mesh,
  group: THREE.Group,
  inverseGroupWorld: THREE.Matrix4,
  excludedRoots: readonly THREE.Object3D[],
): MeshCandidate | null {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return null;
  if (Array.isArray(mesh.material) || !mesh.material || !mesh.geometry?.isBufferGeometry) return null;
  if (mesh.userData.category !== group.userData.category || !isVisibleThroughAncestors(mesh, group)) return null;
  if (isUnderExcludedRoot(mesh, excludedRoots) || hasIgnoredAncestor(mesh, group)) return null;
  // GLTFLoader copies inert `name` and descriptive extras to userData; keep the
  // source objects (with those fields) and batch based on actual render state.
  if (mesh.geometry.groups.length > 0) return null;
  const position = mesh.geometry.getAttribute("position");
  if (!position || mesh.geometry.drawRange.start !== 0) return null;
  const vertexOrIndexCount = mesh.geometry.index?.count ?? position.count;
  if (mesh.geometry.drawRange.count !== Infinity && mesh.geometry.drawRange.count < vertexOrIndexCount) return null;

  const attributes = attributeSignature(mesh.geometry);
  const state = meshStateSignature(mesh);
  if (!attributes || !state) return null;

  const relativeMatrix = new THREE.Matrix4().multiplyMatrices(inverseGroupWorld, mesh.matrixWorld);
  const determinant = relativeMatrix.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;

  return {
    mesh,
    material: mesh.material,
    matrix: relativeMatrix,
    signature: `${attributes}|${state}`,
    mirrored: determinant < 0,
  };
}

function restoreSource(entry: BatchEntry): void {
  entry.source.visible = entry.visible;
  if (entry.hadRaycastIgnored) entry.source.userData.raycastIgnored = entry.raycastIgnored;
  else delete entry.source.userData.raycastIgnored;
}

function makeBatch(category: PcModelCategory, group: THREE.Group, candidates: MeshCandidate[]): GeometryBatch | null {
  if (candidates.length < 2) return null;
  const mirrored = candidates[0].mirrored;
  if (candidates.some((candidate) => candidate.mirrored !== mirrored)) return null;

  const geometryTransform = mirrored ? reflectionY : identity;
  const inverseTransform = mirrored ? reflectionY : identity;
  const transformed: THREE.BufferGeometry[] = [];
  let merged: THREE.BufferGeometry | null = null;
  try {
    for (const candidate of candidates) {
      transformed.push(clonePackedGeometry(candidate.mesh.geometry).applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverseTransform, candidate.matrix),
      ));
    }
    merged = mergeGeometries(transformed, false);
    if (!merged) return null;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();

    const first = candidates[0].mesh;
    const batched = new THREE.Mesh(merged, candidates[0].material);
    batched.name = `Batched static ${category} meshes`;
    batched.userData.category = category;
    if (first.userData.raycastIgnored) batched.userData.raycastIgnored = true;
    batched.matrixAutoUpdate = false;
    batched.matrix.copy(geometryTransform);
    batched.matrixWorldAutoUpdate = true;
    batched.renderOrder = first.renderOrder;
    batched.castShadow = first.castShadow;
    batched.receiveShadow = first.receiveShadow;
    batched.frustumCulled = first.frustumCulled;
    batched.layers.mask = first.layers.mask;
    batched.visible = false;
    group.add(batched);

    return {
      mesh: batched,
      raycastIgnored: Boolean(first.userData.raycastIgnored),
      sources: candidates.map(({ mesh }) => ({
        source: mesh,
        visible: mesh.visible,
        hadRaycastIgnored: Object.prototype.hasOwnProperty.call(mesh.userData, "raycastIgnored"),
        raycastIgnored: mesh.userData.raycastIgnored,
      })),
    };
  } catch {
    merged?.dispose();
    return null;
  } finally {
    for (const geometry of transformed) geometry.dispose();
  }
}

/**
 * Build opt-in opaque mesh batches once, after category transforms are settled.
 * Source meshes stay in the scene so ghosted and excluded parts render normally.
 */
export function batchPcPreviewMeshes(
  groups: ReadonlyMap<PcModelCategory, THREE.Group>,
  excludedRoots: readonly THREE.Object3D[],
): (category: PcModelCategory, enabled: boolean) => void {
  const batchesByCategory = new Map<PcModelCategory, GeometryBatch[]>();

  for (const [category, group] of groups) {
    group.updateWorldMatrix(true, true);
    const inverseGroupWorld = group.matrixWorld.clone().invert();
    const candidatesByMaterial = new Map<THREE.Material, Map<string, MeshCandidate[]>>();

    group.traverse((object) => {
      const candidate = candidateFor(object as THREE.Mesh, group, inverseGroupWorld, excludedRoots);
      if (!candidate) return;
      let bySignature = candidatesByMaterial.get(candidate.material);
      if (!bySignature) candidatesByMaterial.set(candidate.material, bySignature = new Map());
      const candidates = bySignature.get(candidate.signature);
      if (candidates) candidates.push(candidate);
      else bySignature.set(candidate.signature, [candidate]);
    });

    const batches: GeometryBatch[] = [];
    for (const bySignature of candidatesByMaterial.values()) {
      for (const candidates of bySignature.values()) {
        const batch = makeBatch(category, group, candidates);
        if (batch) batches.push(batch);
      }
    }
    if (batches.length) batchesByCategory.set(category, batches);
  }

  return (category, enabled) => {
    for (const batch of batchesByCategory.get(category) ?? []) {
      batch.mesh.visible = enabled;
      batch.mesh.userData.raycastIgnored = !enabled || batch.raycastIgnored;
      for (const source of batch.sources) {
        source.source.visible = enabled ? false : source.visible;
        if (enabled) source.source.userData.raycastIgnored = true;
        else restoreSource(source);
      }
    }
  };
}
