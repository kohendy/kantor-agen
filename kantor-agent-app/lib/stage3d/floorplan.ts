// lib/stage3d/floorplan.ts
// Single source of truth untuk denah isometrik 44x36 tile.
// Satuan: tile (1 tile = 1 unit dunia Three.js). Sumbu X ke timur, Z ke selatan.

export type RoomKind = 'dept' | 'common';
export type WallSide = 'N' | 'S' | 'E' | 'W';

export interface DoorDef {
  id: string;
  roomId: string;
  side: WallSide;
  offset: number; // offset dari sisi dinding ruangan (x untuk N/S, z untuk E/W)
  width: number;
}

export interface BayDef {
  id: string;
  roomId: string;
  side: WallSide;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface RoomDef {
  id: string;
  label: string;
  kind: RoomKind;
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  doors: DoorDef[];
  bays: BayDef[];
  meeting?: boolean;
}

export interface CorridorDef {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface FloorplanData {
  width: number; // 44
  height: number; // 36
  rooms: RoomDef[];
  corridors: CorridorDef[];
  bays: BayDef[];
  doors: DoorDef[];
}

export const FLOORPLAN_WIDTH = 44;
export const FLOORPLAN_HEIGHT = 36;

// Ruangan departemen (10)
const DEPT_ROOMS: RoomDef[] = [
  {
    id: 'meeting',
    label: 'Meeting H+1',
    kind: 'dept',
    x: 0,
    z: 0,
    w: 15,
    d: 9,
    color: '#b7f34a',
    meeting: true,
    doors: [
      { id: 'd_meeting_s', roomId: 'meeting', side: 'S', offset: 6, width: 2 }, // z=9, x: 6-8
      { id: 'd_meeting_e', roomId: 'meeting', side: 'E', offset: 3, width: 2 }, // x=15, z: 3-5
    ],
    bays: [],
  },
  {
    id: 'operasional',
    label: 'Operasional',
    kind: 'dept',
    x: 17,
    z: 0,
    w: 9,
    d: 9,
    color: '#94a3b8',
    doors: [
      { id: 'd_ops_w', roomId: 'operasional', side: 'W', offset: 3, width: 2 }, // x=17, z: 3-5
      { id: 'd_ops_s', roomId: 'operasional', side: 'S', offset: 3, width: 2 }, // z=9, x: 20-22 (17+3=20)
    ],
    bays: [
      { id: 'bay_operasional', roomId: 'operasional', side: 'N', x: 17, z: -2, w: 9, d: 2 },
    ],
  },
  {
    id: 'advertiser',
    label: 'Advertiser',
    kind: 'dept',
    x: 28,
    z: 0,
    w: 13,
    d: 9,
    color: '#29c7ff',
    doors: [
      { id: 'd_adv_w', roomId: 'advertiser', side: 'W', offset: 3, width: 2 }, // x=28, z: 3-5
      { id: 'd_adv_s', roomId: 'advertiser', side: 'S', offset: 5, width: 2 }, // z=9, x: 33-35 (28+5=33)
    ],
    bays: [
      { id: 'bay_advertiser', roomId: 'advertiser', side: 'E', x: 41, z: 0, w: 3, d: 9 },
    ],
  },
  {
    id: 'manager',
    label: 'Manager',
    kind: 'dept',
    x: 0,
    z: 11,
    w: 9,
    d: 9,
    color: '#f07167',
    doors: [
      { id: 'd_manager_e', roomId: 'manager', side: 'E', offset: 3, width: 2 }, // x=9, z: 14-16 (11+3=14)
    ],
    bays: [
      { id: 'bay_manager', roomId: 'manager', side: 'W', x: -3, z: 11, w: 3, d: 9 },
    ],
  },
  {
    id: 'riset',
    label: 'Riset',
    kind: 'dept',
    x: 11,
    z: 11,
    w: 10,
    d: 8,
    color: '#f5a623',
    doors: [
      { id: 'd_riset_w', roomId: 'riset', side: 'W', offset: 2, width: 2 }, // x=11, z: 13-15 (11+2=13)
      { id: 'd_riset_e', roomId: 'riset', side: 'E', offset: 2, width: 2 }, // x=21, z: 13-15 (11+2=13)
      { id: 'd_riset_s', roomId: 'riset', side: 'S', offset: 4, width: 2 }, // z=19, x: 15-17 (11+4=15)
    ],
    bays: [
      { id: 'bay_riset', roomId: 'riset', side: 'S', x: 11, z: 19, w: 10, d: 2 },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    kind: 'dept',
    x: 0,
    z: 21,
    w: 9,
    d: 4,
    color: '#e879f9',
    doors: [
      { id: 'd_hr_e', roomId: 'hr', side: 'E', offset: 1, width: 2 }, // x=9, z: 22-24 (21+1=22)
    ],
    bays: [
      { id: 'bay_hr', roomId: 'hr', side: 'W', x: -3, z: 21, w: 3, d: 4 },
    ],
  },
  {
    id: 'sosmed',
    label: 'Sosial Media',
    kind: 'dept',
    x: 0,
    z: 27,
    w: 10,
    d: 7,
    color: '#fb923c',
    doors: [
      { id: 'd_sosmed_n', roomId: 'sosmed', side: 'N', offset: 4, width: 2 }, // z=27, x: 4-6 (0+4=4)
    ],
    bays: [
      { id: 'bay_sosmed', roomId: 'sosmed', side: 'S', x: 0, z: 34, w: 10, d: 2 },
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    kind: 'dept',
    x: 11,
    z: 27,
    w: 10,
    d: 7,
    color: '#a78bfa',
    doors: [
      { id: 'd_creative_n', roomId: 'creative', side: 'N', offset: 4, width: 2 }, // z=27, x: 15-17 (11+4=15)
    ],
    bays: [
      { id: 'bay_creative', roomId: 'creative', side: 'S', x: 11, z: 34, w: 10, d: 2 },
    ],
  },
  {
    id: 'copy',
    label: 'Copy',
    kind: 'dept',
    x: 22,
    z: 27,
    w: 10,
    d: 7,
    color: '#ff4fa3',
    doors: [
      { id: 'd_copy_n', roomId: 'copy', side: 'N', offset: 4, width: 2 }, // z=27, x: 26-28 (22+4=26)
    ],
    bays: [
      { id: 'bay_copy', roomId: 'copy', side: 'S', x: 22, z: 34, w: 10, d: 2 },
    ],
  },
  {
    id: 'landing_page',
    label: 'Landing Page',
    kind: 'dept',
    x: 33,
    z: 27,
    w: 7,
    d: 7,
    color: '#2ee6a8',
    doors: [
      { id: 'd_lp_n', roomId: 'landing_page', side: 'N', offset: 3, width: 2 }, // z=27, x: 36-38 (33+3=36)
    ],
    bays: [
      { id: 'bay_landing_page', roomId: 'landing_page', side: 'S', x: 33, z: 34, w: 7, d: 2 },
    ],
  },
];

// Area umum (8)
const COMMON_ROOMS: RoomDef[] = [
  {
    id: 'atrium',
    label: 'Atrium',
    kind: 'common',
    x: 21,
    z: 11,
    w: 7,
    d: 10,
    color: '#232738',
    doors: [],
    bays: [],
  },
  {
    id: 'atrium_selatan',
    label: 'Atrium Selatan',
    kind: 'common',
    x: 11,
    z: 21,
    w: 17,
    d: 4,
    color: '#232738',
    doors: [],
    bays: [],
  },
  {
    id: 'pantry',
    label: 'Pantry',
    kind: 'common',
    x: 30,
    z: 11,
    w: 8,
    d: 7,
    color: '#26293d',
    doors: [
      { id: 'd_pantry_w', roomId: 'pantry', side: 'W', offset: 2, width: 2 }, // x=30, z: 13-15 (11+2=13)
    ],
    bays: [],
  },
  {
    id: 'lounge',
    label: 'Lounge',
    kind: 'common',
    x: 30,
    z: 19,
    w: 8,
    d: 6,
    color: '#26293d',
    doors: [
      { id: 'd_lounge_w', roomId: 'lounge', side: 'W', offset: 2, width: 2 }, // x=30, z: 21-23 (19+2=21)
    ],
    bays: [],
  },
  {
    id: 'toilet',
    label: 'Toilet',
    kind: 'common',
    x: 39,
    z: 11,
    w: 5,
    d: 6,
    color: '#2a2d42',
    doors: [
      { id: 'd_toilet_w', roomId: 'toilet', side: 'W', offset: 2, width: 2 }, // x=39, z: 13-15 (11+2=13)
    ],
    bays: [],
  },
  {
    id: 'taman',
    label: 'Taman',
    kind: 'common',
    x: 39,
    z: 18,
    w: 5,
    d: 7,
    color: '#1a3328',
    doors: [
      { id: 'd_taman_w', roomId: 'taman', side: 'W', offset: 2, width: 2 }, // x=39, z: 20-22 (18+2=20)
    ],
    bays: [],
  },
  {
    id: 'resepsi',
    label: 'Resepsi',
    kind: 'common',
    x: 40,
    z: 27,
    w: 4,
    d: 7,
    color: '#2d2842',
    doors: [
      { id: 'd_resepsi_n', roomId: 'resepsi', side: 'N', offset: 1, width: 2 }, // z=27, x: 41-43 (40+1=41)
      { id: 'd_main', roomId: 'resepsi', side: 'E', offset: 2, width: 2 }, // x=44, z: 29-31 (27+2=29) Pintu utama
    ],
    bays: [],
  },
  {
    id: 'taman_kecil',
    label: 'Taman kecil',
    kind: 'common',
    x: 40,
    z: 34,
    w: 4,
    d: 2,
    color: '#1a3328',
    doors: [],
    bays: [],
  },
];

// Koridor (7)
const CORRIDORS: CorridorDef[] = [
  { id: 'H_N', x: 0, z: 9, w: 44, d: 2 },
  { id: 'H_S', x: 0, z: 25, w: 44, d: 2 },
  { id: 'V_W', x: 9, z: 9, w: 2, d: 18 },
  { id: 'V_E', x: 28, z: 9, w: 2, d: 18 },
  { id: 'lorong_1', x: 15, z: 0, w: 2, d: 9 },
  { id: 'lorong_2', x: 26, z: 0, w: 2, d: 9 },
  { id: 'E_lane', x: 38, z: 11, w: 1, d: 14 },
];

export const ALL_ROOMS = [...DEPT_ROOMS, ...COMMON_ROOMS];
export const ALL_DOORS = ALL_ROOMS.flatMap((r) => r.doors);
export const ALL_BAYS = ALL_ROOMS.flatMap((r) => r.bays);

export const FLOORPLAN: FloorplanData = {
  width: FLOORPLAN_WIDTH,
  height: FLOORPLAN_HEIGHT,
  rooms: ALL_ROOMS,
  corridors: CORRIDORS,
  bays: ALL_BAYS,
  doors: ALL_DOORS,
};

// Helper koordinat celah pintu
export function getDoorSpan(door: DoorDef, room: RoomDef) {
  let x1: number, x2: number, z1: number, z2: number;
  let cx: number, cz: number;
  let outsideX: number, outsideZ: number;
  let insideX: number, insideZ: number;

  if (door.side === 'N') {
    x1 = room.x + door.offset;
    x2 = x1 + door.width;
    z1 = room.z;
    z2 = room.z;
    cx = (x1 + x2) / 2;
    cz = room.z;
    outsideX = cx;
    outsideZ = room.z - 0.5;
    insideX = cx;
    insideZ = room.z + 0.5;
  } else if (door.side === 'S') {
    x1 = room.x + door.offset;
    x2 = x1 + door.width;
    z1 = room.z + room.d;
    z2 = room.z + room.d;
    cx = (x1 + x2) / 2;
    cz = room.z + room.d;
    outsideX = cx;
    outsideZ = room.z + room.d + 0.5;
    insideX = cx;
    insideZ = room.z + room.d - 0.5;
  } else if (door.side === 'W') {
    x1 = room.x;
    x2 = room.x;
    z1 = room.z + door.offset;
    z2 = z1 + door.width;
    cx = room.x;
    cz = (z1 + z2) / 2;
    outsideX = room.x - 0.5;
    outsideZ = cz;
    insideX = room.x + 0.5;
    insideZ = cz;
  } else {
    // 'E'
    x1 = room.x + room.w;
    x2 = room.x + room.w;
    z1 = room.z + door.offset;
    z2 = z1 + door.width;
    cx = room.x + room.w;
    cz = (z1 + z2) / 2;
    outsideX = room.x + room.w + 0.5;
    outsideZ = cz;
    insideX = room.x + room.w - 0.5;
    insideZ = cz;
  }

  return { x1, x2, z1, z2, cx, cz, outsideX, outsideZ, insideX, insideZ };
}

// Validasi floorplan ketat saat startup
export function validateFloorplan(fp: FloorplanData): void {
  const rooms = fp.rooms;

  // 1. Tidak ada dua ruangan yang tumpang tindih
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];
      const overlapX = r1.x < r2.x + r2.w && r1.x + r1.w > r2.x;
      const overlapZ = r1.z < r2.z + r2.d && r1.z + r1.d > r2.z;
      if (overlapX && overlapZ) {
        throw new Error(
          `[Floorplan Error] Tumpang tindih antara ruangan "${r1.id}" (${r1.x},${r1.z},${r1.w},${r1.d}) dan "${r2.id}" (${r2.x},${r2.z},${r2.w},${r2.d})`
        );
      }
    }
  }

  // 2. Setiap pintu menempel ke dinding ruangannya dan terhubung ke koridor, area umum, bay, atau luar
  for (const door of fp.doors) {
    const room = rooms.find((r) => r.id === door.roomId);
    if (!room) {
      throw new Error(`[Floorplan Error] Pintu "${door.id}" merujuk ke ruangan yang tidak ada "${door.roomId}"`);
    }

    if (door.side === 'N' || door.side === 'S') {
      if (door.offset < 0 || door.offset + door.width > room.w) {
        throw new Error(
          `[Floorplan Error] Pintu "${door.id}" melampaui lebar dinding ${door.side} ruangan "${room.id}" (offset: ${door.offset}, width: ${door.width}, room.w: ${room.w})`
        );
      }
    } else {
      if (door.offset < 0 || door.offset + door.width > room.d) {
        throw new Error(
          `[Floorplan Error] Pintu "${door.id}" melampaui kedalaman dinding ${door.side} ruangan "${room.id}" (offset: ${door.offset}, width: ${door.width}, room.d: ${room.d})`
        );
      }
    }

    const { outsideX, outsideZ } = getDoorSpan(door, room);
    const inCorridor = fp.corridors.some(
      (c) => outsideX >= c.x && outsideX <= c.x + c.w && outsideZ >= c.z && outsideZ <= c.z + c.d
    );
    const inCommon = rooms
      .filter((r) => r.kind === 'common')
      .some((c) => outsideX >= c.x && outsideX <= c.x + c.w && outsideZ >= c.z && outsideZ <= c.z + c.d);
    const inBay = fp.bays.some(
      (b) => outsideX >= b.x && outsideX <= b.x + b.w && outsideZ >= b.z && outsideZ <= b.z + b.d
    );
    const isMainExt = door.id === 'd_main' || outsideX >= fp.width || outsideX <= 0 || outsideZ >= fp.height || outsideZ <= 0;

    if (!inCorridor && !inCommon && !inBay && !isMainExt) {
      throw new Error(
        `[Floorplan Error] Pintu "${door.id}" pada ruangan "${room.id}" tidak terhubung ke koridor, area umum, bay, atau luar di (${outsideX}, ${outsideZ})`
      );
    }
  }

  // 3. Setiap bay menempel ke ruangannya dan tidak menimpa ruangan lain
  for (const bay of fp.bays) {
    const room = rooms.find((r) => r.id === bay.roomId);
    if (!room) {
      throw new Error(`[Floorplan Error] Bay "${bay.id}" merujuk ke ruangan yang tidak ada "${bay.roomId}"`);
    }

    let attached = false;
    if (bay.side === 'N') {
      attached = bay.z + bay.d === room.z && bay.x < room.x + room.w && bay.x + bay.w > room.x;
    } else if (bay.side === 'S') {
      attached = bay.z === room.z + room.d && bay.x < room.x + room.w && bay.x + bay.w > room.x;
    } else if (bay.side === 'W') {
      attached = bay.x + bay.w === room.x && bay.z < room.z + room.d && bay.z + bay.d > room.z;
    } else if (bay.side === 'E') {
      attached = bay.x === room.x + room.w && bay.z < room.z + room.d && bay.z + bay.d > room.z;
    }

    if (!attached) {
      throw new Error(
        `[Floorplan Error] Bay "${bay.id}" tidak menempel pada dinding sisi ${bay.side} ruangan "${room.id}"`
      );
    }

    for (const otherRoom of rooms) {
      const overlapX = bay.x < otherRoom.x + otherRoom.w && bay.x + bay.w > otherRoom.x;
      const overlapZ = bay.z < otherRoom.z + otherRoom.d && bay.z + bay.d > otherRoom.z;
      if (overlapX && overlapZ) {
        throw new Error(
          `[Floorplan Error] Bay "${bay.id}" menimpa ruangan "${otherRoom.id}" (${otherRoom.x},${otherRoom.z},${otherRoom.w},${otherRoom.d})`
        );
      }
    }
  }
}

// Titik muncul agen baru di ruang HR (dinding barat, dekat bay_hr)
export const HR_PORTAL_POS = [1.0, 22.5] as const;

// Jalankan validasi saat module load
validateFloorplan(FLOORPLAN);
