import * as THREE from "three";
import type { PcModelCategory } from "@/lib/pc-model-assets";

/** A reusable pose for the centered, unit-scaled category groups in the scene. */
export type PcMechanicalPose = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
};

export type PcMechanicalPlan = {
  assembled: Map<PcModelCategory, PcMechanicalPose>;
  release: Map<PcModelCategory, PcMechanicalPose>;
  extracted: Map<PcModelCategory, PcMechanicalPose>;
  spread: Map<PcModelCategory, PcMechanicalPose>;
  panel: {
    object: THREE.Object3D;
    closed: PcMechanicalPose;
    open: PcMechanicalPose;
    out: PcMechanicalPose;
  };
  diagnostics: PcMechanicalDiagnostics;
};

export type PcMechanicalDiagnostics = {
  boardStandoffGapMm: number | null;
  boardTrayClearanceXmm: number | null;
  boardTrayClearanceYmm: number | null;
  motherboardOpeningClearanceXmm: number | null;
  motherboardOpeningClearanceYmm: number | null;
  rearDisengagementMm: number;
  gpuConnectorAlignmentMm: number | null;
  gpuContactContainmentXmm: number | null;
  gpuContactContainmentYmm: number | null;
  gpuContactContainmentZmm: number | null;
  gpuBracketRearClearanceMm: number | null;
  psuHousingOpeningHeightClearanceMm: number | null;
  psuGuardRoofGapMm: number | null;
  psuRearOpeningClearanceYMm: number | null;
  psuRearOpeningClearanceZMm: number | null;
  psuRearFaceClearanceMm: number | null;
  cohortExtractionMm: number;
  panelCorridorClearanceMm: number;
  gpuFanNormalAfterAssembly: [number, number, number];
  assumptions: string[];
};

const categories: PcModelCategory[] = ["case", "motherboard", "cpu", "memory", "gpu", "storage", "psu", "cooling"];
const internalCategories: PcModelCategory[] = ["motherboard", "cpu", "memory", "gpu", "storage", "cooling"];
const EPSILON = 1e-7;
const CONTACT_GAP = 0.0004;
const REAR_RELEASE_CLEARANCE = 0.006;
const SIDE_EXIT_CLEARANCE = 0.03;
const SPREAD_FRONT_CLEARANCE = 0.7;

function poseOf(object: THREE.Object3D): PcMechanicalPose {
  return { position: object.position.clone(), rotation: object.quaternion.clone(), scale: object.scale.clone() };
}

function copyPose(target: THREE.Object3D, pose: PcMechanicalPose): void {
  target.position.copy(pose.position);
  target.quaternion.copy(pose.rotation);
  target.scale.copy(pose.scale);
}

function findObject(root: THREE.Object3D, name: RegExp): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((object) => {
    const normalizedName = object.name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    name.lastIndex = 0;
    if (!found && name.test(normalizedName)) found = object;
  });
  return found;
}

function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function categoryBounds(group: THREE.Group): THREE.Box3 {
  group.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(group);
}

function centerOf(box: THREE.Box3): THREE.Vector3 {
  return box.getCenter(new THREE.Vector3());
}

function setWorldOffset(object: THREE.Object3D, delta: THREE.Vector3): void {
  const parent = object.parent;
  if (!parent) {
    object.position.add(delta);
    return;
  }
  parent.updateWorldMatrix(true, false);
  const inverse = parent.matrixWorld.clone().invert();
  const localOrigin = new THREE.Vector3().applyMatrix4(inverse);
  const localDestination = delta.clone().applyMatrix4(inverse);
  object.position.add(localDestination.sub(localOrigin));
}

function worldVectorInParent(object: THREE.Object3D, delta: THREE.Vector3): THREE.Vector3 {
  const parent = object.parent;
  if (!parent) return delta.clone();
  parent.updateWorldMatrix(true, false);
  const inverse = parent.matrixWorld.clone().invert();
  const origin = new THREE.Vector3().applyMatrix4(inverse);
  return delta.clone().applyMatrix4(inverse).sub(origin);
}

function namedBoundsUnion(root: THREE.Object3D, name: RegExp): THREE.Box3 | null {
  const bounds = new THREE.Box3().makeEmpty();
  let found = false;
  root.traverse((object) => {
    const normalizedName = object.name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    name.lastIndex = 0;
    if (name.test(normalizedName)) {
      bounds.union(boundsOf(object));
      found = true;
    }
  });
  return found ? bounds : null;
}

/**
 * Raise the PSU chamber roof and the connected shroud wall tops by editing only
 * vertices on their original shared roof plane. GLB geometry is cloned before
 * mutation; positions and bounds change, while indices, normals, UVs and materials
 * remain intact. All measurements and the requested plane are in world metres.
 */
function raisePsuShroudRoof(caseRoot: THREE.Group, roofY: number, targetY: number): number {
  const raise = targetY - roofY;
  if (raise <= EPSILON) return 0;
  const tolerance = 0.00005;
  let moved = 0;
  caseRoot.updateWorldMatrix(true, true);
  caseRoot.traverse((object) => {
    const name = object.name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    if (!(object as THREE.Mesh).isMesh || !/^PSU shroud [12]$/i.test(name)) return;
    const mesh = object as THREE.Mesh;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    const vertices = geometry.getAttribute("position");
    mesh.updateWorldMatrix(true, false);
    const inverseWorld = mesh.matrixWorld.clone().invert();
    const worldVertex = new THREE.Vector3();
    for (let index = 0; index < vertices.count; index += 1) {
      worldVertex.fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(worldVertex.y - roofY) > tolerance) continue;
      worldVertex.y = targetY;
      worldVertex.applyMatrix4(inverseWorld);
      vertices.setXYZ(index, worldVertex.x, worldVertex.y, worldVertex.z);
      moved += 1;
    }
    if (moved > 0) {
      vertices.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
  });
  caseRoot.updateWorldMatrix(true, true);
  return moved;
}

function findRearPsuAperture(panel: THREE.Mesh): { bounds: THREE.Box3; vertexIndices: number[] } | null {
  const geometry = panel.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || !index) return null;
  panel.updateWorldMatrix(true, false);
  const edgeUse = new Map<string, { a: number; b: number; count: number }>();
  for (let offset = 0; offset < index.count; offset += 3) {
    const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const current = edgeUse.get(key);
      if (current) current.count += 1;
      else edgeUse.set(key, { a, b, count: 1 });
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const { a, b, count } of edgeUse.values()) {
    if (count !== 1) continue;
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  }

  const visited = new Set<number>();
  const loops: Array<{ bounds: THREE.Box3; vertexIndices: number[] }> = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const loop = [start];
    let previous = -1;
    let current = start;
    while (true) {
      visited.add(current);
      const next = (adjacency.get(current) ?? []).find((candidate) => candidate === start
        ? loop.length >= 3
        : candidate !== previous && !visited.has(candidate));
      if (next === undefined) break;
      loop.push(next);
      previous = current;
      current = next;
      if (current === start) break;
    }
    if (current !== start || loop.length < 4) continue;
    const bounds = new THREE.Box3().makeEmpty();
    for (const vertex of loop) bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(panel.matrixWorld));
    loops.push({ bounds, vertexIndices: loop });
  }
  const panelBounds = boundsOf(panel);
  return loops
    .filter(({ bounds }) => bounds.getSize(new THREE.Vector3()).x < 0.001
      && bounds.min.y > panelBounds.min.y + 0.001
      && bounds.max.y < panelBounds.min.y + 0.12)
    .sort((a, b) => b.bounds.getSize(new THREE.Vector3()).y * b.bounds.getSize(new THREE.Vector3()).z
      - a.bounds.getSize(new THREE.Vector3()).y * a.bounds.getSize(new THREE.Vector3()).z)[0] ?? null;
}

function resizeAperture(
  panel: THREE.Mesh,
  vertexIndices: number[],
  oldBounds: THREE.Box3,
  targetBounds: THREE.Box3,
): number {
  const geometry = panel.geometry.clone();
  panel.geometry = geometry;
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  panel.updateWorldMatrix(true, false);
  const inverseWorld = panel.matrixWorld.clone().invert();
  const worldVertex = new THREE.Vector3();
  for (const index of vertexIndices) {
    worldVertex.fromBufferAttribute(position, index).applyMatrix4(panel.matrixWorld);
    if (Math.abs(worldVertex.y - oldBounds.min.y) < 0.0001) worldVertex.y = targetBounds.min.y;
    if (Math.abs(worldVertex.y - oldBounds.max.y) < 0.0001) worldVertex.y = targetBounds.max.y;
    if (Math.abs(worldVertex.z - oldBounds.min.z) < 0.0001) worldVertex.z = targetBounds.min.z;
    if (Math.abs(worldVertex.z - oldBounds.max.z) < 0.0001) worldVertex.z = targetBounds.max.z;
    worldVertex.applyMatrix4(inverseWorld);
    position.setXYZ(index, worldVertex.x, worldVertex.y, worldVertex.z);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  panel.updateWorldMatrix(true, false);
  return vertexIndices.length;
}

function centeredChildBounds(child: THREE.Object3D): THREE.Box3 {
  child.position.set(0, 0, 0);
  const initial = boundsOf(child);
  child.position.sub(centerOf(initial));
  return boundsOf(child);
}

function blendPose(group: THREE.Group, from: PcMechanicalPose, to: PcMechanicalPose, amount: number): void {
  group.position.lerpVectors(from.position, to.position, amount);
  group.quaternion.slerpQuaternions(from.rotation, to.rotation, amount);
  group.scale.lerpVectors(from.scale, to.scale, amount);
}

function smooth(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function record(map: Map<PcModelCategory, PcMechanicalPose>, category: PcModelCategory, group: THREE.Group): void {
  map.set(category, poseOf(group));
}

function minimumInteriorMargin(inner: THREE.Box3, outer: THREE.Box3, axis: "x" | "y"): number {
  return Math.min(inner.min[axis] - outer.min[axis], outer.max[axis] - inner.max[axis]);
}

/**
 * Fits the centered GLB groups to measured anchors in the actual case/board files,
 * then precomputes the reversible disassembly poses. Coordinates are world metres,
 * +Y is up, the glass side is +Z, the front is +X and the rear is −X.
 *
 * `localBoundsByCategory` must contain the same initial centered/scaled bounds used
 * to build the caller's grid targets. Named child meshes are measured from their
 * actual BufferGeometry bounds after their node transforms, not asset-page estimates.
 */
export function preparePcMechanicalLayout(
  groups: Map<PcModelCategory, THREE.Group>,
  localBoundsByCategory: Map<PcModelCategory, THREE.Box3>,
): PcMechanicalPlan {
  const caseGroup = groups.get("case");
  const boardGroup = groups.get("motherboard");
  const cpuGroup = groups.get("cpu");
  const memoryGroup = groups.get("memory");
  const gpuGroup = groups.get("gpu");
  const storageGroup = groups.get("storage");
  const psuGroup = groups.get("psu");
  const coolingGroup = groups.get("cooling");
  if (!caseGroup || !boardGroup || !cpuGroup || !memoryGroup || !gpuGroup || !storageGroup || !psuGroup || !coolingGroup) {
    throw new Error("pc-mechanical-layout-missing-category");
  }

  const assumptions: string[] = [];
  caseGroup.position.set(0, 0, 0);
  const caseBounds = categoryBounds(caseGroup);
  const rearPanel = findObject(caseGroup, /^Steel chassis panels 2$/i) as THREE.Mesh | null;
  const rearPlaneX = rearPanel ? boundsOf(rearPanel).getCenter(new THREE.Vector3()).x : caseBounds.min.x;
  const tray = findObject(caseGroup, /^Motherboard tray$/i);
  const standoffs = findObject(caseGroup, /Motherboard standoffs \(ATX pattern\)/i);
  const trayBounds = tray ? boundsOf(tray) : caseBounds;
  const standoffBounds = standoffs ? boundsOf(standoffs) : trayBounds;
  if (!standoffs) assumptions.push("Case GLB has no named standoff mesh; PCB back plane is seated against the named motherboard tray with 0.4 mm clearance.");

  // Match the actual PCB sheet to the case's nine-standoff cluster. The I/O and
  // connector meshes are excluded from the seating surface and tray footprint.
  const pcb = findObject(boardGroup, /^Printed circuit board$/i);
  if (pcb) {
    const pcbBounds = boundsOf(pcb);
    const pcbCenter = centerOf(pcbBounds);
    const standCenter = centerOf(standoffBounds);
    boardGroup.position.x += standCenter.x - pcbCenter.x;
    boardGroup.position.y += standCenter.y - pcbCenter.y;
    const seatedPcb = boundsOf(pcb);
    const targetBack = standoffBounds.max.z + CONTACT_GAP;
    boardGroup.position.z += targetBack - seatedPcb.min.z;
  } else {
    assumptions.push("PCB mesh not found; used the motherboard root bounds as the seating proxy.");
    const boardBounds = categoryBounds(boardGroup);
    const boardCenter = centerOf(boardBounds);
    const standCenter = centerOf(standoffBounds);
    boardGroup.position.x += standCenter.x - boardCenter.x;
    boardGroup.position.y += standCenter.y - boardCenter.y;
    boardGroup.position.z += standoffBounds.max.z + CONTACT_GAP - boardBounds.min.z;
  }
  const pcbAfterMount = pcb ? boundsOf(pcb) : categoryBounds(boardGroup);
  const standoffGapMm = pcbAfterMount.min.z - standoffBounds.max.z;
  const trayClearanceX = minimumInteriorMargin(pcbAfterMount, trayBounds, "x");
  const trayClearanceY = minimumInteriorMargin(pcbAfterMount, trayBounds, "y");
  const openingClearanceX = (caseBounds.max.x - caseBounds.min.x - pcbAfterMount.getSize(new THREE.Vector3()).x) / 2;
  const openingClearanceY = (caseBounds.max.y - caseBounds.min.y - pcbAfterMount.getSize(new THREE.Vector3()).y) / 2;

  // The factory socket cap is replaced by the installed processor. The socket
  // frame remains; the substrate rests on the housing's actual top surface.
  const socketHousing = findObject(boardGroup, /^CPU socket housing$/i);
  const cpuSubstrate = findObject(cpuGroup, /^Processor package substrate$/i);
  const cpuTop = findObject(cpuGroup, /^Integrated heat spreader$/i);
  const socketCap = findObject(boardGroup, /^Socket protective cap$/i);
  if (socketCap) socketCap.visible = false;
  if (socketHousing && cpuSubstrate) {
    const socket = boundsOf(socketHousing);
    const substrate = boundsOf(cpuSubstrate);
    const socketCenter = centerOf(socket);
    const substrateCenter = centerOf(substrate);
    cpuGroup.position.set(
      socketCenter.x - substrateCenter.x,
      socketCenter.y - substrateCenter.y,
      socket.max.z + CONTACT_GAP - substrate.min.z,
    );
  } else {
    assumptions.push("CPU socket housing or processor substrate mesh missing; CPU remains at its centered origin.");
  }

  // A DIMM is vertical to the PCB: its gold edge enters the slot and its broad
  // face remains perpendicular to the board. Clone one source stick for A2/B2.
  memoryGroup.position.set(0, 0, 0);
  memoryGroup.quaternion.identity();
  memoryGroup.scale.set(1, 1, 1);
  const ramRoots = memoryGroup.children.filter((child) => child.type === "Group");
  if (ramRoots.length === 1) {
    const second = ramRoots[0].clone(true);
    second.name = "memory-stick-secondary";
    memoryGroup.add(second);
    ramRoots.push(second);
  }
  const dimmSlots = [findObject(boardGroup, /^DIMM slot A2$/i), findObject(boardGroup, /^DIMM slot B2$/i)];
  const dimmSlotBounds = dimmSlots.map((slot) => slot ? boundsOf(slot) : null);
  for (let index = 0; index < Math.min(2, ramRoots.length); index += 1) {
    const root = ramRoots[index];
    // The RAM asset already carries its Rz(90°) mounting orientation from
    // centeredAsset. Keep it: the board asset has its own child rotation, so
    // the category group's identity quaternion is not the board's world frame.
    const ramBounds = centeredChildBounds(root);
    const slot = dimmSlotBounds[index];
    if (slot) {
      const slotCenter = centerOf(slot);
      root.position.set(
        slotCenter.x - centerOf(ramBounds).x,
        slotCenter.y - centerOf(ramBounds).y,
        slot.max.z - ramBounds.min.z - 0.001,
      );
    } else {
      assumptions.push(`DIMM slot ${index === 0 ? "A2" : "B2"} missing; RAM stick remains centered.`);
    }
  }
  if (ramRoots.length > 2) assumptions.push("More than two RAM roots supplied; only A2/B2 are mechanically anchored.");

  // Match GPU gold fingers directly to the selected PCIe slot. The root scene
  // rotation maps the card's +Y fan normal to world −Y while preserving its X edge.
  const pcieSlot = findObject(boardGroup, /^PCIe x16 slot 1$/i) ?? findObject(boardGroup, /PCIe.*x16/i);
  const gpuContacts = findObject(gpuGroup, /Gold-finger contacts \(x16\)|Gold-finger contacts|PCIe contacts/i);
  const pcieSlotArmour = findObject(boardGroup, /^PCIe slot armour \(steel\)$/i);
  if (pcieSlot && gpuContacts) {
    const slot = boundsOf(pcieSlot);
    const contacts = boundsOf(gpuContacts);
    const slotCenter = centerOf(slot);
    const contactsCenter = centerOf(contacts);
    gpuGroup.position.y += slotCenter.y - contactsCenter.y;
    gpuGroup.position.z += slotCenter.z - contactsCenter.z;
  } else {
    assumptions.push("GPU contacts or PCIe x16 slot missing; GPU remains centered at its incoming pose.");
  }
  const gpuBracket = findObject(gpuGroup, /^Slot bracket$/i);
  if (gpuBracket && rearPanel) {
    const bracketBounds = boundsOf(gpuBracket);
    gpuGroup.position.x += rearPlaneX + 0.0004 - bracketBounds.min.x;
  } else {
    assumptions.push("GPU slot bracket or rear case panel missing; bracket remains at its connector-aligned position.");
  }
  if (pcieSlot && gpuContacts && gpuBracket) {
    const contactCenterX = boundsOf(gpuContacts).getCenter(new THREE.Vector3()).x;
    const slotCenterX = boundsOf(pcieSlot).getCenter(new THREE.Vector3()).x;
    const rearwardCalibration = contactCenterX - slotCenterX;
    const worldOffset = new THREE.Vector3(rearwardCalibration, 0, 0);
    setWorldOffset(pcieSlot, worldOffset);
    if (pcieSlotArmour) setWorldOffset(pcieSlotArmour, worldOffset);
  } else {
    assumptions.push("GPU connector calibration skipped because a named slot, contact bank, or rear bracket is missing.");
  }
  const gpuContactBounds = gpuContacts ? boundsOf(gpuContacts) : null;
  const pcieSlotBounds = pcieSlot ? boundsOf(pcieSlot) : null;
  const gpuContactAlignment = pcieSlot && gpuContacts
    ? gpuContactBounds!.getCenter(new THREE.Vector3()).distanceTo(pcieSlotBounds!.getCenter(new THREE.Vector3()))
    : null;
  const gpuContactContainmentX = gpuContactBounds && pcieSlotBounds
    ? Math.min(gpuContactBounds.min.x - pcieSlotBounds.min.x, pcieSlotBounds.max.x - gpuContactBounds.max.x) : null;
  const gpuContactContainmentY = gpuContactBounds && pcieSlotBounds
    ? Math.min(gpuContactBounds.min.y - pcieSlotBounds.min.y, pcieSlotBounds.max.y - gpuContactBounds.max.y) : null;
  const gpuContactContainmentZ = gpuContactBounds && pcieSlotBounds
    ? Math.min(gpuContactBounds.min.z - pcieSlotBounds.min.z, pcieSlotBounds.max.z - gpuContactBounds.max.z) : null;
  const gpuBracketRearClearance = gpuBracket && rearPanel
    ? boundsOf(gpuBracket).min.x - rearPlaneX
    : null;

  // Place the SSD connector in M.2 socket 1 without altering its source scale.
  const m2Socket = findObject(boardGroup, /^M\.?2 connector 1$/i) ?? findObject(boardGroup, /M\.?2 connector/i);
  const ssdContacts = findObject(storageGroup, /^Gold.?finger contacts$/i);
  if (m2Socket && ssdContacts) {
    const slot = boundsOf(m2Socket);
    let drive = boundsOf(storageGroup);
    const size = slot.getSize(new THREE.Vector3());
    if ((size.x > size.y && drive.getSize(new THREE.Vector3()).y > drive.getSize(new THREE.Vector3()).x)
      || (size.y > size.x && drive.getSize(new THREE.Vector3()).x > drive.getSize(new THREE.Vector3()).y)) {
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      storageGroup.quaternion.premultiply(turn);
      drive = boundsOf(storageGroup);
    }
    const contacts = boundsOf(ssdContacts);
    const slotCenter = centerOf(slot);
    const contactCenter = centerOf(contacts);
    storageGroup.position.add(slotCenter.sub(contactCenter));
  } else {
    assumptions.push("M.2 socket or SSD contacts missing; storage remains at its centered origin.");
  }

  // Seat the PSU housing at the case's standard rear PSU aperture. The source
  // shell is 150 × 86 mm; its front/back envelope may be slightly larger at guards.
  const psuHousing = findObject(psuGroup, /^Steel housing$/i);
  const shroud = findObject(caseGroup, /^PSU shroud$/i);
  let shroudBounds = shroud ? boundsOf(shroud) : caseBounds;
  const rearAperture = rearPanel?.isMesh ? findRearPsuAperture(rearPanel) : null;
  if (psuHousing) {
    const housing = boundsOf(psuHousing);
    const shellSize = housing.getSize(new THREE.Vector3());
    const center = new THREE.Vector3(
      rearPlaneX + shellSize.x / 2 + 0.0004,
      shroudBounds.min.y + shellSize.y / 2,
      rearAperture ? rearAperture.bounds.getCenter(new THREE.Vector3()).z : caseBounds.getCenter(new THREE.Vector3()).z,
    );
    psuGroup.position.add(center.sub(centerOf(housing)));
  } else {
    assumptions.push("PSU steel housing missing; PSU remains at its centered origin.");
  }

  const psuEnvelopeBeforeFit = categoryBounds(psuGroup);
  let rearApertureAfterFit: THREE.Box3 | null = null;
  if (rearPanel && rearAperture) {
    const targetAperture = new THREE.Box3(
      new THREE.Vector3(
        rearAperture.bounds.min.x,
        Math.min(rearAperture.bounds.min.y, psuEnvelopeBeforeFit.min.y - 0.0004),
        Math.min(rearAperture.bounds.min.z, psuEnvelopeBeforeFit.min.z - 0.0004),
      ),
      new THREE.Vector3(
        rearAperture.bounds.max.x,
        Math.max(rearAperture.bounds.max.y, psuEnvelopeBeforeFit.max.y + 0.0004),
        Math.max(rearAperture.bounds.max.z, psuEnvelopeBeforeFit.max.z + 0.0004),
      ),
    );
    resizeAperture(rearPanel, rearAperture.vertexIndices, rearAperture.bounds, targetAperture);
    rearApertureAfterFit = targetAperture;
  } else {
    assumptions.push("Rear PSU aperture boundary was not found; PSU uses the case-centered rear fit.");
  }

  const psuGuard = findObject(psuGroup, /^Fan finger guard$/i);
  const psuGuardBeforeFit = psuGuard ? boundsOf(psuGuard) : null;
  const shroudRoof = findObject(caseGroup, /^PSU shroud 2$/i);
  if (psuGuardBeforeFit && shroudRoof) {
    const oldRoofBounds = boundsOf(shroudRoof);
    const targetRoofY = psuGuardBeforeFit.max.y + 0.0004;
    const changedVertices = raisePsuShroudRoof(caseGroup, oldRoofBounds.max.y, targetRoofY);
    if (changedVertices === 0) assumptions.push("PSU shroud roof/wall top vertices were not found on the measured roof plane.");
    shroudBounds = shroud ? boundsOf(shroud) : caseBounds;
  } else {
    assumptions.push("PSU fan guard or named chamber roof missing; chamber clearance was not fitted.");
  }

  // The cooler base contacts the CPU heat spreader. Its tower projects along the
  // motherboard normal (+Z), while its fan remains on the modeled side of the fin stack.
  const coolerBase = findObject(coolingGroup, /^Base and mounting bar$/i);
  if (coolerBase && cpuTop) {
    const base = boundsOf(coolerBase);
    const ihs = boundsOf(cpuTop);
    const baseCenter = centerOf(base);
    const ihsCenter = centerOf(ihs);
    coolingGroup.position.set(
      ihsCenter.x - baseCenter.x,
      ihsCenter.y - baseCenter.y,
      ihs.max.z + CONTACT_GAP - base.min.z,
    );
  } else {
    assumptions.push("Cooler base or CPU heat spreader missing; cooler remains at its centered origin.");
  }

  const assembled = new Map<PcModelCategory, PcMechanicalPose>();
  for (const category of categories) {
    const group = groups.get(category)!;
    if (category !== "case") group.updateWorldMatrix(true, true);
    record(assembled, category, group);
  }

  const panelObject = findObject(caseGroup, /^Tempered glass side panel$/i) ?? findObject(caseGroup, /glass side panel/i);
  if (!panelObject) throw new Error("pc-mechanical-layout-glass-panel-missing");
  const panelClosed = poseOf(panelObject);
  const panelBounds = boundsOf(panelObject);
  const slideDistance = Math.max(0.03, caseBounds.max.z - panelBounds.min.z + 0.03);
  const liftDistance = Math.max(0, caseBounds.max.y + 0.03 - panelBounds.min.y);
  const worldSlide = new THREE.Vector3(0, 0, slideDistance);
  const worldLift = new THREE.Vector3(0, liftDistance, 0);
  const panelOpen = {
    position: panelClosed.position.clone().add(worldVectorInParent(panelObject, worldSlide)),
    rotation: panelClosed.rotation.clone(),
    scale: panelClosed.scale.clone(),
  };
  const panelOut = {
    position: panelOpen.position.clone().add(worldVectorInParent(panelObject, worldLift)),
    rotation: panelOpen.rotation.clone(),
    scale: panelOpen.scale.clone(),
  };
  const panelOutBounds = panelBounds.clone().translate(worldSlide).translate(worldLift);
  const panelCorridorClearance = panelOutBounds.min.y - caseBounds.max.y;

  const release = new Map<PcModelCategory, PcMechanicalPose>();
  for (const category of categories) record(release, category, groups.get(category)!);
  const boardRearBounds = namedBoundsUnion(boardGroup, /Rear I\/O port shells|Rear I\/O port tongues|Rear I\/O cover|LAN jack|Audio jacks|Antenna connectors and button/i);
  let rearDisengagement = 0;
  if (boardRearBounds) {
    rearDisengagement = Math.max(rearDisengagement, caseBounds.min.x + REAR_RELEASE_CLEARANCE - boardRearBounds.min.x);
  }
  if (gpuBracket) {
    const bracketBounds = boundsOf(gpuBracket);
    rearDisengagement = Math.max(rearDisengagement, caseBounds.min.x + REAR_RELEASE_CLEARANCE - bracketBounds.min.x);
  }
  rearDisengagement = Math.max(0, rearDisengagement);
  for (const category of internalCategories) {
    const group = groups.get(category)!;
    const pose = release.get(category)!;
    pose.position.x += rearDisengagement;
    copyPose(group, pose);
  }

  const extracted = new Map<PcModelCategory, PcMechanicalPose>();
  let cohortDeltaZ = 0;
  for (const category of internalCategories) {
    const bounds = categoryBounds(groups.get(category)!);
    cohortDeltaZ = Math.max(cohortDeltaZ, caseBounds.max.z + SIDE_EXIT_CLEARANCE - bounds.min.z);
  }
  cohortDeltaZ = Math.max(0, cohortDeltaZ);
  for (const category of categories) {
    const group = groups.get(category)!;
    if (category === "case") {
      record(extracted, category, group);
      continue;
    }
    const bounds = categoryBounds(group);
    if (category === "psu") {
      const dx = caseBounds.min.x - SIDE_EXIT_CLEARANCE - bounds.max.x;
      group.position.x += dx;
    } else {
      group.position.z += cohortDeltaZ;
    }
    record(extracted, category, group);
  }

  // The first full-size inspection spread sits beyond the glass opening. A wide
  // center gap keeps parts clear of the stationary case until grid animation starts.
  const spread = new Map<PcModelCategory, PcMechanicalPose>();
  const positions: Partial<Record<PcModelCategory, [number, number]>> = {
    gpu: [-0.72, 0.72], motherboard: [0.72, 0.72], cooling: [-0.72, 0.24], psu: [-0.72, -0.24],
    cpu: [-0.72, -0.24], memory: [0.72, -0.24], storage: [-0.72, -0.72],
  };
  const spreadZ = caseBounds.max.z + SPREAD_FRONT_CLEARANCE;
  for (const category of categories) {
    const group = groups.get(category)!;
    const base = extracted.get(category)!;
    const target = { position: base.position.clone(), rotation: base.rotation.clone(), scale: base.scale.clone() };
    if (category === "case") {
      target.position.copy(base.position);
    } else if (category === "psu") {
      target.position.set(caseBounds.min.x - 0.42, caseBounds.getCenter(new THREE.Vector3()).y - 0.18, spreadZ);
    } else {
      const [x, y] = positions[category] ?? [0.72, -0.72];
      target.position.set(x, y, spreadZ);
    }
    spread.set(category, target);
  }

  // Diagnostics describe the assembled fit, independent of the last temporary
  // extraction pose used to measure the animation waypoints.
  for (const category of categories) copyPose(groups.get(category)!, assembled.get(category)!);
  copyPose(panelObject, panelClosed);
  for (const category of categories) groups.get(category)!.updateWorldMatrix(true, true);

  const psuBodyBounds = psuHousing ? boundsOf(psuHousing) : null;
  const psuGuardBounds = psuGuard ? boundsOf(psuGuard) : null;
  const fittedRoofBounds = shroudRoof ? boundsOf(shroudRoof) : null;
  const psuEnvelopeBounds = categoryBounds(psuGroup);
  const psuHeightClearance = psuBodyBounds && shroud
    ? Math.min(psuBodyBounds.min.y - shroudBounds.min.y, shroudBounds.max.y - psuBodyBounds.max.y)
    : psuBodyBounds ? 0.086 - psuBodyBounds.getSize(new THREE.Vector3()).y : null;
  const gpuRoot = findObject(gpuGroup, /^Graphics card with fans$/i) ?? gpuGroup;
  const gpuFanNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(gpuRoot.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const diagnostics: PcMechanicalDiagnostics = {
    boardStandoffGapMm: Number.isFinite(standoffGapMm) ? standoffGapMm * 1000 : null,
    boardTrayClearanceXmm: Number.isFinite(trayClearanceX) ? trayClearanceX * 1000 : null,
    boardTrayClearanceYmm: Number.isFinite(trayClearanceY) ? trayClearanceY * 1000 : null,
    motherboardOpeningClearanceXmm: openingClearanceX * 1000,
    motherboardOpeningClearanceYmm: openingClearanceY * 1000,
    rearDisengagementMm: rearDisengagement * 1000,
    gpuConnectorAlignmentMm: gpuContactAlignment === null ? null : gpuContactAlignment * 1000,
    gpuContactContainmentXmm: gpuContactContainmentX === null ? null : gpuContactContainmentX * 1000,
    gpuContactContainmentYmm: gpuContactContainmentY === null ? null : gpuContactContainmentY * 1000,
    gpuContactContainmentZmm: gpuContactContainmentZ === null ? null : gpuContactContainmentZ * 1000,
    gpuBracketRearClearanceMm: gpuBracketRearClearance === null ? null : gpuBracketRearClearance * 1000,
    psuHousingOpeningHeightClearanceMm: psuHeightClearance === null ? null : psuHeightClearance * 1000,
    psuGuardRoofGapMm: psuGuardBounds && fittedRoofBounds ? (fittedRoofBounds.max.y - psuGuardBounds.max.y) * 1000 : null,
    psuRearOpeningClearanceYMm: rearApertureAfterFit
      ? Math.min(psuEnvelopeBounds.min.y - rearApertureAfterFit.min.y, rearApertureAfterFit.max.y - psuEnvelopeBounds.max.y) * 1000
      : null,
    psuRearOpeningClearanceZMm: rearApertureAfterFit
      ? Math.min(psuEnvelopeBounds.min.z - rearApertureAfterFit.min.z, rearApertureAfterFit.max.z - psuEnvelopeBounds.max.z) * 1000
      : null,
    psuRearFaceClearanceMm: psuBodyBounds ? (psuBodyBounds.min.x - rearPlaneX) * 1000 : null,
    cohortExtractionMm: cohortDeltaZ * 1000,
    panelCorridorClearanceMm: panelCorridorClearance * 1000,
    gpuFanNormalAfterAssembly: [gpuFanNormal.x, gpuFanNormal.y, gpuFanNormal.z],
    assumptions,
  };

  return {
    assembled,
    release,
    extracted,
    spread,
    panel: { object: panelObject, closed: panelClosed, open: panelOpen, out: panelOut },
    diagnostics,
  };
}

/** Apply the reversible, staged assembly path. `gridPoses` is the caller's existing final 100% layout. */
export function applyPcMechanicalLayout(
  groups: Map<PcModelCategory, THREE.Group>,
  plan: PcMechanicalPlan,
  gridPoses: Map<PcModelCategory, PcMechanicalPose>,
  progress01: number,
): void {
  const progress = THREE.MathUtils.clamp(progress01, 0, 1);
  let from: Map<PcModelCategory, PcMechanicalPose>;
  let to: Map<PcModelCategory, PcMechanicalPose>;
  let amount = 0;
  if (progress < 0.12) {
    from = plan.assembled;
    to = plan.assembled;
  } else if (progress < 0.2) {
    from = plan.assembled;
    to = plan.release;
    amount = smooth((progress - 0.12) / 0.08);
  } else if (progress < 0.48) {
    from = plan.release;
    to = plan.extracted;
    amount = smooth((progress - 0.2) / 0.28);
  } else if (progress < 0.56) {
    from = plan.extracted;
    to = plan.extracted;
  } else if (progress < 0.75) {
    from = plan.extracted;
    to = plan.spread;
    amount = smooth((progress - 0.56) / 0.19);
  } else {
    from = plan.spread;
    to = gridPoses;
    amount = smooth((progress - 0.75) / 0.25);
  }

  for (const category of categories) {
    const group = groups.get(category);
    const start = from.get(category);
    const end = to.get(category) ?? plan.spread.get(category);
    if (group && start && end) blendPose(group, start, end, amount);
  }

  const panel = plan.panel.object;
  if (progress < 0.04) {
    const amount = smooth(progress / 0.04);
    panel.position.lerpVectors(plan.panel.closed.position, plan.panel.open.position, amount);
    panel.quaternion.slerpQuaternions(plan.panel.closed.rotation, plan.panel.open.rotation, amount);
    panel.scale.lerpVectors(plan.panel.closed.scale, plan.panel.open.scale, amount);
  } else if (progress < 0.48) {
    const amount = smooth((progress - 0.04) / 0.08);
    panel.position.lerpVectors(plan.panel.open.position, plan.panel.out.position, amount);
    panel.quaternion.slerpQuaternions(plan.panel.open.rotation, plan.panel.out.rotation, amount);
    panel.scale.lerpVectors(plan.panel.open.scale, plan.panel.out.scale, amount);
  } else if (progress < 0.52) {
    const amount = smooth((progress - 0.48) / 0.04);
    panel.position.lerpVectors(plan.panel.out.position, plan.panel.open.position, amount);
    panel.quaternion.slerpQuaternions(plan.panel.out.rotation, plan.panel.open.rotation, amount);
    panel.scale.lerpVectors(plan.panel.out.scale, plan.panel.open.scale, amount);
  } else if (progress < 0.56) {
    const amount = smooth((progress - 0.52) / 0.04);
    panel.position.lerpVectors(plan.panel.open.position, plan.panel.closed.position, amount);
    panel.quaternion.slerpQuaternions(plan.panel.open.rotation, plan.panel.closed.rotation, amount);
    panel.scale.lerpVectors(plan.panel.open.scale, plan.panel.closed.scale, amount);
  } else {
    copyPose(panel, plan.panel.closed);
  }
}
