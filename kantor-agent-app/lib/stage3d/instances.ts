// Model Meja dan Karakter Dinamis Sisi Klien (instances.ts)
// Mendukung penambahan meja/karakter dinamis saat runtime tanpa rebuild Three.js scene.
// Menjamin pembersihan memori (dispose) bersih saat instance demo direset.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  RoomConfig,
  calculateFacingAngle,
} from "@/lib/officeConfig";
import { FLOORPLAN } from "./floorplan";
import { THEME } from "./theme";
import { createVoxelHuman } from "./characters/voxelHuman";
import { PROPS_REGISTRY } from "./props";
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

export const ROOM_DESK_PROP_ID: Record<string, string> = {
  advertiser: "advertiser_desk",
  ads: "advertiser_desk",
  riset: "riset_lab_desk",
  operasional: "ops_workstation_desk",
  ops: "ops_workstation_desk",
  creative: "creative_drafting_desk",
  copy: "copy_desk",
  landing_page: "landing_page_desk",
  lp: "landing_page_desk",
  sosmed: "sosmed_desk",
  hr: "hr_desk",
  manager: "manager_desk",
};

export interface SlotPositionResult {
  rel: [number, number];
  world: { x: number; y: number; z: number };
  deskPos: { x: number; y: number; z: number };
  faceAngle: number;
  rotY: number;
}

// Hitung koordinat slot meja dalam ruangan secara dinamis memakai Bay dari Floorplan
export function calculateRoomSlotPosition(
  room: RoomConfig,
  slotIndex: number,
  isExpanded: boolean = false
): SlotPositionResult {
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

  const propId = ROOM_DESK_PROP_ID[normRoomId] || "advertiser_desk";
  const propDef = PROPS_REGISTRY[propId];
  const deskD = propDef?.footprint.d ?? 0.65;

  // Jika slot ekspansi (slotIndex >= baseSlotsCount) dan bay tersedia: tempatkan berbasis footprint di dalam bay
  if (slotIndex >= baseSlotsCount && bay && isExpanded) {
    const bayIndex = slotIndex - baseSlotsCount;
    let chairX: number;
    let chairZ: number;
    let deskX: number;
    let deskZ: number;
    let faceAngle: number;
    let rotY: number;

    const baySide = bay.side;

    if (baySide === "S") {
      // Bay sisi Selatan (bay_sosmed, bay_riset, bay_creative, bay_copy, bay_landing_page):
      // Dinding luar di z = bay.z + bay.d. Meja diletakkan dekat dinding luar dengan margin >= 0.15.
      deskZ = +(bay.z + bay.d - 0.20 - deskD / 2).toFixed(3);
      chairZ = +(deskZ - 0.65).toFixed(3);

      const maxSlots = Math.max(2, Math.floor(bay.w / 2.2));
      const stepX = bay.w / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      deskX = +(bay.x + currentStep * stepX).toFixed(3);
      chairX = deskX;
    } else if (baySide === "N") {
      // Bay sisi Utara (bay_operasional):
      // Dinding luar di z = bay.z. Meja diletakkan dekat dinding utara dengan margin >= 0.15.
      deskZ = +(bay.z + 0.20 + deskD / 2).toFixed(3);
      chairZ = +(deskZ + 0.65).toFixed(3);

      const maxSlots = Math.max(2, Math.floor(bay.w / 2.2));
      const stepX = bay.w / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      deskX = +(bay.x + currentStep * stepX).toFixed(3);
      chairX = deskX;
    } else if (baySide === "W") {
      // Bay sisi Barat (bay_manager, bay_hr):
      // Dinding luar di x = bay.x. Meja diletakkan dekat dinding barat dengan margin >= 0.15.
      deskX = +(bay.x + 0.20 + deskD / 2).toFixed(3);
      chairX = +(deskX + 0.65).toFixed(3);

      const maxSlots = Math.max(2, Math.floor(bay.d / 2.0));
      const stepZ = bay.d / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      deskZ = +(bay.z + currentStep * stepZ).toFixed(3);
      chairZ = deskZ;
    } else {
      // Bay sisi Timur (bay_advertiser):
      // Dinding luar di x = bay.x + bay.w. Meja diletakkan dekat dinding timur dengan margin >= 0.15.
      deskX = +(bay.x + bay.w - 0.20 - deskD / 2).toFixed(3);
      chairX = +(deskX - 0.65).toFixed(3);

      const maxSlots = Math.max(2, Math.floor(bay.d / 2.0));
      const stepZ = bay.d / (maxSlots + 1);
      const currentStep = (bayIndex % maxSlots) + 1;
      deskZ = +(bay.z + currentStep * stepZ).toFixed(3);
      chairZ = deskZ;
    }

    // Hitung orientasi hadap dinamis via vektor kursi -> meja (atan2)
    faceAngle = calculateFacingAngle([chairX, chairZ], [deskX, deskZ]);
    rotY = faceAngle;

    const roomZ = typeof room.z === "number" ? room.z : (room.y ?? 0);
    return {
      rel: [+(chairX - room.x).toFixed(3), +(chairZ - roomZ).toFixed(3)],
      world: { x: chairX, y: 0, z: chairZ },
      deskPos: { x: deskX, y: 0, z: deskZ },
      faceAngle,
      rotY,
    };
  }

  // Posisi slot standar di dalam ruangan (untuk slotIndex < baseSlotsCount atau ruangan dengan slot kosong)
  let relX: number;
  let relY: number;
  let faceAngle = 0;
  let rotY = 0;

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
    faceAngle = Math.PI;
    rotY = Math.PI;
  } else if (normRoomId === "riset") {
    relX = 7.5;
    relY = 5.5;
  } else {
    relX = Math.min(room.w - 1.5, Math.max(1.5, 2.5 + (slotIndex % 3) * 2.5));
    relY = Math.min(room.d - 1.5, Math.max(1.5, 3.5));
  }

  const roomZ = typeof room.z === "number" ? room.z : (room.y ?? 0);
  const worldX = +(room.x + relX).toFixed(3);
  const worldY = 0;
  const worldZ = +(roomZ + relY).toFixed(3);
  const deskZ = normRoomId === "advertiser" ? +(worldZ - 0.70).toFixed(3) : +(worldZ + 0.75).toFixed(3);
  faceAngle = calculateFacingAngle([worldX, worldZ], [worldX, deskZ]);
  rotY = faceAngle;

  return {
    rel: [relX, relY],
    world: { x: worldX, y: worldY, z: worldZ },
    deskPos: { x: worldX, y: worldY, z: deskZ },
    faceAngle,
    rotY,
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
  const normRoomId = room.id === "ads" ? "advertiser" : room.id === "lp" ? "landing_page" : room.id;
  const slotPos = calculateRoomSlotPosition(room, slotIndex, isExpanded);

  const propId = ROOM_DESK_PROP_ID[normRoomId] || "advertiser_desk";
  const propDef = PROPS_REGISTRY[propId];

  // Gunakan geometri model prop spesifik ruangan
  const deskGeo = propDef ? propDef.createGeometry() : new THREE.BoxGeometry(1.8, 0.44, 0.7);
  const deskMat = new THREE.MeshStandardMaterial({
    vertexColors: !!propDef,
    color: propDef ? 0xffffff : (deskState === "disiapkan" ? 0x243248 : new THREE.Color(THEME.furniture.desk).getHex()),
    roughness: 0.4,
    metalness: 0.2,
  });

  const deskMesh = new THREE.Mesh(deskGeo, deskMat);
  deskMesh.position.set(slotPos.deskPos.x, 0, slotPos.deskPos.z);
  deskMesh.rotation.y = slotPos.rotY;
  group.add(deskMesh);

  // Sub-emissive mesh jika prop memilikinya
  let emissiveMesh: THREE.Mesh | undefined;
  if (propDef?.createEmissiveGeometry) {
    const emGeo = propDef.createEmissiveGeometry();
    const emMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissiveIntensity: 0.8,
    });
    emissiveMesh = new THREE.Mesh(emGeo, emMat);
    deskMesh.add(emissiveMesh);
  }

  // Garis tepi outline meja
  const deskW = propDef?.footprint.w ?? 1.4;
  const deskH = propDef?.height ?? 0.44;
  const deskD = propDef?.footprint.d ?? 0.65;
  const deskTopEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(deskW, deskH, deskD));
  const deskEdgeMat = new THREE.LineBasicMaterial({
    color: deskState === "disiapkan" ? 0xf5a623 : roomColorHex,
    transparent: true,
    opacity: deskState === "disiapkan" ? 0.9 : 0.5,
  });
  const edges = new THREE.LineSegments(deskTopEdgeGeo, deskEdgeMat);
  edges.position.set(slotPos.deskPos.x, deskH / 2, slotPos.deskPos.z);
  edges.rotation.y = slotPos.rotY;
  group.add(edges);

  // Monitor dummy mesh untuk kompatibilitas DynamicDeskResult
  const monGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const monMat = new THREE.MeshBasicMaterial({ visible: false });
  const monMesh = new THREE.Mesh(monGeo, monMat);
  group.add(monMesh);

  // Kursi meja kerja baru
  const chairGeo = PROPS_REGISTRY["chair_single"]
    ? PROPS_REGISTRY["chair_single"].createGeometry()
    : new THREE.BoxGeometry(0.5, 0.08, 0.5);
  const chairMat = new THREE.MeshStandardMaterial({
    vertexColors: !!PROPS_REGISTRY["chair_single"],
    color: PROPS_REGISTRY["chair_single"] ? 0xffffff : 0x243248,
    roughness: 0.5,
  });
  const chairMesh = new THREE.Mesh(chairGeo, chairMat);
  chairMesh.position.set(slotPos.world.x, 0, slotPos.world.z);
  chairMesh.rotation.y = slotPos.faceAngle;
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
    prepTag.position.set(slotPos.deskPos.x, 0.95, slotPos.deskPos.z);
    group.add(prepTag);
  }

  let currentDeskState: DeskState = deskState;

  const setDeskState = (newState: DeskState) => {
    currentDeskState = newState;
    if (newState === "terisi" || newState === "siap") {
      deskEdgeMat.color.setHex(roomColorHex);
      deskEdgeMat.opacity = 0.5;
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
    if (emissiveMesh) {
      emissiveMesh.geometry.dispose();
      (emissiveMesh.material as THREE.Material).dispose();
    }
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
