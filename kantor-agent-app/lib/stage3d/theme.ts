// lib/stage3d/theme.ts
// Single source of truth untuk tema warna 3D Isometrik Terang (Light Theme).
// Seluruh material di OfficeStage3D membaca palet ini. Tidak ada hex warna tersebar di komponen.

import * as THREE from "three";

/**
 * Campur warna hex dengan warna putih untuk menghasilkan warna lantai solid pastel yang lembut (55% - 65% putih).
 * Identitas departemen tetap terbaca kuat, tetapi tampilan terang dan bersih bergaya isometrik klasik.
 */
export function softenColor(hex: string, whiteWeight: number = 0.60): string {
  const c = new THREE.Color(hex);
  const white = new THREE.Color(0xffffff);
  c.lerp(white, whiteWeight);
  return `#${c.getHexString()}`;
}

/**
 * Hitung luminans relatif (ITU-R BT.709) dari warna hex (0.0 = hitam pekat, 1.0 = putih murni).
 */
export function getRelativeLuminance(hex: string | number): number {
  const c = new THREE.Color(hex as unknown as THREE.ColorRepresentation);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export const THEME = {
  // Latar belakang scene siang / default
  background: {
    day: "#eaf0f8",       // Langit terang / krem abu-kebiruan lembut
    morning: "#f4ede0",   // Pagi hangat krem terang
    evening: "#f5e8d8",   // Sore oranye lembut hangat tapi tetap terang
    night: "#121728",     // Malam biru gelap berkarakter (bukan hitam)
  },

  // Dinding
  walls: {
    high: "#f1f5f9",      // Putih hangat / slate-100 bersih
    highRoughness: 0.55,
    highMetalness: 0.05,
    low: "#94a3b8",       // Sedikit lebih gelap dari lantai agar batas ruangan terbaca tegas
    lowRoughness: 0.5,
    lowMetalness: 0.1,
    doorSill: "#b48450",  // Ambang pintu kayu hangat (warm wood / oak)
    doorSillRoughness: 0.45,
    doorSillMetalness: 0.15,
  },

  // Koridor & Jalur Walkway
  corridor: {
    floor: "#dbe5f0",     // Abu-biru terang bersih
    floorRoughness: 0.45,
    floorMetalness: 0.05,
    lineVisual: "#7e92ab",// Garis walkway visual di lantai
    lineOpacity: 0.45,
  },

  // Expansion Bay
  bay: {
    background: "#e2e8f0",// Latar bay abu muda
    hatchColor: "#cbd5e1",// Garis arsir bay
  },

  // Lantai Area Umum (Common Rooms) - Setiap area memiliki warna pastel netral yang berbeda dan jelas
  commonFloors: {
    pantry: "#faebd7",       // Krem aprikot hangat (antique white / soft terracotta)
    lounge: "#ede9fe",       // Ungu lavender pastel santai
    toilet: "#e0f2fe",       // Biru muda pastel higienis
    taman: "#dcfce7",        // Hijau muda segar alami
    taman_kecil: "#dcfce7",  // Hijau muda segar alami
    resepsi: "#fef3c7",      // Krem hangat elegan
    atrium: "#edf2f7",       // Abu-putih netral terang
    atrium_selatan: "#edf2f7",
  },

  // Lantai Departemen: Solid pastel (dicampur 60% putih)
  roomFloor: {
    whiteMixRatio: 0.60,
    opacity: 1.0,
    roughness: 0.40,
    metalness: 0.05,
    edgeOpacity: 0.85,
  },

  // Lantai Spesifik Departemen Tahap 2a (Warm wood Meeting, Karpet Manager, Lab Riset, Semen Ops)
  deptFloors: {
    meeting: "#deb887",     // Lantai kayu hangat (warm oak / burlywood pastel)
    manager: "#d9777f",     // Karpet merah tua pastel hangat
    riset: "#cbd5e1",       // Lantai biru abu-abu bersih
    operasional: "#b0b8c4", // Lantai abu semen industri
  },

  // Library Warna Prop Voxel (Tahap 2a) - Terang, pastel, tegas, kontras dengan lantai
  props: {
    wood: {
      warm: "#8a5a36",
      light: "#d4a373",
      dark: "#4a3324",
      tableTop: "#6b4a2e",
      shelf: "#7d5435",
      reception: "#92400e",
    },
    metal: {
      frame: "#475569",
      dark: "#334155",
      chrome: "#94a3b8",
      industrial: "#3f4d63",
      trolley: "#64748b",
      steel: "#78889b",
    },
    tech: {
      screenFrame: "#1e293b",
      screenOn: "#38bdf8",
      screenDim: "#0284c7",
      whiteboard: "#f8fafc",
      whiteboardFrame: "#64748b",
      serverRack: "#1e293b",
      printerBody: "#e2e8f0",
      printerAccent: "#3b82f6",
      paper: "#ffffff",
      ledGreen: "#22c55e",
      ledAmber: "#f59e0b",
      ledRed: "#ef4444",
      ledBlue: "#38bdf8",
      chartBars: ["#38bdf8", "#34d399", "#f472b6", "#fbbf24"],
    },
    furniture: {
      sofaLeather: "#64748b",
      sofaFabric: "#475569",
      sofaCream: "#f1ede4",
      sofaTeal: "#0d9488",
      coffeeTable: "#a16207",
      beanbagPurple: "#c084fc",
      beanbagMint: "#6ee7b7",
      lampShade: "#fef08a",
      lampPole: "#475569",
      chairSeat: "#475569",
      chairBack: "#334155",
      chairLabSeat: "#38bdf8",
      chairLabBase: "#64748b",
      cushion: "#e2e8f0",
    },
    kitchen: {
      counterTop: "#cbd5e1",
      counterBase: "#475569",
      fridge: "#e2e8f0",
      fridgeHandle: "#94a3b8",
      coffeeMaker: "#1e293b",
      trashBin: "#64748b",
      diningWood: "#b45309",
    },
    sanitary: {
      cubicleWall: "#e2e8f0",
      cubicleDoor: "#cbd5e1",
      sinkPorcelain: "#ffffff",
      mirror: "#93c5fd",
      faucet: "#94a3b8",
      doorHandle: "#64748b",
    },
    nature: {
      leafGreen: "#22c55e",
      leafDark: "#15803d",
      leafLight: "#86efac",
      trunkBrown: "#78350f",
      potClay: "#b45309",
      potWhite: "#f8fafc",
      stonePath: "#94a3b8",
      benchWood: "#854d0e",
      benchIron: "#334155",
    },
    meeting: {
      carpet: "#3b4252",
      tableWood: "#5c3d2e",
      tableEdge: "#3e271a",
      screenBezel: "#0f172a",
      screenGlow: "#38bdf8",
      chairSeat: "#3b4554",
      sofa: "#475569",
    },
    manager: {
      carpet: "#7f1d1d",
      execDesk: "#5c2c16",
      inboxTray: "#475569",
      bookshelf: "#451a03",
      books: ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"],
      tvScreen: "#0284c7",
      guestSofa: "#334155",
    },
    riset: {
      labTableTop: "#e0f2fe",
      labTableFrame: "#0284c7",
      dataBoard: "#0369a1",
      sampleRack: "#0f172a",
      sampleVials: ["#06b6d4", "#10b981", "#ec4899", "#8b5cf6"],
      swivelSeat: "#0284c7",
    },
    operasional: {
      shelving: "#334155",
      crate: "#b45309",
      crateBlue: "#0369a1",
      barrel: "#0284c7",
      blueprint: "#1d4ed8",
      tools: "#f59e0b",
      helmet: "#eab308",
      trolleyFrame: "#475569",
      serverCabinet: "#1e293b",
    },
    reception: {
      curvedFront: "#fef3c7",
      curvedTop: "#92400e",
      welcomeRug: "#b91c1c",
      signKiosk: "#1e293b",
      waitingBench: "#52525b",
    },
  },

  // Perabotan & Furniture (Dinaikkan kecerahannya agar kontras di lantai terang, bukan hitam pekat)
  furniture: {
    desk: "#334155",         // Slate-700 solid (kontras tajam dengan lantai pastel)
    deskRoughness: 0.45,
    deskMetalness: 0.2,
    chair: "#475569",        // Slate-600
    chairRoughness: 0.5,
    chairMetalness: 0.1,
    monitorFrame: "#1e293b", // Slate-800
    monitorScreen: "#93c5fd",// Layar monitor biru terang menyala
    meetingTable: "#4a3c31", // Kayu walnut sedang hangat (bukan hitam)
    meetingTableEdgeOpacity: 0.8,
    meetingChair: "#3b4554", // Charcoal cerah
    managerDesk: "#5c3d2e",  // Mahagoni eksekutif hangat
    hrDesk: "#4a354f",       // Rose-plum elegan
    opsDesk: "#2b394e",      // Tech-navy industrial
    sosmedDesk: "#523f3a",   // Warm coral-slate
    sosDesk: "#523f3a",
    paper: "#ffffff",
  },

  // Karakter Agen 3D
  character: {
    bodyRoughness: 0.45,
    bodyMetalness: 0.15,
    shadowOpacity: 0.25,
  },

  // Label HTML CSS2D (Gaya Terang)
  labels: {
    background: "rgba(255, 255, 255, 0.94)",
    textColor: "#0f172a",    // Teks gelap tegas
    borderWidth: "1.5px",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08)",
  },
} as const;

export type Stage3DTheme = typeof THEME;
