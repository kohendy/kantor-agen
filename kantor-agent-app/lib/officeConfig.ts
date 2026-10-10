// Konfigurasi statis: tampilan, ruangan, jobdesc, tool, dan deskripsi agent.
// Ini sengaja tidak diambil dari database - sesuai prototipe, teks jobdesc/tool/desc
// tetap jadi konfigurasi statis di kode. Yang dinamis dari Supabase hanya status,
// peran singkat, dan ruangan (dipakai untuk validasi/fallback), serta Mission Log.

export interface RoomConfig {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
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

export const ROOMS: RoomConfig[] = [
  {
    id: "riset",
    name: "RISET",
    color: "#f5a623",
    x: 0,
    y: 0,
    desc: "Mencari tahu siapa audiensnya, apa yang dipakai kompetitor, dan apa yang diminta calon pembeli.",
    agents: ["ATHENA", "ARGUS", "METIS"],
  },
  {
    id: "copy",
    name: "COPY",
    color: "#ff4fa3",
    x: 12,
    y: 0,
    desc: "Menulis hook, skrip video, dan naskah landing page. Setiap klaim lewat review sebelum dipakai.",
    agents: ["CLIO", "ERATO", "DAPHNE"],
  },
  {
    id: "lp",
    name: "LANDING PAGE",
    color: "#2ee6a8",
    x: 0,
    y: 6,
    desc: "Menyusun, memeriksa, dan mempercepat halaman tujuan iklan.",
    agents: ["HESTIA", "THEMIS", "TALOS"],
  },
  {
    id: "ads",
    name: "ADVERTISER",
    color: "#29c7ff",
    x: 6,
    y: 6,
    desc: "Mengatur ad set, anggaran, dan laporan performa harian.",
    agents: ["ZEUS", "ARTEMIS", "PLUTUS"],
  },
  {
    id: "creative",
    name: "CREATIVE",
    color: "#a78bfa",
    x: 12,
    y: 6,
    desc: "Mengubah hook dan skrip menjadi video UGC dan creative statis siap tayang.",
    agents: ["THEIA", "LYRA", "IRIS"],
  },
  {
    id: "meeting",
    name: "MEETING H+1",
    color: "#b7f34a",
    x: 6,
    y: 0,
    meeting: true,
    desc: "Ruang rapat harian. Semua agent berkumpul untuk membahas laporan hari sebelumnya.",
    agents: [],
  },
];

export const AGENTS: Record<string, AgentConfig> = {
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
    desc: "Menulis headline, manfaat, dan FAQ halaman penjualan. Klaim yang berisiko ditandai untuk review manusia.",
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
    desc: "Menetapkan rencana uji, target biaya, dan prioritas ad set. Menyaring usulan dari Artemis dan Plutus, menyelesaikan bentrokan, lalu mengajukan yang layak ke manusia. Tidak mengubah akun iklan sendiri.",
  },
  ARTEMIS: {
    role: "Pengelola Kampanye dan Uji",
    tools: ["Meta Ads lewat Pipeboard (rencana)"],
    desc: "Membuat campaign, ad set, dan varian iklan uji sesuai rencana Zeus (selalu dibuat nonaktif), membandingkan hasil uji, menganalisis performa, dan mengganti materi iklan lalu menganalisisnya ulang. Tidak mengubah budget atau menjeda iklan.",
  },
  PLUTUS: {
    role: "Anggaran dan Laporan",
    tools: ["Meta Ads lewat Pipeboard (rencana)", "database"],
    desc: "Mengawasi biaya dan sisa anggaran, mengusulkan jeda untuk iklan boros dan kenaikan budget untuk yang terbukti dalam plafon, serta mengirim laporan harian. Tidak membuat atau mengubah materi iklan.",
  },
  THEIA: {
    role: "Direktur Creative",
    lead: true,
    tools: ["papan brief", "database"],
    desc: "Memilih angle yang diproduksi, menjaga arah visual, dan menyetujui creative sebelum masuk ke tim iklan.",
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

export const SLOTS: [number, number][] = [
  [1.3, 2.0],
  [3.4, 1.5],
  [2.6, 3.9],
];

// Posisi duduk di ruang meeting, relatif terhadap sudut ruangan.
export const SEATS: [number, number][] = [
  [1.0, 0.6], [2.0, 0.6], [3.0, 0.6], [4.0, 0.6], [1.0, 1.4], [2.5, 1.4], [4.0, 1.4],
  [0.4, 2.6], [4.6, 2.6], [1.0, 4.2], [2.0, 4.2], [3.0, 4.2], [4.0, 4.2], [1.5, 4.8], [3.5, 4.8],
];

// Posisi "rumah" tiap agent di ruangannya, dihitung sekali dari konfigurasi statis
// (sama seperti HOME yang dibangun saat render SVG pada prototipe).
export function computeHomePositions(): Record<string, [number, number]> {
  const home: Record<string, [number, number]> = {};
  const sortedRooms = ROOMS.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
  sortedRooms.forEach((room) => {
    room.agents.forEach((name, i) => {
      const slot = SLOTS[i];
      home[name] = [room.x + slot[0], room.y + slot[1]];
    });
  });
  return home;
}

export const HOME_POSITIONS = computeHomePositions();

export const AGENT_RENDER_ORDER = Object.keys(AGENTS).sort(
  (a, b) =>
    HOME_POSITIONS[a][0] + HOME_POSITIONS[a][1] - (HOME_POSITIONS[b][0] + HOME_POSITIONS[b][1])
);

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
