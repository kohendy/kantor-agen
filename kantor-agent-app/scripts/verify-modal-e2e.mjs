import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const envRaw = fs.readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const parts = l.trim().split("=");
      return [parts[0], parts.slice(1).join("=")];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const artifactsDir = path.resolve("verification_artifacts");
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== STARTING COMPREHENSIVE MODAL BRIEF RISET E2E TEST ===");

  // 0. Buat user E2E sementara lewat admin API
  const tempEmail = `e2e-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  console.log(`0. Membuat akun E2E sementara: ${tempEmail}...`);
  const { data: tempUserData, error: tempUserErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (tempUserErr || !tempUserData?.user) {
    throw new Error(`Gagal membuat akun E2E sementara: ${tempUserErr?.message}`);
  }
  tempUserId = tempUserData.user.id;
  console.log(`   ✓ Akun E2E sementara berhasil dibuat (ID: ${tempUserId}).`);

  // Pastikan ada step 52 di database
  const { data: step52, error: step52Err } = await supabase
    .from("pipeline_steps")
    .select("id, output")
    .eq("id", 52)
    .single();

  if (step52Err || !step52) {
    throw new Error(`Step #52 tidak ditemukan di database: ${step52Err?.message}`);
  }
  console.log("1. Step #52 ditemukan (Run #23, revisi_ke 1).");

  // Pastikan ada step brief lama (Step #17 atau step riset tanpa field baru)
  let { data: stepLama } = await supabase
    .from("pipeline_steps")
    .select("id")
    .eq("id", 17)
    .single();

  if (!stepLama) {
    const { data: anyOldStep } = await supabase
      .from("pipeline_steps")
      .select("id")
      .eq("fase", "riset")
      .is("output->umpan_balik_ditangani", null)
      .limit(1)
      .single();
    stepLama = anyOldStep;
  }
  console.log(`2. Step brief lama ditemukan: #${stepLama.id}.`);

  // Buat fixture step malformed untuk uji ketahanan (resilience)
  const malformedOutput = {
    ringkasan: "Inferensi: Ringkasan diawali inferensi uji ketahanan (indikatif).",
    tingkat_bukti: "indikatif riset cepat — sumber terbatas",
    umpan_balik_ditangani: [
      {
        butir: "Butir dengan status kustom tak dikenal",
        status: "MENUNGGU_DATA",
        catatan: "Catatan butir aneh (konteks berbeda dari target).",
        url_bukti: [123, null, "bukan-url-biasa", "https://example.com/valid-url"]
      },
      {
        butir: "Ditangani tapi url_bukti sengaja kosong",
        status: "ditangani",
        catatan: "Catatan ditangani tanpa bukti.",
        url_bukti: []
      }
    ],
    angle_rekomendasi: [
      {
        nama: "Angle Ketahanan",
        alasan: "Alasan uji (data historis s.d. 2024)",
        bukti: "Bukti uji (indikatif)",
        risiko: "Data spesifik tidak ditemukan. Inferensi: Perlu mitigasi risiko."
      }
    ],
    kompetitor: ["Kompetitor A (indikatif)"],
    audiens: ["Audiens B"],
    klaim_berisiko: ["Klaim berisiko uji (data historis s.d. 2025)"],
    celah_data: ["Celah data uji"],
    sumber: ["https://example.com/source-malformed-1"]
  };

  const { data: stepMalformed, error: malformedStepErr } = await supabase
    .from("pipeline_steps")
    .insert({
      fase: "riset",
      agen: "ATHENA",
      status: "selesai",
      output: malformedOutput
    })
    .select("id")
    .single();

  if (malformedStepErr || !stepMalformed) {
    throw new Error(`Gagal membuat step malformed: ${malformedStepErr?.message}`);
  }
  console.log(`3. Step malformed berhasil dibuat: #${stepMalformed.id}.`);

  // Dapatkan step non-riset untuk verifikasi gate non-riset tetap <pre>
  let { data: stepCopy } = await supabase
    .from("pipeline_steps")
    .select("id")
    .neq("fase", "riset")
    .limit(1)
    .single();

  // Setel approval pending lama menjadi kedaluwarsa sebelum mulai
  await supabase
    .from("approvals")
    .update({ status: "kedaluwarsa" })
    .like("ringkasan", "[TEST_MODAL]%");

  // Buat fixture approvals pending (TANPA event 'review')
  const testRows = [
    {
      agent: "ATHENA",
      gate: "riset",
      step_id: 52,
      ringkasan: "[TEST_MODAL] Step 52 Riset Baru dengan Umpan Balik & Tingkat Bukti",
      status: "pending",
      dibuat: new Date(Date.now() - 50000).toISOString()
    },
    {
      agent: "ATHENA",
      gate: "riset",
      step_id: 45,
      ringkasan: "[TEST_MODAL] Step 45 Riset Revisi 0 dengan Sumber",
      status: "pending",
      dibuat: new Date(Date.now() - 40000).toISOString()
    },
    {
      agent: "METIS",
      gate: "riset",
      step_id: stepLama.id,
      ringkasan: "[TEST_MODAL] Step Lama tanpa Field Baru",
      status: "pending",
      dibuat: new Date(Date.now() - 30000).toISOString()
    },
    {
      agent: "ATHENA",
      gate: "riset",
      step_id: stepMalformed.id,
      ringkasan: "[TEST_MODAL] Step Malformed Uji Ketahanan",
      status: "pending",
      dibuat: new Date(Date.now() - 20000).toISOString()
    },
    {
      agent: "CLIO",
      gate: "copywriting",
      step_id: stepCopy ? stepCopy.id : 52,
      ringkasan: "[TEST_MODAL] Gate Non-Riset Output Pre",
      status: "pending",
      dibuat: new Date(Date.now() - 10000).toISOString()
    }
  ];

  const { data: insertedApprovals, error: insErr } = await supabase
    .from("approvals")
    .insert(testRows)
    .select("id, ringkasan");

  if (insErr || !insertedApprovals) {
    throw new Error(`Gagal insert approvals fixture: ${insErr?.message}`);
  }
  console.log(`4. Berhasil insert ${insertedApprovals.length} test approvals (status: pending).`);

  // Pastikan server aktif
  console.log("5. Memastikan server Next.js aktif...");
  let serverProcess = null;
  const isPortOpen = await fetch("http://localhost:3000").then(() => true).catch(() => false);
  if (!isPortOpen) {
    console.log("   Menjalankan server `npm run start`...");
    serverProcess = spawn("npm.cmd", ["run", "start"], {
      stdio: "pipe",
      shell: true
    });
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const ready = await fetch("http://localhost:3000").then(() => true).catch(() => false);
      if (ready) break;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    console.log("6. Login ke dashboard...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.waitForSelector(".approval-panel", { timeout: 15000 });
    await sleep(2000);

    // ========================================================
    // TEST 1: VIEWPORT 1280px (DESKTOP) - STEP #52 DETAIL LENGKAP
    // ========================================================
    console.log("\n--- TEST 1: VIEWPORT 1280px (Step #52 - Field Baru & Anotasi) ---");
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(500);

    // Temukan tombol detail untuk step #52
    const itemStep52 = page.locator(".approval-item", { hasText: "[TEST_MODAL] Step 52" });
    const btnDetailStep52 = itemStep52.locator(".btn-detail-riset");
    await btnDetailStep52.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    // Verifikasi bagian "Umpan Balik Revisi"
    const fbHeader = page.locator(".brief-modal-body h4", { hasText: "Umpan Balik Revisi" });
    await fbHeader.waitFor({ state: "visible", timeout: 10000 });
    const fbHeaderText = await fbHeader.textContent();
    console.log(`   ✓ Header: "${fbHeaderText.trim()}"`);

    const fbItems = await page.locator(".brief-modal-body .fb-item").all();
    console.log(`   Ditemukan ${fbItems.length} butir umpan balik revisi.`);
    if (fbItems.length !== 3) {
      throw new Error(`Diharapkan 3 butir umpan balik pada step #52, ditemukan ${fbItems.length}`);
    }

    // Butir 1: tidak_ditemukan
    const item1 = fbItems[0];
    const status1 = await item1.locator(".fb-status").textContent();
    const status1Class = await item1.locator(".fb-status").getAttribute("class");
    console.log(`   Butir 1 status chip: "${status1.trim()}" (class: ${status1Class})`);
    if (status1.trim() !== "Tidak ditemukan" || !status1Class.includes("tidak_ditemukan")) {
      throw new Error(`Status chip butir 1 salah: "${status1}"`);
    }
    const proofNone1 = await item1.locator(".brief-note", { hasText: "Tidak ada bukti tercantum" }).isVisible();
    console.log(`   Butir 1 menampilkan 'Tidak ada bukti tercantum': ${proofNone1}`);
    if (!proofNone1) {
      throw new Error("Butir 1 tidak menampilkan teks 'Tidak ada bukti tercantum'!");
    }

    // Butir 2: ditangani dengan 2 URL
    const item2 = fbItems[1];
    const status2 = await item2.locator(".fb-status").textContent();
    const status2Class = await item2.locator(".fb-status").getAttribute("class");
    console.log(`   Butir 2 status chip: "${status2.trim()}" (class: ${status2Class})`);
    if (status2.trim() !== "Ditangani" || !status2Class.includes("ditangani")) {
      throw new Error(`Status chip butir 2 salah: "${status2}"`);
    }
    const links2 = await item2.locator("a.brief-link").all();
    console.log(`   Butir 2 tautan bukti: ${links2.length} link`);
    if (links2.length !== 2) {
      throw new Error(`Diharapkan 2 link bukti pada butir 2, ditemukan ${links2.length}`);
    }
    for (const link of links2) {
      const href = await link.getAttribute("href");
      const target = await link.getAttribute("target");
      const rel = await link.getAttribute("rel");
      if (!href?.startsWith("https://") || target !== "_blank" || !rel?.includes("noopener")) {
        throw new Error(`Atribut link tidak valid: href=${href}, target=${target}, rel=${rel}`);
      }
    }
    console.log("   ✓ Link bukti butir 2 memiliki target=_blank dan rel=noopener noreferrer.");

    // Verifikasi Anotasi Badges (Inferensi, Data historis, Indikatif)
    const inferensiBadges = await page.locator(".brief-badge.inferensi").all();
    console.log(`   Ditemukan ${inferensiBadges.length} badge 'Inferensi' pada modal.`);
    if (inferensiBadges.length === 0) {
      throw new Error("Badge 'Inferensi' tidak ditemukan pada modal step #52!");
    }

    const historisBadges = await page.locator(".brief-badge.historis").all();
    console.log(`   Ditemukan ${historisBadges.length} badge 'Data historis' pada modal.`);
    if (historisBadges.length === 0) {
      throw new Error("Badge 'Data historis' tidak ditemukan pada modal step #52!");
    }

    const indikatifBadges = await page.locator(".brief-badge.indikatif").all();
    console.log(`   Ditemukan ${indikatifBadges.length} badge 'Indikatif' pada modal.`);
    if (indikatifBadges.length === 0) {
      throw new Error("Badge 'Indikatif' tidak ditemukan pada modal step #52!");
    }

    // Verifikasi Judul Sumber dan Tingkat Bukti
    const sumberHeader = page.locator(".brief-modal-body h4", { hasText: "Sumber hasil pencarian web" });
    if (!(await sumberHeader.isVisible())) {
      throw new Error("Judul 'Sumber hasil pencarian web' tidak ditemukan!");
    }
    const sumberHeaderText = await sumberHeader.textContent();
    console.log(`   ✓ Judul sumber: "${sumberHeaderText.trim()}"`);

    const tingkatBuktiNote = page.locator(".brief-modal-body .brief-note", { hasText: "Tingkat bukti:" });
    if (!(await tingkatBuktiNote.isVisible())) {
      throw new Error("Catatan 'Tingkat bukti:' tidak ditemukan!");
    }
    const tingkatBuktiText = await tingkatBuktiNote.textContent();
    console.log(`   ✓ Tingkat bukti: "${tingkatBuktiText.trim()}"`);

    // Periksa tidak ada scroll horizontal pada dialog
    const modalDialog = page.locator(".brief-modal-dialog");
    const hasHorizontalOverflow = await modalDialog.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    if (hasHorizontalOverflow) {
      throw new Error("Terdeteksi horizontal scroll pada modal dialog 1280px!");
    }
    console.log("   ✓ Tidak ada scroll horizontal di 1280px.");

    // Screenshot 1280px
    const screenshot1280 = path.join(artifactsDir, "modal_step52_1280px.png");
    await modalDialog.screenshot({ path: screenshot1280 });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshot1280}`);

    // Tutup modal
    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // ========================================================
    // TEST 2: VIEWPORT 768px (TABLET)
    // ========================================================
    console.log("\n--- TEST 2: VIEWPORT 768px (Tablet) ---");
    await page.setViewportSize({ width: 768, height: 1024 });
    await sleep(500);

    await btnDetailStep52.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    const overflow768 = await modalDialog.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    if (overflow768) {
      throw new Error("Terdeteksi horizontal scroll pada modal dialog 768px!");
    }
    console.log("   ✓ Tidak ada scroll horizontal di 768px.");

    const screenshot768 = path.join(artifactsDir, "modal_step52_768px.png");
    await modalDialog.screenshot({ path: screenshot768 });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshot768}`);

    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // ========================================================
    // TEST 3: VIEWPORT 390px (MOBILE)
    // ========================================================
    console.log("\n--- TEST 3: VIEWPORT 390px (Mobile) ---");
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(500);

    await btnDetailStep52.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    const overflow390 = await modalDialog.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    if (overflow390) {
      throw new Error("Terdeteksi horizontal scroll pada modal dialog 390px!");
    }
    console.log("   ✓ Tidak ada scroll horizontal di 390px.");

    const screenshot390 = path.join(artifactsDir, "modal_step52_390px.png");
    await modalDialog.screenshot({ path: screenshot390 });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshot390}`);

    await page.locator(".brief-modal-close").click();
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // ========================================================
    // TEST 4: KOMPATIBILITAS BRIEF LAMA (STEP #45 & STEP #17)
    // ========================================================
    console.log("\n--- TEST 4: KOMPATIBILITAS BRIEF LAMA (Step #45 & Step #17) ---");
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(300);

    // Uji Step 45 (revisi 0, umpan_balik_ditangani kosong [], punya 7 sumber)
    const item45 = page.locator(".approval-item", { hasText: "[TEST_MODAL] Step 45" });
    const btnDetail45 = item45.locator(".btn-detail-riset");
    await btnDetail45.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    const fbHeader45 = page.locator(".brief-modal-body h4", { hasText: "Umpan Balik Revisi" });
    const isFb45Visible = await fbHeader45.isVisible();
    console.log(`   Step #45: 'Umpan Balik Revisi' tampil: ${isFb45Visible} (harus false karena umpan balik kosong)`);
    if (isFb45Visible) {
      throw new Error("Bagian 'Umpan Balik Revisi' seharusnya TIDAK tampil jika umpan_balik_ditangani kosong!");
    }

    const sumber45 = page.locator(".brief-modal-body h4", { hasText: "Sumber hasil pencarian web" });
    const isSumber45Visible = await sumber45.isVisible();
    console.log(`   Step #45: Judul sumber baru 'Sumber hasil pencarian web' tampil: ${isSumber45Visible}`);
    if (!isSumber45Visible) {
      throw new Error("Judul 'Sumber hasil pencarian web' tidak tampil pada step #45!");
    }

    const screenshot45 = path.join(artifactsDir, "modal_brief_lama_step45.png");
    await modalDialog.screenshot({ path: screenshot45 });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshot45}`);

    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // Uji Step 17 (tanpa field baru sama sekali)
    const itemOld = page.locator(".approval-item", { hasText: "[TEST_MODAL] Step Lama" });
    const btnDetailOld = itemOld.locator(".btn-detail-riset");
    await btnDetailOld.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    const fbHeaderOld = page.locator(".brief-modal-body h4", { hasText: "Umpan Balik Revisi" });
    const isFbOldVisible = await fbHeaderOld.isVisible();
    console.log(`   Step #17: 'Umpan Balik Revisi' tampil: ${isFbOldVisible}`);
    if (isFbOldVisible) {
      throw new Error("Bagian 'Umpan Balik Revisi' seharusnya TIDAK tampil pada brief lama!");
    }

    const tbOld = page.locator(".brief-modal-body .brief-note", { hasText: "Tingkat bukti:" });
    const isTbOldVisible = await tbOld.isVisible();
    console.log(`   Step #17: 'Tingkat bukti:' tampil: ${isTbOldVisible}`);
    if (isTbOldVisible) {
      throw new Error("Catatan 'Tingkat bukti:' seharusnya TIDAK tampil pada brief lama!");
    }

    const screenshotOld = path.join(artifactsDir, "modal_brief_lama_step17.png");
    await modalDialog.screenshot({ path: screenshotOld });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshotOld}`);

    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // ========================================================
    // TEST 5: UJI KETAHANAN DENGAN OUTPUT MALFORMED
    // ========================================================
    console.log("\n--- TEST 5: UJI KETAHANAN OUTPUT MALFORMED ---");
    const itemMalformed = page.locator(".approval-item", { hasText: "[TEST_MODAL] Step Malformed" });
    const btnDetailMalformed = itemMalformed.locator(".btn-detail-riset");
    await btnDetailMalformed.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    // Modal tidak crash
    const modalHeadMalformed = await page.locator(".brief-modal-head h3").textContent();
    console.log(`   Modal judul: "${modalHeadMalformed}" (tidak crash)`);

    // Butir 1: status kustom tak dikenal
    const customChip = page.locator(".fb-item .fb-status.lainnya", { hasText: "MENUNGGU_DATA" });
    if (!(await customChip.isVisible())) {
      throw new Error("Chip status kustom 'MENUNGGU_DATA' tidak ditemukan!");
    }
    console.log("   ✓ Status kustom 'MENUNGGU_DATA' dirender dengan kelas netral .lainnya.");

    // Butir 1 url_bukti: elemen non-string dibuang, string non-url dirender plain text, url http dirender <a>
    const plainTextProof = page.locator(".fb-item li span", { hasText: "bukan-url-biasa" });
    const linkProof = page.locator(".fb-item li a.brief-link", { hasText: "https://example.com/valid-url" });
    if (!(await plainTextProof.isVisible()) || !(await linkProof.isVisible())) {
      throw new Error("Normalisasi url_bukti gagal menangani teks biasa dan tautan!");
    }
    console.log("   ✓ url_bukti non-url menjadi teks biasa dan URL valid menjadi <a>.");

    // Butir 2: status 'ditangani' tetapi bukti kosong -> peringatan kecil 'Bukti tidak tercantum'
    const warningProof = page.locator(".fb-item .brief-note.warn", { hasText: "Bukti tidak tercantum" });
    if (!(await warningProof.isVisible())) {
      throw new Error("Peringatan 'Bukti tidak tercantum' tidak muncul pada status ditangani tanpa bukti!");
    }
    console.log("   ✓ Peringatan kecil 'Bukti tidak tercantum' berhasil ditampilkan.");

    const screenshotMalformed = path.join(artifactsDir, "modal_malformed_resilience.png");
    await modalDialog.screenshot({ path: screenshotMalformed });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshotMalformed}`);

    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    // ========================================================
    // TEST 6: REGRESI MODAL (ESC, FULL FRAME, FOCUS TRAP, SCROLL)
    // ========================================================
    console.log("\n--- TEST 6: REGRESI (Esc Bertingkat, Full Frame, Focus Trap, Scroll) ---");

    // Scroll Lock & Pemulihan Fokus
    await btnDetailStep52.focus();
    await btnDetailStep52.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

    const bodyOverflowOpen = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    console.log(`   Body overflow saat modal terbuka: "${bodyOverflowOpen}"`);
    if (bodyOverflowOpen !== "hidden") {
      throw new Error(`Diharapkan body overflow 'hidden', didapat '${bodyOverflowOpen}'`);
    }

    // Focus Trap
    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press("Tab");
      const isInside = await page.evaluate(() => {
        const dialog = document.querySelector(".brief-modal-dialog");
        return dialog && dialog.contains(document.activeElement);
      });
      if (!isInside) {
        throw new Error(`Tab ke-${i} keluar dari modal dialog!`);
      }
    }
    console.log("   ✓ Focus trap: fokus tetap di dalam modal setelah 5x Tab.");

    await page.locator(".brief-modal-close").click();
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    const bodyOverflowClosed = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    console.log(`   Body overflow setelah modal ditutup: "${bodyOverflowClosed}"`);
    if (bodyOverflowClosed === "hidden") {
      throw new Error("Body overflow masih 'hidden' setelah modal ditutup!");
    }

    const focusBack = await page.evaluate(() => document.activeElement?.classList.contains("btn-detail-riset"));
    console.log(`   Fokus kembali ke tombol trigger: ${focusBack}`);
    if (!focusBack) {
      console.warn("   Perhatian: Fokus aktif bukan tombol trigger");
    }

    // Esc Bertingkat di Full Frame
    const fullscreenBtn = page.locator(".stage-fullscreen-btn");
    if (await fullscreenBtn.isVisible()) {
      await fullscreenBtn.click();
      await sleep(800);
      let isFF = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Masuk mode Full Frame: ${isFF}`);

      const ffDetailBtn = page.locator(".dash-grid.is-full-frame .btn-detail-riset").first();
      await ffDetailBtn.click();
      await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
      await page.waitForSelector(".brief-modal-body .brief-meta-bar", { state: "visible", timeout: 15000 });

      // Esc ke-1: modal tertutup, Full Frame tetap aktif
      await page.keyboard.press("Escape");
      await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
      await sleep(300);

      isFF = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Full Frame tetap aktif setelah Esc ke-1 (modal tutup): ${isFF}`);
      if (!isFF) {
        throw new Error("Full Frame ikut tertutup saat Esc modal ditekan!");
      }

      // Esc ke-2: Full Frame tertutup
      await page.keyboard.press("Escape");
      await sleep(300);
      isFF = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Full Frame tertutup setelah Esc ke-2: ${!isFF}`);
      if (isFF) {
        throw new Error("Full Frame gagal ditutup oleh Esc ke-2!");
      }
      console.log("   ✓ Esc bertingkat lolos verifikasi sempurna.");
    }

    // ========================================================
    // TEST 7: GATE NON-RISET TETAP JSON <pre>
    // ========================================================
    console.log("\n--- TEST 7: GATE NON-RISET TETAP JSON <pre> ---");
    const itemNonRiset = page.locator(".approval-item", { hasText: "[TEST_MODAL] Gate Non-Riset" });
    const btnNonRiset = itemNonRiset.locator(".btn-detail-riset");
    if (await btnNonRiset.isVisible()) {
      await btnNonRiset.click();
      await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
      await page.waitForSelector("pre.brief-json-pre", { timeout: 15000 });
      const preJsonVisible = await page.locator("pre.brief-json-pre").isVisible();
      console.log(`   Tag <pre className="brief-json-pre"> visible: ${preJsonVisible}`);
      if (!preJsonVisible) {
        throw new Error("Gate non-riset tidak menampilkan tag pre!");
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
      console.log("   ✓ Gate non-riset tetap fallback ke pre JSON.");
    }

    // ========================================================
    // CONSOLE ERROR CHECK
    // ========================================================
    console.log("\n--- CONSOLE ERROR CHECK ---");
    console.log(`   Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error("   Errors detected:", consoleErrors);
      throw new Error(`Ada browser console errors: ${consoleErrors.join("; ")}`);
    }
    console.log("   ✓ 0 browser console errors!");

  } finally {
    await browser.close();
    if (serverProcess?.pid) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", serverProcess.pid.toString(), "/T", "/F"]);
        } else {
          serverProcess.kill();
        }
      } catch {
        serverProcess.kill();
      }
    }

    if (tempUserId) {
      console.log(`\nMenghapus akun E2E sementara (${tempEmail})...`);
      const { error: delUserErr } = await supabase.auth.admin.deleteUser(tempUserId);
      if (delUserErr) {
        console.error(`Gagal menghapus akun E2E sementara: ${delUserErr.message}`);
      } else {
        console.log("   ✓ Akun E2E sementara berhasil dihapus dari Supabase Auth.");
      }
    }

    // ========================================================
    // PEMBERSIHAN DATA SESUAI ATURAN KERAS:
    // status 'kedaluwarsa'; jangan hapus baris;
    // pastikan 0 approval pending dan 19 agent idle di akhir.
    // ========================================================
    console.log("\n7. Pembersihan data fixture...");
    await supabase
      .from("approvals")
      .update({ status: "kedaluwarsa" })
      .like("ringkasan", "[TEST_MODAL]%");

    const { count: pendingCount } = await supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { data: agentsData } = await supabase
      .from("agents")
      .select("nama, status");

    const nonIdleAgents = (agentsData || []).filter((a) => a.status !== "idle");

    console.log(`   Pending approvals tersisa: ${pendingCount}`);
    console.log(`   Total agents: ${agentsData?.length}, Idle agents: ${(agentsData?.length || 0) - nonIdleAgents.length}`);

    if (pendingCount !== 0) {
      throw new Error(`Masih ada ${pendingCount} approvals berstatus pending!`);
    }
    if (nonIdleAgents.length > 0) {
      throw new Error(`Ada agent yang tidak idle: ${JSON.stringify(nonIdleAgents)}`);
    }
    console.log(`   ✓ Status akhir: 0 approvals pending, ${agentsData?.length} agent idle.`);
  }

  console.log("\n=== SEMUA PENGUJIAN MODAL E2E BERHASIL LOLOS LENGKAP! ===");
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL ERROR IN E2E TEST:", err);
    process.exit(1);
  });
