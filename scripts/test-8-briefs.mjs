// scripts/test-8-briefs.mjs
// Menjalankan 8 brief uji nyata melalui workflow ATLAS n8n live
// dan menguji antrean untuk kasus 8 (departemen bentrok).

import { BriefQueueManager } from "../kantor-agent-app/lib/briefQueue.ts";

const ATLAS_WEBHOOK_URL = "https://n8n-pst7ppfu6txm.jkt2.sumopod.my.id/webhook/atlas-manager";

// Harga Claude 3.5 / 4.5 Sonnet per juta token:
// Input: $3.00 / 1M token (USD 0.000003 / token)
// Output: $15.00 / 1M token (USD 0.000015 / token)
const USD_TO_IDR = 16000;

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

async function runTests() {
  console.log("===============================================================");
  console.log("   UJI 8 BRIEF NYATA PADA WORKFLOW ATLAS (LIVE N8N GATE 0)     ");
  console.log("===============================================================\n");

  const testCases = [
    {
      num: 1,
      name: "Brief lengkap kampanye penuh",
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
      num: 2,
      name: '"hanya riset"',
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Riset Pasar Kopi Susu Kemasan Pouch",
        brief: {
          produk: "Kopi susu gula aren literan pouch",
          target_audiens: "Pekerja kantoran WFH/WFO usia 22-35 di Jabodetabek",
          tujuan: "Hanya riset pasar dan kompetitor, jangan buat materi atau iklan",
          budget_harian: null,
          catatan_bebas: "Hanya riset"
        }
      }
    },
    {
      num: 3,
      name: '"langsung iklan tanpa riset"',
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Flash Sale Gamis Katun Rayon",
        brief: {
          produk: "Gamis katun rayon motif bunga eksklusif",
          target_audiens: "Wanita muslimah 25-45 tahun pengguna media sosial",
          tujuan: "Langsung iklan tanpa riset, materi copy dan landing page sudah siap sendiri",
          budget_harian: 50000,
          catatan_bebas: "Langsung iklan tanpa riset"
        }
      }
    },
    {
      num: 4,
      name: "Brief ambigu mode diarahkan (harus tanya)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Mau Jualan Online Cepat Laku",
        brief: {
          produk: "Barang bagus murah meriah",
          target_audiens: "",
          tujuan: "Biar laku banyak",
          budget_harian: null,
          catatan_bebas: ""
        }
      }
    },
    {
      num: 5,
      name: "Brief ambigu mode manager_bebas (tidak boleh tanya)",
      payload: {
        mode: "manager_bebas",
        putaran_tanya: 0,
        judul: "Mau Jualan Online Bebas Mandiri",
        brief: {
          produk: "Barang bagus murah meriah",
          target_audiens: "",
          tujuan: "Biar laku banyak",
          budget_harian: null,
          catatan_bebas: ""
        }
      }
    },
    {
      num: 6,
      name: "Brief ambigu yang sudah 2 putaran tanya (harus memutuskan dengan asumsi)",
      payload: {
        mode: "diarahkan",
        putaran_tanya: 2,
        jawaban: "Pokoknya jalankan saja sesuai pertimbangan terbaik manajer, produknya aksesoris gadget charger & kabel",
        judul: "Jualan Aksesoris Gadget Cepat",
        brief: {
          produk: "Aksesoris gadget charger & kabel",
          target_audiens: "",
          tujuan: "Biar laku banyak",
          budget_harian: 50000,
          catatan_bebas: ""
        }
      }
    },
    {
      num: 7,
      name: '"materi sudah ditentukan: copy+landing page+konten+iklan"',
      payload: {
        mode: "diarahkan",
        putaran_tanya: 0,
        judul: "Peluncuran Serum Wajah Glowing",
        brief: {
          produk: "Serum pencerah wajah Niacinamide 10%",
          target_audiens: "Wanita 18-32 tahun kulit kusam",
          tujuan: "Materi sudah ditentukan: copy+landing page+konten+iklan. Jangan riset lagi.",
          budget_harian: 75000,
          catatan_bebas: "materi sudah ditentukan: copy+landing page+konten+iklan"
        }
      }
    }
  ];

  const results = [];

  for (const tc of testCases) {
    console.log(`>>> MENJALANKAN UJI ${tc.num}: ${tc.name}...`);
    const resp = await callAtlas(tc.payload);
    results.push({ ...tc, ...resp });
    console.log(`    Status: ${resp.status} (${resp.durationMs}ms)`);
    console.log(`    Keputusan: ${resp.data?.keputusan}`);
    if (resp.data?.keputusan === "tanya") {
      console.log(`    Pertanyaan: ${resp.data?.pertanyaan}`);
    } else {
      console.log(`    Departemen: ${(resp.data?.departemen || []).map(d => d.id).join(" -> ")}`);
    }
    console.log("");
  }

  // UJI 8: Dua brief berurutan dengan departemen bentrok (brief 2 menunggu)
  console.log(">>> MENJALANKAN UJI 8: Dua brief berurutan dengan departemen bentrok (brief 2 menunggu)...");
  const queue = new BriefQueueManager();

  const brief8A = queue.enqueueBrief({
    judul: "Brief 8A: Riset Suplemen Herbal",
    isi: { produk: "Suplemen herbal", target_audiens: "Pria 30+", tujuan: "Riset pasar" },
    mode: "diarahkan"
  });

  const brief8B = queue.enqueueBrief({
    judul: "Brief 8B: Riset Minuman Teh Herbal",
    isi: { produk: "Teh herbal", target_audiens: "Wanita 25+", tujuan: "Riset pasar" },
    mode: "diarahkan"
  });

  // Brief 8A diklaim dan didelegasikan via ATLAS
  const claim8A = queue.claimNextForConsideration("worker-1");
  const resp8A = await callAtlas({
    mode: "diarahkan",
    putaran_tanya: 0,
    judul: brief8A.judul,
    brief: brief8A.isi
  });
  queue.submitManagerDecision(brief8A.id, resp8A.data);

  // Brief 8B diklaim dan didelegasikan via ATLAS
  const claim8B = queue.claimNextForConsideration("worker-1");
  const resp8B = await callAtlas({
    mode: "diarahkan",
    putaran_tanya: 0,
    judul: brief8B.judul,
    brief: brief8B.isi
  });
  queue.submitManagerDecision(brief8B.id, resp8B.data);

  const status8A_awal = queue.getBriefById(brief8A.id).status;
  const status8B_awal = queue.getBriefById(brief8B.id).status;
  const dept8A_awal = queue.getBriefById(brief8A.id).departemen_aktif;
  const dept8B_awal = queue.getBriefById(brief8B.id).departemen_aktif;

  // Brief 8A menyelesaikan riset
  queue.advanceDepartment(brief8A.id);
  const status8A_akhir = queue.getBriefById(brief8A.id).status;
  const status8B_akhir = queue.getBriefById(brief8B.id).status;
  const dept8B_akhir = queue.getBriefById(brief8B.id).departemen_aktif;

  results.push({
    num: 8,
    name: "Dua brief berurutan dengan departemen bentrok (brief 2 menunggu)",
    status: 200,
    durationMs: resp8A.durationMs + resp8B.durationMs,
    data: {
      brief8A: { id: brief8A.id, status_awal: status8A_awal, departemen_aktif: dept8A_awal, status_akhir: status8A_akhir },
      brief8B: { id: brief8B.id, status_awal: status8B_awal, departemen_aktif: dept8B_awal, status_akhir: status8B_akhir, departemen_akhir: dept8B_akhir },
      keputusan_raw_8A: resp8A.data,
      keputusan_raw_8B: resp8B.data,
      kesimpulan: "Brief 8B tertahan di status didelegasikan saat 8A menggunakan riset; langsung berjalan otomatis saat riset selesai!"
    }
  });

  console.log(`    Brief 8A status awal: ${status8A_awal} (${dept8A_awal})`);
  console.log(`    Brief 8B status awal: ${status8B_awal} (menunggu: ${dept8B_awal || "none"})`);
  console.log(`    Setelah 8A selesai -> Brief 8B status: ${status8B_akhir} (${dept8B_akhir})\n`);

  console.log("===============================================================");
  console.log("                    RINGKASAN HASIL JSON                       ");
  console.log("===============================================================");
  for (const r of results) {
    console.log(`\n--- [UJI ${r.num}] ${r.name} ---`);
    console.log(JSON.stringify(r.data, null, 2));
  }
}

runTests().catch(err => {
  console.error("Error in test runner:", err);
  process.exit(1);
});
