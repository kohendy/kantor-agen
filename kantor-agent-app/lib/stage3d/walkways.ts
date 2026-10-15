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
import { THEME } from "./theme";
import { PROPS_OBSTACLES, WalkObstacle } from "./props/index";

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
  for (const b of FLOORPLAN.bays) {
    if (
      worldX >= b.x - 0.05 &&
      worldX <= b.x + b.w + 0.05 &&
      worldZ >= b.z - 0.05 &&
      worldZ <= b.z + b.d + 0.05
    ) {
      return b.roomId;
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
  inputFp: FloorplanData | string[] = FLOORPLAN,
  homePosMap: Record<string, [number, number]> = HOME_POSITIONS,
  seatPosMap: Record<string, [number, number]> = SEAT_BY_AGENT,
  obstacles: WalkObstacle[] = PROPS_OBSTACLES,
  inputExpandedRooms: string[] = [],
  dynamicDesks: Array<{ id: string; roomId: string; x: number; z: number }> = []
): Record<string, WaypointNode> {
  const fp: FloorplanData = Array.isArray(inputFp) ? FLOORPLAN : inputFp;
  const expandedRooms: string[] = Array.isArray(inputFp) ? inputFp : inputExpandedRooms;
  const nodes: Record<string, WaypointNode> = {};

  function addNode(node: WaypointNode) {
    node.x = +node.x.toFixed(3);
    node.z = +node.z.toFixed(3);

    // Node koridor/aisle tidak boleh berada di dalam obstacle
    if (!node.isDesk && !node.isSeat) {
      for (const obs of obstacles) {
        if (
          node.x > obs.minX + 0.05 &&
          node.x < obs.maxX - 0.05 &&
          node.z > obs.minZ + 0.05 &&
          node.z < obs.maxZ - 0.05
        ) {
          return;
        }
      }
    }

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
    const n1 = nodes[id1];
    const n2 = nodes[id2];

    // Hindari segmen yang memotong obstacle
    for (const obs of obstacles) {
      if (segmentIntersectsBox(n1, n2, obs)) {
        return;
      }
    }

    if (!nodes[id1].neighbors.includes(id2)) nodes[id1].neighbors.push(id2);
    if (!nodes[id2].neighbors.includes(id1)) nodes[id2].neighbors.push(id1);
  }

  // 1. KORIDOR & PERSIMPANGAN OTOMATIS DITURUNKAN DARI DATA (FLOORPLAN.corridors)
  const nodesByCorridor: Record<string, string[]> = {};
  for (const c of fp.corridors) {
    nodesByCorridor[c.id] = [];
    const isHoriz = c.w > c.d;
    const midX = +(c.x + c.w / 2).toFixed(3);
    const midZ = +(c.z + c.d / 2).toFixed(3);
    const midId = `mid_${c.id}`;
    addNode({ id: midId, x: midX, z: midZ, neighbors: [] });
    nodesByCorridor[c.id].push(midId);

    // Node ujung koridor
    if (isHoriz) {
      const wEndId = `end_${c.id}_w`;
      const eEndId = `end_${c.id}_e`;
      addNode({ id: wEndId, x: +(c.x + 1.0).toFixed(3), z: midZ, neighbors: [] });
      addNode({ id: eEndId, x: +(c.x + c.w - 1.0).toFixed(3), z: midZ, neighbors: [] });
      nodesByCorridor[c.id].push(wEndId, eEndId);
    } else {
      const nEndId = `end_${c.id}_n`;
      const sEndId = `end_${c.id}_s`;
      addNode({ id: nEndId, x: midX, z: +(c.z + 1.0).toFixed(3), neighbors: [] });
      addNode({ id: sEndId, x: midX, z: +(c.z + c.d - 1.0).toFixed(3), neighbors: [] });
      nodesByCorridor[c.id].push(nEndId, sEndId);
    }
  }

  // Persimpangan antar-koridor: hitung titik temu centerline pasangan koridor yang berpotongan/bersentuhan
  for (let i = 0; i < fp.corridors.length; i++) {
    for (let j = i + 1; j < fp.corridors.length; j++) {
      const c1 = fp.corridors[i];
      const c2 = fp.corridors[j];

      const overlapMinX = Math.max(c1.x, c2.x);
      const overlapMaxX = Math.min(c1.x + c1.w, c2.x + c2.w);
      const overlapMinZ = Math.max(c1.z, c2.z);
      const overlapMaxZ = Math.min(c1.z + c1.d, c2.z + c2.d);

      const touchesX = overlapMaxX - overlapMinX >= -0.2;
      const touchesZ = overlapMaxZ - overlapMinZ >= -0.2;

      if (touchesX && touchesZ) {
        let ix: number;
        let iz: number;
        const c1Horiz = c1.w > c1.d;
        const c2Horiz = c2.w > c2.d;

        if (c1Horiz && !c2Horiz) {
          ix = +(c2.x + c2.w / 2).toFixed(3);
          iz = +(c1.z + c1.d / 2).toFixed(3);
        } else if (!c1Horiz && c2Horiz) {
          ix = +(c1.x + c1.w / 2).toFixed(3);
          iz = +(c2.z + c2.d / 2).toFixed(3);
        } else {
          ix = +((overlapMinX + overlapMaxX) / 2).toFixed(3);
          iz = +((overlapMinZ + overlapMaxZ) / 2).toFixed(3);
        }

        const isectId = `isect_${c1.id}_${c2.id}`;
        addNode({ id: isectId, x: ix, z: iz, neighbors: [] });
        nodesByCorridor[c1.id].push(isectId);
        nodesByCorridor[c2.id].push(isectId);
      }
    }
  }

  // 2. COMMON AREA WALKWAYS (Atrium & Area Terbuka Lainnya Diturunkan Otomatis)
  const commonRooms = fp.rooms.filter((r) => r.kind === "common" && r.doors.length === 0);
  for (const cr of commonRooms) {
    const cx = +(cr.x + cr.w / 2).toFixed(3);
    const cz = +(cr.z + cr.d / 2).toFixed(3);
    const centerId = `common_${cr.id}_center`;
    addNode({ id: centerId, x: cx, z: cz, roomId: cr.id, neighbors: [] });

    if (cr.w >= 10) {
      const westId = `common_${cr.id}_w`;
      const eastId = `common_${cr.id}_e`;
      addNode({ id: westId, x: +(cr.x + 3.0).toFixed(3), z: cz, roomId: cr.id, neighbors: [] });
      addNode({ id: eastId, x: +(cr.x + cr.w - 3.0).toFixed(3), z: cz, roomId: cr.id, neighbors: [] });
      addEdge(westId, centerId);
      addEdge(centerId, eastId);
    }
  }

  // Hubungkan common area yang bersentuhan
  for (let i = 0; i < commonRooms.length; i++) {
    for (let j = i + 1; j < commonRooms.length; j++) {
      const cr1 = commonRooms[i];
      const cr2 = commonRooms[j];
      const overlapX = Math.min(cr1.x + cr1.w, cr2.x + cr2.w) - Math.max(cr1.x, cr2.x);
      const overlapZ = Math.min(cr1.z + cr1.d, cr2.z + cr2.d) - Math.max(cr1.z, cr2.z);
      if (overlapX > 0.5 && overlapZ >= -0.2) {
        const midX = +((Math.max(cr1.x, cr2.x) + Math.min(cr1.x + cr1.w, cr2.x + cr2.w)) / 2).toFixed(3);
        const bz = +(cr1.z + cr1.d).toFixed(3);
        const bridgeId = `bridge_${cr1.id}_${cr2.id}`;
        addNode({ id: bridgeId, x: midX, z: bz, neighbors: [] });
        addEdge(`common_${cr1.id}_center`, bridgeId);
        addEdge(`common_${cr2.id}_center`, bridgeId);
      }
    }
  }

  // Hubungkan common area ke koridor yang berbatasan
  for (const cr of commonRooms) {
    for (const c of fp.corridors) {
      const overlapX = Math.min(cr.x + cr.w, c.x + c.w) - Math.max(cr.x, c.x);
      const overlapZ = Math.min(cr.z + cr.d, c.z + c.d) - Math.max(cr.z, c.z);
      if (overlapX > 0.5 && (Math.abs(cr.z - (c.z + c.d)) <= 0.25 || Math.abs(cr.z + cr.d - c.z) <= 0.25)) {
        const mx = +((Math.max(cr.x, c.x) + Math.min(cr.x + cr.w, c.x + c.w)) / 2).toFixed(3);
        const cz = +(c.z + c.d / 2).toFixed(3);
        const connId = `conn_${cr.id}_${c.id}`;
        addNode({ id: connId, x: mx, z: cz, neighbors: [] });
        nodesByCorridor[c.id].push(connId);
        addEdge(`common_${cr.id}_center`, connId);
      } else if (overlapZ > 0.5 && (Math.abs(cr.x - (c.x + c.w)) <= 0.25 || Math.abs(cr.x + cr.w - c.x) <= 0.25)) {
        const mz = +((Math.max(cr.z, c.z) + Math.min(cr.z + cr.d, c.z + c.d)) / 2).toFixed(3);
        const cx = +(c.x + c.w / 2).toFixed(3);
        const connId = `conn_${cr.id}_${c.id}`;
        addNode({ id: connId, x: cx, z: mz, neighbors: [] });
        nodesByCorridor[c.id].push(connId);
        addEdge(`common_${cr.id}_center`, connId);
      }
    }
  }

  // 3. PINTU OTOMATIS: Dihubungkan ke koridor, area umum, atau bay yang memuat titik luar pintu
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

    const ox = span.outsideX;
    const oz = span.outsideZ;

    // 3a. Cari koridor yang memuat atau berbatasan dengan titik luar pintu
    let foundCorridor: FloorplanData["corridors"][0] | null = null;
    let minCorrDist = Infinity;
    for (const c of fp.corridors) {
      const inX = ox >= c.x - 0.2 && ox <= c.x + c.w + 0.2;
      const inZ = oz >= c.z - 0.2 && oz <= c.z + c.d + 0.2;
      if (inX && inZ) {
        foundCorridor = c;
        break;
      }
      const dx = Math.max(c.x - ox, 0, ox - (c.x + c.w));
      const dz = Math.max(c.z - oz, 0, oz - (c.z + c.d));
      const dist = Math.hypot(dx, dz);
      if (dist < minCorrDist && dist < 0.8) {
        minCorrDist = dist;
        foundCorridor = c;
      }
    }

    if (foundCorridor) {
      const isHoriz = foundCorridor.w > foundCorridor.d;
      let px: number;
      let pz: number;
      if (isHoriz) {
        px = ox;
        pz = +(foundCorridor.z + foundCorridor.d / 2).toFixed(3);
      } else {
        px = +(foundCorridor.x + foundCorridor.w / 2).toFixed(3);
        pz = oz;
      }
      const projId = `proj_${door.id}`;
      addNode({ id: projId, x: px, z: pz, neighbors: [] });
      addEdge(outId, projId);
      nodesByCorridor[foundCorridor.id].push(projId);
      continue;
    }

    // 3b. Cek apakah berada di dalam atau berbatasan dengan area umum terbuka
    const foundCommon = fp.rooms.find(
      (r) =>
        r.kind === "common" &&
        ox >= r.x - 0.2 &&
        ox <= r.x + r.w + 0.2 &&
        oz >= r.z - 0.2 &&
        oz <= r.z + r.d + 0.2
    );
    if (foundCommon) {
      const centerId = `common_${foundCommon.id}_center`;
      if (nodes[centerId]) {
        addEdge(outId, centerId);
      }
      continue;
    }

    // 3c. Cek apakah berada di dalam bay (mis. bay_riset)
    const foundBay = fp.bays.find(
      (b) =>
        ox >= b.x - 0.2 &&
        ox <= b.x + b.w + 0.2 &&
        oz >= b.z - 0.2 &&
        oz <= b.z + b.d + 0.2
    );
    if (foundBay) {
      const bayNodeId = `bay_${foundBay.id}_node`;
      const bx = +(foundBay.x + foundBay.w / 2).toFixed(3);
      const bz = +(foundBay.z + foundBay.d / 2).toFixed(3);
      addNode({ id: bayNodeId, x: bx, z: bz, neighbors: [] });
      addEdge(outId, bayNodeId);

      // Sambungkan bay ke common room terdekat (mis. atrium_selatan)
      const nearestComm = commonRooms.find(
        (r) =>
          Math.max(r.x - bx, 0, bx - (r.x + r.w)) < 1.5 &&
          Math.max(r.z - bz, 0, bz - (r.z + r.d)) < 1.5
      );
      if (nearestComm && nodes[`common_${nearestComm.id}_center`]) {
        addEdge(bayNodeId, `common_${nearestComm.id}_center`);
      }
      continue;
    }

    // 3d. Pintu keluar utama atau luar denah
    if (ox >= fp.width - 0.5 || ox <= 0.5 || oz >= fp.height - 0.5 || oz <= 0.5 || door.id === "d_main") {
      const extId = `ext_${door.id}`;
      addNode({ id: extId, x: +(ox + 0.5).toFixed(3), z: oz, neighbors: [] });
      addEdge(outId, extId);
    }
  }

  // 4. SAMBUNGKAN SELURUH NODE DI TIAP KORIDOR SECARA BERURUTAN
  for (const c of fp.corridors) {
    const rawIds = Array.from(new Set(nodesByCorridor[c.id] || []));
    const corrNodeList = rawIds.map((id) => nodes[id]).filter(Boolean);
    const isHoriz = c.w > c.d;

    if (isHoriz) {
      corrNodeList.sort((a, b) => a.x - b.x);
    } else {
      corrNodeList.sort((a, b) => a.z - b.z);
    }

    for (let k = 0; k < corrNodeList.length - 1; k++) {
      addEdge(corrNodeList[k].id, corrNodeList[k + 1].id);
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

  // Sambungkan seluruh pintu meeting inside ke aisle meeting terdekat
  const meetingDoors = fp.doors.filter((d) => d.roomId === "meeting");
  for (const md of meetingDoors) {
    const inId = `door_${md.id}_in`;
    const dn = nodes[inId];
    if (!dn) continue;
    let bestAisle = meetingLoop[0];
    let minD = Infinity;
    for (const aId of meetingLoop) {
      const an = nodes[aId];
      const d = Math.hypot(an.x - dn.x, an.z - dn.z);
      if (d < minD) {
        minD = d;
        bestAisle = aId;
      }
    }
    addEdge(inId, bestAisle);
  }

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

  // 5b. INTERIOR RUANG DENGAN OBSTACLE: Data-Driven Aisle & Visibility Graph
  // Menggantikan hardcoded Riset nodes dan agent-specific connections dengan
  // aisle otomatis yang diturunkan dari koordinat obstacle (blocksWalk) + margin.
  const deptRoomsWithObstacles = fp.rooms.filter((r) => r.id !== "meeting" && r.kind === "dept");

  for (const room of deptRoomsWithObstacles) {
    const roomObs = obstacles.filter((obs) => obs.roomId === room.id);
    const roomAisleIds: string[] = [];

    // Jika ruangan memiliki obstacle statis, turunkan titik-titik aisle di sekeliling tiap obstacle
    const margin = 0.65;
    for (const obs of roomObs) {
      const candidates: [number, number][] = [
        [obs.minX - margin, obs.minZ - margin],
        [obs.maxX + margin, obs.minZ - margin],
        [obs.maxX + margin, obs.maxZ + margin],
        [obs.minX - margin, obs.maxZ + margin],
      ];

      // Tambahkan titik tengah sisi untuk obstacle yang lebar/panjang
      const obsW = obs.maxX - obs.minX;
      const obsD = obs.maxZ - obs.minZ;
      if (obsW >= 1.2) {
        const midX = (obs.minX + obs.maxX) / 2;
        candidates.push([midX, obs.minZ - margin], [midX, obs.maxZ + margin]);
      }
      if (obsD >= 1.2) {
        const midZ = (obs.minZ + obs.maxZ) / 2;
        candidates.push([obs.minX - margin, midZ], [obs.maxX + margin, midZ]);
      }

      for (const [rawX, rawZ] of candidates) {
        const cx = +rawX.toFixed(3);
        const cz = +rawZ.toFixed(3);

        // 1. Pastikan titik berada di dalam batas interior ruangan
        if (
          cx < room.x + 0.45 ||
          cx > room.x + room.w - 0.45 ||
          cz < room.z + 0.45 ||
          cz > room.z + room.d - 0.45
        ) {
          continue;
        }

        // 2. Pastikan titik tidak berada di dalam obstacle manapun di ruangan ini
        let insideObs = false;
        for (const o of roomObs) {
          if (
            cx > o.minX + 0.05 &&
            cx < o.maxX - 0.05 &&
            cz > o.minZ + 0.05 &&
            cz < o.maxZ - 0.05
          ) {
            insideObs = true;
            break;
          }
        }
        if (insideObs) continue;

        // 3. Hindari penumpukan titik (deduplikasi / clustering jarak minimum 0.5 tile)
        let tooClose = false;
        for (const aId of roomAisleIds) {
          const an = nodes[aId];
          if (an && Math.hypot(an.x - cx, an.z - cz) < 0.5) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const aisleId = `${room.id}_aisle_${Math.round(cx * 10)}_${Math.round(cz * 10)}`;
        addNode({
          id: aisleId,
          x: cx,
          z: cz,
          roomId: room.id,
          isAisle: true,
          neighbors: [],
        });
        if (!roomAisleIds.includes(aisleId)) {
          roomAisleIds.push(aisleId);
        }
      }
    }

    // Hubungkan antar sesama node aisle di ruangan ini jika memiliki Line-of-Sight (LOS) tanpa menabrak obstacle
    for (let i = 0; i < roomAisleIds.length; i++) {
      for (let j = i + 1; j < roomAisleIds.length; j++) {
        const id1 = roomAisleIds[i];
        const id2 = roomAisleIds[j];
        const n1 = nodes[id1];
        const n2 = nodes[id2];
        if (!n1 || !n2) continue;
        const d = Math.hypot(n1.x - n2.x, n1.z - n2.z);
        if (d <= 5.5) {
          addEdge(id1, id2);
        }
      }
    }

    // Hubungkan seluruh pintu inside ruangan ke node aisle atau pintu lain yang terlihat (LOS)
    const roomDoors = fp.doors.filter((d) => d.roomId === room.id);
    for (const d of roomDoors) {
      const doorInId = `door_${d.id}_in`;
      const dn = nodes[doorInId];
      if (!dn) continue;

      let connectedCount = 0;
      for (const aId of roomAisleIds) {
        const an = nodes[aId];
        if (!an) continue;
        const dist = Math.hypot(dn.x - an.x, dn.z - an.z);
        if (dist <= 6.0) {
          const beforeLen = nodes[doorInId].neighbors.length;
          addEdge(doorInId, aId);
          if (nodes[doorInId].neighbors.length > beforeLen) {
            connectedCount++;
          }
        }
      }

      // Jika belum terhubung ke aisle manapun, sambungkan ke aisle terdekat
      if (connectedCount === 0 && roomAisleIds.length > 0) {
        let bestAisle = roomAisleIds[0];
        let minD = Infinity;
        for (const aId of roomAisleIds) {
          const an = nodes[aId];
          if (!an) continue;
          const dist = Math.hypot(dn.x - an.x, dn.z - an.z);
          if (dist < minD) {
            minD = dist;
            bestAisle = aId;
          }
        }
        addEdge(doorInId, bestAisle);
      }
    }
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

    // Hubungkan meja ke aisle terdekat atau pintu jika ada LOS
    const roomAisles = Object.values(nodes).filter(
      (n) => n.roomId === rId && n.isAisle
    );
    let connectedToAisle = 0;
    for (const an of roomAisles) {
      const d = Math.hypot(hx - an.x, hz - an.z);
      if (d <= 5.5) {
        const before = nodes[deskNodeId].neighbors.length;
        addEdge(deskNodeId, an.id);
        if (nodes[deskNodeId].neighbors.length > before) {
          connectedToAisle++;
        }
      }
    }

    if (connectedToAisle === 0 && roomAisles.length > 0) {
      let bestAisle = roomAisles[0].id;
      let minD = Infinity;
      for (const an of roomAisles) {
        const d = Math.hypot(hx - an.x, hz - an.z);
        if (d < minD) {
          minD = d;
          bestAisle = an.id;
        }
      }
      addEdge(deskNodeId, bestAisle);
    }

    // Sambungkan ke seluruh pintu masuk inside yang dapat dijangkau tanpa tabrakan
    const roomDoors = fp.doors.filter((d) => d.roomId === rId);
    for (const d of roomDoors) {
      addEdge(deskNodeId, `door_${d.id}_in`);
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

  // 7. PORTAL KEDATANGAN AGENT DI RUANG HR
  addNode({
    id: "portal_hr",
    x: 1.0,
    z: 22.5,
    roomId: "hr",
    isAisle: true,
    neighbors: [],
  });
  if (nodes["desk_HERA"]) {
    addEdge("portal_hr", "desk_HERA");
  }
  const hrDoors = fp.doors.filter((d) => d.roomId === "hr");
  for (const hd of hrDoors) {
    addEdge("portal_hr", `door_${hd.id}_in`);
  }

  // 8. EKSPANSI BAY PADA RUANGAN AKTIF (Data-driven: opening & interior bay)
  for (const expRoomId of expandedRooms) {
    const normRoomId = expRoomId === "ads" ? "advertiser" : expRoomId === "lp" ? "landing_page" : expRoomId;
    const bay = fp.bays.find((b) => b.roomId === normRoomId);
    const roomDef = fp.rooms.find((r) => r.id === normRoomId);
    if (bay && roomDef) {
      let baseOpenX = 0;
      let baseOpenZ = 0;
      const bayNodeX = +(bay.x + bay.w / 2).toFixed(3);
      const bayNodeZ = +(bay.z + bay.d / 2).toFixed(3);

      if (bay.side === "S") {
        baseOpenX = +(bay.x + bay.w / 2).toFixed(3);
        baseOpenZ = +(roomDef.z + roomDef.d).toFixed(3);
      } else if (bay.side === "N") {
        baseOpenX = +(bay.x + bay.w / 2).toFixed(3);
        baseOpenZ = +(roomDef.z).toFixed(3);
      } else if (bay.side === "W") {
        baseOpenX = +(roomDef.x).toFixed(3);
        baseOpenZ = +(bay.z + bay.d / 2).toFixed(3);
      } else if (bay.side === "E") {
        baseOpenX = +(roomDef.x + roomDef.w).toFixed(3);
        baseOpenZ = +(bay.z + bay.d / 2).toFixed(3);
      }

      // Evaluasi kandidat posisi opening sepanjang sekat bay agar tidak terhalang obstacle interior
      const candidates: { x: number; z: number }[] = [{ x: baseOpenX, z: baseOpenZ }];
      if (bay.side === "S" || bay.side === "N") {
        for (let offset = 0.5; offset < bay.w / 2; offset += 0.5) {
          candidates.push({ x: +(baseOpenX + offset).toFixed(3), z: baseOpenZ });
          candidates.push({ x: +(baseOpenX - offset).toFixed(3), z: baseOpenZ });
        }
      } else {
        for (let offset = 0.5; offset < bay.d / 2; offset += 0.5) {
          candidates.push({ x: baseOpenX, z: +(baseOpenZ + offset).toFixed(3) });
          candidates.push({ x: baseOpenX, z: +(baseOpenZ - offset).toFixed(3) });
        }
      }

      let openX = baseOpenX;
      let openZ = baseOpenZ;
      const interiorNodes = Object.values(nodes).filter(
        (n) => n.roomId === normRoomId && !n.id.startsWith("opening_") && !n.id.startsWith("bay_interior_")
      );

      // Pilih kandidat dengan koneksi aisle terbanyak yang tidak memotong obstacle
      let maxConns = 0;
      for (const cand of candidates) {
        let validConns = 0;
        for (const inNode of interiorNodes) {
          const dist = Math.hypot(cand.x - inNode.x, cand.z - inNode.z);
          if (dist <= 6.0) {
            let blocked = false;
            for (const obs of obstacles) {
              if (segmentIntersectsBox(cand, inNode, obs)) {
                blocked = true;
                break;
              }
            }
            if (!blocked) validConns++;
          }
        }
        if (validConns > maxConns) {
          maxConns = validConns;
          openX = cand.x;
          openZ = cand.z;
        }
      }

      const openId = `opening_${bay.id}`;
      const bayId = `bay_interior_${bay.id}`;

      addNode({ id: openId, x: openX, z: openZ, roomId: normRoomId, isAisle: true, neighbors: [] });
      addNode({ id: bayId, x: bayNodeX, z: bayNodeZ, roomId: normRoomId, isAisle: true, neighbors: [] });
      addEdge(openId, bayId);

      // Hubungkan opening ke aisle atau meja terdekat di dalam ruangan
      for (const inNode of interiorNodes) {
        const dist = Math.hypot(openX - inNode.x, openZ - inNode.z);
        if (dist <= 6.0) {
          addEdge(openId, inNode.id);
        }
      }
    }
  }

  // 9. MEJA DINAMIS INSTANCE
  for (const desk of dynamicDesks) {
    const deskNodeId = `desk_${desk.id}`;
    addNode({
      id: deskNodeId,
      x: desk.x,
      z: desk.z,
      roomId: desk.roomId,
      isDesk: true,
      neighbors: [],
    });

    const roomNodes = Object.values(nodes).filter(
      (n) => n.roomId === desk.roomId && n.id !== deskNodeId
    );
    let connected = 0;
    for (const rn of roomNodes) {
      const dist = Math.hypot(desk.x - rn.x, desk.z - rn.z);
      if (dist <= 6.0) {
        addEdge(deskNodeId, rn.id);
        connected++;
      }
    }
    if (connected === 0 && roomNodes.length > 0) {
      let nearest = roomNodes[0];
      let minDist = Infinity;
      for (const rn of roomNodes) {
        const d = Math.hypot(desk.x - rn.x, desk.z - rn.z);
        if (d < minDist) {
          minDist = d;
          nearest = rn;
        }
      }
      addEdge(deskNodeId, nearest.id);
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
  allowedRoomId?: string,
  graph: Record<string, WaypointNode> = WALKWAY_GRAPH
): string {
  let nearestId = "HN_w_end";
  let minDist = Infinity;
  for (const [id, node] of Object.entries(graph)) {
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
  allowedRoomIds: string[] = [],
  graph: Record<string, WaypointNode> = WALKWAY_GRAPH
): string {
  const candidates = Object.entries(graph)
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
  allowedRoomIds: string[] = [],
  graph: Record<string, WaypointNode> = WALKWAY_GRAPH
): WaypointNode[] {
  if (startNodeId === endNodeId) {
    return [graph[startNodeId]].filter(Boolean);
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const [id, node] of Object.entries(graph)) {
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
    const currNode = graph[closestId];
    if (!currNode) continue;

    for (const neighborId of currNode.neighbors) {
      if (!unvisited.has(neighborId)) continue;
      const neighborNode = graph[neighborId];
      if (!neighborNode) continue;

      const alt = dist[closestId] + nodeDistance(currNode, neighborNode);
      if (alt < dist[neighborId]) {
        dist[neighborId] = alt;
        prev[neighborId] = closestId;
      }
    }
  }

  // Rekonstruksi jalur
  if (dist[endNodeId] === Infinity) {
    return [];
  }
  const path: WaypointNode[] = [];
  let curr: string | null = endNodeId;
  while (curr) {
    const node = graph[curr];
    if (node) path.unshift(node);
    curr = prev[curr] ?? null;
  }

  return path;
}

// Resolusi target identitas ke node ID di graf
function resolveTargetNodeId(
  target: string,
  graph: Record<string, WaypointNode> = WALKWAY_GRAPH
): { nodeId: string; roomId?: string } {
  // Alias landing page & advertiser
  const t = target === "lp" ? "landing_page" : target === "ads" ? "advertiser" : target;

  if (graph[`desk_${t}`]) {
    return { nodeId: `desk_${t}`, roomId: roomOfAgent(t)?.id };
  }
  if (graph[`seat_${t}`]) {
    return { nodeId: `seat_${t}`, roomId: "meeting" };
  }
  if (graph[t]) {
    return { nodeId: t, roomId: graph[t].roomId };
  }

  // Jika berupa ID ruangan
  const room = FLOORPLAN.rooms.find((r) => r.id === t);
  if (room) {
    // Cari meja kepala departemen atau pintu masuk inside
    const roomCfg = ROOMS.find((rc) => rc.id === room.id);
    const firstAgent = room.id === "manager" ? MANAGER_AGENT_NAME : roomCfg?.agents[0];
    if (firstAgent && graph[`desk_${firstAgent}`]) {
      return { nodeId: `desk_${firstAgent}`, roomId: room.id };
    }
    const door = room.doors[0];
    if (door && graph[`door_${door.id}_in`]) {
      return { nodeId: `door_${door.id}_in`, roomId: room.id };
    }
  }

  return { nodeId: findNearestNode(10, 10, undefined, graph) };
}

// API publik utama findPath
export function findPath(
  from: string | { x: number; z: number },
  to: string | { x: number; z: number },
  customAllowedRoomIds?: string[],
  customGraph?: Record<string, WaypointNode>
): THREE.Vector3[] {
  const graph = customGraph ?? WALKWAY_GRAPH;
  let startId: string;
  let endId: string;
  let fromRoom: string | undefined;
  let toRoom: string | undefined;

  if (typeof from === "string") {
    const res = resolveTargetNodeId(from, graph);
    startId = res.nodeId;
    fromRoom = res.roomId;
  } else {
    fromRoom = getRoomAtPosition(from.x, from.z) ?? undefined;
    startId = findNearestNode(from.x, from.z, fromRoom, graph);
  }

  if (typeof to === "string") {
    const res = resolveTargetNodeId(to, graph);
    endId = res.nodeId;
    toRoom = res.roomId;
  } else {
    toRoom = getRoomAtPosition(to.x, to.z) ?? undefined;
    endId = findNearestNode(to.x, to.z, toRoom, graph);
  }

  const allowed =
    customAllowedRoomIds ??
    ([fromRoom, toRoom].filter(Boolean) as string[]);

  const nodes = findPathNodes(startId, endId, allowed, graph);
  return nodes.map((n) => new THREE.Vector3(n.x, 0, n.z));
}

export function findPathWithGraph(
  from: string | { x: number; z: number },
  to: string | { x: number; z: number },
  graph: Record<string, WaypointNode>,
  customAllowedRoomIds?: string[]
): THREE.Vector3[] {
  return findPath(from, to, customAllowedRoomIds, graph);
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
    color: new THREE.Color(THEME.corridor.lineVisual),
    transparent: true,
    opacity: THEME.corridor.lineOpacity,
  });

  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);

  return { group, mat };
}
