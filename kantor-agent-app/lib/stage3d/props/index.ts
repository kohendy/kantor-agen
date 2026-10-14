// lib/stage3d/props/index.ts
// Registry Prop Voxel & Tata Letak Interior Tahap 2a (4 Departemen + Area Umum).
// Setiap prop = fungsi(opsi) -> { geometry/mesh, footprint {w,d}, tinggi, blocksWalk: boolean }.
// Seluruh warna membaca THEME.props.

import * as THREE from "three";
import { THEME } from "../theme";
import { VoxelBoxDef, buildVoxelGeometry } from "./voxel";
import { FloorplanData } from "../floorplan";
import { HOME_POSITIONS, SEAT_BY_AGENT } from "@/lib/officeConfig";

export interface PropDefinition {
  id: string;
  name: string;
  footprint: { w: number; d: number };
  height: number;
  blocksWalk: boolean;
  createGeometry: (options?: Record<string, unknown>) => THREE.BufferGeometry;
  createEmissiveGeometry?: (options?: Record<string, unknown>) => THREE.BufferGeometry;
}

export interface PlacedPropInstance {
  id: string;
  propId: string;
  roomId: string;
  x: number;
  y: number;
  z: number;
  footprint: { w: number; d: number };
  height: number;
  blocksWalk: boolean;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  options?: Record<string, unknown>;
  rotY?: number;
}

// =============================================================================
// 1. REGISTRY GENERATOR GEOMETRI PROP VOXEL
// =============================================================================

export const PROPS_REGISTRY: Record<string, PropDefinition> = {
  // ---------------------------------------------------------------------------
  // MEETING PROPS
  // ---------------------------------------------------------------------------
  meeting_table: {
    id: "meeting_table",
    name: "Meja Konferensi Panjang",
    footprint: { w: 7.6, d: 1.8 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja kayu walnut utama
        { x: 0, y: 0.38, z: 0, w: 7.6, h: 0.06, d: 1.8, color: THEME.props.meeting.tableWood },
        // Pinggiran lis kayu gelap
        { x: 0, y: 0.36, z: 0, w: 7.64, h: 0.03, d: 1.84, color: THEME.props.meeting.tableEdge },
        // Modul konektor kabel di tengah meja
        { x: -1.8, y: 0.44, z: 0, w: 0.6, h: 0.015, d: 0.25, color: THEME.props.metal.dark },
        { x: 0, y: 0.44, z: 0, w: 0.6, h: 0.015, d: 0.25, color: THEME.props.metal.dark },
        { x: 1.8, y: 0.44, z: 0, w: 0.6, h: 0.015, d: 0.25, color: THEME.props.metal.dark },
        // 6 Kaki balok penyangga meja
        { x: -3.4, y: 0, z: -0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        { x: -3.4, y: 0, z: 0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        { x: 0, y: 0, z: -0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        { x: 0, y: 0, z: 0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        { x: 3.4, y: 0, z: -0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        { x: 3.4, y: 0, z: 0.65, w: 0.22, h: 0.38, d: 0.22, color: THEME.props.metal.industrial },
        // Penyangga silang tengah
        { x: 0, y: 0.12, z: 0, w: 6.8, h: 0.06, d: 0.1, color: THEME.props.metal.frame },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  meeting_carpet: {
    id: "meeting_carpet",
    name: "Karpet Meja Rapat",
    footprint: { w: 10.8, d: 4.0 },
    height: 0.02,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.001, z: 0, w: 10.8, h: 0.015, d: 4.0, color: THEME.props.meeting.carpet },
        // Lis pinggiran karpet
        { x: 0, y: 0.002, z: -1.95, w: 10.8, h: 0.015, d: 0.1, color: THEME.props.metal.frame },
        { x: 0, y: 0.002, z: 1.95, w: 10.8, h: 0.015, d: 0.1, color: THEME.props.metal.frame },
        { x: -5.35, y: 0.002, z: 0, w: 0.1, h: 0.015, d: 4.0, color: THEME.props.metal.frame },
        { x: 5.35, y: 0.002, z: 0, w: 0.1, h: 0.015, d: 4.0, color: THEME.props.metal.frame },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  meeting_screen: {
    id: "meeting_screen",
    name: "Layar Presentasi Dinding Utara",
    footprint: { w: 5.0, d: 0.2 },
    height: 1.3,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bezel hitam tebal
        { x: 0, y: 0.6, z: 0, w: 5.0, h: 1.3, d: 0.12, color: THEME.props.meeting.screenBezel },
        // Penyangga dinding
        { x: 0, y: 0.8, z: -0.08, w: 1.2, h: 0.6, d: 0.08, color: THEME.props.metal.dark },
        // Bar grafik statis voxel di dalam layar
        { x: -1.6, y: 0.7, z: 0.065, w: 0.35, h: 0.6, d: 0.02, color: THEME.props.tech.chartBars[0] },
        { x: -1.0, y: 0.6, z: 0.065, w: 0.35, h: 0.4, d: 0.02, color: THEME.props.tech.chartBars[1] },
        { x: -0.4, y: 0.8, z: 0.065, w: 0.35, h: 0.8, d: 0.02, color: THEME.props.tech.chartBars[2] },
        { x: 0.2, y: 0.75, z: 0.065, w: 0.35, h: 0.7, d: 0.02, color: THEME.props.tech.chartBars[3] },
        // Garis batas judul layar
        { x: 1.2, y: 1.05, z: 0.065, w: 1.6, h: 0.06, d: 0.02, color: THEME.props.tech.paper },
        { x: 1.2, y: 0.85, z: 0.065, w: 1.6, h: 0.04, d: 0.02, color: THEME.props.tech.screenDim },
        { x: 1.2, y: 0.65, z: 0.065, w: 1.6, h: 0.04, d: 0.02, color: THEME.props.tech.screenDim },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      // Permukaan layar pemancar cahaya (emissive)
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.65, z: 0.06, w: 4.8, h: 1.15, d: 0.01, color: THEME.props.meeting.screenGlow },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  meeting_whiteboard: {
    id: "meeting_whiteboard",
    name: "Papan Tulis Putih Dinding Barat",
    footprint: { w: 0.2, d: 2.2 },
    height: 1.2,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bingkai aluminium
        { x: 0, y: 0.65, z: 0, w: 0.1, h: 1.2, d: 2.2, color: THEME.props.tech.whiteboardFrame },
        // Papan putih
        { x: 0.05, y: 0.7, z: 0, w: 0.02, h: 1.05, d: 2.05, color: THEME.props.tech.whiteboard },
        // Tatakan spidol
        { x: 0.1, y: 0.55, z: 0, w: 0.1, h: 0.03, d: 1.2, color: THEME.props.metal.chrome },
        // Spidol berwarna
        { x: 0.1, y: 0.57, z: -0.3, w: 0.04, h: 0.03, d: 0.16, color: THEME.props.tech.ledBlue },
        { x: 0.1, y: 0.57, z: 0, w: 0.04, h: 0.03, d: 0.16, color: THEME.props.tech.ledRed },
        { x: 0.1, y: 0.57, z: 0.3, w: 0.04, h: 0.03, d: 0.16, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  meeting_sofa: {
    id: "meeting_sofa",
    name: "Sofa Tunggu Sudut Tenggara",
    footprint: { w: 1.6, d: 0.7 },
    height: 0.52,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kaki sofa kayu
        { x: -0.65, y: 0, z: -0.25, w: 0.1, h: 0.08, d: 0.1, color: THEME.props.wood.dark },
        { x: -0.65, y: 0, z: 0.25, w: 0.1, h: 0.08, d: 0.1, color: THEME.props.wood.dark },
        { x: 0.65, y: 0, z: -0.25, w: 0.1, h: 0.08, d: 0.1, color: THEME.props.wood.dark },
        { x: 0.65, y: 0, z: 0.25, w: 0.1, h: 0.08, d: 0.1, color: THEME.props.wood.dark },
        // Dudukan sofa tebal
        { x: 0, y: 0.08, z: 0, w: 1.6, h: 0.22, d: 0.7, color: THEME.props.meeting.sofa },
        // Sandaran belakang (rendah agar tidak menghalangi kamera tenggara)
        { x: 0, y: 0.30, z: 0.22, w: 1.6, h: 0.22, d: 0.22, color: THEME.props.meeting.sofa },
        // Sandaran lengan kiri & kanan
        { x: -0.72, y: 0.25, z: 0, w: 0.16, h: 0.18, d: 0.7, color: THEME.props.furniture.chairSeat },
        { x: 0.72, y: 0.25, z: 0, w: 0.16, h: 0.18, d: 0.7, color: THEME.props.furniture.chairSeat },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  chair_single: {
    id: "chair_single",
    name: "Kursi Kantor / Rapat Voxel",
    footprint: { w: 0.44, d: 0.44 },
    height: 0.48,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kaki bintang/tiang
        { x: 0, y: 0, z: 0, w: 0.08, h: 0.18, d: 0.08, color: THEME.props.metal.chrome },
        { x: 0, y: 0.02, z: 0, w: 0.36, h: 0.03, d: 0.36, color: THEME.props.metal.dark },
        // Bantalan duduk
        { x: 0, y: 0.18, z: 0, w: 0.44, h: 0.08, d: 0.42, color: THEME.props.meeting.chairSeat },
        // Sandaran punggung
        { x: 0, y: 0.26, z: 0.16, w: 0.42, h: 0.30, d: 0.08, color: THEME.props.furniture.chairBack },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  potted_plant: {
    id: "potted_plant",
    name: "Tanaman Hias Pot Voxel",
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Pot keramik putih
        { x: 0, y: 0, z: 0, w: 0.42, h: 0.32, d: 0.42, color: THEME.props.nature.potWhite },
        // Bibir pot
        { x: 0, y: 0.30, z: 0, w: 0.48, h: 0.05, d: 0.48, color: THEME.props.nature.potClay },
        // Tanah dalam pot
        { x: 0, y: 0.28, z: 0, w: 0.38, h: 0.04, d: 0.38, color: THEME.props.wood.dark },
        // Batang utama
        { x: 0, y: 0.34, z: 0, w: 0.08, h: 0.24, d: 0.08, color: THEME.props.nature.trunkBrown },
        // Rindang dedaunan voxel bersusun
        { x: 0, y: 0.48, z: 0, w: 0.50, h: 0.22, d: 0.50, color: THEME.props.nature.leafDark },
        { x: 0, y: 0.64, z: 0, w: 0.38, h: 0.18, d: 0.38, color: THEME.props.nature.leafGreen },
        { x: 0, y: 0.78, z: 0, w: 0.24, h: 0.12, d: 0.24, color: THEME.props.nature.leafLight },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // MANAGER PROPS
  // ---------------------------------------------------------------------------
  manager_desk: {
    id: "manager_desk",
    name: "Meja Eksekutif L-Shape Manager",
    footprint: { w: 2.4, d: 1.4 },
    height: 0.46,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Meja Utama (menghadap barat daya/selatan)
        { x: 0, y: 0.40, z: 0, w: 2.4, h: 0.06, d: 0.75, color: THEME.props.manager.execDesk },
        // Modesty panel meja utama
        { x: 0, y: 0.08, z: 0.32, w: 2.3, h: 0.32, d: 0.05, color: THEME.props.wood.dark },
        // Kaki meja utama kiri & kanan
        { x: -1.1, y: 0, z: 0, w: 0.12, h: 0.40, d: 0.72, color: THEME.props.wood.dark },
        { x: 1.1, y: 0, z: 0, w: 0.12, h: 0.40, d: 0.72, color: THEME.props.wood.dark },
        // L-Return Meja Samping (Sisi Barat)
        { x: -0.85, y: 0.38, z: -0.7, w: 0.7, h: 0.06, d: 0.65, color: THEME.props.manager.execDesk },
        // Laci & lemari berkas di bawah meja samping
        { x: -0.85, y: 0, z: -0.7, w: 0.62, h: 0.38, d: 0.58, color: THEME.props.wood.dark },
        { x: -0.52, y: 0.26, z: -0.7, w: 0.03, h: 0.05, d: 0.2, color: THEME.props.metal.chrome },
        { x: -0.52, y: 0.12, z: -0.7, w: 0.03, h: 0.05, d: 0.2, color: THEME.props.metal.chrome },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  manager_chair: {
    id: "manager_chair",
    name: "Kursi Eksekutif ATLAS",
    footprint: { w: 0.55, d: 0.55 },
    height: 0.62,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Roda & tiang hidrolik
        { x: 0, y: 0, z: 0, w: 0.45, h: 0.04, d: 0.45, color: THEME.props.metal.dark },
        { x: 0, y: 0.04, z: 0, w: 0.1, h: 0.16, d: 0.1, color: THEME.props.metal.chrome },
        // Dudukan tebal kulit hitam
        { x: 0, y: 0.20, z: 0, w: 0.54, h: 0.09, d: 0.50, color: THEME.props.furniture.chairBack },
        // Sandaran tinggi eksekutif
        { x: 0, y: 0.29, z: -0.21, w: 0.52, h: 0.42, d: 0.09, color: THEME.props.furniture.chairBack },
        // Sandaran kepala
        { x: 0, y: 0.65, z: -0.21, w: 0.36, h: 0.14, d: 0.09, color: THEME.props.furniture.chairSeat },
        // Sandaran lengan
        { x: -0.26, y: 0.32, z: -0.05, w: 0.07, h: 0.14, d: 0.32, color: THEME.props.metal.dark },
        { x: 0.26, y: 0.32, z: -0.05, w: 0.07, h: 0.14, d: 0.32, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  manager_tv: {
    id: "manager_tv",
    name: "TV Dasbor Dinding Utara Manager",
    footprint: { w: 2.2, d: 0.15 },
    height: 1.1,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bezel TV
        { x: 0, y: 0.55, z: 0, w: 2.2, h: 1.1, d: 0.1, color: THEME.props.tech.screenFrame },
        // Braket dinding
        { x: 0, y: 0.55, z: -0.06, w: 0.6, h: 0.5, d: 0.06, color: THEME.props.metal.dark },
        // Grafik dasbor statis
        { x: -0.6, y: 0.7, z: 0.055, w: 0.7, h: 0.4, d: 0.02, color: THEME.props.tech.ledBlue },
        { x: 0.4, y: 0.7, z: 0.055, w: 0.8, h: 0.25, d: 0.02, color: THEME.props.tech.ledGreen },
        { x: 0.4, y: 0.4, z: 0.055, w: 0.8, h: 0.15, d: 0.02, color: THEME.props.tech.ledAmber },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.55, z: 0.05, w: 2.05, h: 0.98, d: 0.01, color: THEME.props.manager.tvScreen },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  manager_bookshelf: {
    id: "manager_bookshelf",
    name: "Rak Buku Tinggi Dinding Timur",
    footprint: { w: 0.55, d: 1.6 },
    height: 1.9,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka lemari kayu gelap
        { x: 0, y: 0.95, z: 0, w: 0.55, h: 1.9, d: 1.6, color: THEME.props.manager.bookshelf },
        // Ruang rak berongga dalam
        { x: -0.05, y: 0.95, z: 0, w: 0.42, h: 1.8, d: 1.48, color: THEME.props.wood.dark },
        // Sekat rak horizontal
        { x: -0.05, y: 0.48, z: 0, w: 0.42, h: 0.05, d: 1.48, color: THEME.props.wood.shelf },
        { x: -0.05, y: 0.95, z: 0, w: 0.42, h: 0.05, d: 1.48, color: THEME.props.wood.shelf },
        { x: -0.05, y: 1.42, z: 0, w: 0.42, h: 0.05, d: 1.48, color: THEME.props.wood.shelf },
        // Buku-buku voxel di rak 1
        { x: -0.05, y: 0.65, z: -0.4, w: 0.32, h: 0.28, d: 0.12, color: THEME.props.manager.books[0] },
        { x: -0.05, y: 0.65, z: -0.25, w: 0.32, h: 0.26, d: 0.14, color: THEME.props.manager.books[1] },
        { x: -0.05, y: 0.65, z: -0.08, w: 0.32, h: 0.29, d: 0.16, color: THEME.props.manager.books[2] },
        { x: -0.05, y: 0.65, z: 0.12, w: 0.32, h: 0.25, d: 0.18, color: THEME.props.manager.books[3] },
        // Buku-buku di rak 2
        { x: -0.05, y: 1.12, z: -0.35, w: 0.32, h: 0.27, d: 0.22, color: THEME.props.manager.books[4] },
        { x: -0.05, y: 1.12, z: 0.0, w: 0.32, h: 0.24, d: 0.25, color: THEME.props.manager.books[0] },
        { x: -0.05, y: 1.12, z: 0.35, w: 0.32, h: 0.28, d: 0.18, color: THEME.props.manager.books[2] },
        // Piagam / trofi kecil di rak atas
        { x: -0.05, y: 1.55, z: 0, w: 0.18, h: 0.22, d: 0.18, color: THEME.props.kitchen.diningWood },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  manager_guest_sofa: {
    id: "manager_guest_sofa",
    name: "Sofa Tamu Manager",
    footprint: { w: 1.8, d: 0.7 },
    height: 0.52,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.08, z: 0, w: 1.8, h: 0.22, d: 0.7, color: THEME.props.manager.guestSofa },
        { x: 0, y: 0.30, z: 0.22, w: 1.8, h: 0.22, d: 0.22, color: THEME.props.manager.guestSofa },
        { x: -0.82, y: 0.24, z: 0, w: 0.16, h: 0.18, d: 0.7, color: THEME.props.furniture.chairBack },
        { x: 0.82, y: 0.24, z: 0, w: 0.16, h: 0.18, d: 0.7, color: THEME.props.furniture.chairBack },
        // Kaki kayu
        { x: -0.75, y: 0, z: -0.25, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.wood.dark },
        { x: 0.75, y: 0, z: -0.25, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.wood.dark },
        { x: -0.75, y: 0, z: 0.25, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.wood.dark },
        { x: 0.75, y: 0, z: 0.25, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.wood.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  manager_coffee_table: {
    id: "manager_coffee_table",
    name: "Meja Kopi Manager",
    footprint: { w: 1.0, d: 0.6 },
    height: 0.32,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.26, z: 0, w: 1.0, h: 0.06, d: 0.6, color: THEME.props.wood.tableTop },
        { x: -0.42, y: 0, z: -0.22, w: 0.08, h: 0.26, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.42, y: 0, z: -0.22, w: 0.08, h: 0.26, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.42, y: 0, z: 0.22, w: 0.08, h: 0.26, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.42, y: 0, z: 0.22, w: 0.08, h: 0.26, d: 0.08, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // RISET PROPS
  // ---------------------------------------------------------------------------
  riset_data_board: {
    id: "riset_data_board",
    name: "Papan Data Besar Riset Dinding Utara",
    footprint: { w: 3.6, d: 0.15 },
    height: 1.2,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.6, z: 0, w: 3.6, h: 1.2, d: 0.1, color: THEME.props.tech.screenFrame },
        // Garis grafik & flowchart data voxel
        { x: -1.0, y: 0.8, z: 0.06, w: 0.8, h: 0.3, d: 0.02, color: THEME.props.tech.ledBlue },
        { x: 0.5, y: 0.7, z: 0.06, w: 1.2, h: 0.5, d: 0.02, color: THEME.props.tech.ledGreen },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.6, z: 0.05, w: 3.4, h: 1.05, d: 0.01, color: THEME.props.riset.dataBoard },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  riset_sample_rack: {
    id: "riset_sample_rack",
    name: "Rak Sampel Laboratorium Dinding Barat",
    footprint: { w: 0.5, d: 1.2 },
    height: 1.6,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.8, z: 0, w: 0.5, h: 1.6, d: 1.2, color: THEME.props.riset.sampleRack },
        { x: 0.05, y: 0.45, z: 0, w: 0.38, h: 0.04, d: 1.1, color: THEME.props.metal.chrome },
        { x: 0.05, y: 0.90, z: 0, w: 0.38, h: 0.04, d: 1.1, color: THEME.props.metal.chrome },
        { x: 0.05, y: 1.30, z: 0, w: 0.38, h: 0.04, d: 1.1, color: THEME.props.metal.chrome },
        // Tabung sampel berwarna
        { x: 0.05, y: 0.52, z: -0.3, w: 0.12, h: 0.18, d: 0.12, color: THEME.props.riset.sampleVials[0] },
        { x: 0.05, y: 0.52, z: -0.1, w: 0.12, h: 0.18, d: 0.12, color: THEME.props.riset.sampleVials[1] },
        { x: 0.05, y: 0.52, z: 0.1, w: 0.12, h: 0.18, d: 0.12, color: THEME.props.riset.sampleVials[2] },
        { x: 0.05, y: 0.52, z: 0.3, w: 0.12, h: 0.18, d: 0.12, color: THEME.props.riset.sampleVials[3] },
        { x: 0.05, y: 0.98, z: -0.2, w: 0.15, h: 0.22, d: 0.15, color: THEME.props.riset.sampleVials[1] },
        { x: 0.05, y: 0.98, z: 0.1, w: 0.15, h: 0.22, d: 0.15, color: THEME.props.riset.sampleVials[0] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  riset_swivel_chair: {
    id: "riset_swivel_chair",
    name: "Kursi Putar Lab Riset",
    footprint: { w: 0.44, d: 0.44 },
    height: 0.52,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0, z: 0, w: 0.38, h: 0.03, d: 0.38, color: THEME.props.furniture.chairLabBase },
        { x: 0, y: 0.03, z: 0, w: 0.08, h: 0.22, d: 0.08, color: THEME.props.metal.chrome },
        { x: 0, y: 0.24, z: 0, w: 0.40, h: 0.08, d: 0.40, color: THEME.props.riset.swivelSeat },
        { x: 0, y: 0.32, z: 0.15, w: 0.36, h: 0.20, d: 0.06, color: THEME.props.furniture.chairBack },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // OPERASIONAL PROPS
  // ---------------------------------------------------------------------------
  ops_shelving: {
    id: "ops_shelving",
    name: "Rak Industri dengan Kotak",
    footprint: { w: 2.0, d: 0.6 },
    height: 1.6,
    blocksWalk: true,
    createGeometry: (options) => {
      const w = typeof options?.w === "number" ? options.w : 2.0;
      const boxes: VoxelBoxDef[] = [
        // 4 Tiang sudut baja
        { x: -w / 2 + 0.05, y: 0, z: -0.25, w: 0.08, h: 1.6, d: 0.08, color: THEME.props.operasional.shelving },
        { x: w / 2 - 0.05, y: 0, z: -0.25, w: 0.08, h: 1.6, d: 0.08, color: THEME.props.operasional.shelving },
        { x: -w / 2 + 0.05, y: 0, z: 0.25, w: 0.08, h: 1.6, d: 0.08, color: THEME.props.operasional.shelving },
        { x: w / 2 - 0.05, y: 0, z: 0.25, w: 0.08, h: 1.6, d: 0.08, color: THEME.props.operasional.shelving },
        // 3 Tingkat ambalan besi
        { x: 0, y: 0.10, z: 0, w, h: 0.04, d: 0.58, color: THEME.props.operasional.shelving },
        { x: 0, y: 0.65, z: 0, w, h: 0.04, d: 0.58, color: THEME.props.operasional.shelving },
        { x: 0, y: 1.15, z: 0, w, h: 0.04, d: 0.58, color: THEME.props.operasional.shelving },
        // Kotak/kardus logistik di rak bawah
        { x: -w / 4, y: 0.14, z: 0, w: 0.6, h: 0.42, d: 0.48, color: THEME.props.operasional.crate },
        { x: w / 4, y: 0.14, z: 0, w: 0.55, h: 0.40, d: 0.46, color: THEME.props.operasional.crateBlue },
        // Kotak di rak tengah
        { x: -w / 4 + 0.1, y: 0.69, z: 0, w: 0.5, h: 0.38, d: 0.44, color: THEME.props.operasional.crate },
        { x: w / 4 - 0.1, y: 0.69, z: 0, w: 0.5, h: 0.36, d: 0.44, color: THEME.props.operasional.crate },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  ops_trolley: {
    id: "ops_trolley",
    name: "Troli Material Industri",
    footprint: { w: 0.8, d: 0.6 },
    height: 0.65,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Roda troli
        { x: -0.3, y: 0, z: -0.2, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.3, y: 0, z: -0.2, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.3, y: 0, z: 0.2, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.3, y: 0, z: 0.2, w: 0.08, h: 0.08, d: 0.08, color: THEME.props.metal.dark },
        // Bak pelat dasar
        { x: 0, y: 0.08, z: 0, w: 0.78, h: 0.06, d: 0.56, color: THEME.props.operasional.trolleyFrame },
        // Pagar troli
        { x: 0, y: 0.24, z: -0.26, w: 0.78, h: 0.26, d: 0.04, color: THEME.props.operasional.shelving },
        { x: 0, y: 0.24, z: 0.26, w: 0.78, h: 0.26, d: 0.04, color: THEME.props.operasional.shelving },
        // Pegangan dorong
        { x: 0.38, y: 0.35, z: 0, w: 0.05, h: 0.30, d: 0.52, color: THEME.props.metal.chrome },
        // Benda muatan di dalam troli
        { x: -0.05, y: 0.14, z: 0, w: 0.45, h: 0.28, d: 0.40, color: THEME.props.operasional.crate },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  ops_server_rack: {
    id: "ops_server_rack",
    name: "Rak Server Berlampu",
    footprint: { w: 0.75, d: 0.6 },
    height: 1.6,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kabinet hitam pekat
        { x: 0, y: 0.8, z: 0, w: 0.75, h: 1.6, d: 0.6, color: THEME.props.operasional.serverCabinet },
        // Slot unit server 1..4
        { x: 0, y: 0.3, z: 0.29, w: 0.65, h: 0.18, d: 0.03, color: THEME.props.operasional.shelving },
        { x: 0, y: 0.6, z: 0.29, w: 0.65, h: 0.18, d: 0.03, color: THEME.props.operasional.shelving },
        { x: 0, y: 0.9, z: 0.29, w: 0.65, h: 0.18, d: 0.03, color: THEME.props.operasional.shelving },
        { x: 0, y: 1.2, z: 0.29, w: 0.65, h: 0.18, d: 0.03, color: THEME.props.operasional.shelving },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      // Lampu LED indikator server
      const boxes: VoxelBoxDef[] = [
        { x: -0.22, y: 0.3, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
        { x: -0.15, y: 0.3, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
        { x: -0.22, y: 0.6, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
        { x: -0.15, y: 0.6, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledAmber },
        { x: -0.22, y: 0.9, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledBlue },
        { x: -0.15, y: 0.9, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
        { x: -0.22, y: 1.2, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
        { x: -0.15, y: 1.2, z: 0.31, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  ops_blueprint_board: {
    id: "ops_blueprint_board",
    name: "Papan Cetak Biru Dinding Timur",
    footprint: { w: 0.15, d: 1.8 },
    height: 1.1,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.6, z: 0, w: 0.08, h: 1.1, d: 1.8, color: THEME.props.tech.screenFrame },
        { x: -0.04, y: 0.6, z: 0, w: 0.02, h: 0.98, d: 1.68, color: THEME.props.operasional.blueprint },
        // Garis rancang putih tipis cetak biru
        { x: -0.05, y: 0.7, z: -0.3, w: 0.01, h: 0.4, d: 0.6, color: THEME.props.tech.paper },
        { x: -0.05, y: 0.5, z: 0.3, w: 0.01, h: 0.3, d: 0.5, color: THEME.props.tech.paper },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // AREA UMUM: ATRIUM, PANTRY, LOUNGE, TOILET, TAMAN, RESEPSI
  // ---------------------------------------------------------------------------
  printer_station: {
    id: "printer_station",
    name: "Mesin Printer & Rak Kertas",
    footprint: { w: 0.9, d: 1.1 },
    height: 1.1,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Meja penyangga printer
        { x: 0, y: 0, z: 0, w: 0.88, h: 0.45, d: 1.05, color: THEME.props.kitchen.counterBase },
        // Rak tumpukan kertas di bawah meja
        { x: 0, y: 0.15, z: -0.2, w: 0.6, h: 0.16, d: 0.45, color: THEME.props.tech.paper },
        { x: 0, y: 0.15, z: 0.2, w: 0.6, h: 0.12, d: 0.45, color: THEME.props.tech.paper },
        // Bodi utama printer kantor
        { x: 0, y: 0.45, z: 0, w: 0.75, h: 0.36, d: 0.85, color: THEME.props.tech.printerBody },
        // Unit scanner atas
        { x: 0, y: 0.81, z: 0, w: 0.72, h: 0.10, d: 0.80, color: THEME.props.tech.printerAccent },
        // Layar sentuh printer
        { x: -0.25, y: 0.88, z: -0.28, w: 0.16, h: 0.12, d: 0.12, color: THEME.props.tech.screenFrame },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: -0.25, y: 0.94, z: -0.22, w: 0.12, h: 0.08, d: 0.01, color: THEME.props.tech.ledBlue },
        { x: 0.20, y: 0.65, z: -0.43, w: 0.04, h: 0.04, d: 0.01, color: THEME.props.tech.ledGreen },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  atrium_bench: {
    id: "atrium_bench",
    name: "Bangku Panjang Atrium",
    footprint: { w: 0.6, d: 1.8 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.34, z: 0, w: 0.58, h: 0.08, d: 1.8, color: THEME.props.nature.benchWood },
        { x: -0.2, y: 0, z: -0.7, w: 0.08, h: 0.34, d: 0.08, color: THEME.props.nature.benchIron },
        { x: 0.2, y: 0, z: -0.7, w: 0.08, h: 0.34, d: 0.08, color: THEME.props.nature.benchIron },
        { x: -0.2, y: 0, z: 0.7, w: 0.08, h: 0.34, d: 0.08, color: THEME.props.nature.benchIron },
        { x: 0.2, y: 0, z: 0.7, w: 0.08, h: 0.34, d: 0.08, color: THEME.props.nature.benchIron },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  pantry_counter: {
    id: "pantry_counter",
    name: "Konter Dapur L-Pantry",
    footprint: { w: 4.0, d: 1.8 },
    height: 0.45,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bagian meja utara
        { x: 0, y: 0.38, z: -0.55, w: 4.0, h: 0.07, d: 0.65, color: THEME.props.kitchen.counterTop },
        { x: 0, y: 0, z: -0.55, w: 3.9, h: 0.38, d: 0.60, color: THEME.props.kitchen.counterBase },
        // Bagian sayap timur
        { x: 1.65, y: 0.38, z: 0.25, w: 0.7, h: 0.07, d: 1.15, color: THEME.props.kitchen.counterTop },
        { x: 1.65, y: 0, z: 0.25, w: 0.65, h: 0.38, d: 1.10, color: THEME.props.kitchen.counterBase },
        // Wastafel dapur chrome
        { x: -0.6, y: 0.39, z: -0.55, w: 0.7, h: 0.05, d: 0.45, color: THEME.props.metal.chrome },
        // Keran leher angsa
        { x: -0.6, y: 0.44, z: -0.75, w: 0.05, h: 0.16, d: 0.05, color: THEME.props.metal.chrome },
        { x: -0.6, y: 0.58, z: -0.68, w: 0.05, h: 0.04, d: 0.12, color: THEME.props.metal.chrome },
        // Mesin Kopi Voxel di atas meja
        { x: 0.8, y: 0.45, z: -0.55, w: 0.32, h: 0.32, d: 0.32, color: THEME.props.kitchen.coffeeMaker },
        { x: 0.8, y: 0.50, z: -0.38, w: 0.12, h: 0.08, d: 0.08, color: THEME.props.tech.screenFrame },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      // Lampu indikator mesin kopi
      const boxes: VoxelBoxDef[] = [
        { x: 0.88, y: 0.66, z: -0.38, w: 0.03, h: 0.03, d: 0.01, color: THEME.props.tech.ledGreen },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  pantry_fridge: {
    id: "pantry_fridge",
    name: "Kulkas Pantry",
    footprint: { w: 0.8, d: 0.7 },
    height: 1.7,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.85, z: 0, w: 0.8, h: 1.7, d: 0.7, color: THEME.props.kitchen.fridge },
        // Pintu atas (freezer) & pintu bawah
        { x: 0, y: 1.35, z: 0.355, w: 0.76, h: 0.55, d: 0.02, color: THEME.props.kitchen.counterTop },
        { x: 0, y: 0.55, z: 0.355, w: 0.76, h: 0.95, d: 0.02, color: THEME.props.kitchen.counterTop },
        // Pegangan pintu kulkas
        { x: -0.3, y: 1.25, z: 0.37, w: 0.04, h: 0.22, d: 0.03, color: THEME.props.kitchen.fridgeHandle },
        { x: -0.3, y: 0.85, z: 0.37, w: 0.04, h: 0.35, d: 0.03, color: THEME.props.kitchen.fridgeHandle },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  dining_table: {
    id: "dining_table",
    name: "Meja Makan Kecil Pantry",
    footprint: { w: 1.3, d: 1.1 },
    height: 0.42,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.36, z: 0, w: 1.3, h: 0.06, d: 1.1, color: THEME.props.kitchen.diningWood },
        { x: -0.55, y: 0, z: -0.45, w: 0.08, h: 0.36, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.55, y: 0, z: -0.45, w: 0.08, h: 0.36, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.55, y: 0, z: 0.45, w: 0.08, h: 0.36, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.55, y: 0, z: 0.45, w: 0.08, h: 0.36, d: 0.08, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  trash_bin: {
    id: "trash_bin",
    name: "Tempat Sampah",
    footprint: { w: 0.4, d: 0.4 },
    height: 0.55,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.24, z: 0, w: 0.36, h: 0.48, d: 0.36, color: THEME.props.kitchen.trashBin },
        { x: 0, y: 0.50, z: 0, w: 0.40, h: 0.06, d: 0.40, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  lounge_sofa: {
    id: "lounge_sofa",
    name: "Sofa Santai L-Shape Lounge",
    footprint: { w: 2.8, d: 2.2 },
    height: 0.52,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Sisi Utama
        { x: 0, y: 0.08, z: -0.65, w: 2.8, h: 0.22, d: 0.85, color: THEME.props.furniture.sofaFabric },
        { x: 0, y: 0.30, z: -0.98, w: 2.8, h: 0.22, d: 0.22, color: THEME.props.furniture.sofaFabric },
        // Sayap L samping
        { x: 0.95, y: 0.08, z: 0.35, w: 0.90, h: 0.22, d: 1.35, color: THEME.props.furniture.sofaFabric },
        { x: 1.28, y: 0.30, z: 0.35, w: 0.24, h: 0.22, d: 1.35, color: THEME.props.furniture.sofaFabric },
        // Bantal sofa pastel
        { x: -0.8, y: 0.30, z: -0.8, w: 0.35, h: 0.16, d: 0.12, color: THEME.props.furniture.beanbagMint },
        { x: 0.4, y: 0.30, z: -0.8, w: 0.35, h: 0.16, d: 0.12, color: THEME.props.furniture.beanbagPurple },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  beanbag: {
    id: "beanbag",
    name: "Bean Bag Pastel",
    footprint: { w: 0.7, d: 0.7 },
    height: 0.38,
    blocksWalk: true,
    createGeometry: (options) => {
      const col = options?.color === "mint"
        ? THEME.props.furniture.beanbagMint
        : THEME.props.furniture.beanbagPurple;
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.10, z: 0, w: 0.68, h: 0.20, d: 0.68, color: col },
        { x: 0, y: 0.22, z: -0.05, w: 0.54, h: 0.16, d: 0.54, color: col },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  floor_lamp: {
    id: "floor_lamp",
    name: "Lampu Lantai Berdiri",
    footprint: { w: 0.35, d: 0.35 },
    height: 1.5,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0, z: 0, w: 0.32, h: 0.04, d: 0.32, color: THEME.props.metal.dark },
        { x: 0, y: 0.04, z: 0, w: 0.06, h: 1.15, d: 0.06, color: THEME.props.furniture.lampPole },
        { x: 0, y: 1.20, z: 0, w: 0.34, h: 0.28, d: 0.34, color: THEME.props.furniture.lampShade },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 1.20, z: 0, w: 0.32, h: 0.26, d: 0.32, color: THEME.props.furniture.lampShade },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  toilet_cubicle: {
    id: "toilet_cubicle",
    name: "Bilik Toilet Partisi",
    footprint: { w: 1.1, d: 1.0 },
    height: 1.8,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Dinding samping bilik
        { x: 0, y: 0.9, z: -0.48, w: 1.1, h: 1.8, d: 0.04, color: THEME.props.sanitary.cubicleWall },
        { x: 0, y: 0.9, z: 0.48, w: 1.1, h: 1.8, d: 0.04, color: THEME.props.sanitary.cubicleWall },
        // Pintu bilik
        { x: -0.52, y: 0.85, z: 0, w: 0.04, h: 1.6, d: 0.92, color: THEME.props.sanitary.cubicleDoor },
        // Handle pintu
        { x: -0.56, y: 0.85, z: 0.35, w: 0.04, h: 0.08, d: 0.03, color: THEME.props.sanitary.doorHandle },
        // Kloset porselen di dalam
        { x: 0.25, y: 0.18, z: 0, w: 0.36, h: 0.36, d: 0.32, color: THEME.props.sanitary.sinkPorcelain },
        { x: 0.44, y: 0.35, z: 0, w: 0.18, h: 0.38, d: 0.32, color: THEME.props.sanitary.sinkPorcelain },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  toilet_sink: {
    id: "toilet_sink",
    name: "Wastafel dan Cermin",
    footprint: { w: 1.8, d: 0.55 },
    height: 1.5,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Meja wastafel marmer
        { x: 0, y: 0.38, z: 0, w: 1.8, h: 0.06, d: 0.55, color: THEME.props.kitchen.counterTop },
        { x: 0, y: 0, z: 0, w: 1.7, h: 0.38, d: 0.50, color: THEME.props.kitchen.counterBase },
        // Wastafel porselen ganda
        { x: -0.45, y: 0.42, z: 0, w: 0.55, h: 0.06, d: 0.42, color: THEME.props.sanitary.sinkPorcelain },
        { x: 0.45, y: 0.42, z: 0, w: 0.55, h: 0.06, d: 0.42, color: THEME.props.sanitary.sinkPorcelain },
        // Keran air
        { x: -0.45, y: 0.48, z: -0.18, w: 0.04, h: 0.12, d: 0.08, color: THEME.props.metal.chrome },
        { x: 0.45, y: 0.48, z: -0.18, w: 0.04, h: 0.12, d: 0.08, color: THEME.props.metal.chrome },
        // Cermin dinding ganda
        { x: -0.45, y: 0.95, z: -0.24, w: 0.65, h: 0.85, d: 0.02, color: THEME.props.sanitary.mirror },
        { x: 0.45, y: 0.95, z: -0.24, w: 0.65, h: 0.85, d: 0.02, color: THEME.props.sanitary.mirror },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  voxel_tree: {
    id: "voxel_tree",
    name: "Pohon Taman Voxel",
    footprint: { w: 1.4, d: 1.4 },
    height: 1.9,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Batang pohon cokelat
        { x: 0, y: 0, z: 0, w: 0.32, h: 0.9, d: 0.32, color: THEME.props.nature.trunkBrown },
        // Kanopi daun bertingkat
        { x: 0, y: 0.8, z: 0, w: 1.35, h: 0.45, d: 1.35, color: THEME.props.nature.leafDark },
        { x: 0, y: 1.2, z: 0, w: 1.05, h: 0.42, d: 1.05, color: THEME.props.nature.leafGreen },
        { x: 0, y: 1.58, z: 0, w: 0.65, h: 0.30, d: 0.65, color: THEME.props.nature.leafLight },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  reception_desk: {
    id: "reception_desk",
    name: "Meja Resepsi Lengkung Voxel",
    footprint: { w: 1.8, d: 0.9 },
    height: 0.52,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bagian tengah meja resepsi
        { x: 0, y: 0.46, z: 0, w: 1.8, h: 0.06, d: 0.85, color: THEME.props.reception.curvedTop },
        // Panel depan berjenjang (efek melengkung)
        { x: 0, y: 0, z: -0.38, w: 1.7, h: 0.46, d: 0.08, color: THEME.props.reception.curvedFront },
        { x: -0.80, y: 0, z: -0.22, w: 0.18, h: 0.46, d: 0.38, color: THEME.props.reception.curvedFront },
        { x: 0.80, y: 0, z: -0.22, w: 0.18, h: 0.46, d: 0.38, color: THEME.props.reception.curvedFront },
        // Lis aksen emas/kayu
        { x: 0, y: 0.22, z: -0.41, w: 1.75, h: 0.04, d: 0.03, color: THEME.props.wood.reception },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  welcome_rug: {
    id: "welcome_rug",
    name: "Karpet Sambutan Resepsi",
    footprint: { w: 1.8, d: 1.4 },
    height: 0.02,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.001, z: 0, w: 1.8, h: 0.015, d: 1.4, color: THEME.props.reception.welcomeRug },
        // Border emas tipis
        { x: 0, y: 0.002, z: 0, w: 1.84, h: 0.012, d: 1.44, color: THEME.props.reception.curvedFront },
      ];
      return buildVoxelGeometry(boxes);
    },
  },
};

// =============================================================================
// 2. PENEMPATAN PROP STATIS PER RUANGAN (TAHAP 2A)
// =============================================================================

export const T2A_PLACED_PROPS: PlacedPropInstance[] = [
  // ---------------------------------------------------------------------------
  // 1. MEETING (0,0,15,9)
  // ---------------------------------------------------------------------------
  {
    id: "meeting_table_main",
    propId: "meeting_table",
    roomId: "meeting",
    x: 7.5,
    y: 0,
    z: 4.5,
    footprint: { w: 7.6, d: 1.8 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 3.7, maxX: 11.3, minZ: 3.6, maxZ: 5.4 },
  },
  {
    id: "meeting_carpet_main",
    propId: "meeting_carpet",
    roomId: "meeting",
    x: 7.5,
    y: 0,
    z: 4.5,
    footprint: { w: 10.8, d: 4.0 },
    height: 0.02,
    blocksWalk: false,
    bounds: { minX: 2.1, maxX: 12.9, minZ: 2.5, maxZ: 6.5 },
  },
  {
    id: "meeting_screen_north",
    propId: "meeting_screen",
    roomId: "meeting",
    x: 7.5,
    y: 0,
    z: 0.25,
    footprint: { w: 5.0, d: 0.2 },
    height: 1.3,
    blocksWalk: true,
    bounds: { minX: 5.0, maxX: 10.0, minZ: 0.15, maxZ: 0.35 },
  },
  {
    id: "meeting_whiteboard_west",
    propId: "meeting_whiteboard",
    roomId: "meeting",
    x: 0.25,
    y: 0,
    z: 4.5,
    footprint: { w: 0.2, d: 2.2 },
    height: 1.2,
    blocksWalk: true,
    bounds: { minX: 0.15, maxX: 0.35, minZ: 3.4, maxZ: 5.6 },
  },
  {
    id: "meeting_sofa_se",
    propId: "meeting_sofa",
    roomId: "meeting",
    x: 13.6,
    y: 0,
    z: 7.6,
    footprint: { w: 1.6, d: 0.7 },
    height: 0.52,
    blocksWalk: true,
    bounds: { minX: 12.8, maxX: 14.4, minZ: 7.25, maxZ: 7.95 },
  },
  {
    id: "meeting_plant_se",
    propId: "potted_plant",
    roomId: "meeting",
    x: 14.2,
    y: 0,
    z: 6.3,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 13.9, maxX: 14.5, minZ: 6.0, maxZ: 6.6 },
  },

  // ---------------------------------------------------------------------------
  // 2. MANAGER (0,11,9,9)
  // ---------------------------------------------------------------------------
  {
    id: "manager_desk_main",
    propId: "manager_desk",
    roomId: "manager",
    x: 4.5,
    y: 0,
    z: 15.8,
    footprint: { w: 2.4, d: 1.4 },
    height: 0.46,
    blocksWalk: true,
    bounds: { minX: 3.3, maxX: 5.7, minZ: 15.1, maxZ: 16.2 },
  },
  {
    id: "manager_chair_atlas",
    propId: "manager_chair",
    roomId: "manager",
    x: 4.5,
    y: 0,
    z: 15.0,
    footprint: { w: 0.55, d: 0.55 },
    height: 0.62,
    blocksWalk: false,
    bounds: { minX: 4.22, maxX: 4.78, minZ: 14.72, maxZ: 15.28 },
  },
  {
    id: "manager_tv_north",
    propId: "manager_tv",
    roomId: "manager",
    x: 4.5,
    y: 0,
    z: 11.25,
    footprint: { w: 2.2, d: 0.15 },
    height: 1.1,
    blocksWalk: true,
    bounds: { minX: 3.4, maxX: 5.6, minZ: 11.15, maxZ: 11.35 },
  },
  {
    id: "manager_bookshelf_east",
    propId: "manager_bookshelf",
    roomId: "manager",
    x: 8.6,
    y: 0,
    z: 12.5,
    footprint: { w: 0.55, d: 1.6 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 8.32, maxX: 8.88, minZ: 11.7, maxZ: 13.3 },
  },
  {
    id: "manager_guest_sofa_se",
    propId: "manager_guest_sofa",
    roomId: "manager",
    x: 7.5,
    y: 0,
    z: 18.8,
    footprint: { w: 1.8, d: 0.7 },
    height: 0.52,
    blocksWalk: true,
    bounds: { minX: 6.6, maxX: 8.4, minZ: 18.45, maxZ: 19.15 },
  },
  {
    id: "manager_coffee_table_se",
    propId: "manager_coffee_table",
    roomId: "manager",
    x: 7.5,
    y: 0,
    z: 17.7,
    footprint: { w: 1.0, d: 0.6 },
    height: 0.32,
    blocksWalk: true,
    bounds: { minX: 7.0, maxX: 8.0, minZ: 17.4, maxZ: 18.0 },
  },

  // ---------------------------------------------------------------------------
  // 3. RISET (11,11,10,8)
  // ---------------------------------------------------------------------------
  {
    id: "riset_lab_athena_desk",
    propId: "dining_table",
    roomId: "riset",
    x: 14.0,
    y: 0,
    z: 14.8,
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 13.25, maxX: 14.75, minZ: 14.47, maxZ: 15.13 },
  },
  {
    id: "riset_lab_argus_desk",
    propId: "dining_table",
    roomId: "riset",
    x: 18.0,
    y: 0,
    z: 14.8,
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 17.25, maxX: 18.75, minZ: 14.47, maxZ: 15.13 },
  },
  {
    id: "riset_lab_metis_desk",
    propId: "dining_table",
    roomId: "riset",
    x: 16.0,
    y: 0,
    z: 17.3,
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 15.25, maxX: 16.75, minZ: 16.97, maxZ: 17.63 },
  },
  {
    id: "riset_lab_center_console",
    propId: "dining_table",
    roomId: "riset",
    x: 16.0,
    y: 0,
    z: 14.8,
    footprint: { w: 1.0, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 15.5, maxX: 16.5, minZ: 14.47, maxZ: 15.13 },
  },
  {
    id: "riset_data_board_north",
    propId: "riset_data_board",
    roomId: "riset",
    x: 16.0,
    y: 0,
    z: 11.25,
    footprint: { w: 3.6, d: 0.15 },
    height: 1.2,
    blocksWalk: true,
    bounds: { minX: 14.2, maxX: 17.8, minZ: 11.15, maxZ: 11.35 },
  },
  {
    id: "riset_sample_rack_west",
    propId: "riset_sample_rack",
    roomId: "riset",
    x: 11.4,
    y: 0,
    z: 12.0,
    footprint: { w: 0.5, d: 1.2 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 11.15, maxX: 11.65, minZ: 11.4, maxZ: 12.6 },
  },

  // ---------------------------------------------------------------------------
  // 4. OPERASIONAL (17,0,9,9)
  // ---------------------------------------------------------------------------
  {
    id: "ops_shelving_north",
    propId: "ops_shelving",
    roomId: "operasional",
    x: 22.0,
    y: 0,
    z: 0.45,
    footprint: { w: 5.0, d: 0.6 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 19.5, maxX: 24.5, minZ: 0.15, maxZ: 0.75 },
    options: { w: 5.0 },
  },
  {
    id: "ops_shelving_west",
    propId: "ops_shelving",
    roomId: "operasional",
    x: 17.45,
    y: 0,
    z: 1.4,
    footprint: { w: 0.6, d: 1.6 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 17.15, maxX: 17.75, minZ: 0.6, maxZ: 2.2 },
    options: { w: 1.6 },
    rotY: Math.PI / 2,
  },
  {
    id: "ops_workstation_hephaestus",
    propId: "dining_table",
    roomId: "operasional",
    x: 21.5,
    y: 0,
    z: 5.3,
    footprint: { w: 1.8, d: 0.7 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 20.6, maxX: 22.4, minZ: 4.95, maxZ: 5.65 },
  },
  {
    id: "ops_blueprint_board_east",
    propId: "ops_blueprint_board",
    roomId: "operasional",
    x: 25.85,
    y: 0,
    z: 4.5,
    footprint: { w: 0.15, d: 1.8 },
    height: 1.1,
    blocksWalk: true,
    bounds: { minX: 25.75, maxX: 25.95, minZ: 3.6, maxZ: 5.4 },
  },
  {
    id: "ops_trolley_material",
    propId: "ops_trolley",
    roomId: "operasional",
    x: 24.2,
    y: 0,
    z: 6.5,
    footprint: { w: 0.8, d: 0.6 },
    height: 0.65,
    blocksWalk: true,
    bounds: { minX: 23.8, maxX: 24.6, minZ: 6.2, maxZ: 6.8 },
  },
  {
    id: "ops_server_rack_east",
    propId: "ops_server_rack",
    roomId: "operasional",
    x: 25.0,
    y: 0,
    z: 1.2,
    footprint: { w: 0.75, d: 0.6 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 24.62, maxX: 25.38, minZ: 0.9, maxZ: 1.5 },
  },

  // ---------------------------------------------------------------------------
  // 5. ATRIUM (21,11,7,10) & ATRIUM SELATAN
  // ---------------------------------------------------------------------------
  {
    id: "atrium_printer_niche",
    propId: "printer_station",
    roomId: "atrium",
    x: 27.2,
    y: 0,
    z: 18.5,
    footprint: { w: 0.9, d: 1.1 },
    height: 1.1,
    blocksWalk: true,
    bounds: { minX: 26.75, maxX: 27.65, minZ: 17.95, maxZ: 19.05 },
  },
  {
    id: "atrium_center_planter",
    propId: "potted_plant",
    roomId: "atrium",
    x: 23.5,
    y: 0,
    z: 18.0,
    footprint: { w: 0.8, d: 0.8 },
    height: 1.2,
    blocksWalk: true,
    bounds: { minX: 23.1, maxX: 23.9, minZ: 17.6, maxZ: 18.4 },
  },
  {
    id: "atrium_bench_east",
    propId: "atrium_bench",
    roomId: "atrium",
    x: 26.8,
    y: 0,
    z: 13.0,
    footprint: { w: 0.6, d: 1.8 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 26.5, maxX: 27.1, minZ: 12.1, maxZ: 13.9 },
  },

  // ---------------------------------------------------------------------------
  // 6. PANTRY (30,11,8,7)
  // ---------------------------------------------------------------------------
  {
    id: "pantry_l_counter",
    propId: "pantry_counter",
    roomId: "pantry",
    x: 35.0,
    y: 0,
    z: 12.0,
    footprint: { w: 4.0, d: 1.8 },
    height: 0.45,
    blocksWalk: true,
    bounds: { minX: 32.5, maxX: 37.6, minZ: 11.1, maxZ: 13.2 },
  },
  {
    id: "pantry_fridge_north",
    propId: "pantry_fridge",
    roomId: "pantry",
    x: 31.6,
    y: 0,
    z: 11.5,
    footprint: { w: 0.8, d: 0.7 },
    height: 1.7,
    blocksWalk: true,
    bounds: { minX: 31.2, maxX: 32.0, minZ: 11.15, maxZ: 11.85 },
  },
  {
    id: "pantry_dining_table",
    propId: "dining_table",
    roomId: "pantry",
    x: 34.5,
    y: 0,
    z: 15.5,
    footprint: { w: 1.3, d: 1.1 },
    height: 0.42,
    blocksWalk: true,
    bounds: { minX: 33.85, maxX: 35.15, minZ: 14.95, maxZ: 16.05 },
  },
  {
    id: "pantry_trash_bin",
    propId: "trash_bin",
    roomId: "pantry",
    x: 37.3,
    y: 0,
    z: 16.8,
    footprint: { w: 0.4, d: 0.4 },
    height: 0.55,
    blocksWalk: true,
    bounds: { minX: 37.1, maxX: 37.5, minZ: 16.6, maxZ: 17.0 },
  },

  // ---------------------------------------------------------------------------
  // 7. LOUNGE (30,19,8,6)
  // ---------------------------------------------------------------------------
  {
    id: "lounge_sofa_l",
    propId: "lounge_sofa",
    roomId: "lounge",
    x: 35.5,
    y: 0,
    z: 20.5,
    footprint: { w: 2.8, d: 2.2 },
    height: 0.52,
    blocksWalk: true,
    bounds: { minX: 34.0, maxX: 37.5, minZ: 19.4, maxZ: 22.4 },
  },
  {
    id: "lounge_coffee_table",
    propId: "manager_coffee_table",
    roomId: "lounge",
    x: 35.0,
    y: 0,
    z: 22.6,
    footprint: { w: 1.0, d: 0.6 },
    height: 0.32,
    blocksWalk: true,
    bounds: { minX: 34.5, maxX: 35.5, minZ: 22.3, maxZ: 22.9 },
  },
  {
    id: "lounge_beanbag_1",
    propId: "beanbag",
    roomId: "lounge",
    x: 32.5,
    y: 0,
    z: 20.0,
    footprint: { w: 0.7, d: 0.7 },
    height: 0.38,
    blocksWalk: true,
    bounds: { minX: 32.15, maxX: 32.85, minZ: 19.65, maxZ: 20.35 },
    options: { color: "mint" },
  },
  {
    id: "lounge_beanbag_2",
    propId: "beanbag",
    roomId: "lounge",
    x: 33.5,
    y: 0,
    z: 23.8,
    footprint: { w: 0.7, d: 0.7 },
    height: 0.38,
    blocksWalk: true,
    bounds: { minX: 33.15, maxX: 33.85, minZ: 23.45, maxZ: 24.15 },
    options: { color: "purple" },
  },
  {
    id: "lounge_floor_lamp",
    propId: "floor_lamp",
    roomId: "lounge",
    x: 37.4,
    y: 0,
    z: 19.5,
    footprint: { w: 0.35, d: 0.35 },
    height: 1.5,
    blocksWalk: true,
    bounds: { minX: 37.22, maxX: 37.58, minZ: 19.32, maxZ: 19.68 },
  },

  // ---------------------------------------------------------------------------
  // 8. TOILET (39,11,5,6)
  // ---------------------------------------------------------------------------
  {
    id: "toilet_cubicles_east",
    propId: "toilet_cubicle",
    roomId: "toilet",
    x: 43.1,
    y: 0,
    z: 12.0,
    footprint: { w: 1.1, d: 1.0 },
    height: 1.8,
    blocksWalk: true,
    bounds: { minX: 42.55, maxX: 43.65, minZ: 11.5, maxZ: 12.5 },
  },
  {
    id: "toilet_cubicles_east_2",
    propId: "toilet_cubicle",
    roomId: "toilet",
    x: 43.1,
    y: 0,
    z: 14.0,
    footprint: { w: 1.1, d: 1.0 },
    height: 1.8,
    blocksWalk: true,
    bounds: { minX: 42.55, maxX: 43.65, minZ: 13.5, maxZ: 14.5 },
  },
  {
    id: "toilet_cubicles_east_3",
    propId: "toilet_cubicle",
    roomId: "toilet",
    x: 43.1,
    y: 0,
    z: 16.0,
    footprint: { w: 1.1, d: 1.0 },
    height: 1.8,
    blocksWalk: true,
    bounds: { minX: 42.55, maxX: 43.65, minZ: 15.5, maxZ: 16.5 },
  },
  {
    id: "toilet_sinks_north",
    propId: "toilet_sink",
    roomId: "toilet",
    x: 40.8,
    y: 0,
    z: 11.4,
    footprint: { w: 1.8, d: 0.55 },
    height: 1.5,
    blocksWalk: true,
    bounds: { minX: 39.9, maxX: 41.7, minZ: 11.12, maxZ: 11.68 },
  },

  // ---------------------------------------------------------------------------
  // 9. TAMAN (39,18,5,7) & TAMAN KECIL (40,34,4,2)
  // ---------------------------------------------------------------------------
  {
    id: "garden_tree_se",
    propId: "voxel_tree",
    roomId: "taman",
    x: 42.6,
    y: 0,
    z: 23.8,
    footprint: { w: 1.4, d: 1.4 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 42.0, maxX: 43.2, minZ: 23.2, maxZ: 24.4 },
  },
  {
    id: "garden_tree_ne",
    propId: "voxel_tree",
    roomId: "taman",
    x: 42.6,
    y: 0,
    z: 19.2,
    footprint: { w: 1.4, d: 1.4 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 42.0, maxX: 43.2, minZ: 18.6, maxZ: 19.8 },
  },
  {
    id: "garden_bench_north",
    propId: "atrium_bench",
    roomId: "taman",
    x: 40.5,
    y: 0,
    z: 18.5,
    footprint: { w: 1.4, d: 0.5 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 39.8, maxX: 41.2, minZ: 18.25, maxZ: 18.75 },
    rotY: Math.PI / 2,
  },
  {
    id: "taman_kecil_tree",
    propId: "voxel_tree",
    roomId: "taman_kecil",
    x: 41.5,
    y: 0,
    z: 35.0,
    footprint: { w: 1.0, d: 1.0 },
    height: 1.5,
    blocksWalk: true,
    bounds: { minX: 41.0, maxX: 42.0, minZ: 34.5, maxZ: 35.5 },
  },

  // ---------------------------------------------------------------------------
  // 10. RESEPSI (40,27,4,7)
  // ---------------------------------------------------------------------------
  {
    id: "reception_curved_desk_main",
    propId: "reception_desk",
    roomId: "resepsi",
    x: 41.5,
    y: 0,
    z: 32.5,
    footprint: { w: 1.8, d: 0.9 },
    height: 0.52,
    blocksWalk: true,
    bounds: { minX: 40.6, maxX: 42.4, minZ: 32.05, maxZ: 32.95 },
  },
  {
    id: "reception_welcome_rug_main",
    propId: "welcome_rug",
    roomId: "resepsi",
    x: 42.2,
    y: 0,
    z: 30.0,
    footprint: { w: 1.8, d: 1.4 },
    height: 0.02,
    blocksWalk: false,
    bounds: { minX: 41.3, maxX: 43.1, minZ: 29.3, maxZ: 30.7 },
  },
  {
    id: "reception_waiting_chair_west",
    propId: "atrium_bench",
    roomId: "resepsi",
    x: 40.4,
    y: 0,
    z: 28.5,
    footprint: { w: 0.5, d: 1.2 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 40.15, maxX: 40.65, minZ: 27.9, maxZ: 29.1 },
  },
  {
    id: "reception_plant_corner",
    propId: "potted_plant",
    roomId: "resepsi",
    x: 40.5,
    y: 0,
    z: 33.3,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 40.25, maxX: 40.75, minZ: 33.05, maxZ: 33.55 },
  },
];

// =============================================================================
// 3. DAFTAR OBSTACLE STATIS UNTUK GENERATOR WALKWAY
// =============================================================================

export interface WalkObstacle {
  id: string;
  roomId: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const PROPS_OBSTACLES: WalkObstacle[] = T2A_PLACED_PROPS
  .filter((p) => p.blocksWalk)
  .map((p) => ({
    id: p.id,
    roomId: p.roomId,
    minX: +p.bounds.minX.toFixed(3),
    maxX: +p.bounds.maxX.toFixed(3),
    minZ: +p.bounds.minZ.toFixed(3),
    maxZ: +p.bounds.maxZ.toFixed(3),
  }));

// =============================================================================
// 4. VALIDASI STARTUP: PENGECEKAN BUKAAN PINTU & KURSI AGENT
// =============================================================================

/**
 * Validasi startup tambahan (throw):
 * 1. Tidak ada prop blocksWalk yang menimpa area bukaan pintu (1 tile di depan dan belakang pintu).
 * 2. Tidak ada prop blocksWalk yang menimpa kursi rapat di SEAT_BY_AGENT.
 * 3. Tidak ada prop blocksWalk yang menimpa posisi duduk/kerja agen di HOME_POSITIONS.
 */
export function validatePropsPlacement(
  doors: FloorplanData["doors"],
  rooms: FloorplanData["rooms"],
  seatByAgent: Record<string, [number, number]> = SEAT_BY_AGENT,
  homePositions: Record<string, [number, number]> = HOME_POSITIONS,
  placedProps: PlacedPropInstance[] = T2A_PLACED_PROPS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const prop of placedProps) {
    if (!prop.blocksWalk) continue;

    // 1. Cek tumpang tindih dengan area bukaan tiap pintu (1 tile depan dan belakang)
    for (const door of doors) {
      const room = rooms.find((r) => r.id === door.roomId);
      if (!room) continue;

      let doorMinX: number;
      let doorMaxX: number;
      let doorMinZ: number;
      let doorMaxZ: number;

      if (door.side === "N") {
        doorMinX = room.x + door.offset;
        doorMaxX = doorMinX + door.width;
        doorMinZ = room.z - 1.0;
        doorMaxZ = room.z + 1.0;
      } else if (door.side === "S") {
        doorMinX = room.x + door.offset;
        doorMaxX = doorMinX + door.width;
        doorMinZ = room.z + room.d - 1.0;
        doorMaxZ = room.z + room.d + 1.0;
      } else if (door.side === "W") {
        doorMinX = room.x - 1.0;
        doorMaxX = room.x + 1.0;
        doorMinZ = room.z + door.offset;
        doorMaxZ = doorMinZ + door.width;
      } else {
        // 'E'
        doorMinX = room.x + room.w - 1.0;
        doorMaxX = room.x + room.w + 1.0;
        doorMinZ = room.z + door.offset;
        doorMaxZ = doorMinZ + door.width;
      }

      const overlapsDoor = !(
        prop.bounds.maxX <= doorMinX ||
        prop.bounds.minX >= doorMaxX ||
        prop.bounds.maxZ <= doorMinZ ||
        prop.bounds.minZ >= doorMaxZ
      );

      if (overlapsDoor) {
        errors.push(
          `Prop "${prop.id}" di ruangan "${prop.roomId}" menutupi area bukaan pintu "${door.id}" (${door.side} offset=${door.offset}, width=${door.width})!`
        );
      }
    }

    // 2. Cek tumpang tindih dengan kursi rapat (SEAT_BY_AGENT)
    for (const [agentName, [sx, sz]] of Object.entries(seatByAgent)) {
      if (
        sx >= prop.bounds.minX &&
        sx <= prop.bounds.maxX &&
        sz >= prop.bounds.minZ &&
        sz <= prop.bounds.maxZ
      ) {
        errors.push(
          `Prop "${prop.id}" di ruangan "${prop.roomId}" menimpa kursi rapat agen "${agentName}" di (${sx}, ${sz})!`
        );
      }
    }

    // 3. Cek tumpang tindih dengan meja/posisi duduk rumah agen (HOME_POSITIONS)
    for (const [agentName, [hx, hz]] of Object.entries(homePositions)) {
      if (
        hx >= prop.bounds.minX &&
        hx <= prop.bounds.maxX &&
        hz >= prop.bounds.minZ &&
        hz <= prop.bounds.maxZ
      ) {
        errors.push(
          `Prop "${prop.id}" di ruangan "${prop.roomId}" menimpa posisi duduk agen "${agentName}" di (${hx}, ${hz})!`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[Startup Validation Failed] Ditemukan ${errors.length} pelanggaran penempatan prop:\n` +
        errors.map((e) => "  - " + e).join("\n")
    );
  }

  return { valid: true, errors: [] };
}
