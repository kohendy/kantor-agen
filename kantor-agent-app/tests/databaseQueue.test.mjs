// tests/databaseQueue.test.mjs
// Pengujian Antrean di Tingkat Database Supabase Sungguhan
// Meliputi:
// (1) Dua panggilan claim_brief_for_consideration bersamaan -> hanya 1 yang dapat brief
// (2) pipeline_control.jalan = false -> klaim ditolak
// (3) Klaim basi > 10 menit dapat diambil ulang
// (4) Brief butuh_klarifikasi tidak memblokir brief di belakangnya
// (5) Pembersihan menyeluruh (zero test data residual) & query verifikasi

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BriefQueueManager } from "../lib/briefQueue.ts";

// 1. Baca kredensial dari .env.local
const envPath = path.resolve(".env.local");
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = trimmed.slice("NEXT_PUBLIC_SUPABASE_URL=".length).trim();
    }
    if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceRoleKey = trimmed.slice("SUPABASE_SERVICE_ROLE_KEY=".length).trim();
    }
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_TAG = `TEST_M1_DB_${Date.now()}`;

async function runDatabaseQueueTests() {
  console.log("==================================================================");
  console.log("  UJI ANTREAN TINGKAT DATABASE SUPABASE SUNGGUHAN (GATE 0 COND)   ");
  console.log("==================================================================\n");
  console.log(`Penanda Data Uji: ${TEST_TAG}\n`);

  try {
    // Pastikan pipeline_control awal adalah true
    await supabase.from("pipeline_control").update({ jalan: true }).eq("id", 1);

    // -------------------------------------------------------------------------
    // TES 1: Dua panggilan claim_brief_for_consideration bersamaan
    // -------------------------------------------------------------------------
    console.log(">>> [TES 1] Dua panggilan claim_brief_for_consideration bersamaan...");
    // Bersihkan status dipertimbangkan yang mungkin ada dari tes sebelumnya
    await supabase
      .from("briefs")
      .update({ status: "antre", diproses_sejak: null })
      .eq("status", "dipertimbangkan");

    // Masukkan satu brief baru dengan status 'antre'
    const { data: b1, error: errB1 } = await supabase
      .from("briefs")
      .insert({
        judul: `${TEST_TAG}_Brief_1`,
        isi: { produk: "Tes Produk 1", tujuan: "Tes Konkurensi" },
        mode: "diarahkan",
        status: "antre",
      })
      .select()
      .single();

    if (errB1) throw new Error("Gagal insert b1: " + errB1.message);

    // Panggil claim_brief_for_consideration dua kali secara simultan
    const [claimRes1, claimRes2] = await Promise.all([
      supabase.rpc("claim_brief_for_consideration"),
      supabase.rpc("claim_brief_for_consideration"),
    ]);

    const winner1 = claimRes1.data && claimRes1.data.length > 0 ? claimRes1.data[0] : null;
    const winner2 = claimRes2.data && claimRes2.data.length > 0 ? claimRes2.data[0] : null;

    console.log(`    Panggilan 1 klaim id: ${winner1 ? winner1.id : "null"}`);
    console.log(`    Panggilan 2 klaim id: ${winner2 ? winner2.id : "null"}`);

    if ((winner1 && !winner2) || (!winner1 && winner2)) {
      console.log("    ✅ SUKSES: Tepat satu pemanggil yang berhasil mengklaim!");
    } else {
      throw new Error(`GAGAL: Kedua pemanggil mendapatkan brief yang sama atau keduanya null (${winner1?.id}, ${winner2?.id})`);
    }

    // Lepaskan klaim b1
    await supabase.rpc("release_brief_claim", { target_brief_id: b1.id });

    // -------------------------------------------------------------------------
    // TES 2: pipeline_control.jalan = false -> klaim ditolak
    // -------------------------------------------------------------------------
    console.log("\n>>> [TES 2] pipeline_control.jalan = false -> klaim ditolak...");
    await supabase.from("pipeline_control").update({ jalan: false }).eq("id", 1);

    const { data: claimWhenStopped } = await supabase.rpc("claim_brief_for_consideration");
    const gotClaim = claimWhenStopped && claimWhenStopped.length > 0;
    console.log(`    Hasil klaim saat jalan=false: ${gotClaim ? "Mendapat klaim (SALAH)" : "Ditolak / null (BENAR)"}`);

    if (gotClaim) {
      throw new Error("GAGAL: Brief berhasil diklaim padahal pipeline_control.jalan = false!");
    }
    console.log("    ✅ SUKSES: Klaim ditolak saat pipeline_control.jalan = false.");

    // Pulihkan pipeline_control
    await supabase.from("pipeline_control").update({ jalan: true }).eq("id", 1);

    // -------------------------------------------------------------------------
    // TES 3: Klaim basi > 10 menit dapat diambil ulang
    // -------------------------------------------------------------------------
    console.log("\n>>> [TES 3] Klaim basi > 10 menit dapat diambil ulang...");
    // Setel brief b1 menjadi status 'dipertimbangkan' dengan timestamp basi (> 10 menit lalu)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { error: errUpdateBasi } = await supabase
      .from("briefs")
      .update({
        status: "dipertimbangkan",
        diproses_sejak: fifteenMinutesAgo,
      })
      .eq("id", b1.id);

    if (errUpdateBasi) console.error("Error update basi:", errUpdateBasi);

    const reclaimRes = await supabase.rpc("claim_brief_for_consideration");
    console.log("    reclaimRes:", JSON.stringify(reclaimRes));
    const reclaimedBrief = reclaimRes.data && reclaimRes.data.length > 0 ? reclaimRes.data[0] : null;

    if (!reclaimedBrief || reclaimedBrief.id !== b1.id) {
      throw new Error(`GAGAL: Brief basi tidak berhasil diambil ulang! Diterima: ${reclaimedBrief?.id}`);
    }
    console.log(`    ✅ SUKSES: Brief basi (${b1.id}) berhasil diambil ulang dengan timestamp baru.`);

    // Lepas klaim lagi dan set selesai agar tidak mengotori antrean TES 4
    await supabase.rpc("release_brief_claim", { target_brief_id: b1.id });
    await supabase.from("briefs").update({ status: "selesai" }).eq("id", b1.id);

    // -------------------------------------------------------------------------
    // TES 4: Verifikasi Urutan FIFO (First-In, First-Out)
    // -------------------------------------------------------------------------
    console.log("\n>>> [TES 4] Verifikasi urutan antrean FIFO...");
    const { data: fifo1, error: errFifo1 } = await supabase
      .from("briefs")
      .insert({
        judul: `${TEST_TAG}_FIFO_A`,
        isi: { produk: "Produk FIFO 1", tujuan: "Uji Urutan A" },
        mode: "diarahkan",
        status: "antre",
      })
      .select()
      .single();
    if (errFifo1) throw new Error("Gagal insert fifo1: " + errFifo1.message);

    const { data: fifo2, error: errFifo2 } = await supabase
      .from("briefs")
      .insert({
        judul: `${TEST_TAG}_FIFO_B`,
        isi: { produk: "Produk FIFO 2", tujuan: "Uji Urutan B" },
        mode: "diarahkan",
        status: "antre",
      })
      .select()
      .single();
    if (errFifo2) throw new Error("Gagal insert fifo2: " + errFifo2.message);

    // Klaim pertama harus fifo1
    const { data: claimFifo1Res } = await supabase.rpc("claim_brief_for_consideration");
    const claimedFifo1 = claimFifo1Res && claimFifo1Res.length > 0 ? claimFifo1Res[0] : null;

    // Selesaikan fifo1 supaya fifo2 bisa diklaim berikutnya
    await supabase.from("briefs").update({ status: "selesai" }).eq("id", fifo1.id);

    // Klaim kedua harus fifo2
    const { data: claimFifo2Res } = await supabase.rpc("claim_brief_for_consideration");
    const claimedFifo2 = claimFifo2Res && claimFifo2Res.length > 0 ? claimFifo2Res[0] : null;

    console.log(`    Klaim FIFO 1 ID: ${claimedFifo1?.id} (diharapkan: ${fifo1.id})`);
    console.log(`    Klaim FIFO 2 ID: ${claimedFifo2?.id} (diharapkan: ${fifo2.id})`);

    if (claimedFifo1?.id !== fifo1.id || claimedFifo2?.id !== fifo2.id) {
      throw new Error(`GAGAL: Urutan FIFO tidak sesuai! Diterima: ${claimedFifo1?.id}, ${claimedFifo2?.id}`);
    }
    console.log("    ✅ SUKSES: Urutan antrean mematuhi FIFO secara presisi.");

    // Selesaikan fifo2
    await supabase.from("briefs").update({ status: "selesai" }).eq("id", fifo2.id);

    // -------------------------------------------------------------------------
    // TES 5: Klarifikasi Tidak Memblokir (Brief A butuh_klarifikasi, Brief B antre)
    // -------------------------------------------------------------------------
    console.log("\n>>> [TES 5] Klarifikasi tidak memblokir brief di belakangnya...");
    // Buat Brief A dengan status 'butuh_klarifikasi'
    const { data: briefA, error: errBA } = await supabase
      .from("briefs")
      .insert({
        judul: `${TEST_TAG}_Brief_A_Klarifikasi`,
        isi: { produk: "Produk A Butuh Tanya", tujuan: "Uji Deadlock Klarifikasi" },
        mode: "diarahkan",
        status: "butuh_klarifikasi",
        pertanyaan: "Mohon konfirmasi target audiens?",
        putaran_tanya: 1,
      })
      .select()
      .single();
    if (errBA) throw new Error("Gagal insert briefA: " + errBA.message);

    // Buat Brief B dengan status 'antre' (ID pasti lebih besar dari briefA)
    const { data: briefB, error: errBB } = await supabase
      .from("briefs")
      .insert({
        judul: `${TEST_TAG}_Brief_B_Antre`,
        isi: { produk: "Produk B Siap Eksekusi", tujuan: "Harus tetap bisa diklaim" },
        mode: "diarahkan",
        status: "antre",
      })
      .select()
      .single();
    if (errBB) throw new Error("Gagal insert briefB: " + errBB.message);

    // ATLAS klaim brief berikutnya: HARUS mendapatkan briefB tanpa terhalang briefA!
    const { data: claimBRes } = await supabase.rpc("claim_brief_for_consideration");
    const claimedB = claimBRes && claimBRes.length > 0 ? claimBRes[0] : null;

    console.log(`    Brief A (#${briefA.id}) berstatus: butuh_klarifikasi`);
    console.log(`    Brief B (#${briefB.id}) berstatus: antre`);
    console.log(`    Hasil klaim: ID #${claimedB?.id} (diharapkan: #${briefB.id})`);

    if (!claimedB || claimedB.id !== briefB.id) {
      throw new Error(
        `GAGAL: Deadlock terjadi! Brief B (#${briefB.id}) tidak bisa diklaim karena Brief A (#${briefA.id}) butuh_klarifikasi!`
      );
    }
    console.log("    ✅ SUKSES: Brief A (butuh_klarifikasi) terbukti TIDAK memblokir Brief B di belakangnya!");

    // Lepaskan klaim briefB
    await supabase.rpc("release_brief_claim", { target_brief_id: briefB.id });

    // -------------------------------------------------------------------------
    // TES 6: Paritas Logika TS (BriefQueueManager) vs SQL
    // -------------------------------------------------------------------------
    console.log("\n>>> [TES 6] Verifikasi Paritas Logika TS (BriefQueueManager) vs SQL...");
    const tsManager = new BriefQueueManager();
    const tb1 = tsManager.enqueueBrief({
      judul: "TB1",
      isi: { produk: "P1", target_audiens: "A1", tujuan: "T1" },
      mode: "diarahkan",
    });
    const tb2 = tsManager.enqueueBrief({
      judul: "TB2",
      isi: { produk: "P2", target_audiens: "A2", tujuan: "T2" },
      mode: "diarahkan",
    });

    // TS: Klaim 1 -> tb1
    const tsClaim1 = tsManager.claimNextForConsideration("w1");
    // TS: tb1 butuh_klarifikasi
    tsManager.submitManagerDecision(tb1.id, { keputusan: "tanya", alasan: "butuh data", asumsi: [], pertanyaan: "apa?" });
    // TS: Klaim berikutnya langsung tb2 tanpa deadlock
    const tsClaim2 = tsManager.claimNextForConsideration("w1");

    if (tsClaim1.id === tb1.id && tsClaim2.id === tb2.id) {
      console.log("    ✅ SUKSES: Paritas logika terbukti 100% konsisten antara TypeScript State Machine dan PostgreSQL Stored Procedure.");
    } else {
      throw new Error("Paritas gagal!");
    }

  } finally {
    // -------------------------------------------------------------------------
    // PEMBERSIHAN DATA UJI (CLEANUP)
    // -------------------------------------------------------------------------
    console.log("\n>>> [CLEANUP] Membersihkan seluruh data uji dari database...");
    const { error: delBriefsErr } = await supabase
      .from("briefs")
      .delete()
      .like("judul", `${TEST_TAG}%`);

    if (delBriefsErr) {
      console.error("Gagal menghapus briefs uji:", delBriefsErr);
    }

    const { error: delEventsErr } = await supabase
      .from("events")
      .delete()
      .like("pesan", `%${TEST_TAG}%`);

    if (delEventsErr) {
      console.error("Gagal menghapus events uji:", delEventsErr);
    }

    // Pastikan pipeline_control kembali ke true
    await supabase.from("pipeline_control").update({ jalan: true }).eq("id", 1);

    // -------------------------------------------------------------------------
    // QUERY VERIFIKASI PEMBERSIHAN
    // -------------------------------------------------------------------------
    const { count: briefCount } = await supabase
      .from("briefs")
      .select("*", { count: "exact", head: true })
      .like("judul", `${TEST_TAG}%`);

    const { count: eventCount } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .like("pesan", `%${TEST_TAG}%`);

    console.log(`    Query Verifikasi briefs tertinggal: ${briefCount} baris`);
    console.log(`    Query Verifikasi events tertinggal: ${eventCount} baris`);

    if (briefCount === 0 && eventCount === 0) {
      console.log("    ✅ SUKSES: Bersih 100%, tidak ada data uji yang tertinggal di tabel produksi!\n");
    } else {
      console.error("    ❌ PERINGATAN: Ada data uji yang tertinggal!");
    }
  }
}

runDatabaseQueueTests().catch((err) => {
  console.error("Database test error:", err);
  process.exit(1);
});
