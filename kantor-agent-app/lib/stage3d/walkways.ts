// lib/stage3d/walkways.ts
// Walkways & Pathfinding (Dijkstra) otomatis diturunkan dari Floorplan.
// Memetakan koridor, persimpangan, kedua sisi tiap pintu, dan meja/kursi tanpa kode tulis-tangan manual.
// Menjamin jalur tidak menembus dinding ruangan lain (Liang-Barsky).

import * as THREE from "three";
import {
  FLOORPLAN,
  FloorplanData,
  getDoorSpan,
} from "./floorplan";
import {
  HOME_POSITIONS,
  SEAT_BY_AGENT,
  MANAGER_AGENT_NAME,
  ROOMS,
  roomOfAgent,
} from "@/lib/officeConfig";

export interface WaypointNode {
  id: string;
  x: number; // World X
  z: number; // World Z
  roomId?: string; // Jika berada di dalam ruangan tertentu
  isDoor?: boolean;
  isDoorOut?: boolean;
  isAisle?: boolean;
  isDesk?: boolean;
  isSeat?: boolean;
  neighbors: string[];
}

export const OFFSET_X = 0;
export const OFFSET_Z = 0;


// Bounding box pelat ruangan untuk deteksi tabrakan dinding (Liang-Barsky)
export const ROOM_BOUNDS_MAP: Record<
  string,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = {};

for (const r of FLOORPLAN.rooms) {
  ROOM_BOUNDS_MAP[r.id] = {
    minX: +(r.x + 0.08).toFixed(3),
    maxX: +(r.x + r.w - 0.08).toFixed(3),
    minZ: +(r.z + 0.08).toFixed(3),
    maxZ: +(r.z + r.d - 0.08).toFixed(3),
  };
}

// Cek apakah posisi berada di dalam ruangan tertentu
export function getRoomAtPosition(worldX: number, worldZ: number): string | null {
  for (const r of FLOORPLAN.rooms) {
    if (
      worldX > r.x + 0.08 &&
      worldX < r.x + r.w - 0.08 &&
      worldZ > r.z + 0.08 &&
      worldZ < r.z + r.d - 0.08
    ) {
      return r.id;
    }
  }
  return null;
}

// Algoritma Liang-Barsky untuk mendeteksi apakah segmen p1 -> p2 memotong kotak
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

// Generator graf otomatis dari Floorplan
export function generateWalkwayGraph(
  fp: FloorplanData,
  homePosMap: Record<string, [number, number]>,
  seatPosMap: Record<string, [number, number]>
): Record<string, WaypointNode> {
  const nodes: Record<string, WaypointNode> = {};

  function addNode(node: WaypointNode) {
    node.x = +node.x.toFixed(3);
    node.z = +node.z.toFixed(3);
    if (!nodes[node.id]) {
      nodes[node.id] = { ...node, neighbors: [...node.neighbors] };
    } else {
      nodes[node.id].neighbors = Array.from(
        new Set([...nodes[node.id].neighbors, ...node.neighbors])
      );
    }
  }

  function addEdge(id1: string, id2: string) {
    if (id1 === id2 || !nodes[id1] || !nodes[id2]) return;
    if (!nodes[id1].neighbors.includes(id2)) nodes[id1].neighbors.push(id2);
    if (!nodes[id2].neighbors.includes(id1)) nodes[id2].neighbors.push(id1);
  }

  // 1. PERSIMPANGAN KORIDOR (Intersections)
  // H_N (z: 9..11, cz = 10) bersimpangan dengan:
  // - V_W (x: 9..11, cx = 10) di (10, 10)
  // - lorong_1 (x: 15..17, cx = 16) di (16, 10)
  // - lorong_2 (x: 26..28, cx = 27) di (27, 10)
  // - V_E (x: 28..30, cx = 29) di (29, 10)
  // - E_lane (x: 38..39, cx = 38.5) di (38.5, 10)
  addNode({ id: "I_HN_VW", x: 10, z: 10, neighbors: [] });
  addNode({ id: "I_HN_L1", x: 16, z: 10, neighbors: [] });
  addNode({ id: "I_HN_L2", x: 27, z: 10, neighbors: [] });
  addNode({ id: "I_HN_VE", x: 29, z: 10, neighbors: [] });
  addNode({ id: "I_HN_EL", x: 38.5, z: 10, neighbors: [] });

  // H_S (z: 25..27, cz = 26) bersimpangan dengan:
  // - V_W (x: 9..11, cx = 10) di (10, 26)
  // - V_E (x: 28..30, cx = 29) di (29, 26)
  // - E_lane (x: 38..39, cx = 38.5) di (38.5, 26)
  addNode({ id: "I_HS_VW", x: 10, z: 26, neighbors: [] });
  addNode({ id: "I_HS_VE", x: 29, z: 26, neighbors: [] });
  addNode({ id: "I_HS_EL", x: 38.5, z: 26, neighbors: [] });

  // 2. NODE DI SEPANJANG KORIDOR UTAMA
  // H_N (cz = 10)
  addNode({ id: "HN_w_end", x: 2.0, z: 10, neighbors: [] });
  addNode({ id: "HN_d_meeting", x: 7.0, z: 10, neighbors: [] });
  addNode({ id: "HN_d_ops", x: 21.0, z: 10, neighbors: [] });
  addNode({ id: "HN_d_adv", x: 34.0, z: 10, neighbors: [] });
  addNode({ id: "HN_e_end", x: 42.0, z: 10, neighbors: [] });

  // Hubungkan segmen horizontal H_N berurutan dari barat ke timur
  const hnChain = [
    "HN_w_end",
    "HN_d_meeting",
    "I_HN_VW",
    "I_HN_L1",
    "HN_d_ops",
    "I_HN_L2",
    "I_HN_VE",
    "HN_d_adv",
    "I_HN_EL",
    "HN_e_end",
  ];
  for (let i = 0; i < hnChain.length - 1; i++) {
    addEdge(hnChain[i], hnChain[i + 1]);
  }

  // H_S (cz = 26)
  addNode({ id: "HS_w_end", x: 2.0, z: 26, neighbors: [] });
  addNode({ id: "HS_d_sosmed", x: 5.0, z: 26, neighbors: [] });
  addNode({ id: "HS_d_creative", x: 16.0, z: 26, neighbors: [] });
  addNode({ id: "HS_d_copy", x: 27.0, z: 26, neighbors: [] });
  addNode({ id: "HS_d_lp", x: 37.0, z: 26, neighbors: [] });
  addNode({ id: "HS_d_resepsi", x: 42.0, z: 26, neighbors: [] });

  // Hubungkan segmen horizontal H_S berurutan dari barat ke timur
  const hsChain = [
    "HS_w_end",
    "HS_d_sosmed",
    "I_HS_VW",
    "HS_d_creative",
    "HS_d_copy",
    "I_HS_VE",
    "HS_d_lp",
    "I_HS_EL",
    "HS_d_resepsi",
  ];
  for (let i = 0; i < hsChain.length - 1; i++) {
    addEdge(hsChain[i], hsChain[i + 1]);
  }

  // V_W (cx = 10, dari z = 10 sampai z = 26)
  addNode({ id: "VW_d_riset_w", x: 10, z: 14.0, neighbors: [] });
  addNode({ id: "VW_d_manager", x: 10, z: 15.0, neighbors: [] });
  addNode({ id: "VW_mid", x: 10, z: 19.0, neighbors: [] });
  addNode({ id: "VW_d_hr", x: 10, z: 23.0, neighbors: [] });

  const vwChain = [
    "I_HN_VW",
    "VW_d_riset_w",
    "VW_d_manager",
    "VW_mid",
    "VW_d_hr",
    "I_HS_VW",
  ];
  for (let i = 0; i < vwChain.length - 1; i++) {
    addEdge(vwChain[i], vwChain[i + 1]);
  }

  // V_E (cx = 29, dari z = 10 sampai z = 26)
  addNode({ id: "VE_d_pantry", x: 29, z: 14.0, neighbors: [] });
  addNode({ id: "VE_mid", x: 29, z: 18.0, neighbors: [] });
  addNode({ id: "VE_d_lounge", x: 29, z: 22.0, neighbors: [] });

  const veChain = [
    "I_HN_VE",
    "VE_d_pantry",
    "VE_mid",
    "VE_d_lounge",
    "I_HS_VE",
  ];
  for (let i = 0; i < veChain.length - 1; i++) {
    addEdge(veChain[i], veChain[i + 1]);
  }

  // Lorong 1 (cx = 16, dari z = 4 sampai z = 10)
  addNode({ id: "L1_doors", x: 16, z: 4.0, neighbors: [] });
  addEdge("L1_doors", "I_HN_L1");

  // Lorong 2 (cx = 27, dari z = 4 sampai z = 10)
  addNode({ id: "L2_doors", x: 27, z: 4.0, neighbors: [] });
  addEdge("L2_doors", "I_HN_L2");

  // E_lane (cx = 38.5, dari z = 10 sampai z = 26)
  addNode({ id: "EL_d_toilet", x: 38.5, z: 14.0, neighbors: [] });
  addNode({ id: "EL_mid", x: 38.5, z: 18.0, neighbors: [] });
  addNode({ id: "EL_d_taman", x: 38.5, z: 21.0, neighbors: [] });

  const elChain = [
    "I_HN_EL",
    "EL_d_toilet",
    "EL_mid",
    "EL_d_taman",
    "I_HS_EL",
  ];
  for (let i = 0; i < elChain.length - 1; i++) {
    addEdge(elChain[i], elChain[i + 1]);
  }

  // 3. COMMON AREA WALKWAYS (Atrium & Atrium Selatan)
  // Atrium (21..28, 11..21)
  addNode({ id: "atrium_nw", x: 23.0, z: 14.0, roomId: "atrium", neighbors: [] });
  addNode({ id: "atrium_center", x: 24.5, z: 16.0, roomId: "atrium", neighbors: [] });
  addNode({ id: "atrium_s", x: 24.5, z: 20.0, roomId: "atrium", neighbors: [] });
  addEdge("atrium_nw", "atrium_center");
  addEdge("atrium_center", "atrium_s");
  // Hubungkan Atrium ke V_E
  addEdge("atrium_center", "VE_d_pantry");
  addEdge("atrium_center", "VE_mid");

  // Atrium Selatan (11..28, 21..25)
  addNode({ id: "atrium_s_w", x: 16.0, z: 23.0, roomId: "atrium_selatan", neighbors: [] });
  addNode({ id: "atrium_s_e", x: 24.5, z: 23.0, roomId: "atrium_selatan", neighbors: [] });
  addEdge("atrium_s_w", "atrium_s_e");
  addEdge("atrium_s_e", "atrium_s"); // Sambungan Atrium ke Atrium Selatan
  addEdge("atrium_s_w", "VW_d_hr");
  addEdge("atrium_s_e", "VE_d_lounge");
  addEdge("atrium_s_w", "HS_d_creative");
  addEdge("atrium_s_e", "HS_d_copy");

  // 4. PINTU (Doors) - Node di kedua sisi tiap pintu (outside & inside)
  for (const door of fp.doors) {
    const room = fp.rooms.find((r) => r.id === door.roomId);
    if (!room) continue;

    const span = getDoorSpan(door, room);
    const outId = `door_${door.id}_out`;
    const inId = `door_${door.id}_in`;

    addNode({
      id: outId,
      x: span.outsideX,
      z: span.outsideZ,
      isDoorOut: true,
      neighbors: [],
    });

    addNode({
      id: inId,
      x: span.insideX,
      z: span.insideZ,
      roomId: door.roomId,
      isDoor: true,
      neighbors: [],
    });

    // Ambang pintu menghubungkan luar dan dalam
    addEdge(outId, inId);

    // Sambungkan door outside ke koridor terdekat yang sesuai spesifikasi
    if (door.id === "d_meeting_s") addEdge(outId, "HN_d_meeting");
    else if (door.id === "d_meeting_e") addEdge(outId, "L1_doors");
    else if (door.id === "d_ops_w") addEdge(outId, "L1_doors");
    else if (door.id === "d_ops_s") addEdge(outId, "HN_d_ops");
    else if (door.id === "d_adv_w") addEdge(outId, "L2_doors");
    else if (door.id === "d_adv_s") addEdge(outId, "HN_d_adv");
    else if (door.id === "d_manager_e") addEdge(outId, "VW_d_manager");
    else if (door.id === "d_riset_w") addEdge(outId, "VW_d_riset_w");
    else if (door.id === "d_riset_e") addEdge(outId, "atrium_nw");
    else if (door.id === "d_riset_s") {
      // Pintu selatan Riset keluar lewat celah bay_riset ke Atrium Selatan
      addNode({ id: "bay_riset_path", x: 16.0, z: 20.0, neighbors: [] });
      addEdge(outId, "bay_riset_path");
      addEdge("bay_riset_path", "atrium_s_w");
    } else if (door.id === "d_hr_e") addEdge(outId, "VW_d_hr");
    else if (door.id === "d_sosmed_n") addEdge(outId, "HS_d_sosmed");
    else if (door.id === "d_creative_n") addEdge(outId, "HS_d_creative");
    else if (door.id === "d_copy_n") addEdge(outId, "HS_d_copy");
    else if (door.id === "d_lp_n") addEdge(outId, "HS_d_lp");
    else if (door.id === "d_pantry_w") addEdge(outId, "VE_d_pantry");
    else if (door.id === "d_lounge_w") addEdge(outId, "VE_d_lounge");
    else if (door.id === "d_toilet_w") addEdge(outId, "EL_d_toilet");
    else if (door.id === "d_taman_w") addEdge(outId, "EL_d_taman");
    else if (door.id === "d_resepsi_n") addEdge(outId, "HS_d_resepsi");
    else if (door.id === "d_main") {
      // Pintu utama (timur resepsi x=44)
      addNode({ id: "main_entrance_out", x: 44.8, z: 30.0, neighbors: [] });
      addEdge(outId, "main_entrance_out");
    }
  }

  // 5. INTERIOR RUANG MEETING (Aisle loop mengelilingi meja panjang + 19 kursi)
  // Meja meeting berada di x: 3.5..11.5, z: 3.5..5.5
  // Aisle melingkari meja
  addNode({ id: "meeting_aisle_w", x: 2.0, z: 4.5, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_nw", x: 3.5, z: 2.0, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_n", x: 7.5, z: 2.0, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_ne", x: 11.5, z: 2.0, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_e", x: 13.5, z: 4.0, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_se", x: 11.5, z: 7.2, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_s", x: 7.0, z: 7.2, roomId: "meeting", isAisle: true, neighbors: [] });
  addNode({ id: "meeting_aisle_sw", x: 3.5, z: 7.2, roomId: "meeting", isAisle: true, neighbors: [] });

  const meetingLoop = [
    "meeting_aisle_w",
    "meeting_aisle_nw",
    "meeting_aisle_n",
    "meeting_aisle_ne",
    "meeting_aisle_e",
    "meeting_aisle_se",
    "meeting_aisle_s",
    "meeting_aisle_sw",
  ];
  for (let i = 0; i < meetingLoop.length; i++) {
    addEdge(meetingLoop[i], meetingLoop[(i + 1) % meetingLoop.length]);
  }

  // Sambungkan pintu meeting inside ke aisle meeting
  addEdge("door_d_meeting_s_in", "meeting_aisle_s");
  addEdge("door_d_meeting_e_in", "meeting_aisle_e");

  // Tambahkan 19 kursi rapat ke graf dan sambungkan ke aisle meeting
  for (const [agentName, [sx, sz]] of Object.entries(seatPosMap)) {
    const seatNodeId = `seat_${agentName}`;
    addNode({
      id: seatNodeId,
      x: sx,
      z: sz,
      roomId: "meeting",
      isSeat: true,
      neighbors: [],
    });

    // Hubungkan ke aisle terdekat di ruang meeting
    let bestAisle = "meeting_aisle_s";
    let minD = Infinity;
    for (const aId of meetingLoop) {
      const an = nodes[aId];
      const d = Math.hypot(an.x - sx, an.z - sz);
      if (d < minD) {
        minD = d;
        bestAisle = aId;
      }
    }
    addEdge(seatNodeId, bestAisle);
  }

  // 6. INTERIOR DEPARTEMEN LAIN: Meja Agent (Home Desks) & Lorong Interior
  for (const [agentName, [hx, hz]] of Object.entries(homePosMap)) {
    const deskNodeId = `desk_${agentName}`;
    const rId = roomOfAgent(agentName)?.id ?? "manager";

    addNode({
      id: deskNodeId,
      x: hx,
      z: hz,
      roomId: rId,
      isDesk: true,
      neighbors: [],
    });

    // Cari pintu masuk inside dari ruangan ini
    const roomDoors = fp.doors.filter((d) => d.roomId === rId);
    if (roomDoors.length > 0) {
      // Hubungkan ke pintu inside terdekat
      let bestDoorIn = `door_${roomDoors[0].id}_in`;
      let minD = Infinity;
      for (const d of roomDoors) {
        const dinId = `door_${d.id}_in`;
        const dn = nodes[dinId];
        if (dn) {
          const dist = Math.hypot(dn.x - hx, dn.z - hz);
          if (dist < minD) {
            minD = dist;
            bestDoorIn = dinId;
          }
        }
      }
      addEdge(deskNodeId, bestDoorIn);
    }
  }

  // Hubungkan sesama meja di dalam ruangan yang sama jika tidak ada halangan
  const agentsByRoom: Record<string, string[]> = {};
  for (const [name] of Object.entries(homePosMap)) {
    const rId = roomOfAgent(name)?.id ?? "manager";
    if (!agentsByRoom[rId]) agentsByRoom[rId] = [];
    agentsByRoom[rId].push(name);
  }
  for (const names of Object.values(agentsByRoom)) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        addEdge(`desk_${names[i]}`, `desk_${names[j]}`);
      }
    }
  }

  return nodes;
}

// Inisialisasi graf global
export const WALKWAY_GRAPH = generateWalkwayGraph(
  FLOORPLAN,
  HOME_POSITIONS,
  SEAT_BY_AGENT
);

// Hitung jarak Euclidean antar node
function nodeDistance(a: WaypointNode, b: WaypointNode): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Cari node terdekat ke titik sembarang (x, z)
export function findNearestNode(
  x: number,
  z: number,
  allowedRoomId?: string
): string {
  let nearestId = "HN_w_end";
  let minDist = Infinity;
  for (const [id, node] of Object.entries(WALKWAY_GRAPH)) {
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

// Cari node koridor terdekat yang tidak menembus dinding ruangan lain
export function findNearestCorridorNode(
  x: number,
  z: number,
  allowedRoomIds: string[] = []
): string {
  const candidates = Object.entries(WALKWAY_GRAPH)
    .filter(([, node]) => !node.roomId)
    .map(([id, node]) => ({
      id,
      dist: Math.hypot(node.x - x, node.z - z),
      node,
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const cand of candidates) {
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

  return candidates[0]?.id ?? "I_HN_VW";
}

// Algoritma Dijkstra untuk mencari rute terpendek antar dua node
export function findPathNodes(
  startNodeId: string,
  endNodeId: string,
  allowedRoomIds: string[] = []
): WaypointNode[] {
  if (startNodeId === endNodeId) {
    return [WALKWAY_GRAPH[startNodeId]].filter(Boolean);
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const [id, node] of Object.entries(WALKWAY_GRAPH)) {
    // Lewati node yang berada di dalam ruangan lain yang tidak diizinkan
    if (node.roomId && !allowedRoomIds.includes(node.roomId)) {
      continue;
    }
    dist[id] = Infinity;
    prev[id] = null;
    unvisited.add(id);
  }

  if (!(startNodeId in dist) || !(endNodeId in dist)) {
    return [];
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

// Resolusi target identitas ke node ID di graf
function resolveTargetNodeId(target: string): { nodeId: string; roomId?: string } {
  // Alias landing page & advertiser
  const t = target === "lp" ? "landing_page" : target === "ads" ? "advertiser" : target;

  if (WALKWAY_GRAPH[`desk_${t}`]) {
    return { nodeId: `desk_${t}`, roomId: roomOfAgent(t)?.id };
  }
  if (WALKWAY_GRAPH[`seat_${t}`]) {
    return { nodeId: `seat_${t}`, roomId: "meeting" };
  }
  if (WALKWAY_GRAPH[t]) {
    return { nodeId: t, roomId: WALKWAY_GRAPH[t].roomId };
  }

  // Jika berupa ID ruangan
  const room = FLOORPLAN.rooms.find((r) => r.id === t);
  if (room) {
    // Cari meja kepala departemen atau pintu masuk inside
    const roomCfg = ROOMS.find((rc) => rc.id === room.id);
    const firstAgent = room.id === "manager" ? MANAGER_AGENT_NAME : roomCfg?.agents[0];
    if (firstAgent && WALKWAY_GRAPH[`desk_${firstAgent}`]) {
      return { nodeId: `desk_${firstAgent}`, roomId: room.id };
    }
    const door = room.doors[0];
    if (door && WALKWAY_GRAPH[`door_${door.id}_in`]) {
      return { nodeId: `door_${door.id}_in`, roomId: room.id };
    }
  }

  return { nodeId: findNearestNode(10, 10) };
}

// API publik utama findPath
export function findPath(
  from: string | { x: number; z: number },
  to: string | { x: number; z: number },
  customAllowedRoomIds?: string[]
): THREE.Vector3[] {
  let startId: string;
  let endId: string;
  let fromRoom: string | undefined;
  let toRoom: string | undefined;

  if (typeof from === "string") {
    const res = resolveTargetNodeId(from);
    startId = res.nodeId;
    fromRoom = res.roomId;
  } else {
    fromRoom = getRoomAtPosition(from.x, from.z) ?? undefined;
    startId = findNearestNode(from.x, from.z, fromRoom);
  }

  if (typeof to === "string") {
    const res = resolveTargetNodeId(to);
    endId = res.nodeId;
    toRoom = res.roomId;
  } else {
    toRoom = getRoomAtPosition(to.x, to.z) ?? undefined;
    endId = findNearestNode(to.x, to.z, toRoom);
  }

  const allowed =
    customAllowedRoomIds ??
    ([fromRoom, toRoom].filter(Boolean) as string[]);

  const nodes = findPathNodes(startId, endId, allowed);
  return nodes.map((n) => new THREE.Vector3(n.x, 0, n.z));
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
  const startNodeId = findNearestNode(startPos.x, startPos.z, currentRoom ?? undefined);
  const endNodeId = `seat_${agentName}`;

  const allowed = ([currentRoom, "meeting"].filter(Boolean) as string[]);
  const nodes = findPathNodes(startNodeId, endNodeId, allowed);

  const waypoints: THREE.Vector3[] = [];
  waypoints.push(new THREE.Vector3(startPos.x, 0, startPos.z));

  const laneOffset = ((agentIndex % 3) - 1) * 0.12;
  for (const n of nodes) {
    let px = n.x;
    let pz = n.z;
    if (!n.roomId) {
      if (n.id.startsWith("V") || n.id.startsWith("I_")) {
        px += laneOffset;
      } else if (n.id.startsWith("H")) {
        pz += laneOffset;
      }
    }
    waypoints.push(new THREE.Vector3(px, 0, pz));
  }

  waypoints.push(new THREE.Vector3(targetSeatPos.x, 0, targetSeatPos.z));
  return cleanWaypoints(waypoints);
}

// Rute bubar rapat: kembali dari kursi meeting ke meja masing-masing
export function getReturnPathForAgent(
  agentName: string,
  currentPos: { x: number; z: number },
  homePos: { x: number; z: number },
  agentIndex: number = 0
): THREE.Vector3[] {
  const isManager = agentName === MANAGER_AGENT_NAME;
  const homeRoomId = isManager
    ? "manager"
    : roomOfAgent(agentName)?.id ?? "manager";

  const currentRoom = getRoomAtPosition(currentPos.x, currentPos.z);
  const startNodeId = findNearestNode(currentPos.x, currentPos.z, currentRoom ?? undefined);
  const endNodeId = `desk_${agentName}`;

  const allowed = ([currentRoom, homeRoomId].filter(Boolean) as string[]);
  const nodes = findPathNodes(startNodeId, endNodeId, allowed);

  const waypoints: THREE.Vector3[] = [];
  waypoints.push(new THREE.Vector3(currentPos.x, 0, currentPos.z));

  const laneOffset = ((agentIndex % 3) - 1) * 0.12;
  for (const n of nodes) {
    let px = n.x;
    let pz = n.z;
    if (!n.roomId) {
      if (n.id.startsWith("V") || n.id.startsWith("I_")) {
        px += laneOffset;
      } else if (n.id.startsWith("H")) {
        pz += laneOffset;
      }
    }
    waypoints.push(new THREE.Vector3(px, 0, pz));
  }

  waypoints.push(new THREE.Vector3(homePos.x, 0, homePos.z));
  return cleanWaypoints(waypoints);
}

// Visual garis koridor yang halus di lantai (Three.js LineSegments)
export function createWalkwayVisuals(): {
  group: THREE.Group;
  mat: THREE.LineBasicMaterial;
} {
  const group = new THREE.Group();
  const linePoints: THREE.Vector3[] = [];
  const addedEdges = new Set<string>();

  for (const [id, node] of Object.entries(WALKWAY_GRAPH)) {
    if (node.roomId) continue;

    for (const neighborId of node.neighbors) {
      const neighbor = WALKWAY_GRAPH[neighborId];
      if (!neighbor || neighbor.roomId) continue;

      const edgeKey = [id, neighborId].sort().join("--");
      if (addedEdges.has(edgeKey)) continue;
      addedEdges.add(edgeKey);

      linePoints.push(new THREE.Vector3(node.x, 0.003, node.z));
      linePoints.push(new THREE.Vector3(neighbor.x, 0.003, neighbor.z));
    }
  }

  const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const mat = new THREE.LineBasicMaterial({
    color: 0x4a4875,
    transparent: true,
    opacity: 0.22,
  });

  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);

  return { group, mat };
}
