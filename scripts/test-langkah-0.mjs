// scripts/test-langkah-0.mjs
// Uji Langkah 0 untuk Verifikasi ATLAS Workflow JFuHPQf8cQZkagh0:
// A) Aturan budget ketat (<= 50.000, penegakan plafon jika > 50.000, tanpa budget -> mengikuti plafon)
// B) Alasan spesifik per departemen (tanpa templat lama, tidak kosong, tidak identik)

const ATLAS_WEBHOOK_URL = "https://n8n-pst7ppfu6txm.jkt2.sumopod.my.id/webhook/atlas-manager";

async function callAtlas(payload) {
  const start = Date.now();
  const res = await fetch(ATLAS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const durationMs = Date.now() - start;
  const status = res.status;
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = await res.text();
  }
  return { status, data, durationMs };
}

async function run() {
  console.log("===============================================================");
  console.log("   UJI LANGKAH 0: ATURAN BUDGET & ALASAN SPESIFIK DEPARTEMEN   ");
  console.log("===============================================================\n");

  const tests = [
    {
      id: "UJI_1",
      name: "Uji 1: Brief lengkap kampanye penuh (budget > plafon di brief awal)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Peluncuran Brand Sepatu Lokal Ramah Lingkungan",
        brief: {
          produk: "Sneakers kasual daur ulang plastik laut sol karet alam Rp450.000",
          target_audiens: "Dewasa muda perkotaan 20-35 tahun peduli lingkungan",
          tujuan: "Kampanye peluncuran penuh mulai dari riset pasar hingga iklan konversi",
          budget_harian: 100000,
          catatan_bebas: "Mulai dari awal sampai siap iklan konversi"
        }
      }
    },
    {
      id: "UJI_5",
      name: "Uji 5: Mode manager_bebas (TIDAK BOLEH BERTANYA, alasan spesifik tiap dept)",
      payload: {
        mode: "manager_bebas",
        putaran_tanya: 0,
        judul: "Peluncuran Suplemen Vitamin D3 K2 Alami",
        brief: {
          produk: "Suplemen tetes Vitamin D3 + K2 organik",
          target_audiens: "Keluarga muda dan pekerja kantoran",
          tujuan: "Meningkatkan penjualan dan brand awareness",
          budget_harian: 50000,
          catatan_bebas: "Terserah manajer mau bagaimana alurnya"
        }
      }
    },
    {
      id: "UJI_6",
      name: "Uji 6: Mode diarahkan brief ambigu putaran 0 (Wajib TANYA tepat 1 pertanyaan)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Brief Penjualan Produk Baru",
        brief: {
          produk: "Mau jualan produk baru",
          target_audiens: "",
          tujuan: "Tolong buatkan kampanye",
          budget_harian: null,
          catatan_bebas: "Tolong segera"
        }
      }
    },
    {
      id: "UJI_7",
      name: "Uji 7: Mode diarahkan brief ambigu putaran 2 (Maksimal putaran tercapai -> Wajib DELEGASI)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 2,
        judul: "Brief Penjualan Produk Baru (Putaran 2)",
        brief: {
          produk: "Mau jualan produk baru",
          target_audiens: "",
          tujuan: "Tolong buatkan kampanye",
          budget_harian: null,
          catatan_bebas: "Tolong segera"
        }
      }
    },
    {
      id: "UJI_BARU_1",
      name: "Uji Baru (i): Permintaan budget Rp200.000 (> plafon Rp50.000)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Kampanye Skincare Pria Anti Jerawat",
        brief: {
          produk: "Serum Wajah Pria Khusus Kulit Berminyak",
          target_audiens: "Pria usia 18-28 tahun",
          tujuan: "Akuisisi pelanggan baru lewat ads",
          budget_harian: 200000,
          catatan_bebas: "Anggaran harian tolong dialokasikan Rp200.000 per hari"
        }
      }
    },
    {
      id: "UJI_BARU_2",
      name: "Uji Baru (ii): Brief TANPA budget (budget null / tidak disebutkan)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Kampanye Buku Cerita Anak Bilingual",
        brief: {
          produk: "Seri Cerita Bergambar Edukasi Anak Usia 3-7 Tahun",
          target_audiens: "Ibu muda usia 25-35 tahun",
          tujuan: "Validasi pasar dan peluncuran bertahap",
          budget_harian: null,
          catatan_bebas: "Jalankan riset dan materi kreatif terlebih dahulu"
        }
      }
    }
  ];

  const results = [];

  for (const t of tests) {
    console.log(`>>> Menjalankan [${t.id}] ${t.name}...`);
    const resp = await callAtlas(t.payload);
    console.log(`    Status: ${resp.status} (${resp.durationMs}ms)`);
    console.log(`    Output Mentah:`);
    console.log(JSON.stringify(resp.data, null, 2));
    console.log("-------------------------------------------------------------------\n");
    results.push({ id: t.id, name: t.name, response: resp.data });
  }

  return results;
}

run().catch(console.error);
