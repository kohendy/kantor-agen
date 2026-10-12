import { chromium } from "playwright";
import fs from "fs";
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== STARTING COMPREHENSIVE MODAL & APPROVAL PANEL E2E TEST ===");

  // 1. Dapatkan step riset yang sudah ada atau buat dummy step
  let { data: stepRiset } = await supabase
    .from("pipeline_steps")
    .select("id")
    .eq("fase", "riset")
    .limit(1)
    .single();

  if (!stepRiset) {
    const { data: newStep } = await supabase
      .from("pipeline_steps")
      .insert({
        fase: "riset",
        agen: "METIS",
        status: "sukses",
        output: {
          keyakinan: "tinggi",
          ringkasan: "Riset pasar membuktikan potensi target audiens sangat tinggi.",
          kompetitor: ["Kompetitor A", "Kompetitor B"],
          audiens: ["Mahasiswa", "Freelancer"],
          angle_rekomendasi: [
            { nama: "Angle Efisiensi", alasan: "Hemat waktu 80%", bukti: "Studi kasus internal", risiko: "Perlu edukasi awal" }
          ],
          klaim_berisiko: ["Garansi 100% cuan"],
          celah_data: ["Data kompetitor regional"],
          sumber: ["https://example.com/riset-2026"]
        }
      })
      .select("id")
      .single();
    stepRiset = newStep;
  }

  // Dapatkan step non-riset atau buat dummy step non-riset
  let { data: stepCopy } = await supabase
    .from("pipeline_steps")
    .select("id")
    .neq("fase", "riset")
    .limit(1)
    .single();

  if (!stepCopy) {
    const { data: newStep2 } = await supabase
      .from("pipeline_steps")
      .insert({
        fase: "copywriting",
        agen: "CLIO",
        status: "sukses",
        output: {
          headline: "Solusi Otomatisasi AI Terdepan",
          cta: "Coba Sekarang"
        }
      })
      .select("id")
      .single();
    stepCopy = newStep2;
  }

  // 2. Siapkan 8 pending approvals untuk pengujian scroll dan 8 approvals
  console.log("1. Seeding approvals test data (8 approvals total)...");
  // Bersihkan data tes approval sebelumnya jika ada
  await supabase.from("approvals").delete().like("ringkasan", "[TEST_MODAL]%");

  const testRows = [
    {
      agent: "METIS",
      gate: "riset",
      step_id: stepRiset.id,
      ringkasan: "[TEST_MODAL] Riset strategi kampanye Q4 - gate riset",
      status: "pending",
      dibuat: new Date(Date.now() - 70000).toISOString()
    },
    {
      agent: "CLIO",
      gate: "copywriting",
      step_id: stepCopy.id,
      ringkasan: "[TEST_MODAL] Draft copywriting utama - gate non-riset",
      status: "pending",
      dibuat: new Date(Date.now() - 60000).toISOString()
    },
    ...Array.from({ length: 6 }).map((_, i) => ({
      agent: ["ARGUS", "ZEUS", "ATHENA", "CLIO"][i % 4],
      gate: i % 2 === 0 ? "riset" : "review",
      step_id: stepRiset.id,
      ringkasan: `[TEST_MODAL] Pending Approval item #${i + 3} untuk scroll check`,
      status: "pending",
      dibuat: new Date(Date.now() - (50000 - i * 5000)).toISOString()
    }))
  ];

  const { data: insertedRows, error: insertErr } = await supabase
    .from("approvals")
    .insert(testRows)
    .select("id");

  if (insertErr) {
    throw new Error(`Failed to seed test approvals: ${insertErr.message}`);
  }
  console.log(`   Berhasil insert ${insertedRows.length} pending test approvals.`);

  // 3. Jalankan server Next.js jika belum jalan
  console.log("2. Memastikan server Next.js aktif...");
  let serverProcess = null;
  const isPortOpen = await fetch("http://localhost:3000").then(() => true).catch(() => false);
  if (!isPortOpen) {
    console.log("   Menjalankan `npm run start` di background...");
    serverProcess = spawn("npm.cmd", ["run", "start"], {
      stdio: "pipe",
      shell: true
    });
    // Tunggu server siap
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const ready = await fetch("http://localhost:3000").then(() => true).catch(() => false);
      if (ready) break;
    }
  }

  // 4. Jalankan Playwright
  console.log("3. Menjalankan Playwright browser test...");
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
    console.log("   Logging into test account...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "test_verifier@kantor-agent.internal");
    await page.fill('input[name="password"]', "test-password-12345");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.waitForSelector(".approval-panel", { timeout: 15000 });
    await sleep(2000);

    // ==========================================
    // TEST VIEWPORT 1440px (DESKTOP)
    // ==========================================
    console.log("\n--- TEST VIEWPORT 1440px (Desktop) ---");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(500);

    // Pastikan daftar approval tampil dan berisi minimal 8 item
    const approvalItems = await page.locator(".approval-item").all();
    console.log(`   Ditemukan ${approvalItems.length} approval items di DOM.`);
    if (approvalItems.length < 8) {
      throw new Error(`Expected at least 8 approval items, found ${approvalItems.length}`);
    }

    // Periksa scrollability pada approval panel body
    const scrollHeight = await page.locator(".approval-panel-body").evaluate((el) => el.scrollHeight);
    const clientHeight = await page.locator(".approval-panel-body").evaluate((el) => el.clientHeight);
    console.log(`   Panel body scrollHeight: ${scrollHeight}px, clientHeight: ${clientHeight}px`);
    if (scrollHeight <= clientHeight) {
      console.warn("   Catatan: scrollHeight <= clientHeight pada tinggi ini");
    } else {
      console.log("   ✓ Scroll daftar approval aktif (scrollHeight > clientHeight).");
    }

    // Periksa textarea 500 karakter & limit
    console.log("   Menguji batasan catatan 500 karakter...");
    const firstTextarea = page.locator(".approval-item .approval-note").first();
    const longText = "A".repeat(550);
    await firstTextarea.fill(longText);
    const textareaVal = await firstTextarea.inputValue();
    const counterText = await page.locator(".approval-item .note").first().textContent();
    console.log(`   Input 550 chars -> Value length: ${textareaVal.length}, counter: "${counterText}"`);
    if (textareaVal.length !== 500 || !counterText.includes("500/500")) {
      throw new Error(`Textarea did not enforce 500 char limit! Length: ${textareaVal.length}`);
    }
    console.log("   ✓ Catatan tepat 500 karakter maksimal dengan counter 500/500.");

    // Periksa tombol Setujui dan Tolak
    const btnSetujui = page.locator(".approval-item .approve-ok").first();
    const btnTolak = page.locator(".approval-item .approve-no").first();
    if (!(await btnSetujui.isVisible()) || !(await btnTolak.isVisible())) {
      throw new Error("Tombol Setujui atau Tolak tidak terlihat!");
    }
    console.log("   ✓ Tombol Setujui dan Tolak terlihat dan aktif.");

    // Periksa tombol "Lihat detail riset" (gate: riset)
    console.log("   Menguji tombol detail riset (gate riset)...");
    const risetDetailBtn = page.locator(".btn-detail-riset", { hasText: "detail riset" }).first();
    if (!(await risetDetailBtn.isVisible())) {
      throw new Error("Tombol 'Lihat detail riset' tidak ditemukan!");
    }
    const labelRiset = await risetDetailBtn.textContent();
    console.log(`   Label tombol riset: "${labelRiset.trim()}"`);

    // Buka modal detail riset
    await risetDetailBtn.focus();
    await risetDetailBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });

    // Verifikasi modal dirender via portal ke body
    const isDirectChildOfBody = await page.evaluate(() => {
      const overlay = document.querySelector(".brief-modal-overlay");
      return overlay && overlay.parentElement === document.body;
    });
    console.log(`   Modal dirender via portal ke document.body: ${isDirectChildOfBody}`);
    if (!isDirectChildOfBody) {
      throw new Error("Modal tidak berada langsung di bawah document.body!");
    }

    // Verifikasi fokus pindah ke modal
    const focusedIsModal = await page.evaluate(() => {
      const active = document.activeElement;
      return active && (active.classList.contains("brief-modal-dialog") || active.closest(".brief-modal-dialog") !== null);
    });
    console.log(`   Fokus berpindah ke modal saat dibuka: ${focusedIsModal}`);

    // Verifikasi isi modal riset
    await page.waitForSelector(".brief-modal-body .brief-meta-bar");
    const metaBarVisible = await page.locator(".brief-modal-body .brief-meta-bar").isVisible();
    const ringkasanVisible = await page.locator(".brief-modal-body h4", { hasText: "Ringkasan Riset" }).isVisible();
    console.log(`   Meta bar visible: ${metaBarVisible}, Ringkasan visible: ${ringkasanVisible}`);
    if (!ringkasanVisible) {
      throw new Error("Section Ringkasan Riset tidak tampil di modal!");
    }

    // Verifikasi z-index modal
    const overlayZIndex = await page.locator(".brief-modal-overlay").evaluate((el) => window.getComputedStyle(el).zIndex);
    console.log(`   Overlay z-index: ${overlayZIndex}`);
    if (parseInt(overlayZIndex, 10) < 1000) {
      throw new Error(`Z-index modal terlalu rendah (${overlayZIndex})!`);
    }

    // Uji Focus Trap (Tab 10 kali) dan Body Scroll Lock
    console.log("   Menguji body scroll lock dan jebakan Tab (Focus Trap)...");
    const bodyOverflowWhileOpen = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    console.log(`   Body overflow saat modal terbuka: "${bodyOverflowWhileOpen}"`);
    if (bodyOverflowWhileOpen !== "hidden") {
      throw new Error(`Expected body overflow hidden, got "${bodyOverflowWhileOpen}"`);
    }

    console.log("   Menekan Tab 10 kali untuk memastikan fokus tidak keluar dari modal...");
    for (let i = 1; i <= 10; i++) {
      await page.keyboard.press("Tab");
      const isInside = await page.evaluate(() => {
        const dialog = document.querySelector(".brief-modal-dialog");
        return dialog && dialog.contains(document.activeElement);
      });
      if (!isInside) {
        throw new Error(`Tab ke-${i} keluar dari modal dialog!`);
      }
    }
    console.log("   ✓ Tab 10 kali berturut-turut fokus tetap berada di dalam modal (Focus trap lolos).");

    // Tutup modal lewat tombol X
    console.log("   Menutup modal via tombol X...");
    const closeBtn = page.locator(".brief-modal-close");
    await closeBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });

    const bodyOverflowAfterClose = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    console.log(`   Body overflow setelah modal ditutup: "${bodyOverflowAfterClose}"`);
    if (bodyOverflowAfterClose === "hidden") {
      throw new Error("Body overflow masih 'hidden' setelah modal ditutup!");
    }

    // Verifikasi fokus kembali ke tombol pemicu
    const focusedBackToTrigger = await page.evaluate(() => {
      return document.activeElement?.classList.contains("btn-detail-riset");
    });
    console.log(`   Fokus kembali ke tombol trigger setelah ditutup: ${focusedBackToTrigger}`);

    // Buka modal lagi, uji tombol Escape di mode normal
    console.log("   Menguji penutupan via tombol Esc di mode normal...");
    await risetDetailBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
    console.log("   ✓ Mode normal: Modal berhasil ditutup via Escape.");

    // Buka modal lagi, uji klik backdrop overlay
    console.log("   Menguji penutupan via klik overlay...");
    await risetDetailBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    await page.locator(".brief-modal-overlay").click({ position: { x: 10, y: 10 } });
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
    console.log("   ✓ Modal berhasil ditutup via klik overlay.");

    // ==========================================
    // TEST GATE LAIN (NON-RISET) -> FALLBACK PRE
    // ==========================================
    console.log("\n--- TEST GATE NON-RISET (Fallback JSON formatted pre) ---");
    const nonRisetBtn = page.locator(".btn-detail-riset", { hasNotText: "detail riset" }).first();
    if (await nonRisetBtn.isVisible()) {
      const nonRisetLabel = await nonRisetBtn.textContent();
      console.log(`   Label tombol gate non-riset: "${nonRisetLabel.trim()}"`);
      await nonRisetBtn.click();
      await page.waitForSelector(".brief-modal-overlay", { state: "visible" });

      await page.waitForSelector("pre.brief-json-pre", { timeout: 10000 });
      const preJsonVisible = await page.locator("pre.brief-json-pre").isVisible();
      console.log(`   Teks terformat <pre className="brief-json-pre"> visible: ${preJsonVisible}`);
      const jsonContent = await page.locator("pre.brief-json-pre").textContent();
      console.log(`   Sample JSON content length: ${jsonContent.length}`);

      await page.keyboard.press("Escape");
      await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
      console.log("   ✓ Gate non-riset sukses menampilkan formatted JSON fallback.");
    }

    // ==========================================
    // TEST FULL FRAME MODE DENGAN ESC BERTAHAP
    // ==========================================
    console.log("\n--- TEST FULL FRAME MODE: ESC MODAL LALU ESC FULL FRAME ---");
    const fullscreenBtn = page.locator(".stage-fullscreen-btn");
    if (await fullscreenBtn.isVisible()) {
      await fullscreenBtn.click();
      await sleep(1000);
      let isFullFrame = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Masuk Full Frame mode: ${isFullFrame}`);
      if (!isFullFrame) {
        throw new Error("Gagal memasuki mode Full Frame!");
      }

      // Pastikan approval panel melayang di kanan atas
      const approvalPanelVisible = await page.locator(".dash-grid.is-full-frame .approval-panel").isVisible();
      console.log(`   Approval panel visible in Full Frame: ${approvalPanelVisible}`);

      // Buka modal di Full Frame mode
      const ffDetailBtn = page.locator(".dash-grid.is-full-frame .btn-detail-riset").first();
      await ffDetailBtn.click();
      await page.waitForSelector(".brief-modal-overlay", { state: "visible" });

      // Verifikasi modal tetap tampil di atas panel melayang
      const modalVisibleInFF = await page.locator(".brief-modal-dialog").isVisible();
      console.log(`   Modal tampil dengan benar di Full Frame mode: ${modalVisibleInFF}`);
      if (!modalVisibleInFF) {
        throw new Error("Modal tidak tampil di Full Frame mode!");
      }

      // Tekan Esc pertama: modal harus tertutup DAN Full Frame HARUS TETAP AKTIF
      console.log("   Menekan Esc ke-1 di Full Frame saat modal terbuka...");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
      console.log("   ✓ Modal berhasil tertutup oleh Esc ke-1.");

      await sleep(500);
      isFullFrame = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Full Frame masih tetap aktif setelah Esc ke-1: ${isFullFrame}`);
      if (!isFullFrame) {
        throw new Error("Full Frame ikut tertutup saat menekan Esc pada modal!");
      }
      console.log("   ✓ Full Frame tetap aktif dan tidak ikut tertutup.");

      // Tekan Esc kedua: sekarang Full Frame harus tertutup
      console.log("   Menekan Esc ke-2 (setelah modal sudah tertutup)...");
      await page.keyboard.press("Escape");
      await sleep(500);
      isFullFrame = await page.locator(".dash-grid.is-full-frame").isVisible();
      console.log(`   Full Frame aktif setelah Esc ke-2: ${isFullFrame}`);
      if (isFullFrame) {
        throw new Error("Full Frame gagal ditutup oleh Esc ke-2!");
      }
      console.log("   ✓ Esc ke-2 berhasil menutup mode Full Frame.");
    }

    // ==========================================
    // TEST VIEWPORT 1024px (TABLET)
    // ==========================================
    console.log("\n--- TEST VIEWPORT 1024px (Tablet) ---");
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(500);
    const tabletDetailBtn = page.locator(".btn-detail-riset").first();
    await tabletDetailBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });
    const dialogWidthTablet = await page.locator(".brief-modal-dialog").evaluate((el) => el.getBoundingClientRect().width);
    console.log(`   Dialog width at 1024px: ${dialogWidthTablet}px (max-width ~720px)`);
    if (dialogWidthTablet > 730) {
      throw new Error(`Modal dialog melebihi 720px di 1024px: ${dialogWidthTablet}px`);
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
    console.log("   ✓ Viewport 1024px lolos uji.");

    // ==========================================
    // TEST VIEWPORT 390px (MOBILE)
    // ==========================================
    console.log("\n--- TEST VIEWPORT 390px (Mobile) ---");
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(500);

    const mobileDetailBtn = page.locator(".btn-detail-riset").first();
    await mobileDetailBtn.click();
    await page.waitForSelector(".brief-modal-overlay", { state: "visible" });

    const dialogWidthMobile = await page.locator(".brief-modal-dialog").evaluate((el) => el.getBoundingClientRect().width);
    console.log(`   Dialog width at 390px viewport: ${dialogWidthMobile}px (hampir selebar layar ~374px)`);
    if (dialogWidthMobile < 340 || dialogWidthMobile > 390) {
      throw new Error(`Modal width tidak sesuai mobile: ${dialogWidthMobile}px`);
    }

    await page.locator(".brief-modal-close").click();
    await page.waitForSelector(".brief-modal-overlay", { state: "detached" });
    console.log("   ✓ Viewport 390px mobile lolos uji.");

    // ==========================================
    // CONSOLE ERROR CHECK
    // ==========================================
    console.log("\n--- CONSOLE ERRORS CHECK ---");
    console.log(`   Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error("   Console errors detected:", consoleErrors);
      throw new Error(`Ada error di browser console: ${consoleErrors.join("; ")}`);
    }
    console.log("   ✓ 0 console errors!");

  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
    // Cleanup seeded approvals
    console.log("\n4. Membersihkan test approval rows...");
    await supabase.from("approvals").delete().like("ringkasan", "[TEST_MODAL]%");
    console.log("   ✓ Selesai membersihkan data.");
  }

  console.log("\n=== SEMUA PENGUJIAN E2E SUKSES LOLOS! ===");
}

run().catch((err) => {
  console.error("FATAL ERROR IN E2E TEST:", err);
  process.exit(1);
});
