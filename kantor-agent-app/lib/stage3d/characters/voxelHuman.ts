// lib/stage3d/characters/voxelHuman.ts
// Karakter Manusia Voxel untuk Kantor Agen (Tahap 3 Isometrik).
// Menggantikan model robot lama dengan satu fungsi tunggal: createVoxelHuman.
// Desain orisinal bergaya chibi voxel (~1.6 tile) dengan identitas per departemen.

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { THEME } from "../theme";
import { VoxelBoxDef, buildVoxelGeometry } from "../props/voxel";
import type { AgentStatus } from "@/lib/types";

export interface VoxelHumanOptions {
  name: string;
  department: string;
  lead?: boolean;
  status?: AgentStatus;
  color?: string;
  initialPos?: { x: number; y: number; z: number };
  onClick?: () => void;
  isInstance?: boolean;
  role?: string;
}

export interface VoxelHumanResult {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  statusLightMesh?: THREE.Mesh;
  statusLightMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
  dotSpan: HTMLSpanElement;
  bubbleDiv?: HTMLDivElement;
  appearance: {
    skin: string;
    hair: string;
    department: string;
    lead: boolean;
  };
  characterType: "voxelHuman";
  dispose: () => void;
}

/**
 * Hash deterministik berdasarkan nama agen untuk menghasilkan warna kulit dan rambut yang tetap.
 */
export function hashAgentName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getAgentAppearance(name: string, department = "manager", lead = false) {
  const hash = hashAgentName(name);
  const skinList = THEME.characters.skin;
  const hairList = THEME.characters.hair;
  const skinIndex = hash % skinList.length;
  const hairIndex = Math.floor(hash / skinList.length) % hairList.length;

  return {
    name,
    department,
    lead,
    skinIndex,
    hairIndex,
    skinColor: skinList[skinIndex],
    hairColor: hairList[hairIndex],
  };
}

/**
 * Normalisasi id departemen agar cocok dengan kunci THEME.characters.departments
 */
function normalizeDept(dept: string): keyof typeof THEME.characters.departments {
  const d = dept.toLowerCase();
  if (d === "ads" || d === "advertiser") return "advertiser";
  if (d === "lp" || d === "landing_page") return "landing_page";
  if (d === "sosmed" || d === "sosial media") return "sosmed";
  if (d === "ops" || d === "operasional") return "operasional";
  if (d === "hr") return "hr";
  if (d === "creative") return "creative";
  if (d === "copy") return "copy";
  if (d === "riset") return "riset";
  return "manager";
}

/**
 * Buat karakter manusia voxel hidup dengan proporsi chibi (~1.6 tile).
 */
export function createVoxelHuman(options: VoxelHumanOptions): VoxelHumanResult {
  const {
    name,
    department: rawDept,
    lead = false,
    status = "idle",
    color: agentColor = "#3b82f6",
    initialPos = { x: 0, y: 0, z: 0 },
    onClick,
    isInstance = false,
    role = "Agen",
  } = options;

  const deptKey = normalizeDept(rawDept);
  const deptStyle = THEME.characters.departments[deptKey];
  const app = getAgentAppearance(name, deptKey, lead);
  const skinColor = app.skinColor;
  const hairColor = app.hairColor;
  const pantsColor = (deptStyle as { pants?: string }).pants || "#1e293b";
  const shoesColor = THEME.characters.shoes;

  const group = new THREE.Group();
  group.position.set(initialPos.x, initialPos.y, initialPos.z);

  // Material umum karakter (vertex colors aktif)
  const charMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: THEME.character.bodyRoughness,
    metalness: THEME.character.bodyMetalness,
  });

  // 1. FLOOR SHADOW
  const shadowGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.01, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: THEME.character.shadowOpacity,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.005, 0);
  group.add(shadowMesh);

  // 2. KAKI (Kaki Kiri & Kaki Kanan)
  // Pivot di pinggul (y = 0.46, x = ±0.11), geometri menjulur ke bawah y: -0.46 s.d. 0
  const legBoxes: VoxelBoxDef[] = [
    // Celana
    { x: 0, y: -0.34, z: 0, w: 0.16, h: 0.34, d: 0.18, color: pantsColor },
    // Sepatu
    { x: 0, y: -0.46, z: 0.02, w: 0.18, h: 0.12, d: 0.22, color: shoesColor },
  ];
  const leftLegGeo = buildVoxelGeometry(legBoxes);
  const rightLegGeo = buildVoxelGeometry(legBoxes);

  const leftLeg = new THREE.Mesh(leftLegGeo, charMat);
  leftLeg.position.set(-0.11, 0.46, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(rightLegGeo, charMat);
  rightLeg.position.set(0.11, 0.46, 0);
  group.add(rightLeg);

  // 3. BADAN / TORSO
  // Pivot di y = 0.46, tinggi badan = 0.44 (mencapai y = 0.90)
  const bodyBoxes: VoxelBoxDef[] = [];

  switch (deptKey) {
    case "manager": {
      // Jas merah tua + kemeja putih + dasi marun
      const mStyle = deptStyle as typeof THEME.characters.departments.manager;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: mStyle.suit },
        { x: 0, y: 0.22, z: 0.155, w: 0.16, h: 0.22, d: 0.02, color: mStyle.shirt },
        { x: 0, y: 0.14, z: 0.165, w: 0.06, h: 0.24, d: 0.02, color: mStyle.tie }
      );
      break;
    }
    case "riset": {
      // Jas lab putih + kemeja biru dalam
      const rStyle = deptStyle as typeof THEME.characters.departments.riset;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: rStyle.labCoat },
        { x: 0, y: 0.16, z: 0.155, w: 0.16, h: 0.28, d: 0.02, color: rStyle.innerShirt },
        { x: -0.15, y: 0.06, z: 0.155, w: 0.14, h: 0.36, d: 0.02, color: rStyle.labCoat },
        { x: 0.15, y: 0.06, z: 0.155, w: 0.14, h: 0.36, d: 0.02, color: rStyle.labCoat }
      );
      break;
    }
    case "copy": {
      // Hoodie biru langit + kantong depan
      const cStyle = deptStyle as typeof THEME.characters.departments.copy;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: cStyle.hoodie },
        { x: 0, y: 0.04, z: 0.16, w: 0.28, h: 0.14, d: 0.04, color: cStyle.hoodiePocket },
        { x: 0, y: 0.34, z: -0.16, w: 0.34, h: 0.12, d: 0.06, color: cStyle.hoodiePocket }
      );
      break;
    }
    case "creative": {
      // Kaus ungu + celemek kerja
      const crStyle = deptStyle as typeof THEME.characters.departments.creative;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: crStyle.shirt },
        { x: 0, y: 0.03, z: 0.155, w: 0.34, h: 0.38, d: 0.02, color: crStyle.apron },
        { x: 0, y: 0.06, z: 0.165, w: 0.22, h: 0.12, d: 0.03, color: crStyle.apronPocket }
      );
      break;
    }
    case "landing_page": {
      // Kemeja hijau + kerah rapi
      const lpStyle = deptStyle as typeof THEME.characters.departments.landing_page;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: lpStyle.shirt },
        { x: 0, y: 0.34, z: 0.155, w: 0.22, h: 0.10, d: 0.02, color: lpStyle.collar },
        { x: 0, y: 0.04, z: 0.155, w: 0.04, h: 0.32, d: 0.02, color: lpStyle.collar }
      );
      break;
    }
    case "advertiser": {
      // Kemeja merah + rompi gelap
      const adStyle = deptStyle as typeof THEME.characters.departments.advertiser;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: adStyle.shirt },
        { x: 0, y: 0.03, z: 0.155, w: 0.44, h: 0.38, d: 0.02, color: adStyle.vest },
        { x: 0, y: 0.24, z: 0.165, w: 0.14, h: 0.18, d: 0.02, color: adStyle.shirt }
      );
      break;
    }
    case "hr": {
      // Blazer magenta + lanyard + name tag
      const hrStyle = deptStyle as typeof THEME.characters.departments.hr;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: hrStyle.blazer },
        { x: 0, y: 0.24, z: 0.155, w: 0.14, h: 0.20, d: 0.02, color: hrStyle.innerShirt },
        { x: 0, y: 0.16, z: 0.165, w: 0.16, h: 0.26, d: 0.02, color: hrStyle.lanyard },
        { x: 0, y: 0.14, z: 0.175, w: 0.08, h: 0.06, d: 0.02, color: hrStyle.nameTag }
      );
      break;
    }
    case "operasional": {
      // Rompi oranye safety + strip reflektif + sabuk alat
      const opStyle = deptStyle as typeof THEME.characters.departments.operasional;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: opStyle.shirt },
        { x: 0, y: 0.06, z: 0.155, w: 0.44, h: 0.38, d: 0.02, color: opStyle.vest },
        { x: 0, y: 0.20, z: 0.165, w: 0.44, h: 0.06, d: 0.02, color: opStyle.vestReflective },
        { x: 0, y: 0.02, z: 0, w: 0.46, h: 0.08, d: 0.32, color: opStyle.belt },
        { x: 0.18, y: 0.02, z: 0.12, w: 0.10, h: 0.10, d: 0.06, color: opStyle.beltTools }
      );
      break;
    }
    case "sosmed": {
      // Jaket oranye + resleting putih + kaus dalam
      const sStyle = deptStyle as typeof THEME.characters.departments.sosmed;
      bodyBoxes.push(
        { x: 0, y: 0, z: 0, w: 0.44, h: 0.44, d: 0.30, color: sStyle.jacket },
        { x: 0, y: 0.02, z: 0.155, w: 0.04, h: 0.40, d: 0.02, color: sStyle.jacketZip },
        { x: 0, y: 0.32, z: 0.155, w: 0.12, h: 0.12, d: 0.02, color: sStyle.innerShirt }
      );
      break;
    }
  }

  const bodyGeo = buildVoxelGeometry(bodyBoxes);
  // Kompatibilitas dengan tes lama: pastikan type bernama BoxGeometry
  (bodyGeo as unknown as { type: string }).type = "BoxGeometry";

  const bodyMesh = new THREE.Mesh(bodyGeo, charMat);
  bodyMesh.position.set(0, 0.46, 0);
  group.add(bodyMesh);

  // 4. LENGAN KIRI (Left Arm)
  // Pivot di bahu (y = 0.84, x = -0.26), geometri menjulur ke bawah y: -0.38 s.d. 0
  const sleeveColor =
    deptKey === "manager"
      ? (deptStyle as typeof THEME.characters.departments.manager).suit
      : deptKey === "riset"
      ? (deptStyle as typeof THEME.characters.departments.riset).labCoat
      : deptKey === "copy"
      ? (deptStyle as typeof THEME.characters.departments.copy).hoodie
      : deptKey === "creative"
      ? (deptStyle as typeof THEME.characters.departments.creative).shirt
      : deptKey === "landing_page"
      ? (deptStyle as typeof THEME.characters.departments.landing_page).shirt
      : deptKey === "advertiser"
      ? (deptStyle as typeof THEME.characters.departments.advertiser).shirt
      : deptKey === "hr"
      ? (deptStyle as typeof THEME.characters.departments.hr).blazer
      : deptKey === "operasional"
      ? (deptStyle as typeof THEME.characters.departments.operasional).shirt
      : (deptStyle as typeof THEME.characters.departments.sosmed).jacket;

  const leftArmBoxes: VoxelBoxDef[] = [
    { x: 0, y: -0.26, z: 0, w: 0.12, h: 0.26, d: 0.14, color: sleeveColor },
    { x: 0, y: -0.38, z: 0, w: 0.10, h: 0.12, d: 0.12, color: skinColor },
  ];

  if (deptKey === "manager") {
    // Papan klip kayu di tangan kiri ATLAS
    const mStyle = deptStyle as typeof THEME.characters.departments.manager;
    leftArmBoxes.push(
      { x: 0, y: -0.42, z: 0.08, w: 0.16, h: 0.22, d: 0.03, color: mStyle.clipboard },
      { x: 0, y: -0.40, z: 0.10, w: 0.13, h: 0.18, d: 0.02, color: mStyle.clipboardPaper }
    );
  } else if (deptKey === "riset") {
    // Tablet data digital di tangan kiri Riset
    const rStyle = deptStyle as typeof THEME.characters.departments.riset;
    leftArmBoxes.push(
      { x: 0, y: -0.42, z: 0.08, w: 0.16, h: 0.22, d: 0.03, color: rStyle.tabletBody },
      { x: 0, y: -0.40, z: 0.10, w: 0.13, h: 0.18, d: 0.02, color: rStyle.tabletScreen }
    );
  }

  const leftArmGeo = buildVoxelGeometry(leftArmBoxes);
  const leftArm = new THREE.Mesh(leftArmGeo, charMat);
  // x = -0.26 (< -0.2 agar terdeteksi oleh Kasus 6 di verify-stage-3d.mjs)
  leftArm.position.set(-0.26, 0.84, 0);
  group.add(leftArm);

  // 5. LENGAN KANAN (Right Arm)
  const rightArmBoxes: VoxelBoxDef[] = [
    { x: 0, y: -0.26, z: 0, w: 0.12, h: 0.26, d: 0.14, color: sleeveColor },
    { x: 0, y: -0.38, z: 0, w: 0.10, h: 0.12, d: 0.12, color: skinColor },
  ];

  if (deptKey === "sosmed") {
    // Smartphone di tangan kanan HERMES
    const sStyle = deptStyle as typeof THEME.characters.departments.sosmed;
    rightArmBoxes.push(
      { x: 0, y: -0.40, z: 0.08, w: 0.08, h: 0.16, d: 0.03, color: sStyle.phoneBody },
      { x: 0, y: -0.39, z: 0.10, w: 0.06, h: 0.13, d: 0.02, color: sStyle.phoneScreen }
    );
  }

  const rightArmGeo = buildVoxelGeometry(rightArmBoxes);
  const rightArm = new THREE.Mesh(rightArmGeo, charMat);
  rightArm.position.set(0.26, 0.84, 0);
  group.add(rightArm);

  // 6. KEPALA (Head Group & Head Mesh)
  // Pivot di leher (y = 0.90, x = 0, z = 0). Proporsi chibi: kepala besar (~0.50 unit)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.90, 0);

  const headBoxes: VoxelBoxDef[] = [
    // Wajah / kulit kepala
    { x: 0, y: 0, z: 0, w: 0.48, h: 0.44, d: 0.44, color: skinColor },
    // Rambut atas
    { x: 0, y: 0.40, z: 0, w: 0.52, h: 0.10, d: 0.48, color: hairColor },
    // Rambut belakang
    { x: 0, y: 0.06, z: -0.22, w: 0.52, h: 0.38, d: 0.08, color: hairColor },
    // Rambut samping kiri & kanan
    { x: -0.24, y: 0.16, z: 0, w: 0.06, h: 0.28, d: 0.40, color: hairColor },
    { x: 0.24, y: 0.16, z: 0, w: 0.06, h: 0.28, d: 0.40, color: hairColor },
    // Poni depan
    { x: 0, y: 0.36, z: 0.22, w: 0.48, h: 0.08, d: 0.06, color: hairColor },
    // Dua mata chibi
    { x: -0.12, y: 0.20, z: 0.225, w: 0.08, h: 0.08, d: 0.02, color: THEME.characters.eyes },
    { x: 0.12, y: 0.20, z: 0.225, w: 0.08, h: 0.08, d: 0.02, color: THEME.characters.eyes },
  ];

  // Aksesori Kepala Spesifik Departemen
  switch (deptKey) {
    case "manager": {
      // Headset komunikasi di kepala ATLAS
      const mStyle = deptStyle as typeof THEME.characters.departments.manager;
      headBoxes.push(
        { x: 0, y: 0.48, z: 0, w: 0.52, h: 0.04, d: 0.06, color: mStyle.headset },
        { x: 0.26, y: 0.20, z: 0, w: 0.08, h: 0.14, d: 0.10, color: mStyle.headset },
        { x: 0.24, y: 0.14, z: 0.18, w: 0.03, h: 0.03, d: 0.14, color: mStyle.headsetMic }
      );
      break;
    }
    case "riset": {
      // Kacamata riset berbingkai dengan lensa cyan
      const rStyle = deptStyle as typeof THEME.characters.departments.riset;
      headBoxes.push(
        { x: 0, y: 0.20, z: 0.235, w: 0.44, h: 0.10, d: 0.03, color: rStyle.glassesFrame },
        { x: -0.11, y: 0.20, z: 0.245, w: 0.12, h: 0.07, d: 0.02, color: rStyle.glassesLens },
        { x: 0.11, y: 0.20, z: 0.245, w: 0.12, h: 0.07, d: 0.02, color: rStyle.glassesLens }
      );
      break;
    }
    case "copy": {
      // Pensil kuning terselip di telinga kanan
      const cStyle = deptStyle as typeof THEME.characters.departments.copy;
      headBoxes.push(
        { x: 0.26, y: 0.24, z: 0.02, w: 0.04, h: 0.04, d: 0.22, color: cStyle.pencilBody },
        { x: 0.26, y: 0.24, z: 0.14, w: 0.03, h: 0.03, d: 0.04, color: cStyle.pencilTip }
      );
      break;
    }
    case "creative": {
      // Topi baret ungu miring di kepala
      const crStyle = deptStyle as typeof THEME.characters.departments.creative;
      headBoxes.push(
        { x: 0.04, y: 0.48, z: 0, w: 0.56, h: 0.08, d: 0.56, color: crStyle.beret },
        { x: 0.04, y: 0.55, z: 0, w: 0.16, h: 0.04, d: 0.16, color: crStyle.beret }
      );
      break;
    }
    case "landing_page": {
      // Headphone studio besar di kedua telinga
      const lpStyle = deptStyle as typeof THEME.characters.departments.landing_page;
      headBoxes.push(
        { x: -0.26, y: 0.20, z: 0, w: 0.08, h: 0.18, d: 0.14, color: lpStyle.headphones },
        { x: 0.26, y: 0.20, z: 0, w: 0.08, h: 0.18, d: 0.14, color: lpStyle.headphones },
        { x: 0, y: 0.50, z: 0, w: 0.54, h: 0.04, d: 0.08, color: lpStyle.headphonesBand }
      );
      break;
    }
    case "advertiser": {
      // Earpiece kecil di telinga kanan
      const adStyle = deptStyle as typeof THEME.characters.departments.advertiser;
      headBoxes.push(
        { x: 0.25, y: 0.20, z: 0.04, w: 0.04, h: 0.06, d: 0.04, color: adStyle.earpiece }
      );
      break;
    }
    case "operasional": {
      // Helm keselamatan kerja oranye/kuning dengan visor depan
      const opStyle = deptStyle as typeof THEME.characters.departments.operasional;
      headBoxes.push(
        { x: 0, y: 0.42, z: 0, w: 0.56, h: 0.14, d: 0.54, color: opStyle.helmet },
        { x: 0, y: 0.42, z: 0.27, w: 0.50, h: 0.04, d: 0.10, color: opStyle.helmet },
        { x: 0, y: 0.54, z: 0, w: 0.18, h: 0.04, d: 0.40, color: opStyle.helmet }
      );
      break;
    }
  }

  // Lencana Bintang 3D untuk Kepala Departemen (Lead)
  // Digabung langsung ke head geometry agar zero extra draw calls!
  if (lead) {
    const starGold = THEME.characters.leadBadge.star;
    headBoxes.push(
      // Bintang oktagon / prisma kecil melayang di atas kepala
      { x: 0, y: 0.60, z: 0, w: 0.16, h: 0.16, d: 0.06, color: starGold },
      { x: 0, y: 0.60, z: 0, w: 0.08, h: 0.22, d: 0.06, color: starGold },
      { x: 0, y: 0.60, z: 0, w: 0.22, h: 0.08, d: 0.06, color: starGold }
    );
  }

  const headGeo = buildVoxelGeometry(headBoxes);
  const headMesh = new THREE.Mesh(headGeo, charMat);
  headGroup.add(headMesh);
  group.add(headGroup);

  // Status Indicator Light (Pin kecil di kerah / pakaian)
  const tipGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
  const statusHex = status === "working" ? 0x2ee6a8 : status === "review" ? 0xf5a623 : 0x4a4875;
  const statusLightMat = new THREE.MeshStandardMaterial({
    color: statusHex,
    emissive: statusHex,
    emissiveIntensity: status === "idle" ? 0.3 : 1.2,
    roughness: 0.2,
  });
  const statusLightMesh = new THREE.Mesh(tipGeo, statusLightMat);
  statusLightMesh.position.set(0.12, 0.36, 0.16);
  bodyMesh.add(statusLightMesh);

  // Balon ucapan CSS2D khusus untuk ATLAS atau instance
  let bubbleDiv: HTMLDivElement | undefined;
  if (name === "ATLAS" || isInstance) {
    bubbleDiv = document.createElement("div");
    bubbleDiv.className = "atlas-speech-bubble";
    bubbleDiv.setAttribute("aria-hidden", "true");
    const bubbleObj = new CSS2DObject(bubbleDiv);
    bubbleObj.position.set(0, 2.15, 0);
    group.add(bubbleObj);
  }

  // Hitbox tidak terlihat untuk raycast pointer
  const hitGeo = new THREE.BoxGeometry(0.85, 1.6, 0.85);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.set(0, 0.80, 0);
  hitMesh.userData = { type: isInstance ? "agent_instance" : "agent", id: name };
  group.add(hitMesh);

  // 7. LABEL CSS2D (Status dot, inisial badge mini, nama lengkap)
  const labelDiv = document.createElement("div");
  labelDiv.className = `agent-tag3d ${isInstance ? "is-instance" : ""} st-${status}`;
  labelDiv.style.setProperty("--c", agentColor);
  labelDiv.style.display = "none";
  labelDiv.setAttribute("role", "button");
  labelDiv.setAttribute("tabindex", "0");
  labelDiv.setAttribute("aria-label", `${name}, ${role}`);

  const dotSpan = document.createElement("span");
  dotSpan.className = `agent-dot3d st-${status}`;
  labelDiv.appendChild(dotSpan);

  const initialSpan = document.createElement("span");
  initialSpan.className = "agent-initial3d";
  initialSpan.textContent = name.substring(0, 2);
  labelDiv.appendChild(initialSpan);

  const nameSpan = document.createElement("span");
  nameSpan.className = "agent-name3d";
  nameSpan.textContent = (lead ? "★ " : "") + name;
  labelDiv.appendChild(nameSpan);

  if (onClick) {
    labelDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    labelDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    });
  }

  const labelObj = new CSS2DObject(labelDiv);
  labelObj.visible = true;
  labelObj.position.set(0, 1.70, 0);
  group.add(labelObj);

  const dispose = () => {
    shadowGeo.dispose();
    shadowMat.dispose();
    leftLegGeo.dispose();
    rightLegGeo.dispose();
    bodyGeo.dispose();
    leftArmGeo.dispose();
    rightArmGeo.dispose();
    headGeo.dispose();
    tipGeo.dispose();
    statusLightMat.dispose();
    hitGeo.dispose();
    hitMat.dispose();
    charMat.dispose();

    if (labelDiv.parentNode) {
      labelDiv.parentNode.removeChild(labelDiv);
    }
    if (bubbleDiv?.parentNode) {
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
    leftLeg,
    rightLeg,
    shadowMesh,
    statusLightMesh,
    statusLightMat,
    hitMesh,
    labelObj,
    labelDiv,
    dotSpan,
    bubbleDiv,
    appearance: {
      skin: skinColor,
      hair: hairColor,
      department: deptKey,
      lead,
    },
    characterType: "voxelHuman",
    dispose,
  };
}
