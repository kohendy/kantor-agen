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
import type { AgentStatus } from "@/lib/types";

export type DeskState = "kosong" | "disiapkan" | "terisi";
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
  if (slotIndex >= baseSlotsCount && bay && (isExpanded || true)) {
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

  // Posisi slot standar di dalam ruangan (untuk slotIndex < baseSlotsCount)
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
    relY = 4.5;
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
  dispose: () => void;
}

// Buat meja runtime (createDesk) yang bisa ditambahkan/dihapus kapan saja
export function createDeskMesh(
  room: RoomConfig,
  slotIndex: number,
  deskState: DeskState = "kosong"
): DynamicDeskResult {
  const group = new THREE.Group();
  const roomColorHex = new THREE.Color(room.color).getHex();
  const slotPos = calculateRoomSlotPosition(room, slotIndex, true);

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

  const dispose = () => {
    deskGeo.dispose();
    deskTopEdgeGeo.dispose();
    deskMat.dispose();
    deskEdgeMat.dispose();
    monGeo.dispose();
    monMat.dispose();
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
    dispose,
  };
}

export interface DynamicAgentResult {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  statusLightMesh: THREE.Mesh;
  statusLightMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
  dotSpan: HTMLSpanElement;
  bubbleDiv: HTMLDivElement;
  targetPos: THREE.Vector3;
  dispose: () => void;
}

// Buat karakter robot agen dinamis (createAgentCharacter)
export function createAgentCharacter(config: {
  instanceId: string;
  label: string;
  role: string;
  color: string;
  initialPos: { x: number; y: number; z: number };
  status?: AgentStatus;
  onClick?: () => void;
}): DynamicAgentResult {
  const group = new THREE.Group();
  const agentColor = config.color;
  const agentHex = new THREE.Color(agentColor).getHex();
  const status = config.status ?? "idle";

  const shadowGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.01, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.005, 0);
  group.add(shadowMesh);

  const bodyGeo = new THREE.BoxGeometry(0.5, 0.44, 0.38);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xdfe3ff,
    roughness: 0.35,
    metalness: 0.2,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.set(0, 0.34, 0);
  group.add(bodyMesh);

  const chestGeo = new THREE.BoxGeometry(0.24, 0.14, 0.02);
  const chestMat = new THREE.MeshBasicMaterial({ color: agentHex });
  const chestMesh = new THREE.Mesh(chestGeo, chestMat);
  chestMesh.position.set(0, 0.34, 0.2);
  group.add(chestMesh);

  const armGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08);
  const armMat = new THREE.MeshStandardMaterial({
    color: 0xdfe3ff,
    roughness: 0.35,
    metalness: 0.2,
  });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.29, 0.32, 0.08);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.29, 0.32, 0.08);
  group.add(rightArm);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.77, 0);

  const headGeo = new THREE.BoxGeometry(0.56, 0.42, 0.42);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xeef0ff,
    roughness: 0.35,
    metalness: 0.2,
  });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.set(0, 0, 0);
  headGroup.add(headMesh);

  const visorGeo = new THREE.BoxGeometry(0.44, 0.2, 0.04);
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x14122b });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0, 0.22);
  headGroup.add(visorMesh);

  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
  const eyeMat = new THREE.MeshBasicMaterial({ color: agentHex });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.11, 0, 0.24);
  headGroup.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.11, 0, 0.24);
  headGroup.add(rightEye);

  const antennaGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18);
  const antMat = new THREE.MeshBasicMaterial({ color: 0xeef0ff });
  const antennaMesh = new THREE.Mesh(antennaGeo, antMat);
  antennaMesh.position.set(0, 0.3, 0);
  headGroup.add(antennaMesh);

  const tipGeo = new THREE.SphereGeometry(0.07, 12, 12);
  const statusHex = status === "working" ? 0x2ee6a8 : status === "review" ? 0xf5a623 : 0x4a4875;
  const statusLightMat = new THREE.MeshStandardMaterial({
    color: statusHex,
    emissive: statusHex,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const statusLightMesh = new THREE.Mesh(tipGeo, statusLightMat);
  statusLightMesh.position.set(0, 0.43, 0);
  headGroup.add(statusLightMesh);

  group.add(headGroup);

  // Balon ucapan
  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "atlas-speech-bubble";
  bubbleDiv.setAttribute("aria-hidden", "true");
  const bubbleObj = new CSS2DObject(bubbleDiv);
  bubbleObj.position.set(0, 2.05, 0);
  group.add(bubbleObj);

  // Hitbox
  const robotHitGeo = new THREE.BoxGeometry(0.85, 1.25, 0.85);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(robotHitGeo, hitMat);
  hitMesh.position.set(0, 0.62, 0);
  hitMesh.userData = { type: "agent_instance", id: config.instanceId };
  group.add(hitMesh);

  // Label CSS2D dengan tanda (demo)
  const labelDiv = document.createElement("div");
  labelDiv.className = `agent-tag3d is-instance st-${status}`;
  labelDiv.style.setProperty("--c", agentColor);
  labelDiv.setAttribute("role", "button");
  labelDiv.setAttribute("tabindex", "0");
  labelDiv.setAttribute("aria-label", `${config.label}, ${config.role}`);

  const dotSpan = document.createElement("span");
  dotSpan.className = `agent-dot3d st-${status}`;
  labelDiv.appendChild(dotSpan);

  const nameSpan = document.createElement("span");
  nameSpan.className = "agent-name3d";
  nameSpan.textContent = config.label;
  labelDiv.appendChild(nameSpan);

  if (config.onClick) {
    labelDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      config.onClick?.();
    });
  }

  const labelObj = new CSS2DObject(labelDiv);
  labelObj.position.set(0, 1.48, 0);
  group.add(labelObj);

  group.position.set(config.initialPos.x, config.initialPos.y, config.initialPos.z);

  const targetPos = new THREE.Vector3(
    config.initialPos.x,
    config.initialPos.y,
    config.initialPos.z
  );

  const dispose = () => {
    shadowGeo.dispose();
    shadowMat.dispose();
    bodyGeo.dispose();
    bodyMat.dispose();
    chestGeo.dispose();
    chestMat.dispose();
    armGeo.dispose();
    armMat.dispose();
    headGeo.dispose();
    headMat.dispose();
    visorGeo.dispose();
    visorMat.dispose();
    eyeGeo.dispose();
    eyeMat.dispose();
    antennaGeo.dispose();
    antMat.dispose();
    tipGeo.dispose();
    statusLightMat.dispose();
    robotHitGeo.dispose();
    hitMat.dispose();

    if (labelDiv.parentNode) {
      labelDiv.parentNode.removeChild(labelDiv);
    }
    if (bubbleDiv.parentNode) {
      bubbleDiv.parentNode.removeChild(bubbleDiv);
    }
  };

  return {
    group,
    bodyMesh,
    headGroup,
    headMesh,
    leftArm,
    rightArm,
    statusLightMesh,
    statusLightMat,
    hitMesh,
    labelObj,
    labelDiv,
    dotSpan,
    bubbleDiv,
    targetPos,
    dispose,
  };
}
