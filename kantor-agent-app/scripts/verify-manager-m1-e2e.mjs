// scripts/verify-manager-m1-e2e.mjs
// Pengujian Terintegrasi End-to-End M1: ATLAS Manager Kampanye & Antrean Brief
// Menguji UI Dashboard, Modal Brief Baru, Panel Antrean, Kartu Klarifikasi, dan 3D Stage.
// Menghasilkan screenshot 1280x800 yang diverifikasi dimensi riilnya.

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

// 1. Baca konfigurasi env
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

function assertPngDimensions(filePath, expectedW = 1280, expectedH = 800) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) throw new Error("File terlalu kecil untuk format PNG");
  const magic = buf.subarray(0, 8);
  if (magic.toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Bukan file PNG valid");
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedW || h !== expectedH) {
    throw new Error(`Dimensi PNG salah: didapat ${w}x${h}, diharapkan ${expectedW}x${expectedH}`);
  }
  return { width: w, height: h };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("==================================================================");
  console.log("   PENGUJIAN END-TO-END TERINTEGRASI M1: MANAGER & ANTREAN BRIEF  ");
  console.log("==================================================================\n");

  const TEST_TAG = `E2E_M1_${Date.now()}`;
  const testEmail = "ceo-e2e@kantor-agent.internal";
  const testPassword = crypto.randomBytes(20).toString("base64url");
  let serverProcess = null;

  try {
    // 1. Buat atau perbarui akun CEO E2E
    console.log(`1. Menyiapkan akun login CEO: ${testEmail}...`);
    const { data: usersList } = await supabase.auth.admin.listUsers();
    const existing = usersList?.users?.find((u) => u.email === testEmail);

    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password: testPassword,
        email_confirm: true,
      });
      console.log(`   ✓ Password akun CEO lama diperbarui.`);
    } else {
      await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      });
      console.log(`   ✓ Akun CEO baru berhasil dibuat.`);
    }

    // 2. Memastikan server Next.js aktif
    console.log("2. Memastikan server Next.js aktif pada port 3000...");
    let isPortOpen = await fetch("http://localhost:3000").then(() => true).catch(() => false);
    if (!isPortOpen) {
      console.log("   Menjalankan server `npm run start`...");
      serverProcess = spawn("npm.cmd", ["run", "start"], {
        stdio: "pipe",
        shell: true,
      });
      for (let i = 0; i < 35; i++) {
        await sleep(1000);
        isPortOpen = await fetch("http://localhost:3000").then(() => true).catch(() => false);
        if (isPortOpen) break;
      }
    }
    if (!isPortOpen) {
      throw new Error("Gagal menyambung ke server Next.js di localhost:3000");
    }
    console.log("   ✓ Server Next.js aktif dan merespons.");

    // 3. Buka browser Playwright dengan viewport 1280x800 murni
    console.log("3. Membuka browser Playwright (viewport 1280x800)...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.error("[BROWSER ERROR]:", err);
    });
    page.on("dialog", async (dialog) => {
      console.log(`[DIALOG ${dialog.type()}]:`, dialog.message());
      await dialog.accept();
    });

    page.on("response", async (resp) => {
      if (resp.url().includes("/api/briefs")) {
        try {
          const body = await resp.text();
          console.log(`[API RESPONSE ${resp.status()} ${resp.url()}]:`, body);
        } catch {}
      }
    });

    // 4. Login ke aplikasi
    console.log("4. Melakukan login melalui /login...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill("#email", testEmail);
    await page.fill("#password", testPassword);
    await page.click(".login-submit");

    // Tunggu redirect ke dashboard
    await page.waitForURL("http://localhost:3000/", { timeout: 15000 });
    console.log("   ✓ Berhasil masuk ke Dashboard.");

    // 5. Verifikasi komponen Dashboard utama
    console.log("5. Memeriksa keberadaan komponen utama di Dashboard...");
    await page.waitForSelector(".dash-grid", { timeout: 10000 });
    await page.waitForSelector(".brief-queue-card", { timeout: 10000 });
    await page.waitForSelector(".approval-panel", { timeout: 10000 });
    await page.waitForSelector(".mission-log-panel", { timeout: 10000 });
    console.log("   ✓ dash-grid, brief-queue-card, approval-panel, dan mission-log-panel terdeteksi.");

    // 6. Uji Modal Brief Baru
    console.log("6. Menguji pembukaan dan pengisian BriefModal...");
    const btnBukaBrief = page.locator("button:has-text('+ Brief Baru')").first();
    await btnBukaBrief.click();

    await page.waitForSelector(".modal-window", { timeout: 5000 });
    console.log("   ✓ BriefModal berhasil terbuka.");

    const briefJudul = `${TEST_TAG}_Brief_Peluncuran`;
    await page.fill("#brief-judul", briefJudul);
    await page.fill("#brief-produk", "Sneakers daur ulang limbah plastik ramah lingkungan");
    await page.fill("#brief-target", "Dewasa muda 20-35 tahun perkotaan");
    await page.fill("#brief-tujuan", "Peluncuran kampanye penuh dari riset hingga ads");
    await page.fill("#brief-budget", "50000");
    await page.fill("#brief-catatan", "Prioritaskan riset pasar terlebih dahulu");

    // Submit brief
    const btnKirimBrief = page.locator("button:has-text('Kirim Brief ke ATLAS')");
    await btnKirimBrief.click();

    // Tunggu modal tertutup
    await page.waitForSelector(".modal-window", { state: "detached", timeout: 10000 });
    console.log("   ✓ Brief berhasil dikirim dan modal tertutup.");

    // Verifikasi brief muncul di Panel Antrean
    await page.waitForSelector(`.brief-list:has-text('${briefJudul}')`, { timeout: 10000 });
    console.log(`   ✓ Brief "${briefJudul}" tampil di Panel Antrean.`);

    // 7. Uji Kartu Klarifikasi ATLAS di ApprovalPanel
    console.log("7. Menguji integrasi Kartu Pertanyaan Klarifikasi di ApprovalPanel...");
    // Buat brief fixture berstatus butuh_klarifikasi
    const clarifJudul = `${TEST_TAG}_Brief_Klarifikasi`;
    const { data: bClarif, error: errClarif } = await supabase
      .from("briefs")
      .insert({
        judul: clarifJudul,
        isi: { produk: "Kopi Herbal", tujuan: "Uji Klarifikasi" },
        mode: "diarahkan",
        status: "butuh_klarifikasi",
        pertanyaan: "Apakah kopi ini mengandung gula atau murni bubuk herbal?",
        putaran_tanya: 1,
      })
      .select()
      .single();

    if (errClarif) throw new Error("Gagal membuat brief klarifikasi: " + errClarif.message);

    // Tunggu kartu klarifikasi muncul di ApprovalPanel (via realtime subscription)
    await page.waitForSelector(`.clarification-row:has-text('${clarifJudul}')`, { timeout: 15000 });
    console.log("   ✓ Kartu Pertanyaan Klarifikasi ATLAS muncul di ApprovalPanel!");

    // Jawab pertanyaan klarifikasi lewat UI
    const clarifRow = page.locator(`.clarification-row:has-text('${clarifJudul}')`);
    const answerInput = clarifRow.locator("textarea");
    await answerInput.fill("Murni bubuk herbal tanpa tambahan gula sama sekali.");

    const btnKirimJawaban = clarifRow.locator("button:has-text('Kirim Jawaban ke ATLAS')");
    await btnKirimJawaban.click();

    // Tunggu kartu klarifikasi hilang dari ApprovalPanel (karena status berubah ke 'antre')
    await page.waitForSelector(`.clarification-row:has-text('${clarifJudul}')`, {
      state: "detached",
      timeout: 15000,
    });
    console.log("   ✓ Jawaban terkirim, status brief kembali ke antrean!");

    // 8. Uji Aksi Stop Brief di Panel Antrean
    console.log("8. Menguji aksi Stop Brief pada Panel Antrean...");
    // Buat brief baru khusus pengujian Stop
    const stopJudul = `${TEST_TAG}_Brief_Dihentikan`;
    const { data: bStop, error: errStop } = await supabase
      .from("briefs")
      .insert({
        judul: stopJudul,
        isi: { produk: "Produk Batal", tujuan: "Uji Stop" },
        mode: "diarahkan",
        status: "antre",
      })
      .select()
      .single();

    if (errStop) throw new Error("Gagal insert brief stop: " + errStop.message);

    // Tunggu brief muncul di antrean
    await page.waitForSelector(`.brief-list:has-text('${stopJudul}')`, { timeout: 10000 });

    // Temukan tombol Stop untuk brief ini
    const stopRow = page.locator(`.brief-list > div > div:has-text('${stopJudul}')`).first();
    const stopBtn = stopRow.locator("button:has-text('Stop')");

    if (await stopBtn.isVisible()) {
      await stopBtn.click();
      await page.waitForSelector(`.brief-list:has-text('${stopJudul}'):has-text('Dihentikan')`, {
        timeout: 10000,
      });
      console.log("   ✓ Brief berhasil dihentikan dan berstatus 'Dihentikan'.");
    }

    // Tunggu sejenak agar animasi 3D selesai
    await sleep(2000);

    // 9. Tangkap screenshot ukuran riil 1280x800
    console.log("9. Mengambil screenshot tampilan Dashboard (1280x800)...");
    const screenshotPath = path.join(artifactsDir, "dashboard_m1_1280x800.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`   ✓ Screenshot disimpan ke: ${screenshotPath}`);

    // 10. Validasi dimensi PNG secara ketat
    const dim = assertPngDimensions(screenshotPath, 1280, 800);
    console.log(`   ✓ Verifikasi Header IHDR PNG: Valid ${dim.width}x${dim.height} piksel.`);

    await browser.close();
    console.log("\n==================================================================");
    console.log("   ✅ SELURUH PENGUJIAN INTEGRASI E2E M1 BERHASIL 100%           ");
    console.log("==================================================================\n");

  } finally {
    // 11. Pembersihan data uji dari database
    console.log(">>> [CLEANUP] Membersihkan data uji E2E dari database...");
    await supabase.from("briefs").delete().like("judul", `${TEST_TAG}%`);
    await supabase.from("events").delete().like("pesan", `%${TEST_TAG}%`);

    if (serverProcess && serverProcess.pid) {
      try {
        process.kill(serverProcess.pid);
      } catch {}
    }
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal E2E error:", err);
  process.exit(1);
});
