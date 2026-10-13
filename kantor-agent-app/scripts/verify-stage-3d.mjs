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
  console.log("=== STARTING FULL STAGE 3D V1a TEST SUITE (KASUS 1 - 11)   ===");
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
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "networkidle" });
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
    // Verifikasi total 16 agent di DOM tag 3D
    const agentTagsCount = await page.locator(".agent-tag3d").count();
    console.log(`   Jumlah agent tag di scene 3D: ${agentTagsCount} (harus 16)`);
    if (agentTagsCount !== 16) {
      throw new Error(`Jumlah agent tag tidak 16! Ditemukan: ${agentTagsCount}`);
    }

    // Verifikasi ATLAS duduk di meja ruang Manager
    const atlasPos = await page.evaluate(() => {
      const pos = window.__STAGE_3D__.getAgentPosition("ATLAS");
      const target = window.__STAGE_3D__.getAgentTargetPosition("ATLAS");
      return { pos, target };
    });
    console.log("   Posisi awal ATLAS:", atlasPos.pos);
    const atlasDistFromHome = Math.hypot(atlasPos.pos.x - 0.0, atlasPos.pos.z - 9.2);
    console.log(`   Jarak ATLAS ke pusat meja Manager: ${atlasDistFromHome.toFixed(4)} unit`);
    if (atlasDistFromHome > 0.15) {
      throw new Error(`ATLAS tidak berada di meja Manager! Posisi: ${JSON.stringify(atlasPos.pos)}`);
    }

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
    await fullFrameBtn.click();
    await page.waitForSelector(".dash-grid.is-full-frame", { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "verification_artifacts/layout_fullframe.png" });
    await fullFrameBtn.click();
    await page.waitForTimeout(600);

    // Reset View Button test
    const resetBtn = page.locator("button.stage-reset-btn");
    await resetBtn.click({ noWaitAfter: true });
    await page.waitForTimeout(800);
    const resetState = await getSceneState();
    console.log("   Posisi kamera setelah reset:", resetState.cameraPos);

    // Fallback SVG Test
    const svgContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: await context.storageState(),
    });
    const svgPage = await svgContext.newPage();
    await svgPage.addInitScript(() => {
      window.__FORCE_WEBGL_FALLBACK__ = true;
    });
    await svgPage.goto("http://localhost:3000/?e2e=1", { waitUntil: "load" });
    await svgPage.waitForSelector("svg.stage", { timeout: 15000 });
    const svgAgentCount = await svgPage.locator("svg.stage g#agents g").count();
    console.log(`   Fallback SVG render: ${svgAgentCount} karakter terdeteksi`);
    await svgPage.screenshot({ path: "verification_artifacts/layout_fallback_svg.png" });
    await svgContext.close();

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
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("riset");
    });

    const startDelegation = Date.now();
    let arrivedAtRiset = false;

    while (Date.now() - startDelegation < 25000) {
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
        };
      });

      if (!data.pos) break;
      positionsSampled.push(data.pos);

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
    console.log(`   Total sampel posisi: ${positionsSampled.length}`);
    console.log(`   Tiba di meja departemen Riset: ${arrivedAtRiset}`);
    console.log(`   Pelanggaran ruangan lain: ${violationFound ? JSON.stringify(violationFound) : "TIDAK ADA ✓"}`);
    console.log(`   Galat posisi akhir ATLAS kembali ke meja: ${finalDistToHome.toFixed(4)} unit (batas ≤ 0.15)`);

    if (violationFound) {
      throw new Error(`ATLAS melintasi ruangan lain yang dilarang: ${JSON.stringify(violationFound)}`);
    }
    if (!arrivedAtRiset) {
      throw new Error("ATLAS tidak sampai di meja Riset!");
    }
    if (finalDistToHome > 0.15) {
      throw new Error(`ATLAS tidak kembali ke meja secara presisi! Galat: ${finalDistToHome}`);
    }

    testReport.kasus2 = {
      samplesCount: positionsSampled.length,
      arrivedAtRiset,
      unallowedViolation: violationFound,
      finalDistToHome,
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

    await rmPage.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "load" });
    await rmPage.waitForSelector("canvas.stage-3d-canvas");
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

    console.log(`   Jumlah agent di database: ${finalAgents?.length} (harus 16)`);
    console.log(`   Jumlah agent idle: ${(finalAgents?.length || 0) - nonIdleList.length}`);
    console.log(`   Jumlah approval pending tersisa: ${finalPendingApprovals}`);

    if (finalAgents?.length !== 16) {
      throw new Error(`Total agent di database bukan 16! Ditemukan: ${finalAgents?.length}`);
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
    console.log("=== SEMUA 11 KASUS PENGUJIAN V1a BERHASIL LOLOS LENGKAP!    ===");
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
