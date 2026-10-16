// lib/stage3d/props/index.ts
// Registry Prop Voxel & Tata Letak Interior Tahap 2a (4 Departemen + Area Umum).
// Setiap prop = fungsi(opsi) -> { geometry/mesh, footprint {w,d}, tinggi, blocksWalk: boolean }.
// Seluruh warna membaca THEME.props.

import * as THREE from "three";
import { THEME } from "../theme";
import { VoxelBoxDef, buildVoxelGeometry } from "./voxel";
import { FloorplanData, FLOORPLAN } from "../floorplan";
import { HOME_POSITIONS, SEAT_BY_AGENT, HOME_FACE_BY_AGENT, AGENT_DESK_PROP_ID, getAgentHomeFacing, calculateFacingAngle } from "@/lib/officeConfig";

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

  riset_lab_desk: {
    id: "riset_lab_desk",
    name: "Meja Laboratorium Riset",
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja lab biru muda
        { x: 0, y: 0.38, z: 0, w: 1.5, h: 0.05, d: 0.65, color: THEME.props.riset.labTableTop },
        // Lis pinggiran biru cerah
        { x: 0, y: 0.36, z: 0, w: 1.52, h: 0.02, d: 0.67, color: THEME.props.riset.labTableFrame },
        // 4 Kaki meja baja lab
        { x: -0.68, y: 0, z: -0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.industrial },
        { x: 0.68, y: 0, z: -0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.industrial },
        { x: -0.68, y: 0, z: 0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.industrial },
        { x: 0.68, y: 0, z: 0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.industrial },
        // Monitor data analitik lab
        { x: -0.35, y: 0.42, z: -0.15, w: 0.45, h: 0.26, d: 0.04, color: THEME.props.metal.dark },
        { x: -0.35, y: 0.44, z: -0.12, w: 0.41, h: 0.22, d: 0.01, color: THEME.props.riset.dataBoard },
        // Tabung sampel riset
        { x: 0.32, y: 0.43, z: -0.12, w: 0.08, h: 0.14, d: 0.08, color: THEME.props.riset.sampleVials[0] },
        { x: 0.44, y: 0.43, z: -0.12, w: 0.08, h: 0.14, d: 0.08, color: THEME.props.riset.sampleVials[1] },
        // Keyboard & mini konsol
        { x: 0.05, y: 0.42, z: 0.1, w: 0.48, h: 0.015, d: 0.2, color: THEME.props.metal.dark },
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

  ops_workstation_desk: {
    id: "ops_workstation_desk",
    name: "Meja Kerja Operasional & Logistik",
    footprint: { w: 1.6, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja industri kokoh
        { x: 0, y: 0.38, z: 0, w: 1.6, h: 0.05, d: 0.65, color: THEME.props.operasional.shelving },
        // Rangka baja tebal
        { x: -0.72, y: 0, z: -0.26, w: 0.1, h: 0.38, d: 0.1, color: THEME.props.operasional.trolleyFrame },
        { x: 0.72, y: 0, z: -0.26, w: 0.1, h: 0.38, d: 0.1, color: THEME.props.operasional.trolleyFrame },
        { x: -0.72, y: 0, z: 0.26, w: 0.1, h: 0.38, d: 0.1, color: THEME.props.operasional.trolleyFrame },
        { x: 0.72, y: 0, z: 0.26, w: 0.1, h: 0.38, d: 0.1, color: THEME.props.operasional.trolleyFrame },
        // Monitor ruggedized
        { x: -0.25, y: 0.42, z: -0.15, w: 0.46, h: 0.28, d: 0.05, color: THEME.props.operasional.serverCabinet },
        { x: -0.25, y: 0.44, z: -0.12, w: 0.42, h: 0.24, d: 0.01, color: THEME.props.operasional.blueprint },
        // Dokumen cetak biru di atas meja
        { x: 0.35, y: 0.43, z: -0.1, w: 0.4, h: 0.06, d: 0.08, color: THEME.props.operasional.blueprint },
        // Toolbox perkakas
        { x: 0.38, y: 0.43, z: 0.12, w: 0.25, h: 0.1, d: 0.14, color: THEME.props.operasional.tools },
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

  atrium_planter: {
    id: "atrium_planter",
    name: "Planter Tengah Atrium",
    footprint: { w: 1.4, d: 1.4 },
    height: 0.8,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kotak planter beton / border luar
        { x: 0, y: 0.15, z: 0, w: 1.4, h: 0.3, d: 1.4, color: THEME.props.metal.dark },
        // Tanah subur dalam
        { x: 0, y: 0.28, z: 0, w: 1.2, h: 0.08, d: 1.2, color: "#3d2314" },
        // Rumpun semak hijau / tanaman tengah
        { x: 0, y: 0.35, z: 0, w: 1.0, h: 0.3, d: 1.0, color: THEME.props.nature.leafDark },
        { x: 0, y: 0.58, z: 0, w: 0.7, h: 0.35, d: 0.7, color: THEME.props.nature.leafGreen },
        // Aksen daun tepi
        { x: -0.25, y: 0.45, z: 0.25, w: 0.25, h: 0.2, d: 0.25, color: THEME.props.nature.leafLight },
        { x: 0.25, y: 0.45, z: -0.25, w: 0.25, h: 0.2, d: 0.25, color: THEME.props.nature.leafLight },
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

  // ---------------------------------------------------------------------------
  // TAHAP 2B: ADVERTISER PROPS
  // ---------------------------------------------------------------------------
  advertiser_screen_wall: {
    id: "advertiser_screen_wall",
    name: "Dinding Layar Analitik Iklan",
    footprint: { w: 5.0, d: 0.3 },
    height: 1.6,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka dinding belakang
        { x: 0, y: 0.2, z: 0, w: 5.0, h: 1.4, d: 0.14, color: THEME.props.advertiser.screenWall },
        // Panel layar utama
        { x: 0, y: 0.25, z: 0.06, w: 4.8, h: 1.3, d: 0.04, color: THEME.props.advertiser.screenDim },
        // Batang metrik CPA multiwarna
        { x: -1.6, y: 0.35, z: 0.08, w: 0.4, h: 0.6, d: 0.04, color: THEME.props.advertiser.cpaBars[0] },
        { x: -1.0, y: 0.35, z: 0.08, w: 0.4, h: 0.8, d: 0.04, color: THEME.props.advertiser.cpaBars[1] },
        { x: -0.4, y: 0.35, z: 0.08, w: 0.4, h: 0.5, d: 0.04, color: THEME.props.advertiser.cpaBars[2] },
        { x: 0.2, y: 0.35, z: 0.08, w: 0.4, h: 0.9, d: 0.04, color: THEME.props.advertiser.cpaBars[3] },
        // Header grafik & garis tren
        { x: 1.2, y: 0.75, z: 0.08, w: 1.8, h: 0.08, d: 0.02, color: THEME.props.advertiser.screenGlow },
        { x: 1.2, y: 0.55, z: 0.08, w: 1.8, h: 0.05, d: 0.02, color: THEME.props.advertiser.screenGlow },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: -1.6, y: 0.35, z: 0.098, w: 0.38, h: 0.58, d: 0.02, color: THEME.props.advertiser.cpaBars[0] },
        { x: -1.0, y: 0.35, z: 0.098, w: 0.38, h: 0.78, d: 0.02, color: THEME.props.advertiser.cpaBars[1] },
        { x: -0.4, y: 0.35, z: 0.098, w: 0.38, h: 0.48, d: 0.02, color: THEME.props.advertiser.cpaBars[2] },
        { x: 0.2, y: 0.35, z: 0.098, w: 0.38, h: 0.88, d: 0.02, color: THEME.props.advertiser.cpaBars[3] },
        { x: 1.2, y: 0.75, z: 0.098, w: 1.8, h: 0.08, d: 0.02, color: THEME.props.advertiser.screenGlow },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  advertiser_cpa_board: {
    id: "advertiser_cpa_board",
    name: "Papan Status CPA Kampanye",
    footprint: { w: 0.25, d: 2.2 },
    height: 1.4,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kaki penyangga logam
        { x: 0, y: 0, z: -0.8, w: 0.08, h: 1.4, d: 0.08, color: THEME.props.metal.industrial },
        { x: 0, y: 0, z: 0.8, w: 0.08, h: 1.4, d: 0.08, color: THEME.props.metal.industrial },
        // Papan display biru
        { x: 0, y: 0.3, z: 0, w: 0.08, h: 1.0, d: 2.0, color: THEME.props.advertiser.cpaBoard },
        // Indikator status kampanye
        { x: -0.05, y: 0.9, z: -0.4, w: 0.03, h: 0.15, d: 0.4, color: THEME.props.advertiser.cpaBars[0] },
        { x: -0.05, y: 0.9, z: 0.4, w: 0.03, h: 0.15, d: 0.4, color: THEME.props.advertiser.cpaBars[1] },
        { x: -0.05, y: 0.6, z: 0, w: 0.03, h: 0.15, d: 1.2, color: THEME.props.tech.paper },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  advertiser_desk: {
    id: "advertiser_desk",
    name: "Meja Kampanye Advertiser",
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja biru navy melengkung
        { x: 0, y: 0.38, z: 0, w: 1.4, h: 0.04, d: 0.65, color: THEME.props.advertiser.arcDesk },
        // 4 Kaki meja logam
        { x: -0.62, y: 0, z: -0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.62, y: 0, z: -0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.62, y: 0, z: 0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.62, y: 0, z: 0.26, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        // Monitor ganda
        { x: -0.28, y: 0.42, z: -0.15, w: 0.45, h: 0.28, d: 0.04, color: THEME.props.metal.dark },
        { x: 0.28, y: 0.42, z: -0.15, w: 0.45, h: 0.28, d: 0.04, color: THEME.props.metal.dark },
        // Layar monitor bercahaya
        { x: -0.28, y: 0.44, z: -0.12, w: 0.41, h: 0.24, d: 0.01, color: THEME.props.advertiser.screenGlow },
        { x: 0.28, y: 0.44, z: -0.12, w: 0.41, h: 0.24, d: 0.01, color: THEME.props.advertiser.screenDim },
        // Keyboard & mousepad
        { x: 0, y: 0.42, z: 0.1, w: 0.5, h: 0.015, d: 0.2, color: THEME.props.metal.dark },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  advertiser_trolley: {
    id: "advertiser_trolley",
    name: "Troli Server Kampanye Iklan",
    footprint: { w: 0.6, d: 0.6 },
    height: 0.8,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka troli
        { x: 0, y: 0.04, z: 0, w: 0.6, h: 0.76, d: 0.6, color: THEME.props.advertiser.trolley },
        // Rak modul server & LED
        { x: 0, y: 0.15, z: 0.22, w: 0.5, h: 0.15, d: 0.12, color: THEME.props.metal.dark },
        { x: 0, y: 0.40, z: 0.22, w: 0.5, h: 0.15, d: 0.12, color: THEME.props.metal.dark },
        { x: 0, y: 0.65, z: 0.22, w: 0.5, h: 0.10, d: 0.12, color: THEME.props.advertiser.cpaBars[0] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // TAHAP 2B: HR PROPS
  // ---------------------------------------------------------------------------
  hr_desk: {
    id: "hr_desk",
    name: "Meja Eksekutif HR",
    footprint: { w: 1.6, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Meja utama kurva magenta tua
        { x: 0, y: 0, z: 0, w: 1.6, h: 0.44, d: 0.65, color: THEME.props.hr.receptionCurved },
        // Countertop putih pastel
        { x: 0, y: 0.44, z: 0, w: 1.64, h: 0.04, d: 0.69, color: THEME.props.hr.receptionTop },
        // Monitor HR
        { x: 0, y: 0.48, z: -0.1, w: 0.5, h: 0.32, d: 0.04, color: THEME.props.metal.dark },
        { x: 0, y: 0.50, z: -0.07, w: 0.46, h: 0.28, d: 0.01, color: THEME.props.hr.portalGlow },
        // Dokumen & map berkas karyawan
        { x: 0.5, y: 0.48, z: 0.1, w: 0.25, h: 0.06, d: 0.22, color: THEME.props.hr.portalFrame },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  hr_file_shelf: {
    id: "hr_file_shelf",
    name: "Lemari Arsip Karyawan HR",
    footprint: { w: 2.4, d: 0.45 },
    height: 1.6,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka lemari kayu ungu tua
        { x: 0, y: 0, z: 0, w: 2.4, h: 1.6, d: 0.45, color: THEME.props.hr.fileShelf },
        // Baris map berkas arsip (merah, ungu, putih)
        { x: -0.6, y: 0.2, z: 0.15, w: 0.9, h: 0.3, d: 0.12, color: THEME.props.hr.waitingChair },
        { x: 0.6, y: 0.2, z: 0.15, w: 0.9, h: 0.3, d: 0.12, color: THEME.props.hr.portalGlow },
        { x: -0.6, y: 0.7, z: 0.15, w: 0.9, h: 0.3, d: 0.12, color: THEME.props.hr.receptionTop },
        { x: 0.6, y: 0.7, z: 0.15, w: 0.9, h: 0.3, d: 0.12, color: THEME.props.hr.waitingChair },
        { x: 0, y: 1.2, z: 0.15, w: 2.0, h: 0.28, d: 0.12, color: THEME.props.hr.portalFrame },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  hr_portal_kiosk: {
    id: "hr_portal_kiosk",
    name: "Kios Portal Rekrutmen",
    footprint: { w: 1.4, d: 0.3 },
    height: 1.4,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka portal ungu
        { x: 0, y: 0, z: 0, w: 1.4, h: 1.4, d: 0.2, color: THEME.props.hr.portalFrame },
        // Layar portal pelamar (dimajukan z: 0.09 d: 0.04 -> muka z=0.11 > rangka z=0.10)
        { x: 0, y: 0.4, z: 0.09, w: 1.2, h: 0.7, d: 0.04, color: THEME.props.hr.portalGlow },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  hr_arrival_portal: {
    id: "hr_arrival_portal",
    name: "Portal Kedatangan HR Voxel",
    footprint: { w: 0.15, d: 1.0 },
    height: 1.8,
    blocksWalk: false,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Tiang kiri portal (z: -0.45)
        { x: 0, y: 0, z: -0.45, w: 0.14, h: 1.8, d: 0.12, color: THEME.props.hr.portalFrame },
        // Tiang kanan portal (z: +0.45)
        { x: 0, y: 0, z: 0.45, w: 0.14, h: 1.8, d: 0.12, color: THEME.props.hr.portalFrame },
        // Ambang atas portal
        { x: 0, y: 1.68, z: 0, w: 0.14, h: 0.12, d: 1.02, color: THEME.props.hr.portalFrame },
        // Panel pendaran portal
        { x: -0.01, y: 0.1, z: 0, w: 0.04, h: 1.58, d: 0.82, color: THEME.props.hr.portalGlow },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  hr_waiting_couch: {
    id: "hr_waiting_couch",
    name: "Sofa Tamu & Pelamar HR",
    footprint: { w: 1.6, d: 0.6 },
    height: 0.46,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Dudukan sofa magenta
        { x: 0, y: 0.05, z: 0, w: 1.6, h: 0.22, d: 0.6, color: THEME.props.hr.waitingChair },
        // Bantalan sofa
        { x: 0, y: 0.27, z: 0.02, w: 1.5, h: 0.12, d: 0.54, color: THEME.props.hr.portalGlow },
        // Sandaran sofa
        { x: 0, y: 0.27, z: -0.22, w: 1.5, h: 0.24, d: 0.14, color: THEME.props.hr.waitingChair },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // TAHAP 2B: SOSMED PROPS
  // ---------------------------------------------------------------------------
  sosmed_desk: {
    id: "sosmed_desk",
    name: "Meja Kreator Sosmed",
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja kayu hangat
        { x: 0, y: 0.38, z: 0, w: 1.5, h: 0.04, d: 0.65, color: THEME.props.sosmed.desk },
        // Kaki meja
        { x: -0.65, y: 0, z: -0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.65, y: 0, z: -0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.65, y: 0, z: 0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.65, y: 0, z: 0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        // Monitor layar lebar & antarmuka suara
        { x: 0, y: 0.42, z: -0.15, w: 0.6, h: 0.32, d: 0.04, color: THEME.props.metal.dark },
        { x: 0, y: 0.44, z: -0.12, w: 0.56, h: 0.28, d: 0.01, color: THEME.props.sosmed.calendarGrid[1] },
        { x: -0.45, y: 0.42, z: 0.1, w: 0.06, h: 0.28, d: 0.06, color: THEME.props.metal.industrial },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  sosmed_green_screen: {
    id: "sosmed_green_screen",
    name: "Layar Green Screen Studio",
    footprint: { w: 2.6, d: 0.25 },
    height: 1.8,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Tiang samping
        { x: -1.25, y: 0, z: 0, w: 0.06, h: 1.8, d: 0.06, color: THEME.props.sosmed.ringStand },
        { x: 1.25, y: 0, z: 0, w: 0.06, h: 1.8, d: 0.06, color: THEME.props.sosmed.ringStand },
        // Tiang atas
        { x: 0, y: 1.76, z: 0, w: 2.56, h: 0.05, d: 0.05, color: THEME.props.sosmed.ringStand },
        // Kain green screen cerah
        { x: 0, y: 0.1, z: 0, w: 2.45, h: 1.65, d: 0.02, color: THEME.props.sosmed.greenScreen },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  sosmed_ring_light: {
    id: "sosmed_ring_light",
    name: "Lampu Ring Light Studio",
    footprint: { w: 0.5, d: 0.5 },
    height: 1.5,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Tiang tripod
        { x: 0, y: 0, z: 0, w: 0.06, h: 1.2, d: 0.06, color: THEME.props.sosmed.ringStand },
        // Kaki tripod
        { x: -0.15, y: 0, z: -0.15, w: 0.04, h: 0.25, d: 0.04, color: THEME.props.sosmed.ringStand },
        { x: 0.15, y: 0, z: -0.15, w: 0.04, h: 0.25, d: 0.04, color: THEME.props.sosmed.ringStand },
        { x: 0, y: 0, z: 0.2, w: 0.04, h: 0.25, d: 0.04, color: THEME.props.sosmed.ringStand },
        // Ring light
        { x: 0, y: 1.3, z: 0, w: 0.38, h: 0.38, d: 0.05, color: THEME.props.sosmed.ringStand },
        { x: 0, y: 1.3, z: 0.02, w: 0.32, h: 0.32, d: 0.02, color: THEME.props.sosmed.ringLight },
      ];
      return buildVoxelGeometry(boxes);
    },
    createEmissiveGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 1.3, z: 0.02, w: 0.32, h: 0.32, d: 0.02, color: THEME.props.sosmed.ringLight },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  sosmed_content_calendar: {
    id: "sosmed_content_calendar",
    name: "Papan Kalender Konten Sosmed",
    footprint: { w: 0.25, d: 2.2 },
    height: 1.3,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan latar
        { x: 0, y: 0.2, z: 0, w: 0.04, h: 1.1, d: 2.2, color: THEME.props.metal.dark },
        // Permukaan kalender
        { x: 0.03, y: 0.25, z: 0, w: 0.02, h: 1.0, d: 2.1, color: THEME.props.tech.paper },
        // Slot konten mingguan multiwarna
        { x: 0.045, y: 0.8, z: -0.6, w: 0.015, h: 0.25, d: 0.35, color: THEME.props.sosmed.calendarGrid[0] },
        { x: 0.045, y: 0.8, z: 0, w: 0.015, h: 0.25, d: 0.35, color: THEME.props.sosmed.calendarGrid[1] },
        { x: 0.045, y: 0.8, z: 0.6, w: 0.015, h: 0.25, d: 0.35, color: THEME.props.sosmed.calendarGrid[2] },
        { x: 0.045, y: 0.45, z: -0.3, w: 0.015, h: 0.25, d: 0.35, color: THEME.props.sosmed.calendarGrid[3] },
        { x: 0.045, y: 0.45, z: 0.3, w: 0.015, h: 0.25, d: 0.35, color: THEME.props.sosmed.calendarGrid[4] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  sosmed_lounge_sofa: {
    id: "sosmed_lounge_sofa",
    name: "Sofa Santai Kreator Sosmed",
    footprint: { w: 0.7, d: 2.0 },
    height: 0.5,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Dudukan oranye
        { x: 0, y: 0.05, z: 0, w: 0.7, h: 0.22, d: 2.0, color: THEME.props.sosmed.sofa },
        // Sandaran
        { x: 0.22, y: 0.27, z: 0, w: 0.18, h: 0.24, d: 1.9, color: THEME.props.sosmed.sofa },
        // Bantal
        { x: -0.05, y: 0.27, z: 0, w: 0.55, h: 0.12, d: 1.9, color: THEME.props.sosmed.calendarGrid[0] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // TAHAP 2B: CREATIVE PROPS
  // ---------------------------------------------------------------------------
  creative_drafting_desk: {
    id: "creative_drafting_desk",
    name: "Meja Gambar Desainer Kreatif",
    footprint: { w: 1.4, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan gambar miring ungu
        { x: 0, y: 0.38, z: 0, w: 1.4, h: 0.04, d: 0.65, color: THEME.props.creative.draftingDesk },
        // Kaki kayu penyangga
        { x: -0.55, y: 0, z: -0.22, w: 0.1, h: 0.38, d: 0.08, color: THEME.props.creative.easel },
        { x: 0.55, y: 0, z: -0.22, w: 0.1, h: 0.38, d: 0.08, color: THEME.props.creative.easel },
        { x: -0.55, y: 0, z: 0.22, w: 0.1, h: 0.38, d: 0.08, color: THEME.props.creative.easel },
        { x: 0.55, y: 0, z: 0.22, w: 0.1, h: 0.38, d: 0.08, color: THEME.props.creative.easel },
        // Tablet gambar digital
        { x: 0, y: 0.42, z: 0.04, w: 0.6, h: 0.02, d: 0.38, color: THEME.props.metal.dark },
        // Monitor referensi
        { x: 0.38, y: 0.42, z: -0.15, w: 0.35, h: 0.25, d: 0.04, color: THEME.props.metal.dark },
        { x: 0.38, y: 0.44, z: -0.12, w: 0.31, h: 0.21, d: 0.01, color: THEME.props.creative.artFrame2 },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  creative_easel: {
    id: "creative_easel",
    name: "Easel Lukis & Kanvas Desain",
    footprint: { w: 0.8, d: 0.8 },
    height: 1.4,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Kaki kayu tripod
        { x: -0.25, y: 0, z: 0.15, w: 0.06, h: 1.4, d: 0.06, color: THEME.props.creative.easel },
        { x: 0.25, y: 0, z: 0.15, w: 0.06, h: 1.4, d: 0.06, color: THEME.props.creative.easel },
        { x: 0, y: 0, z: -0.25, w: 0.06, h: 1.3, d: 0.06, color: THEME.props.creative.easel },
        // Tatakan kanvas
        { x: 0, y: 0.5, z: 0.12, w: 0.7, h: 0.04, d: 0.1, color: THEME.props.creative.easel },
        // Kanvas putih
        { x: 0, y: 0.54, z: 0.12, w: 0.6, h: 0.75, d: 0.03, color: THEME.props.creative.canvas },
        // Coretan warna cat
        { x: -0.1, y: 0.8, z: 0.14, w: 0.2, h: 0.2, d: 0.01, color: THEME.props.creative.paints[0] },
        { x: 0.1, y: 0.7, z: 0.14, w: 0.2, h: 0.2, d: 0.01, color: THEME.props.creative.paints[1] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  creative_paint_rack: {
    id: "creative_paint_rack",
    name: "Rak Cat & Perlengkapan Seni",
    footprint: { w: 0.45, d: 1.4 },
    height: 1.3,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka rak
        { x: 0, y: 0, z: 0, w: 0.45, h: 1.3, d: 1.4, color: THEME.props.creative.paintRack },
        // Kaleng & botol cat warna-warni
        { x: 0.05, y: 0.35, z: -0.3, w: 0.25, h: 0.18, d: 0.2, color: THEME.props.creative.paints[0] },
        { x: 0.05, y: 0.35, z: 0.3, w: 0.25, h: 0.18, d: 0.2, color: THEME.props.creative.paints[2] },
        { x: 0.05, y: 0.75, z: -0.2, w: 0.25, h: 0.18, d: 0.2, color: THEME.props.creative.paints[1] },
        { x: 0.05, y: 0.75, z: 0.2, w: 0.25, h: 0.18, d: 0.2, color: THEME.props.creative.paints[3] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  creative_art_frame: {
    id: "creative_art_frame",
    name: "Bingkai Seni Dinding",
    footprint: { w: 1.5, d: 0.15 },
    height: 1.1,
    blocksWalk: true,
    createGeometry: (options?: Record<string, unknown>) => {
      const frameColor = options?.color === "pink" ? THEME.props.creative.artFrame2 : THEME.props.creative.artFrame1;
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.4, z: 0, w: 1.5, h: 1.1, d: 0.08, color: frameColor },
        { x: 0, y: 0.45, z: 0.04, w: 1.35, h: 0.95, d: 0.02, color: THEME.props.creative.canvas },
        { x: -0.2, y: 0.6, z: 0.05, w: 0.5, h: 0.4, d: 0.01, color: THEME.props.creative.paints[4] },
        { x: 0.2, y: 0.55, z: 0.05, w: 0.4, h: 0.3, d: 0.01, color: THEME.props.creative.paints[0] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // TAHAP 2B: COPY PROPS
  // ---------------------------------------------------------------------------
  copy_desk: {
    id: "copy_desk",
    name: "Meja Kerja Copywriter",
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja merah marun
        { x: 0, y: 0.38, z: 0, w: 1.4, h: 0.04, d: 0.65, color: THEME.props.copy.triangleDesk },
        // Kaki meja
        { x: -0.62, y: 0, z: -0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.62, y: 0, z: -0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: -0.62, y: 0, z: 0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        { x: 0.62, y: 0, z: 0.25, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.metal.dark },
        // Laptop & tumpukan kertas naskah
        { x: -0.15, y: 0.42, z: 0, w: 0.45, h: 0.02, d: 0.35, color: THEME.props.metal.dark },
        { x: -0.15, y: 0.44, z: -0.14, w: 0.45, h: 0.26, d: 0.02, color: THEME.props.metal.dark },
        { x: 0.35, y: 0.42, z: 0, w: 0.3, h: 0.06, d: 0.32, color: THEME.props.tech.paper },
        // Lampu meja kecil kuning
        { x: -0.5, y: 0.42, z: -0.15, w: 0.12, h: 0.24, d: 0.12, color: THEME.props.copy.deskLamp },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  copy_bookshelf: {
    id: "copy_bookshelf",
    name: "Rak Buku Perpustakaan Copy",
    footprint: { w: 0.45, d: 2.0 },
    height: 1.7,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka lemari buku kayu anggur gelap
        { x: 0, y: 0, z: 0, w: 0.45, h: 1.7, d: 2.0, color: THEME.props.copy.bookshelf },
        // Baris buku warna-warni (spines)
        { x: 0.08, y: 0.2, z: -0.4, w: 0.24, h: 0.32, d: 0.6, color: THEME.props.copy.bookSpines[0] },
        { x: 0.08, y: 0.2, z: 0.4, w: 0.24, h: 0.32, d: 0.6, color: THEME.props.copy.bookSpines[1] },
        { x: 0.08, y: 0.65, z: -0.3, w: 0.24, h: 0.32, d: 0.7, color: THEME.props.copy.bookSpines[2] },
        { x: 0.08, y: 0.65, z: 0.4, w: 0.24, h: 0.32, d: 0.5, color: THEME.props.copy.bookSpines[3] },
        { x: 0.08, y: 1.15, z: 0, w: 0.24, h: 0.32, d: 1.4, color: THEME.props.copy.bookSpines[4] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  copy_whiteboard: {
    id: "copy_whiteboard",
    name: "Papan Brainstorming Copy",
    footprint: { w: 2.0, d: 0.15 },
    height: 1.2,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        { x: 0, y: 0.4, z: 0, w: 2.0, h: 1.2, d: 0.06, color: THEME.props.metal.industrial },
        { x: 0, y: 0.45, z: 0.03, w: 1.9, h: 1.1, d: 0.02, color: THEME.props.copy.whiteboard },
        // Sticky notes / headline blocks
        { x: -0.5, y: 0.8, z: 0.045, w: 0.3, h: 0.2, d: 0.01, color: THEME.props.copy.bookSpines[0] },
        { x: 0, y: 0.75, z: 0.045, w: 0.4, h: 0.2, d: 0.01, color: THEME.props.copy.deskLamp },
        { x: 0.5, y: 0.8, z: 0.045, w: 0.3, h: 0.2, d: 0.01, color: THEME.props.copy.bookSpines[1] },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  copy_reading_table: {
    id: "copy_reading_table",
    name: "Meja Diskusi & Mesin Tik Antik",
    footprint: { w: 1.2, d: 0.9 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Meja bundar kayu cokelat
        { x: 0, y: 0.38, z: 0, w: 1.2, h: 0.04, d: 0.9, color: THEME.props.copy.centerTable },
        // Kaki penyangga
        { x: 0, y: 0, z: 0, w: 0.25, h: 0.38, d: 0.25, color: THEME.props.copy.centerTable },
        // Mesin tik antik di tengah
        { x: 0, y: 0.42, z: 0, w: 0.4, h: 0.12, d: 0.35, color: THEME.props.copy.typewriter },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  // ---------------------------------------------------------------------------
  // TAHAP 2B: LANDING PAGE PROPS
  // ---------------------------------------------------------------------------
  landing_page_desk: {
    id: "landing_page_desk",
    name: "Meja Pengembang Landing Page",
    footprint: { w: 1.3, d: 0.6 },
    height: 0.44,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Papan meja hijau tua modern
        { x: 0, y: 0.38, z: 0, w: 1.3, h: 0.04, d: 0.6, color: THEME.props.landing_page.zigzagDesk },
        // Kaki meja
        { x: -0.58, y: 0, z: -0.24, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.landing_page.monitorRack },
        { x: 0.58, y: 0, z: -0.24, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.landing_page.monitorRack },
        { x: -0.58, y: 0, z: 0.24, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.landing_page.monitorRack },
        { x: 0.58, y: 0, z: 0.24, w: 0.08, h: 0.38, d: 0.08, color: THEME.props.landing_page.monitorRack },
        // Monitor ganda pengembang
        { x: -0.25, y: 0.42, z: -0.12, w: 0.44, h: 0.28, d: 0.03, color: THEME.props.landing_page.monitorRack },
        { x: 0.25, y: 0.42, z: -0.12, w: 0.44, h: 0.28, d: 0.03, color: THEME.props.landing_page.monitorRack },
        { x: -0.25, y: 0.44, z: -0.1, w: 0.4, h: 0.24, d: 0.01, color: THEME.props.landing_page.wireframeAccent },
        { x: 0.25, y: 0.44, z: -0.1, w: 0.4, h: 0.24, d: 0.01, color: THEME.props.tech.screenDim },
        // Mousepad aksen hijau
        { x: 0, y: 0.42, z: 0.1, w: 0.55, h: 0.015, d: 0.22, color: THEME.props.landing_page.wireframeAccent },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  landing_page_wireframe_board: {
    id: "landing_page_wireframe_board",
    name: "Papan Wireframe & Alur UI/UX",
    footprint: { w: 0.25, d: 2.2 },
    height: 1.4,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Bingkai papan
        { x: 0, y: 0.25, z: 0, w: 0.05, h: 1.25, d: 2.2, color: THEME.props.landing_page.wireframeBoard },
        // Kartu wireframe mobile
        { x: 0.035, y: 0.7, z: -0.6, w: 0.02, h: 0.45, d: 0.3, color: THEME.props.landing_page.wireframeCards },
        { x: 0.035, y: 0.7, z: 0, w: 0.02, h: 0.45, d: 0.3, color: THEME.props.landing_page.wireframeCards },
        { x: 0.035, y: 0.7, z: 0.6, w: 0.02, h: 0.45, d: 0.3, color: THEME.props.landing_page.wireframeCards },
        // Garis panah alur hijau
        { x: 0.04, y: 0.5, z: 0, w: 0.015, h: 0.06, d: 1.6, color: THEME.props.landing_page.wireframeAccent },
      ];
      return buildVoxelGeometry(boxes);
    },
  },

  landing_page_device_rack: {
    id: "landing_page_device_rack",
    name: "Rak Uji Perangkat Responsif",
    footprint: { w: 0.45, d: 1.4 },
    height: 1.4,
    blocksWalk: true,
    createGeometry: () => {
      const boxes: VoxelBoxDef[] = [
        // Rangka rak
        { x: 0, y: 0, z: 0, w: 0.45, h: 1.4, d: 1.4, color: THEME.props.landing_page.monitorRack },
        // Perangkat uji (tablet & hp)
        { x: 0.08, y: 0.4, z: -0.3, w: 0.2, h: 0.25, d: 0.3, color: THEME.props.metal.dark },
        { x: 0.08, y: 0.4, z: 0.3, w: 0.2, h: 0.25, d: 0.3, color: THEME.props.metal.dark },
        { x: 0.08, y: 0.85, z: 0, w: 0.2, h: 0.3, d: 0.5, color: THEME.props.landing_page.wireframeAccent },
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
    propId: "riset_lab_desk",
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
    propId: "riset_lab_desk",
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
    propId: "riset_lab_desk",
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
    propId: "riset_lab_desk",
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
    propId: "ops_workstation_desk",
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
    propId: "atrium_planter",
    roomId: "atrium",
    x: 24.5,
    y: 0,
    z: 18.0,
    footprint: { w: 1.4, d: 1.4 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 23.8, maxX: 25.2, minZ: 17.3, maxZ: 18.7 },
  },
  {
    id: "atrium_bench_east",
    propId: "atrium_bench",
    roomId: "atrium",
    x: 27.2,
    y: 0,
    z: 12.5,
    footprint: { w: 0.6, d: 1.6 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 26.9, maxX: 27.5, minZ: 11.7, maxZ: 13.3 },
  },
  {
    id: "atrium_bench_west",
    propId: "atrium_bench",
    roomId: "atrium",
    x: 22.0,
    y: 0,
    z: 18.0,
    footprint: { w: 0.6, d: 1.6 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 21.7, maxX: 22.3, minZ: 17.2, maxZ: 18.8 },
  },
  // Foliage Pohon Atrium (5 pohon)
  {
    id: "atrium_tree_nw",
    propId: "voxel_tree",
    roomId: "atrium",
    x: 22.0,
    y: 0,
    z: 11.8,
    footprint: { w: 1.2, d: 1.2 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 21.4, maxX: 22.6, minZ: 11.2, maxZ: 12.4 },
  },
  {
    id: "atrium_tree_ne",
    propId: "voxel_tree",
    roomId: "atrium",
    x: 27.0,
    y: 0,
    z: 11.8,
    footprint: { w: 1.2, d: 1.2 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 26.4, maxX: 27.6, minZ: 11.2, maxZ: 12.4 },
  },
  {
    id: "atrium_tree_nc",
    propId: "voxel_tree",
    roomId: "atrium",
    x: 24.5,
    y: 0,
    z: 11.8,
    footprint: { w: 1.2, d: 1.2 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 23.9, maxX: 25.1, minZ: 11.2, maxZ: 12.4 },
  },
  {
    id: "atrium_tree_sw",
    propId: "voxel_tree",
    roomId: "atrium",
    x: 22.0,
    y: 0,
    z: 20.2,
    footprint: { w: 1.2, d: 1.2 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 21.4, maxX: 22.6, minZ: 19.6, maxZ: 20.8 },
  },
  {
    id: "atrium_tree_se",
    propId: "voxel_tree",
    roomId: "atrium",
    x: 27.0,
    y: 0,
    z: 20.2,
    footprint: { w: 1.2, d: 1.2 },
    height: 1.9,
    blocksWalk: true,
    bounds: { minX: 26.4, maxX: 27.6, minZ: 19.6, maxZ: 20.8 },
  },
  // Foliage Tanaman Pot Atrium (5 tanaman)
  {
    id: "atrium_plant_1",
    propId: "potted_plant",
    roomId: "atrium",
    x: 22.0,
    y: 0,
    z: 16.5,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 21.75, maxX: 22.25, minZ: 16.25, maxZ: 16.75 },
  },
  {
    id: "atrium_plant_2",
    propId: "potted_plant",
    roomId: "atrium",
    x: 22.0,
    y: 0,
    z: 19.5,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 21.75, maxX: 22.25, minZ: 19.25, maxZ: 19.75 },
  },
  {
    id: "atrium_plant_3",
    propId: "potted_plant",
    roomId: "atrium",
    x: 27.0,
    y: 0,
    z: 16.5,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 26.75, maxX: 27.25, minZ: 16.25, maxZ: 16.75 },
  },
  {
    id: "atrium_plant_4",
    propId: "potted_plant",
    roomId: "atrium",
    x: 27.0,
    y: 0,
    z: 17.2,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 26.75, maxX: 27.25, minZ: 16.95, maxZ: 17.45 },
  },
  {
    id: "atrium_plant_5",
    propId: "potted_plant",
    roomId: "atrium",
    x: 24.5,
    y: 0,
    z: 16.2,
    footprint: { w: 0.5, d: 0.5 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 24.25, maxX: 24.75, minZ: 15.95, maxZ: 16.45 },
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
// 2B. PENEMPATAN PROP STATIS TAHAP 2B (6 DEPARTEMEN TERSISA)
// =============================================================================

export const T2B_PLACED_PROPS: PlacedPropInstance[] = [
  // ---------------------------------------------------------------------------
  // 1. ADVERTISER (28, 0, 13, 9)
  // ---------------------------------------------------------------------------
  {
    id: "advertiser_screen_wall_north",
    propId: "advertiser_screen_wall",
    roomId: "advertiser",
    x: 34.5,
    y: 0,
    z: 0.35,
    footprint: { w: 5.0, d: 0.3 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 32.0, maxX: 37.0, minZ: 0.2, maxZ: 0.5 },
  },
  {
    id: "advertiser_cpa_board_west",
    propId: "advertiser_cpa_board",
    roomId: "advertiser",
    x: 28.3,
    y: 0,
    z: 7.0,
    footprint: { w: 0.25, d: 2.2 },
    height: 1.4,
    blocksWalk: true,
    bounds: { minX: 28.175, maxX: 28.425, minZ: 5.9, maxZ: 8.1 },
  },
  {
    id: "advertiser_desk_zeus",
    propId: "advertiser_desk",
    roomId: "advertiser",
    x: 31.5,
    y: 0,
    z: 3.8,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 30.8, maxX: 32.2, minZ: 3.475, maxZ: 4.125 },
  },
  {
    id: "advertiser_desk_artemis",
    propId: "advertiser_desk",
    roomId: "advertiser",
    x: 34.5,
    y: 0,
    z: 3.8,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 33.8, maxX: 35.2, minZ: 3.475, maxZ: 4.125 },
  },
  {
    id: "advertiser_desk_plutus",
    propId: "advertiser_desk",
    roomId: "advertiser",
    x: 37.5,
    y: 0,
    z: 3.8,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 36.8, maxX: 38.2, minZ: 3.475, maxZ: 4.125 },
  },
  {
    id: "advertiser_trolley_se",
    propId: "advertiser_trolley",
    roomId: "advertiser",
    x: 39.5,
    y: 0,
    z: 7.5,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.8,
    blocksWalk: true,
    bounds: { minX: 39.2, maxX: 39.8, minZ: 7.2, maxZ: 7.8 },
  },
  {
    id: "advertiser_plant_ne",
    propId: "potted_plant",
    roomId: "advertiser",
    x: 40.0,
    y: 0,
    z: 1.0,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 39.7, maxX: 40.3, minZ: 0.7, maxZ: 1.3 },
  },

  // ---------------------------------------------------------------------------
  // 2. HR (0, 21, 9, 4)
  // ---------------------------------------------------------------------------
  {
    id: "hr_arrival_portal_w",
    propId: "hr_arrival_portal",
    roomId: "hr",
    x: 0.18,
    y: 0,
    z: 22.5,
    footprint: { w: 0.15, d: 1.0 },
    height: 1.8,
    blocksWalk: false,
    bounds: { minX: 0.105, maxX: 0.255, minZ: 22.0, maxZ: 23.0 },
  },
  {
    id: "hr_desk_hera",
    propId: "hr_desk",
    roomId: "hr",
    x: 4.5,
    y: 0,
    z: 22.3,
    footprint: { w: 1.6, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    bounds: { minX: 3.7, maxX: 5.3, minZ: 21.975, maxZ: 22.625 },
  },
  {
    id: "hr_file_shelf_north",
    propId: "hr_file_shelf",
    roomId: "hr",
    x: 4.5,
    y: 0,
    z: 21.35,
    footprint: { w: 2.4, d: 0.45 },
    height: 1.6,
    blocksWalk: true,
    bounds: { minX: 3.3, maxX: 5.7, minZ: 21.125, maxZ: 21.575 },
  },
  {
    id: "hr_portal_kiosk_nw",
    propId: "hr_portal_kiosk",
    roomId: "hr",
    x: 1.5,
    y: 0,
    z: 21.3,
    footprint: { w: 1.4, d: 0.3 },
    height: 1.4,
    blocksWalk: true,
    bounds: { minX: 0.8, maxX: 2.2, minZ: 21.15, maxZ: 21.45 },
  },
  {
    id: "hr_waiting_couch_sw",
    propId: "hr_waiting_couch",
    roomId: "hr",
    x: 1.5,
    y: 0,
    z: 23.8,
    footprint: { w: 1.6, d: 0.6 },
    height: 0.46,
    blocksWalk: true,
    bounds: { minX: 0.7, maxX: 2.3, minZ: 23.5, maxZ: 24.1 },
  },
  {
    id: "hr_plant_ne",
    propId: "potted_plant",
    roomId: "hr",
    x: 8.2,
    y: 0,
    z: 21.6,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 7.9, maxX: 8.5, minZ: 21.3, maxZ: 21.9 },
  },

  // ---------------------------------------------------------------------------
  // 3. SOSMED (0, 27, 10, 7)
  // ---------------------------------------------------------------------------
  {
    id: "sosmed_desk_hermes",
    propId: "sosmed_desk",
    roomId: "sosmed",
    x: 5.0,
    y: 0,
    z: 31.3,
    footprint: { w: 1.5, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 4.25, maxX: 5.75, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "sosmed_green_screen_south",
    propId: "sosmed_green_screen",
    roomId: "sosmed",
    x: 4.5,
    y: 0,
    z: 33.7,
    footprint: { w: 2.6, d: 0.25 },
    height: 1.8,
    blocksWalk: true,
    bounds: { minX: 3.2, maxX: 5.8, minZ: 33.575, maxZ: 33.825 },
  },
  {
    id: "sosmed_ring_light_sw",
    propId: "sosmed_ring_light",
    roomId: "sosmed",
    x: 2.0,
    y: 0,
    z: 33.0,
    footprint: { w: 0.5, d: 0.5 },
    height: 1.5,
    blocksWalk: true,
    bounds: { minX: 1.75, maxX: 2.25, minZ: 32.75, maxZ: 33.25 },
  },
  {
    id: "sosmed_content_calendar_west",
    propId: "sosmed_content_calendar",
    roomId: "sosmed",
    x: 0.35,
    y: 0,
    z: 30.5,
    footprint: { w: 0.25, d: 2.2 },
    height: 1.3,
    blocksWalk: true,
    bounds: { minX: 0.225, maxX: 0.475, minZ: 29.4, maxZ: 31.6 },
  },
  {
    id: "sosmed_lounge_sofa_nw",
    propId: "sosmed_lounge_sofa",
    roomId: "sosmed",
    x: 1.0,
    y: 0,
    z: 28.3,
    footprint: { w: 0.7, d: 2.0 },
    height: 0.5,
    blocksWalk: true,
    bounds: { minX: 0.65, maxX: 1.35, minZ: 27.3, maxZ: 29.3 },
  },
  {
    id: "sosmed_plant_se",
    propId: "potted_plant",
    roomId: "sosmed",
    x: 8.5,
    y: 0,
    z: 33.0,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 8.2, maxX: 8.8, minZ: 32.7, maxZ: 33.3 },
  },

  // ---------------------------------------------------------------------------
  // 4. CREATIVE (11, 27, 10, 7)
  // ---------------------------------------------------------------------------
  {
    id: "creative_desk_theia",
    propId: "creative_drafting_desk",
    roomId: "creative",
    x: 13.5,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    bounds: { minX: 12.8, maxX: 14.2, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "creative_desk_lyra",
    propId: "creative_drafting_desk",
    roomId: "creative",
    x: 16.0,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    bounds: { minX: 15.3, maxX: 16.7, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "creative_desk_iris",
    propId: "creative_drafting_desk",
    roomId: "creative",
    x: 18.5,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.48,
    blocksWalk: true,
    bounds: { minX: 17.8, maxX: 19.2, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "creative_easel_nw",
    propId: "creative_easel",
    roomId: "creative",
    x: 13.0,
    y: 0,
    z: 28.2,
    footprint: { w: 0.8, d: 0.8 },
    height: 1.4,
    blocksWalk: true,
    bounds: { minX: 12.6, maxX: 13.4, minZ: 27.8, maxZ: 28.6 },
  },
  {
    id: "creative_paint_rack_se",
    propId: "creative_paint_rack",
    roomId: "creative",
    x: 20.6,
    y: 0,
    z: 33.0,
    footprint: { w: 0.45, d: 1.4 },
    height: 1.3,
    blocksWalk: true,
    bounds: { minX: 20.375, maxX: 20.825, minZ: 32.3, maxZ: 33.7 },
  },
  {
    id: "creative_art_frame_north",
    propId: "creative_art_frame",
    roomId: "creative",
    x: 13.0,
    y: 0,
    z: 27.2,
    footprint: { w: 1.5, d: 0.15 },
    height: 1.1,
    blocksWalk: true,
    bounds: { minX: 12.25, maxX: 13.75, minZ: 27.125, maxZ: 27.275 },
  },
  {
    id: "creative_plant_sw",
    propId: "potted_plant",
    roomId: "creative",
    x: 11.6,
    y: 0,
    z: 33.2,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 11.3, maxX: 11.9, minZ: 32.9, maxZ: 33.5 },
  },

  // ---------------------------------------------------------------------------
  // 5. COPY (22, 27, 10, 7)
  // ---------------------------------------------------------------------------
  {
    id: "copy_desk_clio",
    propId: "copy_desk",
    roomId: "copy",
    x: 24.5,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 23.8, maxX: 25.2, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "copy_desk_erato",
    propId: "copy_desk",
    roomId: "copy",
    x: 27.0,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 26.3, maxX: 27.7, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "copy_desk_daphne",
    propId: "copy_desk",
    roomId: "copy",
    x: 29.5,
    y: 0,
    z: 31.3,
    footprint: { w: 1.4, d: 0.65 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 28.8, maxX: 30.2, minZ: 30.975, maxZ: 31.625 },
  },
  {
    id: "copy_bookshelf_sw",
    propId: "copy_bookshelf",
    roomId: "copy",
    x: 22.4,
    y: 0,
    z: 32.8,
    footprint: { w: 0.45, d: 2.0 },
    height: 1.7,
    blocksWalk: true,
    bounds: { minX: 22.175, maxX: 22.625, minZ: 31.8, maxZ: 33.8 },
  },
  {
    id: "copy_whiteboard_north",
    propId: "copy_whiteboard",
    roomId: "copy",
    x: 24.0,
    y: 0,
    z: 27.2,
    footprint: { w: 2.0, d: 0.15 },
    height: 1.2,
    blocksWalk: true,
    bounds: { minX: 23.0, maxX: 25.0, minZ: 27.125, maxZ: 27.275 },
  },
  {
    id: "copy_reading_table_ne",
    propId: "copy_reading_table",
    roomId: "copy",
    x: 30.5,
    y: 0,
    z: 28.2,
    footprint: { w: 1.2, d: 0.9 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 29.9, maxX: 31.1, minZ: 27.75, maxZ: 28.65 },
  },
  {
    id: "copy_plant_se",
    propId: "potted_plant",
    roomId: "copy",
    x: 31.2,
    y: 0,
    z: 33.2,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 30.9, maxX: 31.5, minZ: 32.9, maxZ: 33.5 },
  },

  // ---------------------------------------------------------------------------
  // 6. LANDING PAGE (33, 27, 7, 7)
  // ---------------------------------------------------------------------------
  {
    id: "landing_page_desk_hestia",
    propId: "landing_page_desk",
    roomId: "landing_page",
    x: 35.0,
    y: 0,
    z: 28.7,
    footprint: { w: 1.3, d: 0.6 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 34.35, maxX: 35.65, minZ: 28.4, maxZ: 29.0 },
  },
  {
    id: "landing_page_desk_talos",
    propId: "landing_page_desk",
    roomId: "landing_page",
    x: 35.0,
    y: 0,
    z: 32.3,
    footprint: { w: 1.3, d: 0.6 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 34.35, maxX: 35.65, minZ: 32.0, maxZ: 32.6 },
  },
  {
    id: "landing_page_desk_themis",
    propId: "landing_page_desk",
    roomId: "landing_page",
    x: 37.0,
    y: 0,
    z: 32.3,
    footprint: { w: 1.3, d: 0.6 },
    height: 0.44,
    blocksWalk: true,
    bounds: { minX: 36.35, maxX: 37.65, minZ: 32.0, maxZ: 32.6 },
  },
  {
    id: "landing_page_wireframe_board_east",
    propId: "landing_page_wireframe_board",
    roomId: "landing_page",
    x: 39.7,
    y: 0,
    z: 29.0,
    footprint: { w: 0.25, d: 2.2 },
    height: 1.4,
    blocksWalk: true,
    bounds: { minX: 39.575, maxX: 39.825, minZ: 27.9, maxZ: 30.1 },
  },
  {
    id: "landing_page_device_rack_sw",
    propId: "landing_page_device_rack",
    roomId: "landing_page",
    x: 33.4,
    y: 0,
    z: 33.0,
    footprint: { w: 0.45, d: 1.4 },
    height: 1.4,
    blocksWalk: true,
    bounds: { minX: 33.175, maxX: 33.625, minZ: 32.3, maxZ: 33.7 },
  },
  {
    id: "landing_page_plant_ne",
    propId: "potted_plant",
    roomId: "landing_page",
    x: 38.8,
    y: 0,
    z: 27.6,
    footprint: { w: 0.6, d: 0.6 },
    height: 0.85,
    blocksWalk: true,
    bounds: { minX: 38.5, maxX: 39.1, minZ: 27.3, maxZ: 27.9 },
  },
];

// Gabungan seluruh prop yang ditempatkan (Tahap 2a + Tahap 2b)
export const ALL_PLACED_PROPS: PlacedPropInstance[] = [
  ...T2A_PLACED_PROPS,
  ...T2B_PLACED_PROPS,
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

export const PROPS_OBSTACLES: WalkObstacle[] = ALL_PLACED_PROPS
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
// 4. VALIDASI STARTUP: PENGECEKAN BUKAAN PINTU, KURSI, & BAY KOSONG
// =============================================================================

/**
 * Validasi startup (throw jika ada pelanggaran):
 * 1. Tidak ada prop blocksWalk yang menimpa area bukaan pintu (1 tile di depan dan belakang pintu).
 * 2. Tidak ada prop blocksWalk yang menimpa kursi rapat di SEAT_BY_AGENT.
 * 3. Tidak ada prop blocksWalk yang menimpa posisi duduk/kerja agen di HOME_POSITIONS.
 * 4. Seluruh bay pada FLOORPLAN.bays harus 100% kosong (tidak ada prop apapun di area bay).
 */
export function validatePropsPlacement(
  doors: FloorplanData["doors"] = FLOORPLAN.doors,
  rooms: FloorplanData["rooms"] = FLOORPLAN.rooms,
  seatByAgent: Record<string, [number, number]> = SEAT_BY_AGENT,
  homePositions: Record<string, [number, number]> = HOME_POSITIONS,
  placedProps: PlacedPropInstance[] = ALL_PLACED_PROPS,
  bays: FloorplanData["bays"] = FLOORPLAN.bays
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const prop of placedProps) {
    // 4. Cek apakah prop menempati bay manapun (harus kosong 100%)
    for (const bay of bays) {
      const bayMinX = bay.x;
      const bayMaxX = bay.x + bay.w;
      const bayMinZ = bay.z;
      const bayMaxZ = bay.z + bay.d;

      const overlapsBay = !(
        prop.bounds.maxX <= bayMinX ||
        prop.bounds.minX >= bayMaxX ||
        prop.bounds.maxZ <= bayMinZ ||
        prop.bounds.minZ >= bayMaxZ
      );

      if (overlapsBay) {
        errors.push(
          `Prop "${prop.id}" di ruangan "${prop.roomId}" menempati bay "${bay.id}" (${bay.x}, ${bay.z}, w=${bay.w}, d=${bay.d}) yang harus tetap kosong 100%!`
        );
      }
    }

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

  // 5. Validasi arah hadap seluruh 19 agen di meja kerja masing-masing (vektor kursi-ke-meja, toleransi < 20°)
  for (const [agentName, [hx, hz]] of Object.entries(homePositions)) {
    const deskPropId = AGENT_DESK_PROP_ID[agentName];
    if (!deskPropId) {
      errors.push(`Agen "${agentName}" tidak memiliki relasi meja di AGENT_DESK_PROP_ID!`);
      continue;
    }
    const deskProp = placedProps.find((p) => p.id === deskPropId);
    if (!deskProp) {
      errors.push(`Meja kerja "${deskPropId}" untuk agen "${agentName}" tidak ditemukan di placedProps!`);
      continue;
    }
    const assignedAngle = getAgentHomeFacing(agentName, placedProps);
    const dx = deskProp.x - hx;
    const dz = deskProp.z - hz;
    let expectedAngle = Math.atan2(dx, dz);
    while (expectedAngle > Math.PI) expectedAngle -= 2 * Math.PI;
    while (expectedAngle < -Math.PI) expectedAngle += 2 * Math.PI;
    let actualAngle = assignedAngle;
    while (actualAngle > Math.PI) actualAngle -= 2 * Math.PI;
    while (actualAngle < -Math.PI) actualAngle += 2 * Math.PI;
    let diff = Math.abs(actualAngle - expectedAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    const diffDeg = (diff * 180) / Math.PI;
    if (diffDeg >= 20) {
      errors.push(
        `Arah hadap agen "${agentName}" (${assignedAngle.toFixed(3)} rad) menyimpang ${diffDeg.toFixed(1)}° (harus < 20°) dari vektor kursi ke meja!`
      );
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
