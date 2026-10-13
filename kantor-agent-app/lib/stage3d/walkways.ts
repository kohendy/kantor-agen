// Walkways & Pathfinding (BFS/Dijkstra) untuk koreografi kantor 3D
// Memetakan koridor di sela 1-unit antar pelat dan titik pintu/lorong tiap ruangan.
// Jalur tidak boleh melintasi bagian dalam ruangan lain selain ruangan asal & tujuan.

import * as THREE from "three";
import { ROOMS, MANAGER_AGENT_NAME, roomOfAgent } from "@/lib/officeConfig";

export const OFFSET_X = -8.5;
export const OFFSET_Z = -5.5;

export interface WaypointNode {
  id: string;
  x: number; // World coordinate X
  z: number; // World coordinate Z
  roomId?: string; // Jika berada di dalam atau di ambang pintu ruangan tertentu
  isDoor?: boolean;
  isAisle?: boolean;
  isDesk?: boolean;
  neighbors: string[];
}

// Konversi koordinat konfigurasi (0..17) ke World coordinates Three.js
export function configToWorld(cx: number, cy: number): { x: number; z: number } {
  return {
    x: +(cx + OFFSET_X).toFixed(3),
    z: +(cy + OFFSET_Z).toFixed(3),
  };
}

// Graf waypoint koridor dan pintu ruangan
export const WALKWAY_GRAPH: Record<string, WaypointNode> = {
  // --- PERSIMPANGAN KORIDOR ---
  "I_V1_H1": {
    id: "I_V1_H1",
    ...configToWorld(5.5, 5.5), // world (-3.0, 0.0)
    neighbors: ["V1_N", "V1_M", "H1_W", "H1_M"],
  },
  "I_V2_H1": {
    id: "I_V2_H1",
    ...configToWorld(11.5, 5.5), // world (+3.0, 0.0)
    neighbors: ["V2_N", "V2_M", "H1_M", "H1_E"],
  },
  "I_V1_H2": {
    id: "I_V1_H2",
    ...configToWorld(5.5, 11.5), // world (-3.0, +6.0)
    neighbors: ["V1_M", "V1_S", "H2_W", "H2_M"],
  },
  "I_V2_H2": {
    id: "I_V2_H2",
    ...configToWorld(11.5, 11.5), // world (+3.0, +6.0)
    neighbors: ["V2_M", "V2_S", "H2_M", "H2_E"],
  },

  // --- SEGMEN KORIDOR VERTIKAL (V1: x=5.5 -> world x=-3.0) ---
  "V1_N": {
    id: "V1_N",
    ...configToWorld(5.5, 2.5), // (-3.0, -3.0)
    neighbors: ["I_V1_H1", "door_riset", "door_meeting_west"],
  },
  "V1_M": {
    id: "V1_M",
    ...configToWorld(5.5, 8.5), // (-3.0, +3.0)
    neighbors: ["I_V1_H1", "I_V1_H2", "door_lp", "door_ads"],
  },
  "V1_S": {
    id: "V1_S",
    ...configToWorld(5.5, 14.5), // (-3.0, +9.0)
    neighbors: ["I_V1_H2"],
  },

  // --- SEGMEN KORIDOR VERTIKAL (V2: x=11.5 -> world x=+3.0) ---
  "V2_N": {
    id: "V2_N",
    ...configToWorld(11.5, 2.5), // (+3.0, -3.0)
    neighbors: ["I_V2_H1", "door_copy", "door_meeting_east"],
  },
  "V2_M": {
    id: "V2_M",
    ...configToWorld(11.5, 8.5), // (+3.0, +3.0)
    neighbors: ["I_V2_H1", "I_V2_H2", "door_creative"],
  },
  "V2_S": {
    id: "V2_S",
    ...configToWorld(11.5, 14.5), // (+3.0, +9.0)
    neighbors: ["I_V2_H2"],
  },

  // --- SEGMEN KORIDOR HORIZONTAL (H1: y=5.5 -> world z=0.0) ---
  "H1_W": {
    id: "H1_W",
    ...configToWorld(2.5, 5.5), // (-6.0, 0.0)
    neighbors: ["I_V1_H1"],
  },
  "H1_M": {
    id: "H1_M",
    ...configToWorld(8.5, 5.5), // (0.0, 0.0)
    neighbors: ["I_V1_H1", "I_V2_H1", "door_meeting_south"],
  },
  "H1_E": {
    id: "H1_E",
    ...configToWorld(14.5, 5.5), // (+6.0, 0.0)
    neighbors: ["I_V2_H1"],
  },

  // --- SEGMEN KORIDOR HORIZONTAL (H2: y=11.5 -> world z=+6.0) ---
  "H2_W": {
    id: "H2_W",
    ...configToWorld(2.5, 11.5), // (-6.0, +6.0)
    neighbors: ["I_V1_H2"],
  },
  "H2_M": {
    id: "H2_M",
    ...configToWorld(8.5, 11.5), // (0.0, +6.0)
    neighbors: ["I_V1_H2", "I_V2_H2", "door_manager"],
  },
  "H2_E": {
    id: "H2_E",
    ...configToWorld(14.5, 11.5), // (+6.0, +6.0)
    neighbors: ["I_V2_H2"],
  },

  // --- RUANG MANAGER (x:6, y:12) ---
  "door_manager": {
    id: "door_manager",
    ...configToWorld(8.5, 12.0), // (0.0, 6.5) - Pintu sisi utara menghadap H2
    roomId: "manager",
    isDoor: true,
    neighbors: ["H2_M", "aisle_manager"],
  },
  "aisle_manager": {
    id: "aisle_manager",
    ...configToWorld(8.5, 13.2), // (0.0, 7.7) - Lorong tengah ruang Manager
    roomId: "manager",
    isAisle: true,
    neighbors: ["door_manager", "desk_manager"],
  },
  "desk_manager": {
    id: "desk_manager",
    ...configToWorld(8.5, 14.7), // (0.0, 9.2) - Posisi duduk ATLAS di meja
    roomId: "manager",
    isDesk: true,
    neighbors: ["aisle_manager"],
  },

  // --- RUANG RISET (x:0, y:0) - Kepala Departemen: ATHENA ---
  "door_riset": {
    id: "door_riset",
    ...configToWorld(5.0, 2.5), // (-3.5, -3.0) - Pintu timur menghadap V1
    roomId: "riset",
    isDoor: true,
    neighbors: ["V1_N", "aisle_riset"],
  },
  "aisle_riset": {
    id: "aisle_riset",
    ...configToWorld(3.2, 2.5), // (-5.3, -3.0)
    roomId: "riset",
    isAisle: true,
    neighbors: ["door_riset", "desk_riset"],
  },
  "desk_riset": {
    id: "desk_riset",
    ...configToWorld(1.9, 2.2), // (-6.6, -3.3) - Meja ATHENA
    roomId: "riset",
    isDesk: true,
    neighbors: ["aisle_riset"],
  },

  // --- RUANG COPY (x:12, y:0) - Kepala Departemen: CLIO ---
  "door_copy": {
    id: "door_copy",
    ...configToWorld(12.0, 2.5), // (+3.5, -3.0) - Pintu barat menghadap V2
    roomId: "copy",
    isDoor: true,
    neighbors: ["V2_N", "aisle_copy"],
  },
  "aisle_copy": {
    id: "aisle_copy",
    ...configToWorld(12.6, 2.5), // (+4.1, -3.0)
    roomId: "copy",
    isAisle: true,
    neighbors: ["door_copy", "desk_copy"],
  },
  "desk_copy": {
    id: "desk_copy",
    ...configToWorld(13.5, 2.2), // (+5.0, -3.3) - Meja CLIO
    roomId: "copy",
    isDesk: true,
    neighbors: ["aisle_copy"],
  },

  // --- RUANG LANDING PAGE (x:0, y:6) - Kepala Departemen: HESTIA ---
  "door_lp": {
    id: "door_lp",
    ...configToWorld(5.0, 8.5), // (-3.5, +3.0) - Pintu timur menghadap V1
    roomId: "lp",
    isDoor: true,
    neighbors: ["V1_M", "aisle_lp"],
  },
  "aisle_lp": {
    id: "aisle_lp",
    ...configToWorld(3.2, 8.5), // (-5.3, +3.0)
    roomId: "lp",
    isAisle: true,
    neighbors: ["door_lp", "desk_lp"],
  },
  "desk_lp": {
    id: "desk_lp",
    ...configToWorld(1.9, 8.2), // (-6.6, +2.7) - Meja HESTIA
    roomId: "lp",
    isDesk: true,
    neighbors: ["aisle_lp"],
  },

  // --- RUANG ADVERTISER (x:6, y:6) - Kepala Departemen: ZEUS ---
  "door_ads": {
    id: "door_ads",
    ...configToWorld(6.0, 8.5), // (-2.5, +3.0) - Pintu barat menghadap V1
    roomId: "ads",
    isDoor: true,
    neighbors: ["V1_M", "aisle_ads"],
  },
  "aisle_ads": {
    id: "aisle_ads",
    ...configToWorld(6.8, 8.5), // (-1.7, +3.0)
    roomId: "ads",
    isAisle: true,
    neighbors: ["door_ads", "desk_ads"],
  },
  "desk_ads": {
    id: "desk_ads",
    ...configToWorld(7.5, 8.2), // (-1.0, +2.7) - Meja ZEUS
    roomId: "ads",
    isDesk: true,
    neighbors: ["aisle_ads"],
  },

  // --- RUANG CREATIVE (x:12, y:6) - Kepala Departemen: THEIA ---
  "door_creative": {
    id: "door_creative",
    ...configToWorld(12.0, 8.5), // (+3.5, +3.0) - Pintu barat menghadap V2
    roomId: "creative",
    isDoor: true,
    neighbors: ["V2_M", "aisle_creative"],
  },
  "aisle_creative": {
    id: "aisle_creative",
    ...configToWorld(12.6, 8.5), // (+4.1, +3.0)
    roomId: "creative",
    isAisle: true,
    neighbors: ["door_creative", "desk_creative"],
  },
  "desk_creative": {
    id: "desk_creative",
    ...configToWorld(13.5, 8.2), // (+5.0, +2.7) - Meja THEIA
    roomId: "creative",
    isDesk: true,
    neighbors: ["aisle_creative"],
  },

  // --- RUANG MEETING (x:6, y:0) ---
  "door_meeting_south": {
    id: "door_meeting_south",
    ...configToWorld(8.5, 5.0), // (0.0, -0.5) - Pintu selatan menghadap H1
    roomId: "meeting",
    isDoor: true,
    neighbors: ["H1_M", "aisle_meeting_south"],
  },
  "door_meeting_west": {
    id: "door_meeting_west",
    ...configToWorld(6.0, 2.5), // (-2.5, -3.0) - Pintu barat menghadap V1
    roomId: "meeting",
    isDoor: true,
    neighbors: ["V1_N", "aisle_meeting_west"],
  },
  "door_meeting_east": {
    id: "door_meeting_east",
    ...configToWorld(11.0, 2.5), // (+2.5, -3.0) - Pintu timur menghadap V2
    roomId: "meeting",
    isDoor: true,
    neighbors: ["V2_N", "aisle_meeting_east"],
  },
  "aisle_meeting_south": {
    id: "aisle_meeting_south",
    ...configToWorld(8.5, 4.2), // (0.0, -1.3)
    roomId: "meeting",
    isAisle: true,
    neighbors: ["door_meeting_south", "aisle_meeting_west", "aisle_meeting_east"],
  },
  "aisle_meeting_west": {
    id: "aisle_meeting_west",
    ...configToWorld(6.8, 2.5), // (-1.7, -3.0)
    roomId: "meeting",
    isAisle: true,
    neighbors: ["door_meeting_west", "aisle_meeting_south", "aisle_meeting_north"],
  },
  "aisle_meeting_east": {
    id: "aisle_meeting_east",
    ...configToWorld(10.2, 2.5), // (+1.7, -3.0)
    roomId: "meeting",
    isAisle: true,
    neighbors: ["door_meeting_east", "aisle_meeting_south", "aisle_meeting_north"],
  },
  "aisle_meeting_north": {
    id: "aisle_meeting_north",
    ...configToWorld(8.5, 0.9), // (0.0, -4.6)
    roomId: "meeting",
    isAisle: true,
    neighbors: ["aisle_meeting_west", "aisle_meeting_east"],
  },
};

// Pemetaan ID ruangan ke titik desk / door utama
export const ROOM_NODE_MAP: Record<string, { doorId: string; deskId: string }> = {
  manager: { doorId: "door_manager", deskId: "desk_manager" },
  riset: { doorId: "door_riset", deskId: "desk_riset" },
  copy: { doorId: "door_copy", deskId: "desk_copy" },
  lp: { doorId: "door_lp", deskId: "desk_lp" },
  ads: { doorId: "door_ads", deskId: "desk_ads" },
  creative: { doorId: "door_creative", deskId: "desk_creative" },
  meeting: { doorId: "door_meeting_south", deskId: "aisle_meeting_south" },
};

export const ROOM_AISLE_MAP: Record<string, { aisleId: string; doorId: string }> = {
  manager: { aisleId: "aisle_manager", doorId: "door_manager" },
  riset: { aisleId: "aisle_riset", doorId: "door_riset" },
  copy: { aisleId: "aisle_copy", doorId: "door_copy" },
  lp: { aisleId: "aisle_lp", doorId: "door_lp" },
  ads: { aisleId: "aisle_ads", doorId: "door_ads" },
  creative: { aisleId: "aisle_creative", doorId: "door_creative" },
};

export const MEETING_AISLE_IDS = [
  "aisle_meeting_south",
  "aisle_meeting_north",
  "aisle_meeting_west",
  "aisle_meeting_east",
];

export function getNearestMeetingAisle(worldX: number, worldZ: number): string {
  let bestId = "aisle_meeting_south";
  let minDist = Infinity;
  for (const id of MEETING_AISLE_IDS) {
    const node = WALKWAY_GRAPH[id];
    if (!node) continue;
    const d = Math.hypot(node.x - worldX, node.z - worldZ);
    if (d < minDist) {
      minDist = d;
      bestId = id;
    }
  }
  return bestId;
}

// Hitung jarak Euclidean antar dua node
function nodeDistance(a: WaypointNode, b: WaypointNode): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Cari node terdekat ke titik sembarang (x, z)
export function findNearestNode(x: number, z: number, allowedRoomId?: string): string {
  let nearestId = "H2_M";
  let minDist = Infinity;
  for (const [id, node] of Object.entries(WALKWAY_GRAPH)) {
    // Jangan pilih node di dalam ruangan lain yang tertutup
    if (node.roomId && allowedRoomId && node.roomId !== allowedRoomId) {
      continue;
    }
    const dist = Math.hypot(node.x - x, node.z - z);
    if (dist < minDist) {
      minDist = dist;
      nearestId = id;
    }
  }
  return nearestId;
}

// Algoritma Dijkstra / BFS untuk mencari jalur terpendek
export function findPathNodes(startNodeId: string, endNodeId: string): WaypointNode[] {
  if (startNodeId === endNodeId) {
    return [WALKWAY_GRAPH[startNodeId]].filter(Boolean);
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const id of Object.keys(WALKWAY_GRAPH)) {
    dist[id] = Infinity;
    prev[id] = null;
    unvisited.add(id);
  }

  dist[startNodeId] = 0;

  while (unvisited.size > 0) {
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const id of unvisited) {
      if (dist[id] < closestDist) {
        closestDist = dist[id];
        closestId = id;
      }
    }

    if (!closestId || closestDist === Infinity || closestId === endNodeId) {
      break;
    }

    unvisited.delete(closestId);
    const currNode = WALKWAY_GRAPH[closestId];
    if (!currNode) continue;

    for (const neighborId of currNode.neighbors) {
      if (!unvisited.has(neighborId)) continue;
      const neighborNode = WALKWAY_GRAPH[neighborId];
      if (!neighborNode) continue;

      const alt = dist[closestId] + nodeDistance(currNode, neighborNode);
      if (alt < dist[neighborId]) {
        dist[neighborId] = alt;
        prev[neighborId] = closestId;
      }
    }
  }

  // Rekonstruksi jalur
  const path: WaypointNode[] = [];
  let curr: string | null = endNodeId;
  while (curr) {
    const node = WALKWAY_GRAPH[curr];
    if (node) path.unshift(node);
    curr = prev[curr] ?? null;
  }

  return path;
}

// Fungsi publik utama findPath: menerima roomId atau titik koordinat
export function findPath(
  from: string | { x: number; z: number },
  to: string | { x: number; z: number }
): THREE.Vector3[] {
  let startId: string;
  let endId: string;

  if (typeof from === "string") {
    startId = ROOM_NODE_MAP[from]?.deskId ?? ROOM_NODE_MAP[from]?.doorId ?? from;
  } else {
    startId = findNearestNode(from.x, from.z);
  }

  if (typeof to === "string") {
    endId = ROOM_NODE_MAP[to]?.deskId ?? ROOM_NODE_MAP[to]?.doorId ?? to;
  } else {
    endId = findNearestNode(to.x, to.z);
  }

  const nodes = findPathNodes(startId, endId);
  return nodes.map((n) => new THREE.Vector3(n.x, 0, n.z));
}

// Buat visual garis koridor yang halus di lantai (LineSegments Three.js)
export function createWalkwayVisuals(): {
  group: THREE.Group;
  mat: THREE.LineBasicMaterial;
} {
  const group = new THREE.Group();
  const linePoints: THREE.Vector3[] = [];
  const addedEdges = new Set<string>();

  for (const [id, node] of Object.entries(WALKWAY_GRAPH)) {
    // Gambar hanya koridor utama di luar ruangan (bukan interior)
    if (node.roomId) continue;

    for (const neighborId of node.neighbors) {
      const neighbor = WALKWAY_GRAPH[neighborId];
      if (!neighbor || neighbor.roomId) continue;

      const edgeKey = [id, neighborId].sort().join("--");
      if (addedEdges.has(edgeKey)) continue;
      addedEdges.add(edgeKey);

      // Garis koridor halus tepat di atas lantai (y = 0.003)
      linePoints.push(new THREE.Vector3(node.x, 0.003, node.z));
      linePoints.push(new THREE.Vector3(neighbor.x, 0.003, neighbor.z));
    }
  }

  const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const mat = new THREE.LineBasicMaterial({
    color: 0x4a4875,
    transparent: true,
    opacity: 0.22,
    linewidth: 1,
  });

  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);

  return { group, mat };
}

// Bounding box pelat ruangan untuk deteksi tabrakan dinding
// Ruangan 5x5 dengan margin tipis 0.08 dari tepi pelat
export const ROOM_BOUNDS_MAP: Record<
  string,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = {
  riset: { minX: 0 + OFFSET_X + 0.08, maxX: 5 + OFFSET_X - 0.08, minZ: 0 + OFFSET_Z + 0.08, maxZ: 5 + OFFSET_Z - 0.08 },
  meeting: { minX: 6 + OFFSET_X + 0.08, maxX: 11 + OFFSET_X - 0.08, minZ: 0 + OFFSET_Z + 0.08, maxZ: 5 + OFFSET_Z - 0.08 },
  copy: { minX: 12 + OFFSET_X + 0.08, maxX: 17 + OFFSET_X - 0.08, minZ: 0 + OFFSET_Z + 0.08, maxZ: 5 + OFFSET_Z - 0.08 },
  lp: { minX: 0 + OFFSET_X + 0.08, maxX: 5 + OFFSET_X - 0.08, minZ: 6 + OFFSET_Z + 0.08, maxZ: 11 + OFFSET_Z - 0.08 },
  ads: { minX: 6 + OFFSET_X + 0.08, maxX: 11 + OFFSET_X - 0.08, minZ: 6 + OFFSET_Z + 0.08, maxZ: 11 + OFFSET_Z - 0.08 },
  creative: { minX: 12 + OFFSET_X + 0.08, maxX: 17 + OFFSET_X - 0.08, minZ: 6 + OFFSET_Z + 0.08, maxZ: 11 + OFFSET_Z - 0.08 },
  manager: { minX: 6 + OFFSET_X + 0.08, maxX: 11 + OFFSET_X - 0.08, minZ: 12 + OFFSET_Z + 0.08, maxZ: 17 + OFFSET_Z - 0.08 },
};

// Cek apakah segmen garis p1 -> p2 memotong interior ruangan tertentu (metode Liang-Barsky)
export function segmentIntersectsBox(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
): boolean {
  let t0 = 0.0;
  let t1 = 1.0;
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;

  if (Math.abs(dx) < 1e-9) {
    if (p1.x < box.minX || p1.x > box.maxX) return false;
  } else {
    const invDx = 1.0 / dx;
    let tNearX = (box.minX - p1.x) * invDx;
    let tFarX = (box.maxX - p1.x) * invDx;
    if (tNearX > tFarX) {
      const tmp = tNearX;
      tNearX = tFarX;
      tFarX = tmp;
    }
    t0 = Math.max(t0, tNearX);
    t1 = Math.min(t1, tFarX);
    if (t0 > t1) return false;
  }

  if (Math.abs(dz) < 1e-9) {
    if (p1.z < box.minZ || p1.z > box.maxZ) return false;
  } else {
    const invDz = 1.0 / dz;
    let tNearZ = (box.minZ - p1.z) * invDz;
    let tFarZ = (box.maxZ - p1.z) * invDz;
    if (tNearZ > tFarZ) {
      const tmp = tNearZ;
      tNearZ = tFarZ;
      tFarZ = tmp;
    }
    t0 = Math.max(t0, tNearZ);
    t1 = Math.min(t1, tFarZ);
    if (t0 > t1) return false;
  }

  return t0 < t1 && t1 > 0.001 && t0 < 0.999;
}

// Cek apakah segmen p1 -> p2 memotong ruangan yang tidak diizinkan
export function segmentIntersectsUnallowedRooms(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  allowedRoomIds: string[] = []
): boolean {
  for (const [roomId, box] of Object.entries(ROOM_BOUNDS_MAP)) {
    if (allowedRoomIds.includes(roomId)) continue;
    if (segmentIntersectsBox(p1, p2, box)) {
      return true;
    }
  }
  return false;
}

// Cari node koridor terdekat yang tidak menembus dinding ruangan lain
export function findNearestCorridorNode(
  x: number,
  z: number,
  allowedRoomIds: string[] = []
): string {
  const corridorCandidates = Object.entries(WALKWAY_GRAPH)
    .filter(([, node]) => !node.roomId)
    .map(([id, node]) => ({
      id,
      dist: Math.hypot(node.x - x, node.z - z),
      node,
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const cand of corridorCandidates) {
    if (
      !segmentIntersectsUnallowedRooms(
        { x, z },
        { x: cand.node.x, z: cand.node.z },
        allowedRoomIds
      )
    ) {
      return cand.id;
    }
  }

  return corridorCandidates[0]?.id ?? "I_V1_H1";
}

// Verifikasi apakah suatu posisi berada di dalam batas ruangan tertentu
export function getRoomAtPosition(worldX: number, worldZ: number): string | null {
  for (const r of ROOMS) {
    const minX = r.x + OFFSET_X;
    const maxX = r.x + 5.0 + OFFSET_X;
    const minZ = r.y + OFFSET_Z;
    const maxZ = r.y + 5.0 + OFFSET_Z;

    // Buffer tipis 0.08 agar tepi pelat tidak dihitung melanggar ruangan
    if (worldX > minX + 0.08 && worldX < maxX - 0.08 && worldZ > minZ + 0.08 && worldZ < maxZ - 0.08) {
      return r.id;
    }
  }
  return null;
}

// Bersihkan waypoint ganda berdekatan
function cleanWaypoints(pts: THREE.Vector3[]): THREE.Vector3[] {
  const res: THREE.Vector3[] = [];
  for (const pt of pts) {
    if (res.length === 0) {
      res.push(pt);
      continue;
    }
    const prev = res[res.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.z - prev.z) > 0.04) {
      res.push(pt);
    }
  }
  return res;
}

// Rute jalan agen dari meja ke kursi rapat di ruang Meeting
export function getMeetingPathForAgent(
  agentName: string,
  startPos: { x: number; z: number },
  targetSeatPos: { x: number; z: number },
  agentIndex: number = 0
): THREE.Vector3[] {
  const currentRoom = getRoomAtPosition(startPos.x, startPos.z);
  const targetAisleId = getNearestMeetingAisle(targetSeatPos.x, targetSeatPos.z);
  const waypoints: THREE.Vector3[] = [];

  // 1. Titik awal
  waypoints.push(new THREE.Vector3(startPos.x, 0, startPos.z));

  let startGraphNode: string;

  if (currentRoom && currentRoom !== "meeting") {
    // Berada di dalam ruangan asal: keluar lewat lorong dan pintu ruangan tersebut
    const nav = ROOM_AISLE_MAP[currentRoom] ?? ROOM_AISLE_MAP.manager;
    const aisleNode = WALKWAY_GRAPH[nav.aisleId];
    if (aisleNode && Math.hypot(startPos.x - aisleNode.x, startPos.z - aisleNode.z) > 0.1) {
      waypoints.push(new THREE.Vector3(aisleNode.x, 0, aisleNode.z));
    }
    const doorNode = WALKWAY_GRAPH[nav.doorId];
    if (doorNode) {
      waypoints.push(new THREE.Vector3(doorNode.x, 0, doorNode.z));
    }
    startGraphNode = nav.doorId;
  } else if (currentRoom === "meeting") {
    // Sudah di dalam ruang meeting: gunakan lorong terdekat di ruang meeting
    startGraphNode = getNearestMeetingAisle(startPos.x, startPos.z);
    const sn = WALKWAY_GRAPH[startGraphNode];
    if (sn && Math.hypot(startPos.x - sn.x, startPos.z - sn.z) > 0.1) {
      waypoints.push(new THREE.Vector3(sn.x, 0, sn.z));
    }
  } else {
    // Posisi di koridor: langsung gabung ke graf di node koridor terdekat
    startGraphNode = findNearestCorridorNode(startPos.x, startPos.z, ["meeting"]);
    const sn = WALKWAY_GRAPH[startGraphNode];
    if (sn && Math.hypot(startPos.x - sn.x, startPos.z - sn.z) > 0.05) {
      waypoints.push(new THREE.Vector3(sn.x, 0, sn.z));
    }
  }

  // Dijkstra dari startGraphNode ke lorong meeting tujuan
  const nodes = findPathNodes(startGraphNode, targetAisleId);

  // Lewati koridor dengan lane offset halus (±0.12) agar antar agen tidak bertumpuk
  const laneOffset = ((agentIndex % 3) - 1) * 0.12;
  for (const n of nodes) {
    let px = n.x;
    let pz = n.z;
    if (!n.roomId) {
      if (n.id.startsWith("V") || n.id.startsWith("I_V")) {
        px += laneOffset;
      } else if (n.id.startsWith("H")) {
        pz += laneOffset;
      }
    }
    waypoints.push(new THREE.Vector3(px, 0, pz));
  }

  // Tiba di kursi rapat
  waypoints.push(new THREE.Vector3(targetSeatPos.x, 0, targetSeatPos.z));

  return cleanWaypoints(waypoints);
}

// Rute bubar rapat: dari kursi meeting kembali ke meja masing-masing lewat koridor
export function getReturnPathForAgent(
  agentName: string,
  currentPos: { x: number; z: number },
  homePos: { x: number; z: number },
  agentIndex: number = 0
): THREE.Vector3[] {
  const isManager = agentName === MANAGER_AGENT_NAME;
  const homeRoomId = isManager ? "manager" : roomOfAgent(agentName)?.id ?? "manager";
  const homeNav = ROOM_AISLE_MAP[homeRoomId] ?? ROOM_AISLE_MAP.manager;
  const currentRoom = getRoomAtPosition(currentPos.x, currentPos.z);
  const waypoints: THREE.Vector3[] = [];

  // 1. Titik saat ini
  waypoints.push(new THREE.Vector3(currentPos.x, 0, currentPos.z));

  if (currentRoom === homeRoomId) {
    // Sudah di ruangan rumah sendiri: cukup jalan langsung ke meja rumah
    waypoints.push(new THREE.Vector3(homePos.x, 0, homePos.z));
    return cleanWaypoints(waypoints);
  }

  let startGraphNode: string;

  if (currentRoom === "meeting") {
    // Sedang di kursi ruang meeting: jalan ke lorong meeting terdekat lalu ke graf
    const startAisleId = getNearestMeetingAisle(currentPos.x, currentPos.z);
    const startAisleNode = WALKWAY_GRAPH[startAisleId];
    if (startAisleNode && Math.hypot(currentPos.x - startAisleNode.x, currentPos.z - startAisleNode.z) > 0.1) {
      waypoints.push(new THREE.Vector3(startAisleNode.x, 0, startAisleNode.z));
    }
    startGraphNode = startAisleId;
  } else if (currentRoom && currentRoom !== homeRoomId) {
    // Sedang di dalam ruangan lain: keluar lewat pintu ruangan itu
    const currNav = ROOM_AISLE_MAP[currentRoom] ?? ROOM_AISLE_MAP.manager;
    const aisleNode = WALKWAY_GRAPH[currNav.aisleId];
    if (aisleNode && Math.hypot(currentPos.x - aisleNode.x, currentPos.z - aisleNode.z) > 0.1) {
      waypoints.push(new THREE.Vector3(aisleNode.x, 0, aisleNode.z));
    }
    const doorNode = WALKWAY_GRAPH[currNav.doorId];
    if (doorNode) {
      waypoints.push(new THREE.Vector3(doorNode.x, 0, doorNode.z));
    }
    startGraphNode = currNav.doorId;
  } else {
    // Sedang di koridor: langsung gabung ke graf di node koridor terdekat
    startGraphNode = findNearestCorridorNode(currentPos.x, currentPos.z, [homeRoomId]);
    const sn = WALKWAY_GRAPH[startGraphNode];
    if (sn && Math.hypot(currentPos.x - sn.x, currentPos.z - sn.z) > 0.05) {
      waypoints.push(new THREE.Vector3(sn.x, 0, sn.z));
    }
  }

  // Dijkstra dari startGraphNode ke lorong ruangan rumah tujuan
  const nodes = findPathNodes(startGraphNode, homeNav.aisleId);

  // Lewati koridor dengan lane offset halus
  const laneOffset = ((agentIndex % 3) - 1) * 0.12;
  for (const n of nodes) {
    let px = n.x;
    let pz = n.z;
    if (!n.roomId) {
      if (n.id.startsWith("V") || n.id.startsWith("I_V")) {
        px += laneOffset;
      } else if (n.id.startsWith("H")) {
        pz += laneOffset;
      }
    }
    waypoints.push(new THREE.Vector3(px, 0, pz));
  }

  // Dari lorong ruangan rumah kembali ke meja rumah
  waypoints.push(new THREE.Vector3(homePos.x, 0, homePos.z));

  return cleanWaypoints(waypoints);
}
