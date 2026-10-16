// tests/briefQueue.test.mjs
// Unit Test State Machine Antrean Brief & ATLAS (lib/briefQueue.ts)
// Membuktikan kegagalan pada implementasi naif dan keberhasilan pada BriefQueueManager.

import assert from "node:assert";
import test from "node:test";
import { BriefQueueManager } from "../lib/briefQueue.ts";
import { NaiveBriefQueueManager } from "./naiveBriefQueue.ts";

test("1. KLAIM GANDA (CONCURRENT CLAIM): Bukti kegagalan versi naif vs perbaikan state machine", () => {
  // --- Versi Naif: GAGAL karena memperbolehkan klaim ganda tanpa proteksi ---
  const naive = new NaiveBriefQueueManager();
  naive.enqueueBrief({
    judul: "Brief A",
    isi: { produk: "Kopi", target_audiens: "Dewasa", tujuan: "Promo" },
    mode: "diarahkan"
  });

  const naiveClaim1 = naive.claimNextForConsideration("worker-1");
  const naiveClaim2 = naive.claimNextForConsideration("worker-2");

  // Pada naif, worker-2 berhasil merebut brief yang sama yang sedang dipertimbangkan worker-1!
  assert.strictEqual(naiveClaim1.id, naiveClaim2.id, "NAIF BUG: Brief yang sama direbut oleh dua worker!");
  assert.strictEqual(naiveClaim2.claimed_by, "worker-2", "NAIF BUG: Klaim worker-1 ditimpa oleh worker-2!");

  // --- Versi BriefQueueManager: SUKSES (Klaim atomik & idempoten) ---
  let simTime = 1000;
  const manager = new BriefQueueManager(() => simTime);
  manager.enqueueBrief({
    judul: "Brief A",
    isi: { produk: "Kopi", target_audiens: "Dewasa", tujuan: "Promo" },
    mode: "diarahkan"
  });

  const claim1 = manager.claimNextForConsideration("worker-1");
  assert.ok(claim1, "Worker-1 berhasil mengklaim");
  assert.strictEqual(claim1.status, "dipertimbangkan");
  assert.strictEqual(claim1.claimed_by, "worker-1");

  // Worker-2 mencoba mengklaim di saat yang sama -> DITOLAK (karena Manager sedang mempertimbangkan)
  const claim2 = manager.claimNextForConsideration("worker-2");
  assert.strictEqual(claim2, null, "Worker-2 ditolak karena ATLAS sedang sibuk");
});

test("2. DEADLOCK KLARIFIKASI: Bukti kegagalan versi naif vs perbaikan antrean bebas deadlock", () => {
  // --- Versi Naif: GAGAL karena brief butuh_klarifikasi menahan seluruh antrean (Head-of-Line blocking) ---
  const naive = new NaiveBriefQueueManager();
  const b1 = naive.enqueueBrief({
    judul: "Brief Ambigu 1",
    isi: { produk: "Barang bagus", target_audiens: "", tujuan: "" },
    mode: "diarahkan"
  });
  naive.enqueueBrief({
    judul: "Brief Jelas 2",
    isi: { produk: "Sepatu Lari", target_audiens: "Pelari", tujuan: "Riset" },
    mode: "diarahkan"
  });

  // Brief 1 dipertimbangkan lalu minta klarifikasi
  naive.claimNextForConsideration("worker-1");
  naive.submitManagerDecision(b1.id, {
    keputusan: "tanya",
    alasan: "Data kurang",
    asumsi: [],
    pertanyaan: "Apa spesifikasi produknya?"
  });
  assert.strictEqual(b1.status, "butuh_klarifikasi");

  // Worker mencoba memproses antrean berikutnya:
  // Pada implementasi naif, antrean macet total karena elemen depan belum selesai dijawab!
  const naiveNextClaim = naive.claimNextForConsideration("worker-1");
  assert.strictEqual(naiveNextClaim, null, "NAIF BUG: Antrean mengalami deadlock karena b1 menunggu CEO!");

  // --- Versi BriefQueueManager: SUKSES (Brief di belakangnya TETAP diproses) ---
  let simTime = 2000;
  const manager = new BriefQueueManager(() => simTime);
  const mb1 = manager.enqueueBrief({
    judul: "Brief Ambigu 1",
    isi: { produk: "Barang bagus", target_audiens: "", tujuan: "" },
    mode: "diarahkan"
  });
  const mb2 = manager.enqueueBrief({
    judul: "Brief Jelas 2",
    isi: { produk: "Sepatu Lari", target_audiens: "Pelari", tujuan: "Riset" },
    mode: "diarahkan"
  });

  const c1 = manager.claimNextForConsideration("worker-1");
  assert.strictEqual(c1.id, mb1.id);
  manager.submitManagerDecision(mb1.id, {
    keputusan: "tanya",
    alasan: "Data kurang",
    asumsi: [],
    pertanyaan: "Apa spesifikasi produknya?"
  });
  assert.strictEqual(mb1.status, "butuh_klarifikasi");

  // ATLAS bebas kembali! Brief 2 LANGSUNG bisa diklaim tanpa menunggu CEO menjawab Brief 1!
  const c2 = manager.claimNextForConsideration("worker-1");
  assert.ok(c2, "Brief 2 berhasil diklaim");
  assert.strictEqual(c2.id, mb2.id, "Brief 2 diproses secara lancar tanpa deadlock!");

  // Setelah CEO menjawab Brief 1, Brief 1 kembali ke antrean
  simTime += 5000;
  manager.answerClarification(mb1.id, "Produknya adalah sepatu kasual kulit");
  assert.strictEqual(mb1.status, "antre");
  assert.strictEqual(mb1.putaran_tanya, 1);
  assert.strictEqual(mb1.jawaban, "Produknya adalah sepatu kasual kulit");
});

test("3. URUTAN FIFO: Brief diproses berurutan sesuai id masuk", () => {
  let simTime = 10000;
  const manager = new BriefQueueManager(() => simTime);

  const b1 = manager.enqueueBrief({
    judul: "Antrean 1",
    isi: { produk: "P1", target_audiens: "A1", tujuan: "T1" },
    mode: "diarahkan"
  });
  const b2 = manager.enqueueBrief({
    judul: "Antrean 2",
    isi: { produk: "P2", target_audiens: "A2", tujuan: "T2" },
    mode: "diarahkan"
  });
  const b3 = manager.enqueueBrief({
    judul: "Antrean 3",
    isi: { produk: "P3", target_audiens: "A3", tujuan: "T3" },
    mode: "diarahkan"
  });

  // Klaim 1 -> b1
  const c1 = manager.claimNextForConsideration("worker");
  assert.strictEqual(c1.id, b1.id);
  manager.submitManagerDecision(b1.id, {
    keputusan: "delegasi",
    departemen: [{ id: "riset", nama: "Riset", belum_tersedia: false }],
    alasan: "Riset awal",
    asumsi: []
  });

  // Klaim 2 -> b2
  const c2 = manager.claimNextForConsideration("worker");
  assert.strictEqual(c2.id, b2.id);
  manager.submitManagerDecision(b2.id, {
    keputusan: "delegasi",
    departemen: [{ id: "copy_creative", nama: "Copy", belum_tersedia: true }],
    alasan: "Copy awal",
    asumsi: []
  });

  // Klaim 3 -> b3
  const c3 = manager.claimNextForConsideration("worker");
  assert.strictEqual(c3.id, b3.id);
});

test("4. KONFLIK DEPARTEMEN: Brief 2 menunggu departemen bebas, tetapi departemen lain boleh paralel", () => {
  let simTime = 20000;
  const manager = new BriefQueueManager(() => simTime);

  const b1 = manager.enqueueBrief({
    judul: "Brief Riset 1",
    isi: { produk: "P1", target_audiens: "A1", tujuan: "T1" },
    mode: "diarahkan"
  });
  const b2 = manager.enqueueBrief({
    judul: "Brief Riset 2",
    isi: { produk: "P2", target_audiens: "A2", tujuan: "T2" },
    mode: "diarahkan"
  });
  const b3 = manager.enqueueBrief({
    judul: "Brief Copywriting 3",
    isi: { produk: "P3", target_audiens: "A3", tujuan: "T3" },
    mode: "diarahkan"
  });

  // 1. Brief 1 diproses ATLAS dan didelegasikan ke 'riset'
  manager.claimNextForConsideration("worker");
  manager.submitManagerDecision(b1.id, {
    keputusan: "delegasi",
    departemen: [{ id: "riset", nama: "Riset", belum_tersedia: false }],
    alasan: "Mulai riset",
    asumsi: []
  });
  assert.strictEqual(b1.status, "berjalan");
  assert.strictEqual(b1.departemen_aktif, "riset");

  // 2. Brief 2 diproses ATLAS dan JUGA membutuhkan 'riset'
  manager.claimNextForConsideration("worker");
  manager.submitManagerDecision(b2.id, {
    keputusan: "delegasi",
    departemen: [{ id: "riset", nama: "Riset", belum_tersedia: false }],
    alasan: "Butuh riset juga",
    asumsi: []
  });
  // Karena 'riset' sedang dipakai b1, b2 TIDAK boleh 'berjalan' bersamaan di 'riset'!
  assert.strictEqual(b2.status, "didelegasikan", "Brief 2 menunggu di status didelegasikan");
  assert.strictEqual(b2.departemen_aktif, null, "Departemen riset belum dialokasikan ke b2");

  // 3. Brief 3 diproses ATLAS dan membutuhkan 'copy_creative' (tidak bentrok dengan riset!)
  manager.claimNextForConsideration("worker");
  manager.submitManagerDecision(b3.id, {
    keputusan: "delegasi",
    departemen: [{ id: "copy_creative", nama: "Copy", belum_tersedia: true }],
    alasan: "Copywriting",
    asumsi: []
  });
  // b3 BISA berjalan secara paralel karena copy_creative bebas!
  assert.strictEqual(b3.status, "berjalan", "Brief 3 berjalan paralel");
  assert.strictEqual(b3.departemen_aktif, "copy_creative");

  // 4. Brief 1 menyelesaikan riset
  manager.advanceDepartment(b1.id);
  assert.strictEqual(b1.status, "selesai");
  assert.strictEqual(b1.departemen_aktif, null);

  // Otomatis Brief 2 yang menunggu riset sekarang maju ke berjalan!
  assert.strictEqual(b2.status, "berjalan", "Brief 2 otomatis berjalan setelah riset bebas");
  assert.strictEqual(b2.departemen_aktif, "riset");
});

test("5. HORMAT PADA PIPELINE_CONTROL: Bukti kegagalan versi naif vs perbaikan jeda darurat", () => {
  // --- Versi Naif: GAGAL karena tetap memproses saat pipeline dimatikan ---
  const naive = new NaiveBriefQueueManager();
  naive.enqueueBrief({
    judul: "Brief Saat Stop",
    isi: { produk: "P", target_audiens: "A", tujuan: "T" },
    mode: "diarahkan"
  });
  naive.setPipelineControl(false); // CEO menekan tombol "Hentikan proyek"

  const naiveClaim = naive.claimNextForConsideration("worker");
  assert.ok(naiveClaim !== null, "NAIF BUG: Tetap mengklaim brief padahal pipeline dimatikan!");

  // --- Versi BriefQueueManager: SUKSES (Klaim dan proses dihentikan seketika) ---
  const manager = new BriefQueueManager();
  manager.enqueueBrief({
    judul: "Brief Saat Stop",
    isi: { produk: "P", target_audiens: "A", tujuan: "T" },
    mode: "diarahkan"
  });
  manager.setPipelineControl(false); // Stop aktif

  const claim = manager.claimNextForConsideration("worker");
  assert.strictEqual(claim, null, "Klaim ditolak karena pipeline_control.jalan = false");

  // Nyalakan kembali
  manager.setPipelineControl(true);
  const claimResume = manager.claimNextForConsideration("worker");
  assert.ok(claimResume !== null, "Klaim berhasil setelah pipeline diaktifkan kembali");
});
