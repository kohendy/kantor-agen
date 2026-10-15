// Model Meja dan Karakter Dinamis Sisi Klien (instances.ts)
// Mendukung penambahan meja/karakter dinamis saat runtime tanpa rebuild Three.js scene.
// Menjamin pembersihan memori (dispose) bersih saat instance demo direset.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  RoomConfig,
} from "@/lib/officeConfig";
import { FLOORPLAN } from "./floorplan";
import { THEME } from "./theme";
import { createVoxelHuman } from "./characters/voxelHuman";
import type { AgentStatus } from "@/lib/types";

export type DeskState = "kosong" | "disiapkan" | "siap" | "terisi";
export type ExpansionSide = "west" | "east" | "north" | "south" | "compact";

export interface RoomSlot {
  roomId: string;
  slotIndex: number;
  position: { x: number; y: number; z: number }; // Posisi dunia Three.js
  relPosition: [number, number]; // [rx, ry] relatif terhadap pelat ruangan
  deskState: DeskState;
  instanceId: string | null;
}

export interface AgentInstance {
  id: string; // mis. "inst_ads_akun_b"
  baseAgent: string; // mis. "ARTEMIS"
  role: string; // mis. "Pengelola Kampanye"
  label: string; // mis. "Iklan · Akun B"
  context: string; // mis. "Akun B"
  roomId: string;
  slotIndex: number;
  status: AgentStatus;
  isDemo: boolean;
}

export interface ExpansionState {
  roomId: string;
  side: ExpansionSide;
  isExpanded: boolean;
  progress: number; // 0..1
}

export const ROOM_EXPANSION_SIDES: Record<string, ExpansionSide> = {
  advertiser: "east",
  ads: "east",
  operasional: "north",
  manager: "west",
  riset: "south",
  hr: "west",
  sosmed: "south",
  creative: "south",
  copy: "south",
  landing_page: "south",
  lp: "south",
  meeting: "compact",
};

// Hitung koordinat slot meja dalam ruangan secara dinamis memakai Bay dari Floorplan
export function calculateRoomSlotPosition(
  room: RoomConfig,
  slotIndex: number,
  isExpanded: boolean = false
): { rel: [number, number]; world: { x: number; y: number; z: number } } {
  const normRoomId = room.id === "ads" ? "advertiser" : room.id === "lp" ? "landing_page" : room.id;
  const bay = FLOORPLAN.bays.find((b) => b.roomId === normRoomId);

  // Jumlah slot dasar ruangan: Manager, HR, Operasional, Sosmed memiliki 1 agen dasar
  const baseSlotsCount =
    normRoomId === "manager" ||
    normRoomId === "hr" ||
    normRoomId === "operasional" ||
    normRoomId === "sosmed"
      ? 1
      : room.agents?.length || 3;

  // Jika slot ekspansi (slotIndex >= baseSlotsCount) dan bay tersedia: tempatkan tersebar di dalam bay
  if (slotIndex >= baseSlotsCount && bay && isExpanded) {
    const bayIndex = slotIndex - baseSlotsCount;
    let wx: number;
    let wz: number;

    if (bay.d > bay.w) {
      // Bay vertikal (mis. bay_manager, bay_hr, bay_advertiser): sebar sepanjang sumbu Z
      const maxSlots = Math.max(2, Math.floor(bay.d / 1.3));
      const stepZ = bay.d / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      wx = +(bay.x + bay.w / 2).toFixed(3);
      wz = +(bay.z + currentStep * stepZ).toFixed(3);
    } else {
      // Bay horizontal (mis. bay_operasional, bay_riset, bay_creative, dll): sebar sepanjang sumbu X
      const maxSlots = Math.max(2, Math.floor(bay.w / 1.8));
      const stepX = bay.w / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      wx = +(bay.x + currentStep * stepX).toFixed(3);
      wz = +(bay.z + bay.d / 2).toFixed(3);
    }

    const wy = 0;
    return {
      rel: [+(wx - room.x).toFixed(3), +(wz - room.y).toFixed(3)],
      world: { x: wx, y: wy, z: wz },
    };
  }

  // Posisi slot standar di dalam ruangan (untuk slotIndex < baseSlotsCount atau ruangan dengan slot kosong)
  let relX: number;
  let relY: number;

  if (room.id === "hr") {
    relX = 4.5;
    relY = 2.5;
  } else if (normRoomId === "operasional") {
    relX = 4.5;
    relY = 4.5;
  } else if (normRoomId === "manager") {
    relX = 4.5;
    relY = 4.0;
  } else if (normRoomId === "sosmed") {
    relX = 5.0;
    relY = 3.5;
  } else if (normRoomId === "advertiser") {
    relX = 3.5 + (slotIndex % 3) * 3.0;
    relY = slotIndex >= 3 ? 6.5 : 4.5;
  } else if (normRoomId === "riset") {
    // Ruang riset: meja internal ke-4 (slotIndex 3) di sebelah timur METIS
    relX = 7.5;
    relY = 5.5;
  } else {
    // Ruang lainnya
    relX = Math.min(room.w - 1.5, Math.max(1.5, 2.5 + (slotIndex % 3) * 2.5));
    relY = Math.min(room.d - 1.5, Math.max(1.5, 3.5));
  }

  const worldX = +(room.x + relX).toFixed(3);
  const worldY = 0;
  const worldZ = +(room.y + relY).toFixed(3);

  return {
    rel: [relX, relY],
    world: { x: worldX, y: worldY, z: worldZ },
  };
}


export interface DynamicDeskResult {
  group: THREE.Group;
  deskMesh: THREE.Mesh;
  edges: THREE.LineSegments;
  monMesh: THREE.Mesh;
  prepGlow?: THREE.Mesh;
  prepTag?: CSS2DObject;
  slotPos: { rel: [number, number]; world: { x: number; y: number; z: number } };
  chairPos: { x: number; y: number; z: number };
  deskState: DeskState;
  getDeskState: () => DeskState;
  setDeskState: (state: DeskState) => void;
  dispose: () => void;
}

// Buat meja runtime (createDesk) yang bisa ditambahkan/dihapus kapan saja
export function createDeskMesh(
  room: RoomConfig,
  slotIndex: number,
  deskState: DeskState = "kosong",
  isExpanded: boolean = false
): DynamicDeskResult {
  const group = new THREE.Group();
  const roomColorHex = new THREE.Color(room.color).getHex();
  const slotPos = calculateRoomSlotPosition(room, slotIndex, isExpanded);

  const deskGeo = new THREE.BoxGeometry(1.8, 0.44, 0.7);
  const deskTopEdgeGeo = new THREE.EdgesGeometry(deskGeo);

  const deskMat = new THREE.MeshStandardMaterial({
    color: deskState === "disiapkan" ? 0x243248 : new THREE.Color(THEME.furniture.desk).getHex(),
    roughness: 0.35,
    metalness: 0.3,
  });

  const deskEdgeMat = new THREE.LineBasicMaterial({
    color: deskState === "disiapkan" ? 0xf5a623 : roomColorHex,
    transparent: true,
    opacity: deskState === "disiapkan" ? 0.9 : 0.5,
  });

  const deskMesh = new THREE.Mesh(deskGeo, deskMat);
  deskMesh.position.set(slotPos.world.x, 0.22, slotPos.world.z + 0.8);
  group.add(deskMesh);

  const edges = new THREE.LineSegments(deskTopEdgeGeo, deskEdgeMat);
  edges.position.copy(deskMesh.position);
  group.add(edges);

  // Monitor di atas meja
  const monGeo = new THREE.BoxGeometry(0.38, 0.24, 0.04);
  const monMat = new THREE.MeshStandardMaterial({
    color: deskState === "disiapkan" ? 0xf5a623 : roomColorHex,
    emissive: deskState === "disiapkan" ? 0xf5a623 : roomColorHex,
    emissiveIntensity: deskState === "disiapkan" ? 0.7 : 0.4,
  });
  const monMesh = new THREE.Mesh(monGeo, monMat);
  monMesh.position.set(slotPos.world.x, 0.56, slotPos.world.z + 0.9);
  group.add(monMesh);

  // Kursi meja kerja baru
  const chairGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
  const chairMat = new THREE.MeshStandardMaterial({
    color: 0x243248,
    roughness: 0.5,
  });
  const chairMesh = new THREE.Mesh(chairGeo, chairMat);
  chairMesh.position.set(slotPos.world.x, 0.2, slotPos.world.z);
  group.add(chairMesh);

  let prepGlow: THREE.Mesh | undefined;
  let prepTag: CSS2DObject | undefined;

  if (deskState === "disiapkan") {
    // Aura/ring tanda meja sedang disiapkan
    const glowGeo = new THREE.RingGeometry(0.65, 0.95, 18);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xf5a623,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    prepGlow = new THREE.Mesh(glowGeo, glowMat);
    prepGlow.rotation.x = -Math.PI / 2;
    prepGlow.position.set(slotPos.world.x, 0.015, slotPos.world.z);
    group.add(prepGlow);

    // Label CSS2D "disiapkan" di atas meja
    const tagDiv = document.createElement("div");
    tagDiv.className = "desk-prep-tag";
    tagDiv.textContent = "MEJA DISIAPKAN";
    prepTag = new CSS2DObject(tagDiv);
    prepTag.position.set(slotPos.world.x, 0.95, slotPos.world.z + 0.8);
    group.add(prepTag);
  }

  let currentDeskState: DeskState = deskState;

  const setDeskState = (newState: DeskState) => {
    currentDeskState = newState;
    if (newState === "terisi" || newState === "siap") {
      deskMat.color.setHex(new THREE.Color(THEME.furniture.desk).getHex());
      deskEdgeMat.color.setHex(roomColorHex);
      deskEdgeMat.opacity = 0.5;
      monMat.color.setHex(roomColorHex);
      monMat.emissive.setHex(roomColorHex);
      monMat.emissiveIntensity = 0.4;
      if (prepGlow) prepGlow.visible = false;
      if (prepTag && prepTag.element.parentNode) {
        prepTag.element.parentNode.removeChild(prepTag.element);
      }
    }
  };

  const dispose = () => {
    deskGeo.dispose();
    deskTopEdgeGeo.dispose();
    deskMat.dispose();
    deskEdgeMat.dispose();
    monGeo.dispose();
    monMat.dispose();
    chairGeo.dispose();
    chairMat.dispose();
    if (prepGlow) {
      (prepGlow.geometry as THREE.BufferGeometry).dispose();
      (prepGlow.material as THREE.Material).dispose();
    }
    if (prepTag && prepTag.element.parentNode) {
      prepTag.element.parentNode.removeChild(prepTag.element);
    }
  };

  return {
    group,
    deskMesh,
    edges,
    monMesh,
    prepGlow,
    prepTag,
    slotPos,
    chairPos: { x: slotPos.world.x, y: 0.2, z: slotPos.world.z },
    deskState: currentDeskState,
    getDeskState: () => currentDeskState,
    setDeskState,
    dispose,
  };
}

export interface DynamicAgentResult {
  id: string;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  statusLightMesh?: THREE.Mesh;
  statusLightMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
  dotSpan: HTMLSpanElement;
  bubbleDiv?: HTMLDivElement;
  targetPos: THREE.Vector3;
  appearance?: {
    skin: string;
    hair: string;
    department: string;
    lead: boolean;
  };
  characterType?: string;
  dispose: () => void;
}

// Buat karakter manusia voxel agen dinamis (createAgentCharacter)
export function createAgentCharacter(config: {
  instanceId: string;
  label: string;
  role: string;
  color: string;
  initialPos: { x: number; y: number; z: number };
  status?: AgentStatus;
  onClick?: () => void;
  department?: string;
}): DynamicAgentResult {
  let dept = config.department;
  if (!dept) {
    if (config.instanceId.includes("ads") || config.instanceId.includes("iklan")) dept = "advertiser";
    else if (config.instanceId.includes("hr")) dept = "hr";
    else if (config.instanceId.includes("ops")) dept = "operasional";
    else if (config.instanceId.includes("sosmed")) dept = "sosmed";
    else if (config.instanceId.includes("creative")) dept = "creative";
    else if (config.instanceId.includes("copy")) dept = "copy";
    else if (config.instanceId.includes("lp") || config.instanceId.includes("landing")) dept = "landing_page";
    else if (config.instanceId.includes("riset")) dept = "riset";
    else dept = "advertiser";
  }

  const voxelHuman = createVoxelHuman({
    name: config.label,
    department: dept,
    role: config.role,
    color: config.color,
    initialPos: config.initialPos,
    status: config.status,
    onClick: config.onClick,
    isInstance: true,
  });

  voxelHuman.group.name = config.instanceId;

  return {
    id: config.instanceId,
    group: voxelHuman.group,
    bodyMesh: voxelHuman.bodyMesh,
    headGroup: voxelHuman.headGroup,
    headMesh: voxelHuman.headMesh,
    leftArm: voxelHuman.leftArm,
    rightArm: voxelHuman.rightArm,
    leftLeg: voxelHuman.leftLeg,
    rightLeg: voxelHuman.rightLeg,
    statusLightMesh: voxelHuman.statusLightMesh,
    statusLightMat: voxelHuman.statusLightMat,
    hitMesh: voxelHuman.hitMesh,
    labelObj: voxelHuman.labelObj,
    labelDiv: voxelHuman.labelDiv,
    dotSpan: voxelHuman.dotSpan,
    bubbleDiv: voxelHuman.bubbleDiv,
    targetPos: new THREE.Vector3(config.initialPos.x, config.initialPos.y, config.initialPos.z),
    appearance: voxelHuman.appearance,
    characterType: voxelHuman.characterType,
    dispose: voxelHuman.dispose,
  };
}
