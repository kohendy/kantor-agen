// lib/departments.ts
// Katalog Departemen Tetap (Single Source of Truth)
// Digunakan oleh Manajer ATLAS, antrean brief, dan UI tanpa duplikasi hard-code.

export interface DepartmentInfo {
  id: string;
  nama: string;
  tersedia: boolean;
  dapat_didelegasikan: boolean;
  ruangan: string;
  kepala_agen: string;
  deskripsi: string;
}

export const DEPARTEMEN_KATALOG: Record<string, DepartmentInfo> = {
  riset: {
    id: "riset",
    nama: "Riset Pasar & Kompetitor",
    tersedia: true,
    dapat_didelegasikan: true,
    ruangan: "riset",
    kepala_agen: "ATHENA",
    deskripsi: "Riset kompetitor, data pasar, profil audiens, dan sintesis sudut pandang kampanye (pipeline aktif).",
  },
  copy_creative: {
    id: "copy_creative",
    nama: "Copywriting & Creative",
    tersedia: false,
    dapat_didelegasikan: true,
    ruangan: "creative",
    kepala_agen: "CLIO",
    deskripsi: "Penyusunan hook, naskah iklan, dan panduan visual kreatif (tahap lanjutan).",
  },
  landing_page: {
    id: "landing_page",
    nama: "Landing Page",
    tersedia: false,
    dapat_didelegasikan: true,
    ruangan: "landing_page",
    kepala_agen: "HESTIA",
    deskripsi: "Struktur penawaran, mockup, dan optimasi konversi halaman landas (tahap lanjutan).",
  },
  ads: {
    id: "ads",
    nama: "Periklanan (Ads)",
    tersedia: false,
    dapat_didelegasikan: true,
    ruangan: "advertiser",
    kepala_agen: "ZEUS",
    deskripsi: "Setup ad set, alokasi anggaran, dan pemantauan performa CPA (tahap lanjutan).",
  },
  sosmed: {
    id: "sosmed",
    nama: "Media Sosial",
    tersedia: false,
    dapat_didelegasikan: true,
    ruangan: "sosmed",
    kepala_agen: "HERMES",
    deskripsi: "Penyusunan kalender konten dan komunikasi media sosial (tahap lanjutan).",
  },
  hr: {
    id: "hr",
    nama: "HR (Human Resources)",
    tersedia: false,
    dapat_didelegasikan: false,
    ruangan: "hr",
    kepala_agen: "HERA",
    deskripsi: "Pengelolaan agen dan rekrutmen. Bukan departemen kerja kampanye.",
  },
  operasional: {
    id: "operasional",
    nama: "Operasional Kantor",
    tersedia: false,
    dapat_didelegasikan: false,
    ruangan: "operasional",
    kepala_agen: "HEPHAESTUS",
    deskripsi: "Fasilitas dan kesiapan meja kerja. Bukan departemen kerja kampanye.",
  },
};

// Batas standar periklanan sesuai aturan kerja M1 (tidak boleh diubah Manager)
export const BATAS_IKLAN_STANDAR = {
  target_cpa: 30000,
  min_spend_sebelum_menilai: 150000,
  plafon_harian: 50000,
  kenaikan_maksimal_persen: 20,
} as const;

export function getDelegableDepartments(): DepartmentInfo[] {
  return Object.values(DEPARTEMEN_KATALOG).filter((d) => d.dapat_didelegasikan);
}

export function isDepartmentAvailable(id: string): boolean {
  return Boolean(DEPARTEMEN_KATALOG[id]?.tersedia);
}

export function isDelegableDepartment(id: string): boolean {
  return Boolean(DEPARTEMEN_KATALOG[id]?.dapat_didelegasikan);
}
