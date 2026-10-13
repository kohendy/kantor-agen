// Walkways & Pathfinding (BFS/Dijkstra) untuk koreografi kantor 3D
// Memetakan koridor di sela 1-unit antar pelat dan titik pintu/lorong tiap ruangan.
// Jalur tidak boleh melintasi bagian dalam ruangan lain selain ruangan asal & tujuan.

import * as THREE from "three";
import { ROOMS } from "@/lib/officeConfig";

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
    neighbors: ["I_V1_H1", "door_riset"],
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
    neighbors: ["I_V2_H1", "door_copy"],
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
    neighbors: ["I_V1_H1", "I_V2_H1"],
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
};

// Pemetaan ID ruangan ke titik desk / door utama
export const ROOM_NODE_MAP: Record<string, { doorId: string; deskId: string }> = {
  manager: { doorId: "door_manager", deskId: "desk_manager" },
  riset: { doorId: "door_riset", deskId: "desk_riset" },
  copy: { doorId: "door_copy", deskId: "desk_copy" },
  lp: { doorId: "door_lp", deskId: "desk_lp" },
  ads: { doorId: "door_ads", deskId: "desk_ads" },
  creative: { doorId: "door_creative", deskId: "desk_creative" },
};

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

// Verifikasi apakah suatu posisi berada di dalam batas ruangan tertentu
export function getRoomAtPosition(worldX: number, worldZ: number): string | null {
  for (const r of ROOMS) {
    const minX = r.x + OFFSET_X;
    const maxX = r.x + 5.0 + OFFSET_X;
    const minZ = r.y + OFFSET_Z;
    const maxZ = r.y + 5.0 + OFFSET_Z;

    // Buffer tipis 0.1 agar tepi pelat tidak dihitung melanggar ruangan
    if (worldX > minX + 0.08 && worldX < maxX - 0.08 && worldZ > minZ + 0.08 && worldZ < maxZ - 0.08) {
      return r.id;
    }
  }
  return null;
}
