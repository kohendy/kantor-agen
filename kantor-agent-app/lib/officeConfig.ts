// lib/officeConfig.ts
// Konfigurasi statis diturunkan dari Floorplan (sumber kebenaran tunggal).
// Menampung metadata ruangan, jobdesc, tool, deskripsi agent, serta posisi meja dan kursi rapat.

import { FLOORPLAN } from './stage3d/floorplan';

export interface RoomConfig {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number; // Disinkronkan dengan z floorplan untuk kompatibilitas SVG/Stage
  z: number;
  w: number;
  d: number;
  meeting?: boolean;
  desc: string;
  agents: string[];
}

export interface AgentConfig {
  role: string;
  lead?: boolean;
  tools: string[];
  desc: string;
}

export const MANAGER_AGENT_NAME = "ATLAS";
export const MANAGER_ROOM_ID = "manager";

// Deskripsi statis per ruangan
const ROOM_DESCRIPTIONS: Record<string, { desc: string; agents: string[] }> = {
  meeting: {
    desc: "Ruang rapat harian. Semua agent berkumpul untuk membahas laporan hari sebelumnya.",
    agents: [],
  },
  operasional: {
    desc: "Menyiapkan meja, peralatan kerja, dan memperluas ruangan untuk penambahan agent baru.",
    agents: ["HEPHAESTUS"],
  },
  advertiser: {
    desc: "Mengatur ad set, anggaran, dan laporan performa harian.",
    agents: ["ZEUS", "ARTEMIS", "PLUTUS"],
  },
  manager: {
    desc: "Pusat komando dan orkestrasi kantor: menerima brief CEO, merencanakan workflow, dan mendelegasikan tugas ke kepala departemen.",
    agents: [MANAGER_AGENT_NAME],
  },
  riset: {
    desc: "Mencari tahu siapa audiensnya, apa yang dipakai kompetitor, dan apa yang diminta calon pembeli.",
    agents: ["ATHENA", "ARGUS", "METIS"],
  },
  hr: {
    desc: "Menangani rekrutmen, penempatan agent, dan permintaan kapasitas tambahan tim.",
    agents: ["HERA"],
  },
  sosmed: {
    desc: "Merencanakan dan mengelola kalender konten media sosial untuk Instagram dan Threads.",
    agents: ["HERMES"],
  },
  creative: {
    desc: "Mengubah hook dan skrip menjadi video UGC dan creative statis siap tayang.",
    agents: ["THEIA", "LYRA", "IRIS"],
  },
  copy: {
    desc: "Menulis hook, skrip video, dan naskah landing page. Setiap klaim lewat review sebelum dipakai.",
    agents: ["CLIO", "ERATO", "DAPHNE"],
  },
  landing_page: {
    desc: "Menyusun, memeriksa, dan mempercepat halaman tujuan iklan.",
    agents: ["HESTIA", "THEMIS", "TALOS"],
  },
};

// Bangun ROOMS dari FLOORPLAN (hanya departemen yang ada di ROOM_DESCRIPTIONS)
export const ROOMS: RoomConfig[] = FLOORPLAN.rooms
  .filter((r) => r.id in ROOM_DESCRIPTIONS)
  .map((r) => {
    const meta = ROOM_DESCRIPTIONS[r.id];
    return {
      id: r.id,
      name: r.label.toUpperCase(),
      color: r.color,
      x: r.x,
      y: r.z, // y = z untuk 2D projection
      z: r.z,
      w: r.w,
      d: r.d,
      meeting: r.meeting,
      desc: meta.desc,
      agents: meta.agents,
    };
  });

export const AGENTS: Record<string, AgentConfig> = {
  [MANAGER_AGENT_NAME]: {
    role: "Manajer Kantor",
    lead: true,
    tools: ["database"],
    desc: "Menerima brief CEO dan mendelegasikan ke departemen. Logika perencanaan dan orkestrasi otomatis sedang dikembangkan.",
  },
  HERA: {
    role: "Kepala HR",
    lead: true,
    tools: ["database"],
    desc: "Menangani permintaan agent tambahan dan penempatan agent; logika otomatis masih dikembangkan.",
  },
  HEPHAESTUS: {
    role: "Kepala Operasional",
    lead: true,
    tools: ["database"],
    desc: "Menyiapkan meja dan memperluas ruangan untuk agent baru.",
  },
  HERMES: {
    role: "Perencana Konten Sosial Media",
    lead: true,
    tools: ["panduan gaya", "database"],
    desc: "Merencanakan kalender konten Instagram dan Threads; hasil akan melewati persetujuan.",
  },
  ATHENA: {
    role: "Koordinator Riset",
    lead: true,
    tools: ["web search", "database"],
    desc: "Memecah pertanyaan riset menjadi tugas untuk Argus dan Metis, lalu merangkum temuan untuk seluruh tim.",
  },
  ARGUS: {
    role: "Pemantau Kompetitor",
    tools: ["Meta Ad Library", "web fetch"],
    desc: "Memindai iklan dan akun kompetitor setiap pagi, lalu mencatat angle yang sedang ramai dipakai.",
  },
  METIS: {
    role: "Survei dan Data",
    tools: ["formulir survei", "spreadsheet"],
    desc: "Merancang survei waitlist, membaca jawabannya, dan mengubahnya jadi rekomendasi.",
  },
  CLIO: {
    role: "Editor Copy",
    lead: true,
    tools: ["panduan gaya", "database"],
    desc: "Menjaga nada tulisan tetap sama di semua kanal dan menyetujui copy sebelum naik tayang.",
  },
  ERATO: {
    role: "Penulis Landing Page",
    tools: ["pengolah kata", "database"],
    desc: "Menulis headline, manfaat, dan FAQ halaman penjualan. Klaim berisiko ditandai untuk review manusia.",
  },
  DAPHNE: {
    role: "Hook dan Skrip",
    tools: ["pengolah kata", "riset audiens"],
    desc: "Membuat hook iklan, skrip video UGC, dan caption creative statis dari angle yang dipilih tim riset.",
  },
  HESTIA: {
    role: "Penanggung Jawab LP",
    lead: true,
    tools: ["pembuat halaman", "database"],
    desc: "Mengatur struktur halaman, urutan bagian, dan jadwal terbit landing page.",
  },
  THEMIS: {
    role: "QA dan Kepatuhan",
    tools: ["daftar periksa klaim", "web fetch"],
    desc: "Memeriksa klaim, janji hasil, dan syarat iklan sebelum halaman dipublikasikan.",
  },
  TALOS: {
    role: "Performa Teknis",
    tools: ["uji kecepatan", "kompresi gambar"],
    desc: "Mengukur waktu muat dan memastikan formulir berjalan baik di layar ponsel.",
  },
  ZEUS: {
    role: "Kepala Iklan",
    lead: true,
    tools: ["database"],
    desc: "Menetapkan rencana uji, target biaya, dan prioritas ad set. Tidak mengubah akun iklan sendiri.",
  },
  ARTEMIS: {
    role: "Pengelola Kampanye dan Uji",
    tools: ["Meta Ads lewat Pipeboard (rencana)"],
    desc: "Membuat campaign, ad set, dan varian iklan uji sesuai rencana Zeus. Tidak mengubah budget langsung.",
  },
  PLUTUS: {
    role: "Anggaran dan Laporan",
    tools: ["Meta Ads lewat Pipeboard (rencana)", "database"],
    desc: "Mengawasi biaya dan sisa anggaran, mengusulkan jeda iklan boros, dan mengirim laporan harian.",
  },
  THEIA: {
    role: "Direktur Creative",
    lead: true,
    tools: ["papan brief", "database"],
    desc: "Memilih angle yang diproduksi, menjaga arah visual, dan menyetujui creative.",
  },
  LYRA: {
    role: "Video UGC",
    tools: ["editor video", "template teks layar"],
    desc: "Mengedit video UGC format 9:16 dari skrip Daphne, termasuk beberapa versi untuk diuji.",
  },
  IRIS: {
    role: "Creative Statis",
    tools: ["template desain", "kompresi gambar"],
    desc: "Membuat creative statis rasio 4:5 dan story, lengkap dengan variasi warna untuk uji A/B.",
  },
};

// Posisi meja rumah (Home Desks) 19 agent
// Koordinat absolut dunia (x, z) di dalam ruangan masing-masing
function computeHomePositions(): Record<string, [number, number]> {
  return {
    // MANAGER (0, 11, 9, 9): ATLAS duduk di x=4.5, z=15.0 menghadap meja di selatan (z=15.5)
    [MANAGER_AGENT_NAME]: [4.5, 15.0],

    // HR (0, 21, 9, 4): HERA
    HERA: [4.5, 23.0],

    // OPERASIONAL (17, 0, 9, 9): HEPHAESTUS
    HEPHAESTUS: [21.5, 4.5],

    // SOSMED (0, 27, 10, 7): HERMES
    HERMES: [5.0, 30.5],

    // RISET (11, 11, 10, 8): ATHENA, ARGUS, METIS
    ATHENA: [14.0, 14.0],
    ARGUS: [18.0, 14.0],
    METIS: [16.0, 16.5],

    // ADVERTISER (28, 0, 13, 9): ZEUS, ARTEMIS, PLUTUS
    ZEUS: [31.5, 4.5],
    ARTEMIS: [34.5, 4.5],
    PLUTUS: [37.5, 4.5],

    // CREATIVE (11, 27, 10, 7): THEIA, LYRA, IRIS
    THEIA: [13.5, 30.5],
    LYRA: [16.0, 30.5],
    IRIS: [18.5, 30.5],

    // COPY (22, 27, 10, 7): CLIO, ERATO, DAPHNE
    CLIO: [24.5, 30.5],
    ERATO: [27.0, 30.5],
    DAPHNE: [29.5, 30.5],

    // LANDING PAGE (33, 27, 7, 7): HESTIA, THEMIS, TALOS
    HESTIA: [35.0, 29.5],
    THEMIS: [37.0, 31.5],
    TALOS: [35.0, 31.5],
  };
}

export const HOME_POSITIONS = computeHomePositions();

// Kursi Meeting (19 kursi) mengelilingi meja panjang di dalam Ruang Meeting (0, 0, 15, 9).
// Koordinat absolut dunia (x, z). Meja berada di tengah (x: 3.5..11.5, z: 3.5..5.5).
export const SEAT_BY_AGENT: Record<string, [number, number]> = {
  // Pimpinan rapat (Manager ATLAS) di kepala barat meja
  [MANAGER_AGENT_NAME]: [2.5, 4.5],

  // Baris utara meja (z = 2.6)
  ATHENA: [4.0, 2.6],
  ARGUS: [5.0, 2.6],
  METIS: [6.0, 2.6],
  CLIO: [7.0, 2.6],
  ERATO: [8.0, 2.6],
  DAPHNE: [9.0, 2.6],
  HESTIA: [10.0, 2.6],
  THEMIS: [11.0, 2.6],

  // Baris selatan meja (z = 6.4)
  TALOS: [4.0, 6.4],
  ZEUS: [5.0, 6.4],
  ARTEMIS: [6.0, 6.4],
  PLUTUS: [7.0, 6.4],
  THEIA: [8.0, 6.4],
  LYRA: [9.0, 6.4],
  IRIS: [10.0, 6.4],
  HERA: [11.0, 6.4],

  // Kepala timur meja (x = 12.5)
  HEPHAESTUS: [12.5, 3.9],
  HERMES: [12.5, 5.1],
};

// Titik overflow deterministik di sepanjang dinding ruang Meeting (0, 0, 15, 9)
export const OVERFLOW_MEETING_SEATS: [number, number][] = [
  [1.5, 1.5],
  [13.5, 1.5],
  [1.5, 7.5],
  [13.5, 7.5],
  [7.5, 1.5],
  [7.5, 7.5],
  [4.5, 1.5],
  [10.5, 1.5],
];

export function getOverflowSeat(index: number): [number, number] {
  return OVERFLOW_MEETING_SEATS[index % OVERFLOW_MEETING_SEATS.length];
}

export const AGENT_RENDER_ORDER = Object.keys(AGENTS).sort(
  (a, b) =>
    HOME_POSITIONS[a][0] + HOME_POSITIONS[a][1] - (HOME_POSITIONS[b][0] + HOME_POSITIONS[b][1])
);

// Validasi startup: seluruh 19 agent wajib punya kursi rapat di SEAT_BY_AGENT
for (const name of AGENT_RENDER_ORDER) {
  if (!SEAT_BY_AGENT[name]) {
    throw new Error(
      `[officeConfig] Konfigurasi kursi rapat hilang: agen "${name}" tidak memiliki entri di SEAT_BY_AGENT!`
    );
  }
}

// Validasi startup: seluruh 19 agent wajib punya posisi rumah di HOME_POSITIONS
for (const name of AGENT_RENDER_ORDER) {
  if (!HOME_POSITIONS[name]) {
    throw new Error(
      `[officeConfig] Konfigurasi meja rumah hilang: agen "${name}" tidak memiliki entri di HOME_POSITIONS!`
    );
  }
}

export function colorOfAgent(name: string): string {
  for (const room of ROOMS) {
    if (room.agents.includes(name)) return room.color;
  }
  return "#e8e9ff";
}

export function roomOfAgent(name: string): RoomConfig | undefined {
  return ROOMS.find((room) => room.agents.includes(name));
}

export const STATUS_LABEL: Record<string, string> = {
  working: "Bekerja",
  review: "Menunggu review",
  idle: "Idle",
};

export const SLOTS: [number, number][] = [
  [1.3, 2.0],
  [3.4, 1.5],
  [2.6, 3.9],
];

