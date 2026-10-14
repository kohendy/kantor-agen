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
