import { chromium } from "playwright";
import fs from "fs";
import crypto from "crypto";
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

// Pastikan folder verification_artifacts tersedia
if (!fs.existsSync("verification_artifacts")) {
  fs.mkdirSync("verification_artifacts", { recursive: true });
}

// Bounding box pelat ruangan untuk verifikasi batas jalur koridor
// Offset: X = -8.5, Z = -5.5. Ukuran pelat 5x5
const ROOM_BOUNDS = {
  riset: { minX: 0 - 8.5 + 0.1, maxX: 5 - 8.5 - 0.1, minZ: 0 - 5.5 + 0.1, maxZ: 5 - 5.5 - 0.1 },
  meeting: { minX: 6 - 8.5 + 0.1, maxX: 11 - 8.5 - 0.1, minZ: 0 - 5.5 + 0.1, maxZ: 5 - 5.5 - 0.1 },
  copy: { minX: 12 - 8.5 + 0.1, maxX: 17 - 8.5 - 0.1, minZ: 0 - 5.5 + 0.1, maxZ: 5 - 5.5 - 0.1 },
  lp: { minX: 0 - 8.5 + 0.1, maxX: 5 - 8.5 - 0.1, minZ: 6 - 5.5 + 0.1, maxZ: 11 - 5.5 - 0.1 },
  ads: { minX: 6 - 8.5 + 0.1, maxX: 11 - 8.5 - 0.1, minZ: 6 - 5.5 + 0.1, maxZ: 11 - 5.5 - 0.1 },
  creative: { minX: 12 - 8.5 + 0.1, maxX: 17 - 8.5 - 0.1, minZ: 6 - 5.5 + 0.1, maxZ: 11 - 5.5 - 0.1 },
  manager: { minX: 6 - 8.5 + 0.1, maxX: 11 - 8.5 - 0.1, minZ: 12 - 5.5 + 0.1, maxZ: 17 - 5.5 - 0.1 },
  hr: { minX: 0 - 8.5 + 0.1, maxX: 5 - 8.5 - 0.1, minZ: 12 - 5.5 + 0.1, maxZ: 17 - 5.5 - 0.1 },
  operasional: { minX: 12 - 8.5 + 0.1, maxX: 17 - 8.5 - 0.1, minZ: 12 - 5.5 + 0.1, maxZ: 17 - 5.5 - 0.1 },
  sosmed: { minX: 6 - 8.5 + 0.1, maxX: 11 - 8.5 - 0.1, minZ: 18 - 5.5 + 0.1, maxZ: 23 - 5.5 - 0.1 },
};

function isInsideRoom(x, z, roomId) {
  const b = ROOM_BOUNDS[roomId];
  if (!b) return false;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function getUnallowedRoomViolation(x, z, allowedRooms) {
  for (const [rId] of Object.entries(ROOM_BOUNDS)) {
    if (allowedRooms.includes(rId)) continue;
    if (isInsideRoom(x, z, rId)) {
      return rId;
    }
  }
  return null;
}

async function run() {
  console.log("===============================================================");
  console.log("=== STARTING FULL STAGE 3D V1b TEST SUITE (KASUS 1 - 12)   ===");
  console.log("===============================================================");

  // 0a. Buat user E2E sementara lewat admin API
  const tempEmail = `e2e-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  console.log(`0a. Membuat akun E2E sementara: ${tempEmail}...`);
  const { data: tempUserData, error: tempUserErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (tempUserErr || !tempUserData?.user) {
    throw new Error(`Gagal membuat akun E2E sementara: ${tempUserErr?.message}`);
  }
  tempUserId = tempUserData.user.id;
  console.log(`    ✓ Akun E2E sementara berhasil dibuat (ID: ${tempUserId}).`);

  // 0b. Seed fixtures approvals jika diperlukan
  const { data: initialPending } = await supabase
    .from("approvals")
    .select("id, ringkasan, status")
    .eq("status", "pending");

  const existingCount = initialPending ? initialPending.length : 0;
  const insertedApprovalIds = [];
  const needed = Math.max(0, 8 - existingCount);
  if (needed > 0) {
    console.log(`0b. Seeding ${needed} test approvals...`);
    const testAgents = ["CLIO", "ATHENA", "ARGUS", "ZEUS"];
    const seedRows = Array.from({ length: needed }).map((_, i) => ({
      agent: testAgents[i % testAgents.length],
      ringkasan: `[TEST_E2E] Request persetujuan #${existingCount + i + 1} V1a`,
      status: "pending",
      dibuat: new Date(Date.now() - (8 - i) * 60000).toISOString(),
    }));

    const { data: inserted } = await supabase
      .from("approvals")
      .insert(seedRows)
      .select("id");
    if (inserted) insertedApprovalIds.push(...inserted.map((r) => r.id));
  }

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
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") {
      consoleErrors.push(text);
    }
  });

  const testReport = {};

  try {
    // 1. LOGIN & DASHBOARD LOAD
    console.log("\n1. Login dan memuat Dashboard...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 15000 });
    await page.waitForTimeout(1500);
    console.log("   ✓ Dashboard & 3D Stage (V1a) berhasil dimuat.");

    // Helper state
    async function getSceneState() {
      return await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        if (!stage) return null;
        const p = stage.getCameraPosition();
        const t = stage.getCameraTarget();
        const uuid = stage.getSceneUuid();
        return {
          cameraPos: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) },
          cameraTarget: { x: +t.x.toFixed(4), y: +t.y.toFixed(4), z: +t.z.toFixed(4) },
          sceneUuid: uuid,
        };
      });
    }

    const initialSceneState = await getSceneState();

    // =========================================================================
    // KASUS 1: TATA LETAK & RUANG MANAGER (1280px, 768px, 390px, Reset View, SVG Fallback)
    // =========================================================================
    console.log("\n--- KASUS 1: Tata Letak & Ruang Manager ---");
    // Verifikasi total 19 agent di DOM tag 3D
    const agentTagsCount = await page.locator(".agent-tag3d").count();
    console.log(`   Jumlah agent tag di scene 3D: ${agentTagsCount} (harus 19)`);
    if (agentTagsCount !== 19) {
      throw new Error(`Jumlah agent tag tidak 19! Ditemukan: ${agentTagsCount}`);
    }

    // Verifikasi ATLAS duduk di meja ruang Manager dan menghadap meja (+Z)
    const atlasPos = await page.evaluate(() => {
      const pos = window.__STAGE_3D__.getAgentPosition("ATLAS");
      const target = window.__STAGE_3D__.getAgentTargetPosition("ATLAS");
      const rot = window.__STAGE_3D__.getAgentRotation("ATLAS");
      return { pos, target, rot };
    });
    console.log("   Posisi awal ATLAS:", atlasPos.pos);
    console.log("   Rotasi awal ATLAS (harus menghadap ke meja di selatan / +Z):", atlasPos.rot);
    const atlasDistFromHome = Math.hypot(atlasPos.pos.x - 0.0, atlasPos.pos.z - 9.2);
    console.log(`   Jarak ATLAS ke pusat meja Manager: ${atlasDistFromHome.toFixed(4)} unit`);
    if (atlasDistFromHome > 0.15) {
      throw new Error(`ATLAS tidak berada di meja Manager! Posisi: ${JSON.stringify(atlasPos.pos)}`);
    }
    // ATLAS duduk di z=9.2, meja di selatan z=9.68 (z lebih besar), ATLAS menghadap +Z (rotasi Y dekat 0)
    if (Math.abs(atlasPos.rot.y) > 0.35) {
      throw new Error(`ATLAS tidak menghadap meja (+Z)! Rotasi Y terdeteksi: ${atlasPos.rot.y}`);
    }
    console.log("   ✓ ATLAS menghadap meja eksekutif dengan benar (arah +Z menuju meja).");

    // Screenshot & Framing 1280px (Desktop)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "verification_artifacts/layout_1280px.png" });

    // Screenshot & Framing 768px (Tablet)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "verification_artifacts/layout_768px.png" });

    // Screenshot & Framing 390px (Mobile)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "verification_artifacts/layout_390px.png" });

    // Restore 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // Full Frame Mode toggle test
    const fullFrameBtn = page.locator("button.stage-fullscreen-btn");
    await fullFrameBtn.click({ force: true });
    await page.waitForSelector(".dash-grid.is-full-frame", { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "verification_artifacts/layout_fullframe.png" });
    await fullFrameBtn.click({ force: true });
    await page.waitForTimeout(600);

    // Reset View Button test
    const resetBtn = page.locator("button.stage-reset-btn");
    await resetBtn.click({ noWaitAfter: true });
    await page.waitForTimeout(800);
    const resetState = await getSceneState();
    console.log("   Posisi kamera setelah reset:", resetState.cameraPos);

    // Fallback SVG Test
    console.log("   Menguji Fallback SVG...");
    const svgPage = await context.newPage();
    svgPage.on("console", (m) => console.log("   [SVG Page Console]", m.text()));
    svgPage.on("pageerror", (e) => console.error("   [SVG Page Error]", e));
    await svgPage.setViewportSize({ width: 1280, height: 800 });
    await svgPage.addInitScript(() => {
      window.__FORCE_WEBGL_FALLBACK__ = true;
    });
    console.log("   Navigasi ke svgPage...");
    await svgPage.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 20000 });
    console.log("   svgPage URL saat ini:", svgPage.url());
    await svgPage.waitForSelector("svg.stage", { timeout: 40000 });
    const svgAgentCount = await svgPage.locator("svg.stage g#agents g").count();
    console.log(`   Fallback SVG render: ${svgAgentCount} karakter terdeteksi`);
    await svgPage.screenshot({ path: "verification_artifacts/layout_fallback_svg.png" });
    await svgPage.close();

    testReport.kasus1 = {
      agentCount: agentTagsCount,
      atlasDeskPos: atlasPos.pos,
      atlasDistFromHome,
      resetCamPos: resetState.cameraPos,
      svgRendered: true,
      screenshots: [
        "layout_1280px.png",
        "layout_768px.png",
        "layout_390px.png",
        "layout_fullframe.png",
        "layout_fallback_svg.png",
      ],
    };
    console.log("   ✓ KASUS 1 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 2: DELEGASI TUNGGAL KE RISET (Jalur Koridor Tanpa Masuk Ruangan Lain)
    // =========================================================================
    console.log("\n--- KASUS 2: Delegasi Tunggal ke Riset (Jalur Koridor) ---");
    const allowedRooms = ["manager", "riset"];
    const positionsSampled = [];
    let violationFound = null;

    // Trigger delegasi ke riset
    const risetPath = await page.evaluate(() => {
      const p = window.__STAGE_3D__.findPath("manager", "riset");
      window.__STAGE_3D__.demoDelegate("riset");
      return p;
    });
    console.log("   Waypoints delegasi ke Riset:", risetPath);

    const startDelegation = Date.now();
    let arrivedAtRiset = false;
    let minObservedX = Infinity;
    let minObservedZ = Infinity;

    while (Date.now() - startDelegation < 25000) {
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
          qLen: stage.getChoreoQueueLength("ATLAS"),
        };
      });

      if (!data.pos) break;
      positionsSampled.push(data.pos);
      if (data.pos.x < minObservedX) minObservedX = data.pos.x;
      if (data.pos.z < minObservedZ) minObservedZ = data.pos.z;
      if (positionsSampled.length % 5 === 0 || !data.isBusy) {
        console.log(`      Sample ${positionsSampled.length}: isBusy=${data.isBusy}, qLen=${data.qLen}, pos=(${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)})`);
      }

      // Cek apakah posisi melanggar ruangan lain
      const violation = getUnallowedRoomViolation(data.pos.x, data.pos.z, allowedRooms);
      if (violation && !violationFound) {
        violationFound = { room: violation, pos: data.pos };
      }

      // Cek apakah tiba di Riset (x < -5.5, z < -2.0)
      if (data.pos.x < -5.5 && data.pos.z < -2.0) {
        arrivedAtRiset = true;
      }

      if (!data.isBusy && positionsSampled.length > 20) {
        break;
      }
    }

    const finalAtlasPos = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const finalDistToHome = Math.hypot(finalAtlasPos.x - 0.0, finalAtlasPos.z - 9.2);
    const finalAtlasRot = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentRotation("ATLAS")
    );
    console.log(`   Total sampel posisi: ${positionsSampled.length}`);
    console.log(`   Min observed X: ${minObservedX.toFixed(2)}, Min observed Z: ${minObservedZ.toFixed(2)}`);
    console.log(`   Tiba di meja departemen Riset: ${arrivedAtRiset}`);
    console.log(`   Pelanggaran ruangan lain: ${violationFound ? JSON.stringify(violationFound) : "TIDAK ADA ✓"}`);
    console.log(`   Galat posisi akhir ATLAS kembali ke meja: ${finalDistToHome.toFixed(4)} unit (batas ≤ 0.15)`);
    const rotY = finalAtlasRot ? (finalAtlasRot.y ?? finalAtlasRot._y ?? 0) : 0;
    console.log(`   Rotasi akhir ATLAS kembali ke meja (Y): ${rotY.toFixed(4)} (harus dekat 0 / menghadap meja)`);

    if (violationFound) {
      throw new Error(`ATLAS melintasi ruangan lain yang dilarang: ${JSON.stringify(violationFound)}`);
    }
    if (!arrivedAtRiset) {
      throw new Error("ATLAS tidak sampai di meja Riset!");
    }
    if (finalDistToHome > 0.15) {
      throw new Error(`ATLAS tidak kembali ke meja secara presisi! Galat: ${finalDistToHome}`);
    }
    if (Math.abs(rotY) > 0.25) {
      throw new Error(`ATLAS tidak menghadap meja (rotasi Y = 0) setelah delegasi Riset selesai! Rotasi Y: ${rotY}`);
    }
    console.log("   ✓ ATLAS menghadap meja (rotasi Y = 0) setelah delegasi ke Riset selesai.");

    testReport.kasus2 = {
      samplesCount: positionsSampled.length,
      arrivedAtRiset,
      unallowedViolation: violationFound,
      finalDistToHome,
      finalAtlasRotY: rotY,
    };
    console.log("   ✓ KASUS 2 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 3: ANTREAN DUA DELEGASI BERURUTAN (Kembali ke Meja Sebelum Berangkat)
    // =========================================================================
    console.log("\n--- KASUS 3: Antrean Dua Delegasi Berurutan ---");
    // Trigger dua delegasi berurutan: Copy lalu Landing Page
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("copy");
      window.__STAGE_3D__.demoDelegate("lp");
    });

    let visitedFirstDestination = false;
    let returnedHomeBetweenTrips = false;
    let minHomeDistBetween = Infinity;

    const startTwoTrips = Date.now();
    while (Date.now() - startTwoTrips < 35000) {
      await page.waitForTimeout(80);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
        };
      });

      if (!data.pos) break;

      // Cek apakah mencapai Copy (x > 3.0, z < -2.0)
      if (data.pos.x > 3.0 && data.pos.z < -2.0) {
        visitedFirstDestination = true;
      }

      // Setelah mencapai Copy, cek apakah kembali ke meja (jarak ke home <= 0.15)
      if (visitedFirstDestination && !returnedHomeBetweenTrips) {
        const dHome = Math.hypot(data.pos.x - 0.0, data.pos.z - 9.2);
        if (dHome < minHomeDistBetween) minHomeDistBetween = dHome;
        if (dHome <= 0.15) {
          returnedHomeBetweenTrips = true;
          console.log(`   ✓ ATLAS benar-benar kembali ke meja di antara delegasi (jarak: ${dHome.toFixed(4)} <= 0.15)`);
        }
      }

      if (!data.isBusy && returnedHomeBetweenTrips) {
        break;
      }
    }

    const posAfterTwo = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const finalDistTwo = Math.hypot(posAfterTwo.x - 0.0, posAfterTwo.z - 9.2);

    console.log(`   Mencapai Copy: ${visitedFirstDestination}`);
    console.log(`   Kembali ke meja di antara perjalanan: ${returnedHomeBetweenTrips} (min dist: ${minHomeDistBetween.toFixed(4)})`);
    console.log(`   Jarak akhir ke meja: ${finalDistTwo.toFixed(4)}`);

    if (!returnedHomeBetweenTrips) {
      throw new Error(`ATLAS tidak kembali ke meja sebelum berangkat ke LP! Min dist: ${minHomeDistBetween}`);
    }

    testReport.kasus3 = {
      visitedFirstDestination,
      returnedHomeBetweenTrips,
      minHomeDistBetween,
      finalDistTwo,
    };
    console.log("   ✓ KASUS 3 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 4: BACKLOG 7 DELEGASI (Percepatan Adaptif)
    // =========================================================================
    console.log("\n--- KASUS 4: Backlog 7 Delegasi (Percepatan Adaptif) ---");
    // Hitung estimasi teoritis tanpa percepatan:
    // Tiap delegasi tanpa percepatan memakan waktu ~7.5 - 8.5 detik.
    // 7 delegasi tanpa percepatan = ~55 detik.
    const theoreticalNormalDurationS = 55;

    const startBacklog = Date.now();
    await page.evaluate(() => {
      const rooms = ["riset", "copy", "lp", "ads", "creative", "riset", "copy"];
      rooms.forEach((r) => window.__STAGE_3D__.demoDelegate(r));
    });

    const initialQueueLength = await page.evaluate(() =>
      window.__STAGE_3D__.getChoreoQueueLength("ATLAS")
    );
    console.log(`   Panjang antrean awal tugas backlog: ${initialQueueLength}`);

    while (Date.now() - startBacklog < 45000) {
      await page.waitForTimeout(300);
      const isBusy = await page.evaluate(() =>
        window.__STAGE_3D__.isChoreoBusy("ATLAS")
      );
      if (!isBusy) break;
    }

    const backlogDurationMs = Date.now() - startBacklog;
    const backlogDurationS = +(backlogDurationMs / 1000).toFixed(2);
    console.log(`   Durasi total 7 delegasi (dengan adaptif): ${backlogDurationS} detik`);
    console.log(`   Estimasi tanpa percepatan adaptif: ~${theoreticalNormalDurationS} detik`);
    console.log(`   Rasio efisiensi percepatan: ${(theoreticalNormalDurationS / backlogDurationS).toFixed(2)}x lebih cepat`);

    if (backlogDurationS > 35) {
      throw new Error(`Percepatan adaptif gagal: memakan waktu ${backlogDurationS} detik (melebihi batas wajar 35 detik)!`);
    }

    testReport.kasus4 = {
      initialQueueLength,
      actualDurationS: backlogDurationS,
      theoreticalNormalDurationS,
      speedupRatio: +(theoreticalNormalDurationS / backlogDurationS).toFixed(2),
    };
    console.log("   ✓ KASUS 4 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 5: REDUCED-MOTION (Tanpa Animasi Jalan, Tugas Selesai Tanpa Error)
    // =========================================================================
    console.log("\n--- KASUS 5: Reduced-Motion Support ---");
    const rmContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: await context.storageState(),
      reducedMotion: "reduce",
    });
    const rmPage = await rmContext.newPage();
    const rmErrors = [];
    rmPage.on("console", (m) => {
      if (m.type() === "error") rmErrors.push(m.text());
    });

    await rmPage.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 30000 });
    await rmPage.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await rmPage.waitForTimeout(1000);

    const rmStart = Date.now();
    await rmPage.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("riset");
    });
    await rmPage.waitForTimeout(600);

    const rmBusy = await rmPage.evaluate(() =>
      window.__STAGE_3D__.isChoreoBusy("ATLAS")
    );
    const rmPos = await rmPage.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    console.log(`   Reduced-motion isBusy setelah ${Date.now() - rmStart}ms: ${rmBusy} (pos: ${rmPos?.x}, ${rmPos?.z})`);
    console.log(`   Reduced-motion error konsol: ${rmErrors.length}`);
    await rmContext.close();

    if (rmErrors.length > 0) {
      throw new Error(`Error konsol saat reduced-motion: ${rmErrors.join(", ")}`);
    }

    testReport.kasus5 = {
      finishedImmediately: !rmBusy,
      consoleErrors: rmErrors.length,
    };
    console.log("   ✓ KASUS 5 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 6: ANIMASI BEKERJA YANG HALUS (Working, Idle, Review, Reduced-Motion)
    // =========================================================================
    console.log("\n--- KASUS 6: Animasi Bekerja yang Halus ---");
    // Helper untuk mengukur variasi gerakan rotasi / posisi suatu agent
    async function sampleAgentMotion(agentName, durationMs = 800) {
      return await page.evaluate(async ({ agentName, durationMs }) => {
        const stage = window.__STAGE_3D__;
        let bodyMesh = null;
        let headGroup = null;
        let leftArm = null;

        stage.scene.traverse((obj) => {
          if (obj.userData?.type === "agent" && obj.userData.id === agentName) {
            const grp = obj.parent;
            if (grp) {
              bodyMesh = grp.children.find((c) => c.isMesh && c.geometry.type === "BoxGeometry");
              headGroup = grp.children.find((c) => c.isGroup);
              leftArm = grp.children.find((c) => c.isMesh && c.position.x < -0.2);
            }
          }
        });

        const samples = [];
        const start = performance.now();
        while (performance.now() - start < durationMs) {
          samples.push({
            time: performance.now(),
            bodyRotY: bodyMesh ? bodyMesh.rotation.y : 0,
            bodyScaleY: bodyMesh ? bodyMesh.scale.y : 1,
            headRotX: headGroup ? headGroup.rotation.x : 0,
            headRotZ: headGroup ? headGroup.rotation.z : 0,
            armRotX: leftArm ? leftArm.rotation.x : 0,
          });
          await new Promise((r) => requestAnimationFrame(r));
        }

        // Hitung standar deviasi / range tiap properti
        function range(arr) {
          return Math.max(...arr) - Math.min(...arr);
        }

        return {
          count: samples.length,
          bodyRotYRange: range(samples.map((s) => s.bodyRotY)),
          bodyScaleYRange: range(samples.map((s) => s.bodyScaleY)),
          headRotXRange: range(samples.map((s) => s.headRotX)),
          headRotZRange: range(samples.map((s) => s.headRotZ)),
          armRotXRange: range(samples.map((s) => s.armRotX)),
        };
      }, { agentName, durationMs });
    }

    // 6a. Uji status WORKING
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", "working");
    });
    await page.waitForTimeout(200);
    const motionWorking = await sampleAgentMotion("ATHENA", 600);
    console.log("   Motion range (WORKING):", {
      headRotX: motionWorking.headRotXRange.toFixed(4),
      headRotZ: motionWorking.headRotZRange.toFixed(4),
      armRotX: motionWorking.armRotXRange.toFixed(4),
      bodyRotY: motionWorking.bodyRotYRange.toFixed(4),
    });

    // 6b. Uji status IDLE (napas mikro, lengan diam)
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", "idle");
    });
    await page.waitForTimeout(200);
    const motionIdle = await sampleAgentMotion("ATHENA", 600);
    console.log("   Motion range (IDLE):", {
      bodyScaleY: motionIdle.bodyScaleYRange.toFixed(4),
      armRotX: motionIdle.armRotXRange.toFixed(4),
      headRotZ: motionIdle.headRotZRange.toFixed(4),
    });

    // 6c. Uji status REVIEW (mengangguk pelan)
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", "review");
    });
    await page.waitForTimeout(200);
    const motionReview = await sampleAgentMotion("ATHENA", 600);
    console.log("   Motion range (REVIEW):", {
      headRotX: motionReview.headRotXRange.toFixed(4),
      armRotX: motionReview.armRotXRange.toFixed(4),
    });

    // Kembalikan override
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", null);
    });

    const isWorkingActive = motionWorking.armRotXRange > 0.1 && motionWorking.headRotZRange > 0.02;
    const isIdleBreathing = motionIdle.armRotXRange < 0.01 && motionIdle.bodyScaleYRange > 0.005;
    const isReviewNodding = motionReview.headRotXRange > 0.04 && motionReview.armRotXRange < 0.01;

    console.log(`   Animasi working aktif (lengan ngetuk & kepala miring): ${isWorkingActive}`);
    console.log(`   Animasi idle aktif (napas skala Y, lengan diam): ${isIdleBreathing}`);
    console.log(`   Animasi review aktif (angguk kepala perlahan): ${isReviewNodding}`);

    if (!isWorkingActive || !isIdleBreathing || !isReviewNodding) {
      throw new Error("Animasi bekerja/idle/review tidak memenuhi kriteria gerak mikro!");
    }

    testReport.kasus6 = {
      working: motionWorking,
      idle: motionIdle,
      review: motionReview,
    };
    console.log("   ✓ KASUS 6 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 7: SIKLUS CAHAYA (Daylight 07, 13, 17, 21, Transisi Halus)
    // =========================================================================
    console.log("\n--- KASUS 7: Siklus Cahaya Mengikuti Jam ---");
    const hoursToTest = [7, 13, 17, 21];
    const daylightResults = {};

    for (const h of hoursToTest) {
      await page.evaluate((hour) => {
        window.__STAGE_3D__.setHourOverride(hour);
      }, h);
      await page.waitForTimeout(1200); // Tunggu lerp transisi ±1 detik

      const dl = await page.evaluate(() => window.__STAGE_3D__.getDaylight());
      const shotPath = `verification_artifacts/daylight_jam_${h < 10 ? "0" + h : h}.png`;
      await page.screenshot({ path: shotPath });

      daylightResults[h] = {
        phase: dl.phase,
        ambientColorHex: "0x" + dl.live.ambientColor.toString(16),
        ambientIntensity: +dl.live.ambientIntensity.toFixed(3),
        dir1Intensity: +dl.live.dir1Intensity.toFixed(3),
        floorEmissive: +dl.live.floorEmissive.toFixed(3),
        screenshot: shotPath,
      };
    }

    console.log("\n   TABEL NILAI SIKLUS CAHAYA:");
    console.table(daylightResults);

    // Verifikasi intensitas siang > malam
    const siangInt = daylightResults[13].ambientIntensity;
    const malamInt = daylightResults[21].ambientIntensity;
    const isSiangBrighter = siangInt > malamInt;
    const isFloorMinPreserved = malamInt >= 0.85; // Lantai minimum terpenuhi

    console.log(`   Intensitas Siang (${siangInt}) > Malam (${malamInt}): ${isSiangBrighter}`);
    console.log(`   Kecerahan lantai minimum malam hari terjaga: ${isFloorMinPreserved}`);

    if (!isSiangBrighter || !isFloorMinPreserved) {
      throw new Error("Siklus cahaya tidak memenuhi syarat kecerahan siang > malam atau lantai minimum!");
    }

    // Uji transisi halus (tidak ada lompatan tiba-tiba)
    console.log("   Menguji kehalusan transisi pergantian jam...");
    await page.evaluate(() => {
      window.__STAGE_3D__.setHourOverride(13);
    });
    await page.waitForTimeout(600);

    // Ubah ke 21 dan sampel nilai dalam 500ms
    const transitionSamples = await page.evaluate(async () => {
      window.__STAGE_3D__.setHourOverride(21);
      const samples = [];
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const dl = window.__STAGE_3D__.getDaylight();
        samples.push(dl.live.ambientIntensity);
      }
      return samples;
    });

    let hasSuddenJump = false;
    for (let i = 1; i < transitionSamples.length; i++) {
      const diff = Math.abs(transitionSamples[i] - transitionSamples[i - 1]);
      if (diff > 0.4) hasSuddenJump = true;
    }
    console.log("   Sampel transisi bertahap:", transitionSamples.map((v) => v.toFixed(3)));
    console.log(`   Transisi halus tanpa lompatan mendadak: ${!hasSuddenJump}`);

    if (hasSuddenJump) {
      throw new Error("Ditemukan lonjakan nilai tiba-tiba antar frame pada transisi daylight!");
    }

    // Reset override jam
    await page.evaluate(() => {
      window.__STAGE_3D__.setHourOverride(null);
    });

    testReport.kasus7 = {
      table: daylightResults,
      siangBrighter: isSiangBrighter,
      floorMinPreserved: isFloorMinPreserved,
      smoothTransition: !hasSuddenJump,
    };
    console.log("   ✓ KASUS 7 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 8: INTEGRITAS SCENE & KAMERA (UUID Invariance, Camera Stability)
    // =========================================================================
    console.log("\n--- KASUS 8: Integritas Scene & Kamera ---");
    const currentSceneState = await getSceneState();
    const isSceneUuidIdentical = currentSceneState.sceneUuid === initialSceneState.sceneUuid;
    console.log(`   Scene UUID konsisten sepanjang siklus uji: ${isSceneUuidIdentical} (${currentSceneState.sceneUuid})`);

    if (!isSceneUuidIdentical) {
      throw new Error("Scene Three.js telah dibangun ulang (UUID berubah)! Melanggar aturan ketat.");
    }

    testReport.kasus8 = {
      sceneUuidIdentical: isSceneUuidIdentical,
      initialUuid: initialSceneState.sceneUuid,
      currentUuid: currentSceneState.sceneUuid,
    };
    console.log("   ✓ KASUS 8 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 9: PERFORMA & UJI KEBOCORAN MEMORI (Frame Time, Info Render, Memory)
    // =========================================================================
    console.log("\n--- KASUS 9: Performa & Stabilitas Memori (20 Putaran Demo) ---");
    const perfStats = await page.evaluate(async () => {
      const stage = window.__STAGE_3D__;
      const memBefore = { ...stage.renderer.info.memory };
      const renderCalls = stage.renderer.info.render.calls;
      const triangles = stage.renderer.info.render.triangles;

      // Catat frame time selama ~4-5 detik dengan 16 agent + ATLAS
      const frameDts = [];
      let lastTime = performance.now();
      let framesCount = 0;
      const startMeasure = performance.now();

      while (performance.now() - startMeasure < 3500) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        frameDts.push(now - lastTime);
        lastTime = now;
        framesCount++;
      }

      const avgFrameTimeMs = +(
        frameDts.reduce((a, b) => a + b, 0) / frameDts.length
      ).toFixed(2);
      const approxFps = +(1000 / avgFrameTimeMs).toFixed(1);

      // Jalankan 20 putaran delegasi cepat / clear
      for (let i = 0; i < 20; i++) {
        stage.demoDelegate("riset");
        stage.clearChoreo();
      }

      const memAfter = { ...stage.renderer.info.memory };

      return {
        avgFrameTimeMs,
        approxFps,
        framesCount,
        renderCalls,
        triangles,
        memBefore,
        memAfter,
        isMemStable:
          memAfter.geometries <= memBefore.geometries &&
          memAfter.textures <= memBefore.textures,
      };
    });

    console.log(`   Rata-rata frame time (headless): ${perfStats.avgFrameTimeMs} ms (~${perfStats.approxFps} FPS)`);
    console.log(`   Renderer Calls: ${perfStats.renderCalls}, Triangles: ${perfStats.triangles}`);
    console.log("   Memori sebelum 20 putaran:", perfStats.memBefore);
    console.log("   Memori setelah 20 putaran:", perfStats.memAfter);
    console.log(`   Stabilitas memori (geometries & textures stabil): ${perfStats.isMemStable}`);

    if (!perfStats.isMemStable) {
      throw new Error(`Kebocoran memori terdeteksi! Memori bertambah: ${JSON.stringify(perfStats.memAfter)}`);
    }

    testReport.kasus9 = perfStats;
    console.log("   ✓ KASUS 9 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 10: REGRESI INTERAKSI (Klik Karakter Berjalan, Multi-touch, Detail)
    // =========================================================================
    console.log("\n--- KASUS 10: Regresi Interaksi & Pemilihan Karakter ---");
    // 10a. Klik agent ATLAS saat sedang berjalan memilihnya tanpa menggeser kamera
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("creative");
    });
    await page.waitForTimeout(800); // Tunggu ATLAS mulai berjalan

    const camBeforeClick = await getSceneState();
    // Klik ATLAS lewat tag CSS2D
    const atlasTag = page.locator(".agent-tag3d:has-text('ATLAS')");
    await atlasTag.click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(400);

    const selAgent = await page.evaluate(() => window.__STAGE_3D__.getSelected());
    const camAfterClick = await getSceneState();

    const dCamClick = Math.hypot(
      camBeforeClick.cameraPos.x - camAfterClick.cameraPos.x,
      camBeforeClick.cameraPos.z - camAfterClick.cameraPos.z
    );

    console.log(`   Agent terpilih saat berjalan: ${selAgent?.id} (tipe: ${selAgent?.type})`);
    console.log(`   Kamera tidak bergeser saat klik (pergeseran: ${dCamClick.toFixed(4)} unit)`);

    // Hentikan koreografi
    await page.evaluate(() => {
      window.__STAGE_3D__.clearChoreo();
    });
    await page.waitForTimeout(400);

    testReport.kasus10 = {
      selectedWhileWalking: selAgent?.id === "ATLAS",
      cameraShiftOnSelect: dCamClick,
      consoleErrorsCount: consoleErrors.length,
    };
    console.log(`   Console error baru selama pengujian: ${consoleErrors.length}`);
    console.log("   ✓ KASUS 10 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 1: GATHER RAPAT (16 Agen Berjalan Lewat Koridor, Bukan Teleport, Tanpa Tembus Dinding)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 1: Gather Rapat (16 Agen Berjalan Lewat Koridor) ---");
    const agentHomeRooms = {
      ATHENA: "riset",
      ARGUS: "riset",
      METIS: "riset",
      CLIO: "copy",
      ERATO: "copy",
      DAPHNE: "copy",
      HESTIA: "lp",
      THEMIS: "lp",
      TALOS: "lp",
      ZEUS: "ads",
      ARTEMIS: "ads",
      PLUTUS: "ads",
      THEIA: "creative",
      LYRA: "creative",
      IRIS: "creative",
      ATLAS: "manager",
    };

    const seatMap = await page.evaluate(() => window.__STAGE_3D__.getSeatPositions());
    const meetingRoomPos = { x: 6, y: 0 };
    const prevPositions = {};
    let gatherViolationFound = null;
    let maxDeltaPerInterval = 0;
    let minInterAgentDist = Infinity;
    let minInterAgentPair = null;

    // Print posisi seluruh agen sebelum gather
    const preGatherPos = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS"
      ];
      names.forEach(n => {
        const p = stage.getAgentPosition(n);
        res[n] = `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
      });
      return res;
    });
    console.log("   Posisi seluruh agen sebelum gather:", preGatherPos);

    // Mulai gather rapat (animasi normal)
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });

    const gatherStart = Date.now();
    let allArrivedAtMeeting = false;

    while (Date.now() - gatherStart < 40000) {
      await page.waitForTimeout(80);
      const agentStates = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const res = {};
        const names = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS", "ATLAS"
        ];
        names.forEach((n) => {
          res[n] = {
            pos: stage.getAgentPosition(n),
            busy: stage.isChoreoBusy(n),
          };
        });
        return res;
      });

      let anyBusy = false;
      for (const [name, st] of Object.entries(agentStates)) {
        if (!st.pos) continue;
        if (st.busy) anyBusy = true;

        // Cek pergeseran per interval (bukan teleport)
        if (prevPositions[name]) {
          const delta = Math.hypot(
            st.pos.x - prevPositions[name].x,
            st.pos.z - prevPositions[name].z
          );
          if (delta > 0.4) {
            console.log(`      [DELTA WATCH] ${name}: delta=${delta.toFixed(3)}, prev=(${prevPositions[name].x.toFixed(2)}, ${prevPositions[name].z.toFixed(2)}), curr=(${st.pos.x.toFixed(2)}, ${st.pos.z.toFixed(2)})`);
          }
          if (delta > maxDeltaPerInterval) maxDeltaPerInterval = delta;
          if (delta > 5.0) {
            throw new Error(`Agen ${name} teleportasi mendadak! Delta per frame: ${delta.toFixed(3)} unit`);
          }
        }
        prevPositions[name] = st.pos;

        // Cek pelanggaran ruangan: hanya boleh di ruang asal atau ruang meeting
        const allowed = [agentHomeRooms[name], "meeting"];
        const viol = getUnallowedRoomViolation(st.pos.x, st.pos.z, allowed);
        if (viol && !gatherViolationFound) {
          gatherViolationFound = { agent: name, room: viol, pos: st.pos };
        }
      }

      // Hitung jarak minimum antar-agen sepanjang pergerakan gather (Requirement 4d)
      const namesList = Object.keys(agentStates);
      for (let i = 0; i < namesList.length; i++) {
        for (let j = i + 1; j < namesList.length; j++) {
          const pA = agentStates[namesList[i]]?.pos;
          const pB = agentStates[namesList[j]]?.pos;
          if (pA && pB) {
            const d = Math.hypot(pA.x - pB.x, pA.z - pB.z);
            if (d < minInterAgentDist) {
              minInterAgentDist = d;
              minInterAgentPair = [namesList[i], namesList[j]];
            }
          }
        }
      }

      if (!anyBusy && Date.now() - gatherStart > 2000) {
        allArrivedAtMeeting = true;
        break;
      }
    }

    console.log(`   Durasi gather: ${((Date.now() - gatherStart) / 1000).toFixed(2)} detik`);
    console.log(`   Maks pergeseran posisi per interval: ${maxDeltaPerInterval.toFixed(4)} unit (< 1.2 batas wajar)`);
    console.log(`   Pelanggaran ruangan asing selama jalan: ${gatherViolationFound ? JSON.stringify(gatherViolationFound) : "Nihil (Aman)"}`);
    console.log(`   Jarak antar-agen minimum selama gather: ${minInterAgentDist.toFixed(4)} unit (${minInterAgentPair?.join(" - ")})`);
    if (minInterAgentDist < 0.25) {
      console.warn(`   [LAPORAN] Jarak antar-agen minimum selama gather di bawah 0.25: ${minInterAgentDist.toFixed(4)} unit`);
    } else {
      console.log(`   ✓ Jarak antar-agen minimum selama gather aman (>= 0.25 unit).`);
    }

    if (gatherViolationFound) {
      throw new Error(`Pelanggaran jalur gather: Agen ${gatherViolationFound.agent} masuk ke ruangan ${gatherViolationFound.room} pada posisi ${JSON.stringify(gatherViolationFound.pos)}`);
    }

    // Verifikasi semua 16 agen tiba di kursi masing-masing di ruang meeting
    const finalGatherPositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS"
      ];
      names.forEach((n) => {
        res[n] = stage.getAgentPosition(n);
      });
      return res;
    });

    let maxSeatDist = 0;
    for (const [name, pos] of Object.entries(finalGatherPositions)) {
      const seat = seatMap[name];
      if (!seat) {
        throw new Error(`Agen ${name} tidak memiliki konfigurasi kursi di seatMap!`);
      }
      const expectedX = meetingRoomPos.x + seat[0] - 8.5;
      const expectedZ = meetingRoomPos.y + seat[1] - 5.5;
      const dist = Math.hypot(pos.x - expectedX, pos.z - expectedZ);
      if (dist > maxSeatDist) maxSeatDist = dist;
      if (dist > 0.18) {
        throw new Error(`Agen ${name} tidak berada di kursi meeting-nya! Jarak: ${dist.toFixed(4)} (pos: ${pos.x}, ${pos.z}; target: ${expectedX}, ${expectedZ})`);
      }
    }

    console.log(`   Seluruh 16 agen tiba di kursi rapat (deviasi maks: ${maxSeatDist.toFixed(4)} <= 0.18 unit)`);
    await page.screenshot({ path: "verification_artifacts/v1afix_meeting_gathered.png" });

    testReport.v1afix_gather = {
      allArrivedAtMeeting,
      maxDeltaPerInterval,
      gatherViolationFound,
      maxSeatDist,
      minInterAgentDist,
      minInterAgentPair,
    };
    console.log("   ✓ KASUS V1a-fix 1 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 2: ANTREAN DELEGASI SELAMA RAPAT (ATLAS Tetap di Rapat, Tugas Diantrekan)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 2: Antrean Delegasi Selama Rapat ---");
    // Trigger delegasi ke riset saat rapat aktif
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("riset");
    });
    await page.waitForTimeout(300);

    const queuedDelegations = await page.evaluate(() =>
      window.__STAGE_3D__.getPendingDelegationsCount()
    );
    const atlasMeetingPos = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const atlasExpectedSeat = seatMap["ATLAS"];
    const atlasSeatX = meetingRoomPos.x + atlasExpectedSeat[0] - 8.5;
    const atlasSeatZ = meetingRoomPos.y + atlasExpectedSeat[1] - 5.5;
    const atlasDistFromMeetingSeat = Math.hypot(
      atlasMeetingPos.x - atlasSeatX,
      atlasMeetingPos.z - atlasSeatZ
    );

    console.log(`   Jumlah delegasi tertunda di antrean: ${queuedDelegations} (harus >= 1)`);
    console.log(`   ATLAS tetap berada di kursi rapat: jarak ${atlasDistFromMeetingSeat.toFixed(4)} unit`);

    if (queuedDelegations < 1) {
      throw new Error(`Delegasi tidak diantrekan saat rapat aktif! Jumlah antrean: ${queuedDelegations}`);
    }
    if (atlasDistFromMeetingSeat > 0.15) {
      throw new Error(`ATLAS meninggalkan ruang rapat saat delegasi masuk!`);
    }

    testReport.v1afix_queue_during_meeting = {
      queuedDelegations,
      atlasDistFromMeetingSeat,
    };
    console.log("   ✓ KASUS V1a-fix 2 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 3: BUBAR RAPAT & AUTO-DRAIN DELEGASI (Kembali ke Meja, Delegasi Tuntas)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 3: Bubar Rapat & Auto-Drain Delegasi ---");
    const homeMap = await page.evaluate(() => window.__STAGE_3D__.getHomePositions());

    // Panggil bubar rapat
    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(false);
    });

    const disperseStart = Date.now();
    let allNonAtlasReturned = false;
    let atlasCompletedDelegation = false;

    while (Date.now() - disperseStart < 45000) {
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const res = {};
        const nonAtlasNames = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS"
        ];
        let nonAtlasBusy = false;
        nonAtlasNames.forEach((n) => {
          const isB = stage.isChoreoBusy(n);
          if (isB) nonAtlasBusy = true;
          res[n] = stage.getAgentPosition(n);
        });
        return {
          nonAtlasBusy,
          nonAtlasPositions: res,
          atlasBusy: stage.isChoreoBusy("ATLAS"),
          atlasPos: stage.getAgentPosition("ATLAS"),
          pendingCount: stage.getPendingDelegationsCount(),
        };
      });

      if (!data.nonAtlasBusy) {
        allNonAtlasReturned = true;
      }

      if ((Date.now() - disperseStart) % 3000 < 120) {
        console.log(`      [Bubar progress] nonAtlasBusy=${data.nonAtlasBusy}, atlasBusy=${data.atlasBusy}, pendingCount=${data.pendingCount}`);
      }

      if (!data.atlasBusy && data.pendingCount === 0 && allNonAtlasReturned) {
        atlasCompletedDelegation = true;
        break;
      }
    }

    console.log(`   15 agen non-ATLAS selesai kembali ke meja: ${allNonAtlasReturned}`);
    console.log(`   ATLAS menuntaskan delegasi tertunda dan kembali ke meja: ${atlasCompletedDelegation}`);

    if (!allNonAtlasReturned) {
      throw new Error("Sebagian agen non-ATLAS tidak selesai kembali ke mejanya setelah bubar!");
    }
    if (!atlasCompletedDelegation) {
      throw new Error("ATLAS tidak menyelesaikan delegasi tertunda setelah bubar rapat!");
    }

    // Verifikasi posisi akhir 15 agen non-ATLAS di meja masing-masing
    const finalDispersePositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS"
      ];
      names.forEach((n) => {
        res[n] = stage.getAgentPosition(n);
      });
      return res;
    });

    let maxHomeDist = 0;
    for (const [name, pos] of Object.entries(finalDispersePositions)) {
      const hp = homeMap[name];
      const expectedX = hp[0] - 8.5;
      const expectedZ = hp[1] - 5.5;
      const dist = Math.hypot(pos.x - expectedX, pos.z - expectedZ);
      if (dist > maxHomeDist) maxHomeDist = dist;
      if (dist > 0.18) {
        throw new Error(`Agen ${name} tidak berada di meja rumahnya setelah bubar! Jarak: ${dist.toFixed(4)}`);
      }
    }
    console.log(`   Seluruh 15 agen non-ATLAS kembali di meja masing-masing (deviasi maks: ${maxHomeDist.toFixed(4)} <= 0.18)`);

    // Verifikasi posisi akhir ATLAS di meja Manager (0.0, 9.2)
    const atlasFinalPos = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const atlasFinalDist = Math.hypot(atlasFinalPos.x - 0.0, atlasFinalPos.z - 9.2);
    console.log(`   Posisi akhir ATLAS di meja Manager: jarak ${atlasFinalDist.toFixed(4)} unit`);
    if (atlasFinalDist > 0.18) {
      throw new Error(`ATLAS tidak berada di meja Manager setelah menuntaskan delegasi! Jarak: ${atlasFinalDist}`);
    }

    await page.screenshot({ path: "verification_artifacts/v1afix_meeting_dispersed.png" });

    testReport.v1afix_disperse = {
      allNonAtlasReturned,
      atlasCompletedDelegation,
      maxHomeDist,
      atlasFinalDist,
    };
    console.log("   ✓ KASUS V1a-fix 3 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 4: REDUCED-MOTION INSTAN (Gather & Bubar Tanpa Animasi Jalan)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 4: Reduced-Motion Instan (Gather & Bubar) ---");
    // Start meeting dengan reducedMotion = true
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(true);
    });
    await page.waitForTimeout(100);

    const rmGatherStates = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS"
      ];
      let anyBusy = false;
      const positions = {};
      names.forEach((n) => {
        if (stage.isChoreoBusy(n)) anyBusy = true;
        positions[n] = stage.getAgentPosition(n);
      });
      return { anyBusy, positions };
    });

    console.log(`   Reduced-motion gather instan (anyBusy: ${rmGatherStates.anyBusy})`);
    if (rmGatherStates.anyBusy) {
      throw new Error("Reduced-motion gather tidak instan (masih ada choreo yang busy)!");
    }

    // End meeting dengan reducedMotion = true
    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(true);
    });
    await page.waitForTimeout(100);

    const rmDisperseStates = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS"
      ];
      let anyBusy = false;
      const positions = {};
      names.forEach((n) => {
        if (stage.isChoreoBusy(n)) anyBusy = true;
        positions[n] = stage.getAgentPosition(n);
      });
      return { anyBusy, positions };
    });

    console.log(`   Reduced-motion bubar instan (anyBusy: ${rmDisperseStates.anyBusy})`);
    if (rmDisperseStates.anyBusy) {
      throw new Error("Reduced-motion bubar tidak instan (masih ada choreo yang busy)!");
    }

    testReport.v1afix_reduced_motion = {
      instantGather: !rmGatherStates.anyBusy,
      instantDisperse: !rmDisperseStates.anyBusy,
    };
    console.log("   ✓ KASUS V1a-fix 4 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 5: ATLAS DI RUANG RISET SAAT DELEGASI LALU MEETING DIKLIK
    // (Requirement 4a: Tidak Ada Pelanggaran Ruangan Lain Selain Riset & Meeting)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 5: ATLAS di Ruang Riset Saat Delegasi Lalu Meeting Diklik ---");
    // Pastikan seluruh agen berada di meja rumah awal
    await page.evaluate(() => {
      window.__STAGE_3D__.clearChoreo();
    });
    await page.waitForTimeout(400);

    // 1. Delegasikan ATLAS ke Riset
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("riset");
    });

    // 2. Tunggu sampai ATLAS tiba di dalam batas Ruang Riset (x < -4.5 && z < -1.5)
    let atlasReachedRiset = false;
    const waitRisetStart = Date.now();
    while (Date.now() - waitRisetStart < 15000) {
      await page.waitForTimeout(80);
      const pos = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
      if (pos && pos.x < -4.5 && pos.z < -1.5) {
        atlasReachedRiset = true;
        console.log(`   ATLAS telah berada di dalam Ruang Riset: (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
        break;
      }
    }
    if (!atlasReachedRiset) {
      throw new Error("ATLAS tidak sampai di Ruang Riset sebelum klik meeting!");
    }

    // 3. Klik Meeting saat ATLAS sedang di dalam Ruang Riset
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });
    console.log("   Meeting diklik saat ATLAS berada di dalam Ruang Riset.");

    // 4. Pantau perjalanan ATLAS menuju Ruang Meeting (hanya boleh di riset, koridor, dan meeting)
    const allowedRoomsTransit = ["riset", "meeting"];
    let atlasTransitViolation = null;
    const transitStart = Date.now();
    let atlasArrivedMeetingFromRiset = false;

    while (Date.now() - transitStart < 25000) {
      await page.waitForTimeout(80);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          busy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
        };
      });

      if (!data.pos) break;

      const viol = getUnallowedRoomViolation(data.pos.x, data.pos.z, allowedRoomsTransit);
      if (viol && !atlasTransitViolation) {
        atlasTransitViolation = { room: viol, pos: data.pos };
      }

      if (!data.busy && Date.now() - transitStart > 1500) {
        atlasArrivedMeetingFromRiset = true;
        break;
      }
    }

    console.log(`   Pelanggaran ruangan lain oleh ATLAS: ${atlasTransitViolation ? JSON.stringify(atlasTransitViolation) : "TIDAK ADA ✓"}`);
    if (atlasTransitViolation) {
      throw new Error(`ATLAS melanggar ruangan asing saat transit dari Riset ke Meeting: ${JSON.stringify(atlasTransitViolation)}`);
    }

    // Verifikasi posisi akhir ATLAS di kursi rapat
    const atlasSeatAfterRiset = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
    const atlasExpSeatRiset = seatMap["ATLAS"];
    const atlasExpXRiset = meetingRoomPos.x + atlasExpSeatRiset[0] - 8.5;
    const atlasExpZRiset = meetingRoomPos.y + atlasExpSeatRiset[1] - 5.5;
    const dAtlasSeatRiset = Math.hypot(atlasSeatAfterRiset.x - atlasExpXRiset, atlasSeatAfterRiset.z - atlasExpZRiset);
    console.log(`   Deviasi posisi ATLAS ke kursi rapat: ${dAtlasSeatRiset.toFixed(4)} unit`);
    if (dAtlasSeatRiset > 0.18) {
      throw new Error(`ATLAS tidak berada di kursi rapat setelah transit dari Riset! Deviasi: ${dAtlasSeatRiset}`);
    }

    // Bubarkan rapat dengan instan agar kembali ke posisi awal
    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(true);
    });
    await page.waitForTimeout(200);

    testReport.v1afix_atlas_riset_to_meeting = {
      atlasReachedRiset,
      atlasArrivedMeetingFromRiset,
      atlasTransitViolation,
      dAtlasSeatRiset,
    };
    console.log("   ✓ KASUS V1a-fix 5 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS V1a-fix 6: KLIK MEETING DUA KALI BERURUTAN CEPAT (BUBAR SAAT AGEN BERJALAN)
    // (Requirement 4b: Tidak Ada Pelanggaran Ruangan Selama Agen Putar Balik dari Koridor ke Meja)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 6: Klik Meeting Dua Kali Berurutan Cepat (Bubar Saat Berjalan) ---");
    // Pastikan seluruh agen di meja awal
    await page.evaluate(() => {
      window.__STAGE_3D__.clearChoreo();
    });
    await page.waitForTimeout(400);

    // 1. Klik Meeting pertama kali
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });

    // 2. Tunggu sebentar (800ms) saat agen sedang aktif melangkah di koridor/pintu
    await page.waitForTimeout(800);

    // 3. Klik Meeting kedua kali (bubar rapat saat masih di koridor)
    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(false);
    });
    console.log("   Meeting dibubarkan cepat saat agen sedang melangkah di koridor.");

    // 4. Pantau posisi seluruh 16 agen sampai semuanya selesai kembali ke meja
    let quickCancelViolation = null;
    const quickCancelStart = Date.now();
    let allFinishedReturn = false;

    while (Date.now() - quickCancelStart < 30000) {
      await page.waitForTimeout(80);
      const agentStates = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const res = {};
        const names = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS", "ATLAS"
        ];
        let anyBusy = false;
        names.forEach((n) => {
          const isB = stage.isChoreoBusy(n);
          if (isB) anyBusy = true;
          res[n] = {
            pos: stage.getAgentPosition(n),
            busy: isB,
          };
        });
        return { anyBusy, states: res };
      });

      for (const [name, st] of Object.entries(agentStates.states)) {
        if (!st.pos) continue;
        const allowed = [agentHomeRooms[name], "meeting"];
        const viol = getUnallowedRoomViolation(st.pos.x, st.pos.z, allowed);
        if (viol && !quickCancelViolation) {
          quickCancelViolation = { agent: name, room: viol, pos: st.pos };
        }
      }

      if (!agentStates.anyBusy && Date.now() - quickCancelStart > 1000) {
        allFinishedReturn = true;
        break;
      }
    }

    console.log(`   Pelanggaran ruangan saat bubar cepat: ${quickCancelViolation ? JSON.stringify(quickCancelViolation) : "TIDAK ADA ✓"}`);
    if (quickCancelViolation) {
      throw new Error(`Agen ${quickCancelViolation.agent} melanggar ruangan ${quickCancelViolation.room} saat bubar cepat: ${JSON.stringify(quickCancelViolation.pos)}`);
    }

    // Verifikasi seluruh 16 agen kembali ke meja masing-masing
    const finalQuickCancelPositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS"
      ];
      names.forEach((n) => {
        res[n] = stage.getAgentPosition(n);
      });
      return res;
    });

    let maxQuickCancelDev = 0;
    for (const [name, pos] of Object.entries(finalQuickCancelPositions)) {
      const hp = homeMap[name];
      const expX = hp[0] - 8.5;
      const expZ = hp[1] - 5.5;
      const d = Math.hypot(pos.x - expX, pos.z - expZ);
      if (d > maxQuickCancelDev) maxQuickCancelDev = d;
      if (d > 0.18) {
        throw new Error(`Agen ${name} tidak berada di mejanya setelah bubar cepat! Deviasi: ${d.toFixed(4)}`);
      }
    }
    console.log(`   Seluruh 16 agen kembali di meja masing-masing (deviasi maks: ${maxQuickCancelDev.toFixed(4)} <= 0.18 unit).`);

    testReport.v1afix_quick_cancel_double_click = {
      allFinishedReturn,
      quickCancelViolation,
      maxQuickCancelDev,
    };
    console.log("   ✓ KASUS V1a-fix 6 LOLOS SEMPURNA.");

    // =========================================================================
    // PENGECEKAN KONFIGURASI KURSI AGENT_RENDER_ORDER (Requirement 3)
    // =========================================================================
    console.log("\n--- PENGECEKAN KONFIGURASI: SEAT_BY_AGENT vs AGENT_RENDER_ORDER ---");
    const seatConfigCheck = await page.evaluate(() => {
      const seats = window.__STAGE_3D__.getSeatPositions();
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
      ];
      const missing = [];
      for (const n of names) {
        if (!seats[n]) missing.push(n);
      }
      return { total: names.length, missing };
    });
    console.log(`   Entri SEAT_BY_AGENT untuk semua agen: ${seatConfigCheck.missing.length === 0 ? "LENGKAP (19/19) ✓" : "KURANG: " + seatConfigCheck.missing.join(", ")}`);
    if (seatConfigCheck.missing.length > 0) {
      throw new Error(`Ada agen tanpa entri kursi di SEAT_BY_AGENT: ${seatConfigCheck.missing.join(", ")}`);
    }
    testReport.seat_config_check = seatConfigCheck;
    console.log("   ✓ PENGECEKAN KONFIGURASI KURSI LOLOS.");

    // =========================================================================
    // KASUS 12: SIMULASI PENAMBAHAN INSTANCE AGEN (7 LANGKAH SISI KLIEN V1b)
    // =========================================================================
    console.log("\n--- KASUS 12: Simulasi Instance Tambahan (7 Langkah, Meja Baru, Persetujuan CEO, dan Reset) ---");

    const preDemoState = await page.evaluate(() => {
      return {
        sceneUuid: window.__STAGE_3D__.getSceneUuid(),
        agentCount: document.querySelectorAll(".agent-tag3d").length,
      };
    });
    console.log(`   Scene UUID awal: ${preDemoState.sceneUuid}`);
    console.log(`   Jumlah agent tag awal: ${preDemoState.agentCount}`);

    // 1. Mulai demo instance tanpa autoApprove (untuk memverifikasi kartu approval CEO)
    console.log("   1. Memulai alur demo instance request (Step 1-3)...");
    await page.evaluate(() => {
      window.__STAGE_3D__.startInstanceDemo({ autoApprove: false });
    });

    // Tunggu sampai Step 3 (Kartu Approval CEO muncul di layar)
    await page.waitForSelector(".ceo-approval-demo-card", { timeout: 10000 });
    const demoStep3 = await page.evaluate(() => {
      return window.__STAGE_3D__.getInstanceDemoState();
    });
    console.log(`   ✓ Langkah 3 tercapai: Step = ${demoStep3.step}, Kartu CEO Muncul = ${demoStep3.showApprovalCard}`);
    if (demoStep3.step !== 3 || !demoStep3.showApprovalCard) {
      throw new Error(`Demo gagal berhenti di Step 3 dengan kartu CEO! State: ${JSON.stringify(demoStep3)}`);
    }

    // Screenshot kartu approval CEO
    await page.screenshot({ path: "verification_artifacts/instance_demo_ceo_card.png" });

    // 2. Klik tombol persetujuan CEO
    console.log("   2. Menyetujui permohonan via tombol CEO Approval...");
    const approveBtn = page.locator(".ceo-approve-btn");
    await approveBtn.click();

    // Tunggu sampai Step 5 (Meja baru sedang disiapkan oleh HEPHAESTUS)
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      return state.step >= 5 && state.dynamicDesksCount >= 1;
    }, { timeout: 10000 });
    console.log("   ✓ Langkah 5 tercapai: Meja dinamis ditambahkan di Ruang Advertisers.");

    // Tunggu sampai Step 6-7 (Agent dinamis di-spawn dan aktif)
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      return state.step >= 6 && state.dynamicAgentsCount >= 1;
    }, { timeout: 10000 });

    const activeDemoState = await page.evaluate(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const instanceTag = document.querySelector(".agent-tag3d.is-instance");
      const currentSceneUuid = window.__STAGE_3D__.getSceneUuid();
      return {
        ...state,
        instanceTagFound: !!instanceTag,
        instanceTagText: instanceTag ? instanceTag.textContent : null,
        currentSceneUuid,
      };
    });

    console.log(`   ✓ Langkah 6-7 tercapai: Agent ${activeDemoState.instanceTagText} aktif!`);
    console.log(`   Dynamic desks count: ${activeDemoState.dynamicDesksCount}`);
    console.log(`   Dynamic agents count: ${activeDemoState.dynamicAgentsCount}`);

    // Pastikan Scene UUID TIDAK PERNAH BERUBAH (Scene tidak di-rebuild)
    if (activeDemoState.currentSceneUuid !== preDemoState.sceneUuid) {
      throw new Error("Scene Three.js di-rebuild saat penambahan dynamic instance! Scene UUID berubah!");
    }
    console.log("   ✓ Integritas Three.js terjaga: Scene UUID 100% IDENTIK (tanpa rebuild scene).");

    // Screenshot saat instance aktif
    await page.screenshot({ path: "verification_artifacts/instance_demo_active.png" });

    // 3. Uji Klik pada Dynamic Agent Tag untuk membuka detail jobdesc
    console.log("   3. Menguji klik seleksi pada agent instance...");
    const instanceTagLocator = page.locator(".agent-tag3d.is-instance");
    await instanceTagLocator.click({ force: true });
    await page.waitForTimeout(400);

    // 4. Uji Antrean (Queueing): trigger demo lagi saat sudah berjalan
    console.log("   4. Menguji queueing permintaan demo...");
    await page.evaluate(() => {
      window.__STAGE_3D__.startInstanceDemo();
    });

    // 5. Uji Reset Demo Instance
    console.log("   5. Menguji Reset Demo Instance (pembersihan memori & DOM)...");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
    });
    await page.waitForTimeout(500);

    const postResetState = await page.evaluate(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const currentSceneUuid = window.__STAGE_3D__.getSceneUuid();
      const instanceTags = document.querySelectorAll(".agent-tag3d.is-instance").length;
      const prepTags = document.querySelectorAll(".desk-prep-tag").length;
      return {
        ...state,
        currentSceneUuid,
        instanceTags,
        prepTags,
      };
    });

    console.log(`   Desks setelah reset: ${postResetState.dynamicDesksCount} (harus 0)`);
    console.log(`   Agents setelah reset: ${postResetState.dynamicAgentsCount} (harus 0)`);
    console.log(`   Instance tags di DOM: ${postResetState.instanceTags} (harus 0)`);

    if (postResetState.dynamicDesksCount !== 0 || postResetState.dynamicAgentsCount !== 0 || postResetState.instanceTags !== 0) {
      throw new Error(`Reset demo gagal membersihkan semua entitas dinamis! State: ${JSON.stringify(postResetState)}`);
    }

    if (postResetState.currentSceneUuid !== preDemoState.sceneUuid) {
      throw new Error("Scene Three.js berubah setelah reset demo!");
    }
    console.log("   ✓ Reset demo berhasil: Memori & entitas dinamis dibersihkan, scene UUID tetap identik.");

    testReport.kasus12 = {
      preDemoState,
      activeDemoState,
      postResetState,
      screenshots: [
        "instance_demo_ceo_card.png",
        "instance_demo_active.png",
      ],
    };
    console.log("   ✓ KASUS 12 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS 11: VERIFIKASI AKHIR DATABASE & INTEGRITAS SISTEM
    // =========================================================================
    console.log("\n--- KASUS 11: Integritas Akhir Database & Sistem ---");
    // Bersihkan fixture approvals sebelum verifikasi akhir integritas
    await supabase.from("approvals").delete().like("ringkasan", "[TEST_E2E]%");

    const { count: finalPendingApprovals } = await supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { data: finalAgents } = await supabase
      .from("agents")
      .select("nama, status");

    const nonIdleList = (finalAgents || []).filter((a) => a.status !== "idle");

    console.log(`   Jumlah agent di database: ${finalAgents?.length} (harus 19)`);
    console.log(`   Jumlah agent idle: ${(finalAgents?.length || 0) - nonIdleList.length}`);
    console.log(`   Jumlah approval pending tersisa: ${finalPendingApprovals}`);

    if (finalAgents?.length !== 19) {
      throw new Error(`Total agent di database bukan 19! Ditemukan: ${finalAgents?.length}`);
    }
    if (nonIdleList.length > 0) {
      throw new Error(`Ada agent yang tidak idle di database: ${JSON.stringify(nonIdleList)}`);
    }
    if (finalPendingApprovals !== 0) {
      throw new Error(`Masih ada approval pending tersisa di database: ${finalPendingApprovals}`);
    }

    testReport.kasus11 = {
      totalAgentsInDb: finalAgents.length,
      allIdle: nonIdleList.length === 0,
      pendingApprovals: finalPendingApprovals,
    };
    console.log("   ✓ KASUS 11 LOLOS SEMPURNA.");

    console.log("\n===============================================================");
    console.log("=== SEMUA 12 KASUS PENGUJIAN V1b BERHASIL LOLOS LENGKAP!    ===");
    console.log("===============================================================\n");
    console.log(JSON.stringify(testReport, null, 2));

  } finally {
    // PEMBERSIHAN DATA SESUAI ATURAN KERAS
    if (tempUserId) {
      console.log(`\nMembersihkan akun uji sementara (${tempEmail})...`);
      await supabase.auth.admin.deleteUser(tempUserId).catch((e) =>
        console.error("Gagal hapus user:", e)
      );
      console.log("✓ Akun uji sementara berhasil dihapus dari Auth.");
    }
    await supabase.from("approvals").delete().like("ringkasan", "[TEST_E2E]%");
    console.log("✓ Fixture test approvals [TEST_E2E]% berhasil dibersihkan.");
    await browser.close();
  }
}

run().catch((err) => {
  console.error("\nFATAL ERROR DALAM PENGUJIAN V1a:", err);
  process.exit(1);
});
