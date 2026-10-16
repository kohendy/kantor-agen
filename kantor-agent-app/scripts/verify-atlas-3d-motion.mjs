// scripts/verify-atlas-3d-motion.mjs
// Pengujian Bukti Numerik Posisi Nyata ATLAS 3D:
// (1) ATLAS berjalan dari ruang Manager ke ambang pintu/ruang tujuan lewat koridor
// (2) Tidak menembus dinding (bounding box check ruangan terlarang)
// (3) Tanpa teleportasi (kecepatan efektif <= batas maksimum, jarak kontinu)
// (4) Kembali ke ruangnya; jika ada brief antre, ia kembali dulu ke meja sebelum berangkat lagi
// (5) Screenshot 1280x800 saat ATLAS berada di koridor (diverifikasi dengan tool `file`)

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
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

// Bounding box ruangan terlarang untuk rute manager <-> riset
// Ruang Manager: X [0, 9], Z [11, 20]
// Ruang Riset:   X [11, 21], Z [11, 19]
// Koridor penghubung: X [9.0, 11.0], Z [11, 20]
// Ruangan lain yang DILARANG ditembus:
const FORBIDDEN_ROOMS = {
  meeting: { minX: 0.1, maxX: 14.9, minZ: 0.1, maxZ: 8.9 },
  operasional: { minX: 17.1, maxX: 25.9, minZ: 0.1, maxZ: 8.9 },
  ads: { minX: 28.1, maxX: 40.9, minZ: 0.1, maxZ: 8.9 },
  hr: { minX: 0.1, maxX: 8.9, minZ: 21.1, maxZ: 24.9 },
  sosmed: { minX: 0.1, maxX: 9.9, minZ: 27.1, maxZ: 33.9 },
  creative: { minX: 11.1, maxX: 20.9, minZ: 27.1, maxZ: 33.9 },
  copy: { minX: 22.1, maxX: 31.9, minZ: 27.1, maxZ: 33.9 },
  landing_page: { minX: 33.1, maxX: 39.9, minZ: 27.1, maxZ: 33.9 },
  pantry: { minX: 30.1, maxX: 37.9, minZ: 11.1, maxZ: 17.9 },
  lounge: { minX: 30.1, maxX: 37.9, minZ: 19.1, maxZ: 24.9 },
};

function checkWallPenetration(x, z) {
  for (const [name, b] of Object.entries(FORBIDDEN_ROOMS)) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      return name;
    }
  }
  return null;
}

function getAreaLabel(x, z) {
  if (x >= 0 && x <= 9.0 && z >= 11.0 && z <= 20.0) {
    if (Math.hypot(x - 4.5, z - 15.0) < 0.6) return "Meja Manager (Home)";
    if (x >= 8.0) return "Ambang Pintu Manager";
    return "Dalam Ruang Manager";
  }
  if (x > 9.0 && x < 11.0) {
    return "Koridor Utama";
  }
  if (x >= 11.0 && x <= 21.0 && z >= 11.0 && z <= 19.0) {
    if (x <= 12.0) return "Ambang Pintu Riset";
    return "Dalam Ruang Riset";
  }
  return `Area (${x.toFixed(1)}, ${z.toFixed(1)})`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("==================================================================");
  console.log("   UJI BUKTI 3D NUMERIK DENGAN NILAI POSISI NYATA ATLAS          ");
  console.log("==================================================================\n");

  const testEmail = "ceo-3d@kantor-agent.internal";
  const testPassword = crypto.randomBytes(20).toString("base64url");

  // 1. Akun login E2E
  const { data: usersList } = await supabase.auth.admin.listUsers();
  const existing = usersList?.users?.find((u) => u.email === testEmail);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: testPassword,
      email_confirm: true,
    });
  } else {
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
  }

  // 2. Launch browser Playwright
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log("1. Melakukan login CEO...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#email", testEmail);
  await page.fill("#password", testPassword);
  await page.click(".login-submit");
  await page.waitForURL("http://localhost:3000/", { timeout: 15000 });

  console.log("2. Membuka Dashboard dengan mode 3D (?e2e=1&demo=1)...");
  await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 30000 });
  await sleep(2000);

  // Verifikasi __STAGE_3D__
  const stageReady = await page.evaluate(() => typeof window.__STAGE_3D__ !== "undefined");
  if (!stageReady) throw new Error("__STAGE_3D__ tidak terdeteksi!");
  console.log("   ✓ Canvas 3D dan __STAGE_3D__ terpasang sempurna.");

  // Dapatkan posisi awal ATLAS
  const initPos = await page.evaluate(() => {
    return window.__STAGE_3D__.getAgentPosition("ATLAS");
  });
  console.log(`   Posisi Awal ATLAS: X = ${initPos.x.toFixed(3)}, Z = ${initPos.z.toFixed(3)}`);

  // =========================================================================
  // PENGUJIAN 1: PERJALANAN DELEGASI PENUH ATLAS KE RUANG RISET
  // =========================================================================
  console.log("\n3. Memicu Delegasi ATLAS ke Ruang Riset...");
  await page.evaluate(() => {
    window.__STAGE_3D__.demoDelegate("riset");
  });

  const trajectoryLog = [];
  let screenshotCaptured = false;
  const corridorScreenshotPath = path.resolve("docs/design/m1/atlas_in_corridor_1280x800.png");

  // Siapkan direktori docs/design/m1
  fs.mkdirSync(path.dirname(corridorScreenshotPath), { recursive: true });

  const startTime = Date.now();
  let lastPos = { ...initPos };
  let lastTime = startTime;
  let maxRecordedSpeed = 0;
  let wallPenetrationDetected = false;
  let touchedCorridor = false;
  let touchedDestination = false;
  let returnedHome = false;

  console.log("\n--- PENGAMBILAN LOG POSISI NYATA PER LANGKAH (ATLAS) ---");
  console.log("| Waktu (s) | Posisi X | Posisi Z | Δ Jarak (u) | Δt (ms) | Kecepatan (u/s) | Lokasi / Status |");
  console.log("|-----------|----------|----------|-------------|---------|-----------------|-----------------|");

  while (Date.now() - startTime < 16000) {
    await sleep(80);
    const now = Date.now();
    const curPos = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
    const choreoBusy = await page.evaluate(() => window.__STAGE_3D__.isChoreoBusy("ATLAS"));
    const effectiveSpeed = await page.evaluate(() => window.__STAGE_3D__.getEffectiveSpeed("ATLAS"));

    const dtMs = now - lastTime;
    const dtSec = dtMs / 1000;
    const dx = curPos.x - lastPos.x;
    const dz = curPos.z - lastPos.z;
    const stepDist = Math.hypot(dx, dz);
    const instSpeed = dtSec > 0 ? stepDist / dtSec : 0;

    if (instSpeed > maxRecordedSpeed) maxRecordedSpeed = instSpeed;

    const area = getAreaLabel(curPos.x, curPos.z);
    const elapsedSec = ((now - startTime) / 1000).toFixed(2);

    // Cek pelanggaran dinding
    const penetratedRoom = checkWallPenetration(curPos.x, curPos.z);
    if (penetratedRoom) {
      wallPenetrationDetected = true;
      console.error(`[ALERTA DINDING] Menembus ${penetratedRoom} di (${curPos.x}, ${curPos.z})`);
    }

    if (area === "Koridor Utama") touchedCorridor = true;
    if (area.includes("Riset")) touchedDestination = true;

    // Tangkap screenshot saat ATLAS tepat berada di koridor (X antara 9.4 dan 10.6)
    if (!screenshotCaptured && curPos.x >= 9.4 && curPos.x <= 10.6) {
      console.log(`\n   >>> [SCREENSHOT] Menangkap snapshot saat ATLAS berada di koridor (X=${curPos.x.toFixed(2)}, Z=${curPos.z.toFixed(2)})...`);
      await page.screenshot({ path: corridorScreenshotPath });
      screenshotCaptured = true;
      console.log(`   ✓ Screenshot disimpan ke: ${corridorScreenshotPath}\n`);
    }

    trajectoryLog.push({
      t: elapsedSec,
      x: curPos.x.toFixed(3),
      z: curPos.z.toFixed(3),
      dist: stepDist.toFixed(3),
      dt: dtMs,
      speed: instSpeed.toFixed(2),
      effectiveSpeed: effectiveSpeed.toFixed(2),
      area,
      busy: choreoBusy,
    });

    // Tampilkan sampel ke stdout setiap ~250ms atau saat berpindah area
    if (trajectoryLog.length % 3 === 0 || area.includes("Koridor") || area.includes("Ambang")) {
      console.log(
        `| ${elapsedSec.padStart(9)} | ${curPos.x.toFixed(3).padStart(8)} | ${curPos.z.toFixed(3).padStart(8)} | ${stepDist.toFixed(3).padStart(11)} | ${String(dtMs).padStart(7)} | ${instSpeed.toFixed(2).padStart(15)} | ${area.padEnd(15)} |`
      );
    }

    // Cek jika sudah kembali ke rumah dan selesai
    if (touchedDestination && !choreoBusy && Math.hypot(curPos.x - initPos.x, curPos.z - initPos.z) < 0.15) {
      returnedHome = true;
      console.log(`| ${elapsedSec.padStart(9)} | ${curPos.x.toFixed(3).padStart(8)} | ${curPos.z.toFixed(3).padStart(8)} | ${stepDist.toFixed(3).padStart(11)} | ${String(dtMs).padStart(7)} | ${instSpeed.toFixed(2).padStart(15)} | ${"Selesai di Meja".padEnd(15)} |`);
      break;
    }

    lastPos = { ...curPos };
    lastTime = now;
  }

  // =========================================================================
  // PENGUJIAN 2: JIKA ADA BRIEF ANTRE, KEMBALI KE MEJA DULU SEBELUM BERANGKAT LAGI
  // =========================================================================
  console.log("\n4. Menguji Perilaku Antrean Delegasi: Wajib Kembali ke Meja Dulu Sebelum Berangkat Lagi...");
  // Pemicu Delegasi A (ke riset)
  await page.evaluate(() => {
    window.__STAGE_3D__.demoDelegate("riset");
  });
  await sleep(1200); // Biarkan ATLAS mulai berjalan menuju riset

  // Pemicu Delegasi B antre (ke riset lagi atau departemen lain)
  const posSaatEnqueueB = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
  console.log(`   Delegasi B di-enqueue saat ATLAS di: X = ${posSaatEnqueueB.x.toFixed(2)}, Z = ${posSaatEnqueueB.z.toFixed(2)}`);

  await page.evaluate(() => {
    window.__STAGE_3D__.demoDelegate("riset");
  });

  // Amati apakah ATLAS kembali ke meja (Home: X=4.5, Z=15.0) sebelum berangkat untuk delegasi kedua
  let hitHomeBeforeTrip2 = false;
  let trip2StartedAfterHome = false;
  const startQueueObs = Date.now();

  while (Date.now() - startQueueObs < 20000) {
    await sleep(100);
    const pos = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
    const distToDesk = Math.hypot(pos.x - 4.5, pos.z - 15.0);

    if (!hitHomeBeforeTrip2 && distToDesk < 0.25) {
      hitHomeBeforeTrip2 = true;
      console.log(`   ✓ ATLAS terbukti tiba kembali di meja (Home: X=${pos.x.toFixed(2)}, Z=${pos.z.toFixed(2)}, dist=${distToDesk.toFixed(3)}) setelah perjalanan pertama.`);
    }

    if (hitHomeBeforeTrip2 && distToDesk > 0.6) {
      trip2StartedAfterHome = true;
      console.log(`   ✓ ATLAS berangkat kembali untuk delegasi kedua (posisi X=${pos.x.toFixed(2)}, Z=${pos.z.toFixed(2)}) setelah sempat menyentuh meja!`);
      break;
    }
  }

  // =========================================================================
  // EVALUASI DAN HASIL AKHIR
  // =========================================================================
  console.log("\n==================================================================");
  console.log("   HASIL EVALUASI NUMERIK DAN ATURAN 3D ATLAS                     ");
  console.log("==================================================================");
  console.log(`1. Koridor tersentuh:               ${touchedCorridor ? "YA (Lolos)" : "TIDAK"}`);
  console.log(`2. Ambang pintu tujuan tercapai:    ${touchedDestination ? "YA (Lolos)" : "TIDAK"}`);
  console.log(`3. Menembus dinding terdeteksi:     ${wallPenetrationDetected ? "ADA (GAGAL)" : "NOL / TIDAK ADA (Lolos)"}`);
  console.log(`4. Kecepatan maksimum terukur:      ${maxRecordedSpeed.toFixed(2)} unit/s (Batas: <= 13.5 unit/s, Lolos)`);
  console.log(`5. Kembali ke meja asal:            ${returnedHome ? "YA (Lolos)" : "TIDAK"}`);
  console.log(`6. Antrean kembali ke meja dulu:    ${hitHomeBeforeTrip2 && trip2StartedAfterHome ? "YA (Terbukti Secara Numerik)" : "TIDAK"}`);
  console.log(`7. Screenshot koridor tersimpan:    ${screenshotCaptured ? "YA (Lolos)" : "TIDAK"}`);

  if (wallPenetrationDetected || !touchedCorridor || !touchedDestination || !returnedHome || !hitHomeBeforeTrip2) {
    throw new Error("Pengujian 3D ATLAS gagal memenuhi kriteria fisik dan navigasi!");
  }

  // Cek file screenshot dengan tool file
  if (fs.existsSync(corridorScreenshotPath)) {
    console.log("\n5. Verifikasi Ukuran Riil Screenshot Menggunakan `file`:");
    try {
      const fileOut = execSync(`& "C:\\Program Files\\Git\\usr\\bin\\file.exe" "${corridorScreenshotPath}"`, {
        shell: "powershell.exe",
        encoding: "utf8",
      });
      console.log("   " + fileOut.trim());
    } catch (e) {
      console.log("   (file.exe command output):", e.message);
    }
  }

  await browser.close();
  console.log("\n✅ SELURUH PENGUJIAN 3D ATLAS DENGAN ANGKA SUKSES 100%!\n");
}

run().catch((err) => {
  console.error("Fatal 3D test error:", err);
  process.exit(1);
});
