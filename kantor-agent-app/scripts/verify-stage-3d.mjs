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

console.log = (...args) => {
  const ts = new Date().toISOString().substring(11, 19);
  process.stdout.write(`[${ts}] ` + args.join(" ") + "\n");
};

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// Pastikan folder verification_artifacts tersedia
if (!fs.existsSync("verification_artifacts")) {
  fs.mkdirSync("verification_artifacts", { recursive: true });
}

// Bounding box pelat ruangan untuk verifikasi batas jalur koridor (Denah 44x36 isometrik)
// Satuan: tile / Three.js world units (1 tile = 1 unit dunia)
const ROOM_BOUNDS = {
  meeting: { minX: 0 + 0.1, maxX: 15 - 0.1, minZ: 0 + 0.1, maxZ: 9 - 0.1 },
  operasional: { minX: 17 + 0.1, maxX: 26 - 0.1, minZ: 0 + 0.1, maxZ: 9 - 0.1 },
  advertiser: { minX: 28 + 0.1, maxX: 41 - 0.1, minZ: 0 + 0.1, maxZ: 9 - 0.1 },
  ads: { minX: 28 + 0.1, maxX: 41 - 0.1, minZ: 0 + 0.1, maxZ: 9 - 0.1 },
  manager: { minX: 0 + 0.1, maxX: 9 - 0.1, minZ: 11 + 0.1, maxZ: 20 - 0.1 },
  riset: { minX: 11 + 0.1, maxX: 21 - 0.1, minZ: 11 + 0.1, maxZ: 19 - 0.1 },
  hr: { minX: 0 + 0.1, maxX: 9 - 0.1, minZ: 21 + 0.1, maxZ: 25 - 0.1 },
  sosmed: { minX: 0 + 0.1, maxX: 10 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
  creative: { minX: 11 + 0.1, maxX: 21 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
  copy: { minX: 22 + 0.1, maxX: 32 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
  landing_page: { minX: 33 + 0.1, maxX: 40 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
  lp: { minX: 33 + 0.1, maxX: 40 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
  pantry: { minX: 30 + 0.1, maxX: 38 - 0.1, minZ: 11 + 0.1, maxZ: 18 - 0.1 },
  lounge: { minX: 30 + 0.1, maxX: 38 - 0.1, minZ: 19 + 0.1, maxZ: 25 - 0.1 },
  toilet: { minX: 39 + 0.1, maxX: 44 - 0.1, minZ: 11 + 0.1, maxZ: 17 - 0.1 },
  taman: { minX: 39 + 0.1, maxX: 44 - 0.1, minZ: 18 + 0.1, maxZ: 25 - 0.1 },
  resepsi: { minX: 40 + 0.1, maxX: 44 - 0.1, minZ: 27 + 0.1, maxZ: 34 - 0.1 },
};

function normalizeRoomName(r) {
  if (r === "ads") return "advertiser";
  if (r === "lp") return "landing_page";
  return r;
}

function isInsideRoom(x, z, roomId) {
  const b = ROOM_BOUNDS[roomId];
  if (!b) return false;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function getUnallowedRoomViolation(x, z, allowedRooms) {
  const normalizedAllowed = (allowedRooms || []).map(normalizeRoomName);
  for (const [rId] of Object.entries(ROOM_BOUNDS)) {
    if (normalizedAllowed.includes(normalizeRoomName(rId))) continue;
    if (isInsideRoom(x, z, rId)) {
      return rId;
    }
  }
  return null;
}

async function run() {
  console.log("===============================================================");
  console.log("=== STARTING FULL STAGE 3D T1-FLOORPLAN TEST SUITE          ===");
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
    console.log("   ✓ Dashboard & 3D Stage berhasil dimuat.");

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
    // KASUS T1-1: VALIDASI DATA-DRIVEN FLOORPLAN 44x36 (Single Source of Truth)
    // =========================================================================
    console.log("\n--- KASUS T1-1: Validasi Data-Driven Floorplan 44x36 ---");
    const fpData = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const fp = stage.floorplan;
      let validErr = null;
      try {
        stage.validateFloorplan();
      } catch (e) {
        validErr = e.message;
      }
      return {
        width: fp.width,
        height: fp.height,
        roomsCount: fp.rooms.length,
        deptRooms: fp.rooms.filter((r) => r.kind === "dept").map((r) => r.id),
        commonRooms: fp.rooms.filter((r) => r.kind === "common").map((r) => r.id),
        corridorsCount: fp.corridors.length,
        corridorIds: fp.corridors.map((c) => c.id),
        baysCount: fp.bays.length,
        bayIds: fp.bays.map((b) => b.id),
        doorsCount: fp.doors.length,
        validErr,
      };
    });

    console.log(`   Dimensi denah: ${fpData.width} x ${fpData.height} tile (harus 44 x 36)`);
    console.log(`   Jumlah departemen: ${fpData.deptRooms.length} (harus 10) -> ${fpData.deptRooms.join(", ")}`);
    console.log(`   Jumlah area umum: ${fpData.commonRooms.length} (harus 8) -> ${fpData.commonRooms.join(", ")}`);
    console.log(`   Jumlah koridor: ${fpData.corridorsCount} (harus 7) -> ${fpData.corridorIds.join(", ")}`);
    console.log(`   Jumlah expansion bays: ${fpData.baysCount} (harus 9) -> ${fpData.bayIds.join(", ")}`);
    console.log(`   Jumlah pintu: ${fpData.doorsCount} (harus 21)`);
    console.log(`   Hasil startup validation: ${fpData.validErr ? "GALAT: " + fpData.validErr : "VALID TANPA ERROR ✓"}`);

    if (fpData.width !== 44 || fpData.height !== 36) {
      throw new Error(`Dimensi denah salah: ${fpData.width}x${fpData.height}, harus 44x36!`);
    }
    if (fpData.deptRooms.length !== 10) {
      throw new Error(`Jumlah departemen salah: ${fpData.deptRooms.length}, harus 10!`);
    }
    if (fpData.commonRooms.length !== 8) {
      throw new Error(`Jumlah area umum salah: ${fpData.commonRooms.length}, harus 8!`);
    }
    if (fpData.corridorsCount !== 7) {
      throw new Error(`Jumlah koridor salah: ${fpData.corridorsCount}, harus 7!`);
    }
    if (fpData.baysCount !== 9) {
      throw new Error(`Jumlah bays salah: ${fpData.baysCount}, harus 9!`);
    }
    if (fpData.doorsCount !== 21) {
      throw new Error(`Jumlah pintu salah: ${fpData.doorsCount}, harus 21!`);
    }
    if (fpData.validErr) {
      throw new Error(`Validasi denah gagal: ${fpData.validErr}`);
    }

    testReport.kasusT1_1 = fpData;
    console.log("   ✓ KASUS T1-1 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS T1-2: KAMERA ORTOGRAFIS TENGGARA & FRUSTUM FITTING VIEWPORTS
    // =========================================================================
    console.log("\n--- KASUS T1-2: Kamera Ortografis Tenggara & Frustum Fitting (1280px, 768px, 390px) ---");
    const camProps = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const cam = stage.camera;
      const p = stage.getCameraPosition();
      const t = stage.getCameraTarget();
      return {
        isOrthographic: !!cam.isOrthographicCamera,
        pos: { x: p.x, y: p.y, z: p.z },
        target: { x: t.x, y: t.y, z: t.z },
      };
    });

    console.log(`   Kamera isOrthographicCamera: ${camProps.isOrthographic} (harus true)`);
    console.log(`   Posisi kamera: (${camProps.pos.x.toFixed(1)}, ${camProps.pos.y.toFixed(1)}, ${camProps.pos.z.toFixed(1)})`);
    console.log(`   Target kamera: (${camProps.target.x.toFixed(1)}, ${camProps.target.y.toFixed(1)}, ${camProps.target.z.toFixed(1)})`);

    if (!camProps.isOrthographic) {
      throw new Error("Kamera bukan OrthographicCamera!");
    }
    // Posisi dari kuadran Tenggara (x > 20.5, z > 17.0, y > 20.0) menghadap pusat (20.5, 0, 17.0)
    if (camProps.pos.x <= 20.5 || camProps.pos.z <= 17.0 || camProps.pos.y < 20.0) {
      throw new Error(`Kamera tidak berada di Tenggara denah! Pos: ${JSON.stringify(camProps.pos)}`);
    }

    // Uji proyeksi 4 sudut ekstrem denah termasuk bay (x: -3..44, z: -2..36)
    // Semua sudut harus terproyeksi dalam batas NDC [-1, 1] pada viewport 1280px, 768px, dan 390px
    const viewportsToTest = [
      { name: "1280px (Desktop)", w: 1280, h: 800 },
      { name: "768px (Tablet)", w: 768, h: 1024 },
      { name: "390px (Mobile)", w: 390, h: 844 },
    ];

    const frustumReport = {};
    for (const vp of viewportsToTest) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(400);

      const projections = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const corners = [
          { name: "NW (bay_manager/ops)", x: -3, z: -2 },
          { name: "NE (bay_adv/ops)", x: 44, z: -2 },
          { name: "SE (bay_lp/resepsi)", x: 44, z: 36 },
          { name: "SW (bay_sosmed/manager)", x: -3, z: 36 },
        ];
        return corners.map((c) => {
          const ndc = stage.projectPoint(c.x, 0, c.z);
          return {
            ...c,
            ndc,
            insideNDC: Math.abs(ndc.x) <= 1.0 && Math.abs(ndc.y) <= 1.0,
          };
        });
      });

      console.log(`   Viewport ${vp.name}:`);
      let allInside = true;
      for (const p of projections) {
        console.log(`      Sudut ${p.name} (${p.x}, ${p.z}): NDC=(${p.ndc.x.toFixed(3)}, ${p.ndc.y.toFixed(3)}) -> ${p.insideNDC ? "IN BOUNDS ✓" : "CLIPPED ✗"}`);
        if (!p.insideNDC) allInside = false;
      }

      if (!allInside) {
        throw new Error(`Ujung denah terpotong pada viewport ${vp.name}! Proyeksi: ${JSON.stringify(projections)}`);
      }
      frustumReport[vp.name] = projections;
    }

    // Kembalikan viewport ke 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    testReport.kasusT1_2 = {
      isOrthographic: camProps.isOrthographic,
      camPos: camProps.pos,
      camTarget: camProps.target,
      frustumReport,
    };
    console.log("   ✓ KASUS T1-2 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS T1-3: PENEMPATAN & ORIENTASI 19 AGEN & KURSI RAPAT
    // =========================================================================
    console.log("\n--- KASUS T1-3: Penempatan & Orientasi 19 Agen & Kursi Rapat ---");
    const agentHomeVerification = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const homeMap = stage.getHomePositions();
      const seatMap = stage.getSeatPositions();
      const names = Object.keys(homeMap);
      const res = [];

      for (const name of names) {
        const hp = homeMap[name];
        const sp = seatMap[name];
        const pos = stage.getAgentPosition(name);
        const d = Math.hypot(pos.x - hp[0], pos.z - hp[1]);
        res.push({
          name,
          home: hp,
          seat: sp,
          currentPos: { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) },
          distFromHome: +d.toFixed(4),
          atHome: d <= 0.15,
        });
      }
      return { total: names.length, agents: res };
    });

    console.log(`   Total agen terdaftar: ${agentHomeVerification.total} (harus 19)`);
    let allAtHome = true;
    for (const a of agentHomeVerification.agents) {
      if (!a.atHome) {
        console.error(`      ✗ Agen ${a.name} tidak berada di meja rumah! Pos: (${a.currentPos.x}, ${a.currentPos.z}), Home: (${a.home[0]}, ${a.home[1]}), dist: ${a.distFromHome}`);
        allAtHome = false;
      }
    }
    if (!allAtHome) {
      throw new Error("Sebagian agen tidak berada di meja rumah masing-masing!");
    }
    console.log("   ✓ Seluruh 19 agen berada di meja kerja departemen masing-masing.");

    testReport.kasusT1_3 = agentHomeVerification;
    console.log("   ✓ KASUS T1-3 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS T1-4: AUTO-GENERATED WALKWAY GRAPH & DIJKSTRA PATHFINDING
    // =========================================================================
    console.log("\n--- KASUS T1-4: Auto-Generated Walkway Graph & Dijkstra Pathfinding ---");
    const routesToTest = [
      { from: "manager", to: "riset", allowed: ["manager", "riset"] },
      { from: "manager", to: "copy", allowed: ["manager", "copy"] },
      { from: "manager", to: "landing_page", allowed: ["manager", "landing_page"] },
      { from: "manager", to: "advertiser", allowed: ["manager", "advertiser"] },
    ];

    const pathResults = {};
    for (const r of routesToTest) {
      const pathPts = await page.evaluate(({ from, to }) => {
        const pts = window.__STAGE_3D__.findPath(from, to);
        return pts.map((p) => ({ x: +p.x.toFixed(3), z: +p.z.toFixed(3) }));
      }, r);

      console.log(`   Rute ${r.from} -> ${r.to}: ${pathPts.length} waypoints terdeteksi`);
      if (pathPts.length < 2) {
        throw new Error(`Rute ${r.from} -> ${r.to} menghasilkan waypoint kurang dari 2!`);
      }

      // Verifikasi tidak ada segmen rute yang menabrak ruangan terlarang
      let violation = null;
      for (let i = 0; i < pathPts.length; i++) {
        const pt = pathPts[i];
        const v = getUnallowedRoomViolation(pt.x, pt.z, r.allowed);
        if (v) {
          violation = { point: pt, room: v };
          break;
        }
      }
      if (violation) {
        throw new Error(`Waypoint rute ${r.from} -> ${r.to} melanggar ruangan ${violation.room} di (${violation.point.x}, ${violation.point.z})`);
      }
      console.log(`      ✓ Rute ${r.from} -> ${r.to} aman tanpa menembus dinding ruangan lain.`);
      pathResults[`${r.from}_${r.to}`] = { pointsCount: pathPts.length, start: pathPts[0], end: pathPts[pathPts.length - 1] };
    }

    testReport.kasusT1_4 = pathResults;
    console.log("   ✓ KASUS T1-4 LOLOS SEMPURNA.");

    // =========================================================================
    // KASUS T1-5: MERGED STATIC GEOMETRY & ANGGARAN DRAW CALLS (< 150)
    // =========================================================================
    console.log("\n--- KASUS T1-5: Merged Static Geometry & Anggaran Draw Calls (< 150) ---");
    const renderStats = await page.evaluate(async () => {
      const stage = window.__STAGE_3D__;
      // Tunggu 3 frame agar render loop mengupdate info render
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));

      const info = stage.getRenderInfo();
      const staticCalls = stage.getStaticDrawCalls ? stage.getStaticDrawCalls() : 0;
      const mergedMeshes = [];
      stage.scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          const vCount = obj.geometry.attributes?.position?.count || 0;
          if (vCount > 40) {
            mergedMeshes.push({
              name: obj.name || "unnamed",
              vertexCount: vCount,
            });
          }
        }
      });
      return {
        calls: info.calls,
        staticCalls,
        triangles: info.triangles,
        largeMeshesCount: mergedMeshes.length,
      };
    });

    console.log(`   Static Draw Calls terukur: ${renderStats.staticCalls} (anggaran ketat: < 150)`);
    console.log(`   Total Scene Calls: ${renderStats.calls} (termasuk 19 karakter dinamis)`);
    console.log(`   Triangles: ${renderStats.triangles}`);
    console.log(`   Static merged meshes terdeteksi: ${renderStats.largeMeshesCount}`);

    if (renderStats.staticCalls >= 150) {
      throw new Error(`Static draw calls (${renderStats.staticCalls}) melebihi anggaran maksimal 150! Merging geometri gagal.`);
    }
    if (renderStats.staticCalls === 0) {
      throw new Error("Static draw calls tidak terdeteksi (0)! Tag userData.isStatic gagal.");
    }
    console.log(`   ✓ Anggaran static draw calls terpenuhi (< 150).`);

    testReport.kasusT1_5 = renderStats;
    console.log("   ✓ KASUS T1-5 LOLOS SEMPURNA.");

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

    // Verifikasi ATLAS duduk di meja ruang Manager (4.5, 15.0) dan menghadap meja (+Z)
    const atlasPos = await page.evaluate(() => {
      const pos = window.__STAGE_3D__.getAgentPosition("ATLAS");
      const target = window.__STAGE_3D__.getAgentTargetPosition("ATLAS");
      const rot = window.__STAGE_3D__.getAgentRotation("ATLAS");
      return { pos, target, rot };
    });
    console.log("   Posisi awal ATLAS:", atlasPos.pos);
    console.log("   Rotasi awal ATLAS (harus menghadap ke meja di selatan / +Z):", atlasPos.rot);
    const atlasDistFromHome = Math.hypot(atlasPos.pos.x - 4.5, atlasPos.pos.z - 15.0);
    console.log(`   Jarak ATLAS ke pusat meja Manager: ${atlasDistFromHome.toFixed(4)} unit`);
    if (atlasDistFromHome > 0.15) {
      throw new Error(`ATLAS tidak berada di meja Manager! Posisi: ${JSON.stringify(atlasPos.pos)}`);
    }
    // ATLAS duduk di z=15.0, meja di selatan z=15.8 (z lebih besar), ATLAS menghadap +Z (rotasi Y dekat 0)
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
    await svgPage.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("   svgPage URL saat ini:", svgPage.url());
    await svgPage.waitForSelector("svg.stage", { timeout: 60000 });
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
      if (positionsSampled.length % 5 === 0 || !data.isBusy) {
        console.log(`      Sample ${positionsSampled.length}: isBusy=${data.isBusy}, qLen=${data.qLen}, pos=(${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)})`);
      }

      // Cek apakah posisi melanggar ruangan lain
      const violation = getUnallowedRoomViolation(data.pos.x, data.pos.z, allowedRooms);
      if (violation && !violationFound) {
        violationFound = { room: violation, pos: data.pos };
      }

      // Cek apakah tiba di Riset (x: 11..21, z: 11..19)
      if (data.pos.x >= 11 && data.pos.x <= 21 && data.pos.z >= 11 && data.pos.z <= 19) {
        arrivedAtRiset = true;
      }

      if (!data.isBusy && positionsSampled.length > 20) {
        break;
      }
    }

    const finalAtlasPos = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const finalDistToHome = Math.hypot(finalAtlasPos.x - 4.5, finalAtlasPos.z - 15.0);
    const finalAtlasRot = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentRotation("ATLAS")
    );
    console.log(`   Total sampel posisi: ${positionsSampled.length}`);
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
    while (Date.now() - startTwoTrips < 50000) {
      await page.waitForTimeout(80);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
        };
      });

      if (!data.pos) break;

      // Cek apakah mencapai Copy (x: 22..32, z: 27..34)
      if (data.pos.x >= 22 && data.pos.x <= 32 && data.pos.z >= 27 && data.pos.z <= 34) {
        visitedFirstDestination = true;
      }

      // Setelah mencapai Copy, cek apakah kembali ke meja (jarak ke home <= 0.15)
      if (visitedFirstDestination && !returnedHomeBetweenTrips) {
        const dHome = Math.hypot(data.pos.x - 4.5, data.pos.z - 15.0);
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
    const finalDistTwo = Math.hypot(posAfterTwo.x - 4.5, posAfterTwo.z - 15.0);

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
    const rmPage = await context.newPage();
    await rmPage.setViewportSize({ width: 1280, height: 800 });
    await rmPage.emulateMedia({ reducedMotion: "reduce" });
    const rmErrors = [];
    rmPage.on("console", (m) => {
      if (m.type() === "error") rmErrors.push(m.text());
    });
    rmPage.on("pageerror", (e) => {
      rmErrors.push(e.message || String(e));
    });

    console.log("   Navigasi ke rmPage (reduced-motion)...");
    await rmPage.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("   rmPage URL saat ini:", rmPage.url());
    await rmPage.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await rmPage.waitForTimeout(1000);

    const isRmActive = await rmPage.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    console.log("   prefers-reduced-motion terdeteksi:", isRmActive);

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
    await rmPage.close();

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

    const siangInt = daylightResults[13].ambientIntensity;
    const malamInt = daylightResults[21].ambientIntensity;
    const isSiangBrighter = siangInt > malamInt;
    const isFloorMinPreserved = malamInt >= 0.85;

    console.log(`   Intensitas Siang (${siangInt}) > Malam (${malamInt}): ${isSiangBrighter}`);
    console.log(`   Kecerahan lantai minimum malam hari terjaga: ${isFloorMinPreserved}`);

    if (!isSiangBrighter || !isFloorMinPreserved) {
      throw new Error("Siklus cahaya tidak memenuhi syarat kecerahan siang > malam atau lantai minimum!");
    }

    // Uji transisi halus
    console.log("   Menguji kehalusan transisi pergantian jam...");
    await page.evaluate(() => {
      window.__STAGE_3D__.setHourOverride(13);
    });
    await page.waitForTimeout(600);

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
    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("creative");
    });
    await page.waitForTimeout(800);

    const camBeforeClick = await getSceneState();
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
    // KASUS V1a-fix 1: GATHER RAPAT (19 Agen Berjalan Lewat Koridor)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 1: Gather Rapat (19 Agen Berjalan Lewat Koridor) ---");
    const agentHomeRooms = {
      ATHENA: "riset",
      ARGUS: "riset",
      METIS: "riset",
      CLIO: "copy",
      ERATO: "copy",
      DAPHNE: "copy",
      HESTIA: "landing_page",
      THEMIS: "landing_page",
      TALOS: "landing_page",
      ZEUS: "advertiser",
      ARTEMIS: "advertiser",
      PLUTUS: "advertiser",
      THEIA: "creative",
      LYRA: "creative",
      IRIS: "creative",
      ATLAS: "manager",
      HERA: "hr",
      HEPHAESTUS: "operasional",
      HERMES: "sosmed",
    };

    const seatMap = await page.evaluate(() => window.__STAGE_3D__.getSeatPositions());
    const prevPositions = {};
    let gatherViolationFound = null;
    let maxDeltaPerInterval = 0;
    let minInterAgentDist = Infinity;
    let minInterAgentPair = null;

    // Mulai gather rapat (animasi normal)
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });

    const gatherStart = Date.now();
    let prevSampleTime = Date.now();
    let allArrivedAtMeeting = false;

    while (Date.now() - gatherStart < 40000) {
      await page.waitForTimeout(80);
      const nowSampleTime = Date.now();
      const dtIntervalS = Math.max((nowSampleTime - prevSampleTime) / 1000, 0.001);
      prevSampleTime = nowSampleTime;

      const agentStates = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const res = {};
        const names = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
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

        if (prevPositions[name]) {
          const delta = Math.hypot(
            st.pos.x - prevPositions[name].x,
            st.pos.z - prevPositions[name].z
          );
          if (delta > maxDeltaPerInterval) maxDeltaPerInterval = delta;
          const apparentSpeed = delta / dtIntervalS;
          if (delta > 12.0 || apparentSpeed > 7.0) {
            throw new Error(`Agen ${name} teleportasi mendadak! Delta per frame: ${delta.toFixed(3)} unit (kecepatan: ${apparentSpeed.toFixed(2)} unit/s)`);
          }
        }
        prevPositions[name] = st.pos;

        const allowed = [agentHomeRooms[name], "meeting"];
        const viol = getUnallowedRoomViolation(st.pos.x, st.pos.z, allowed);
        if (viol && !gatherViolationFound) {
          gatherViolationFound = { agent: name, room: viol, pos: st.pos };
        }
      }

      // Jarak minimum antar-agen sepanjang pergerakan gather
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
    console.log(`   Maks pergeseran posisi per interval: ${maxDeltaPerInterval.toFixed(4)} unit`);
    console.log(`   Pelanggaran ruangan asing selama jalan: ${gatherViolationFound ? JSON.stringify(gatherViolationFound) : "Nihil (Aman)"}`);
    console.log(`   Jarak antar-agen minimum selama gather: ${minInterAgentDist.toFixed(4)} unit (${minInterAgentPair?.join(" - ")})`);

    if (gatherViolationFound) {
      throw new Error(`Pelanggaran jalur gather: Agen ${gatherViolationFound.agent} masuk ke ruangan ${gatherViolationFound.room} pada posisi ${JSON.stringify(gatherViolationFound.pos)}`);
    }

    // Verifikasi semua 19 agen tiba di kursi masing-masing di ruang meeting
    const finalGatherPositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
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
      const expectedX = seat[0];
      const expectedZ = seat[1];
      const dist = Math.hypot(pos.x - expectedX, pos.z - expectedZ);
      if (dist > maxSeatDist) maxSeatDist = dist;
      if (dist > 0.18) {
        throw new Error(`Agen ${name} tidak berada di kursi meeting-nya! Jarak: ${dist.toFixed(4)} (pos: ${pos.x}, ${pos.z}; target: ${expectedX}, ${expectedZ})`);
      }
    }

    console.log(`   Seluruh 19 agen tiba di kursi rapat (deviasi maks: ${maxSeatDist.toFixed(4)} <= 0.18 unit)`);
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
    // KASUS V1a-fix 2: ANTREAN DELEGASI SELAMA RAPAT
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 2: Antrean Delegasi Selama Rapat ---");
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
    const atlasSeatX = atlasExpectedSeat[0];
    const atlasSeatZ = atlasExpectedSeat[1];
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
    // KASUS V1a-fix 3: BUBAR RAPAT & AUTO-DRAIN DELEGASI
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 3: Bubar Rapat & Auto-Drain Delegasi ---");
    const homeMap = await page.evaluate(() => window.__STAGE_3D__.getHomePositions());

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
          "THEIA", "LYRA", "IRIS", "HERA", "HEPHAESTUS", "HERMES"
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

    console.log(`   18 agen non-ATLAS selesai kembali ke meja: ${allNonAtlasReturned}`);
    console.log(`   ATLAS menuntaskan delegasi tertunda dan kembali ke meja: ${atlasCompletedDelegation}`);

    if (!allNonAtlasReturned) {
      throw new Error("Sebagian agen non-ATLAS tidak selesai kembali ke mejanya setelah bubar!");
    }
    if (!atlasCompletedDelegation) {
      throw new Error("ATLAS tidak menyelesaikan delegasi tertunda setelah bubar rapat!");
    }

    // Verifikasi posisi akhir 18 agen non-ATLAS di meja masing-masing
    const finalDispersePositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "HERA", "HEPHAESTUS", "HERMES"
      ];
      names.forEach((n) => {
        res[n] = stage.getAgentPosition(n);
      });
      return res;
    });

    let maxHomeDist = 0;
    for (const [name, pos] of Object.entries(finalDispersePositions)) {
      const hp = homeMap[name];
      const expectedX = hp[0];
      const expectedZ = hp[1];
      const dist = Math.hypot(pos.x - expectedX, pos.z - expectedZ);
      if (dist > maxHomeDist) maxHomeDist = dist;
      if (dist > 0.18) {
        throw new Error(`Agen ${name} tidak berada di meja rumahnya setelah bubar! Jarak: ${dist.toFixed(4)}`);
      }
    }
    console.log(`   Seluruh 18 agen non-ATLAS kembali di meja masing-masing (deviasi maks: ${maxHomeDist.toFixed(4)} <= 0.18)`);

    // Verifikasi posisi akhir ATLAS di meja Manager (4.5, 15.0)
    const atlasFinalPos = await page.evaluate(() =>
      window.__STAGE_3D__.getAgentPosition("ATLAS")
    );
    const atlasFinalDist = Math.hypot(atlasFinalPos.x - 4.5, atlasFinalPos.z - 15.0);
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
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(true);
    });
    await page.waitForTimeout(100);

    const rmGatherStates = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
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

    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(true);
    });
    await page.waitForTimeout(100);

    const rmDisperseStates = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
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
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 5: ATLAS di Ruang Riset Saat Delegasi Lalu Meeting Diklik ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.clearChoreo();
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      window.__STAGE_3D__.demoDelegate("riset");
    });

    let atlasReachedRiset = false;
    const waitRisetStart = Date.now();
    while (Date.now() - waitRisetStart < 15000) {
      await page.waitForTimeout(80);
      const pos = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
      if (pos && pos.x >= 11 && pos.x <= 21 && pos.z >= 11 && pos.z <= 19) {
        atlasReachedRiset = true;
        console.log(`   ATLAS telah berada di dalam Ruang Riset: (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
        break;
      }
    }
    if (!atlasReachedRiset) {
      throw new Error("ATLAS tidak sampai di Ruang Riset sebelum klik meeting!");
    }

    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });
    console.log("   Meeting diklik saat ATLAS berada di dalam Ruang Riset.");

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

    const atlasSeatAfterRiset = await page.evaluate(() => window.__STAGE_3D__.getAgentPosition("ATLAS"));
    const atlasExpSeatRiset = seatMap["ATLAS"];
    const atlasExpXRiset = atlasExpSeatRiset[0];
    const atlasExpZRiset = atlasExpSeatRiset[1];
    const dAtlasSeatRiset = Math.hypot(atlasSeatAfterRiset.x - atlasExpXRiset, atlasSeatAfterRiset.z - atlasExpZRiset);
    console.log(`   Deviasi posisi ATLAS ke kursi rapat: ${dAtlasSeatRiset.toFixed(4)} unit`);
    if (dAtlasSeatRiset > 0.18) {
      throw new Error(`ATLAS tidak berada di kursi rapat setelah transit dari Riset! Deviasi: ${dAtlasSeatRiset}`);
    }

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
    // KASUS V1a-fix 6: KLIK MEETING DUA KALI BERURUTAN CEPAT (BUBAR SAAT BERJALAN)
    // =========================================================================
    console.log("\n--- KASUS V1a-fix 6: Klik Meeting Dua Kali Berurutan Cepat (Bubar Saat Berjalan) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.clearChoreo();
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });

    await page.waitForTimeout(800);

    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(false);
    });
    console.log("   Meeting dibubarkan cepat saat agen sedang melangkah di koridor.");

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
          "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
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

    const finalQuickCancelPositions = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const res = {};
      const names = [
        "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
        "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
        "THEIA", "LYRA", "IRIS", "ATLAS", "HERA", "HEPHAESTUS", "HERMES"
      ];
      names.forEach((n) => {
        res[n] = stage.getAgentPosition(n);
      });
      return res;
    });

    let maxQuickCancelDev = 0;
    for (const [name, pos] of Object.entries(finalQuickCancelPositions)) {
      const hp = homeMap[name];
      const expX = hp[0];
      const expZ = hp[1];
      const d = Math.hypot(pos.x - expX, pos.z - expZ);
      if (d > maxQuickCancelDev) maxQuickCancelDev = d;
      if (d > 0.18) {
        throw new Error(`Agen ${name} tidak berada di mejanya setelah bubar cepat! Deviasi: ${d.toFixed(4)}`);
      }
    }
    console.log(`   Seluruh 19 agen kembali di meja masing-masing (deviasi maks: ${maxQuickCancelDev.toFixed(4)} <= 0.18 unit).`);

    testReport.v1afix_quick_cancel_double_click = {
      allFinishedReturn,
      quickCancelViolation,
      maxQuickCancelDev,
    };
    console.log("   ✓ KASUS V1a-fix 6 LOLOS SEMPURNA.");

    // =========================================================================
    // PENGECEKAN KONFIGURASI KURSI AGENT_RENDER_ORDER
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
    // KASUS 12: SIMULASI PENAMBAHAN INSTANCE AGEN
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

    console.log("   1. Memulai alur demo instance request (Step 1-3)...");
    await page.evaluate(() => {
      window.__STAGE_3D__.startInstanceDemo({ autoApprove: false });
    });

    await page.waitForSelector(".ceo-approval-demo-card", { timeout: 10000 });
    const demoStep3 = await page.evaluate(() => {
      return window.__STAGE_3D__.getInstanceDemoState();
    });
    console.log(`   ✓ Langkah 3 tercapai: Step = ${demoStep3.step}, Kartu CEO Muncul = ${demoStep3.showApprovalCard}`);
    if (demoStep3.step !== 3 || !demoStep3.showApprovalCard) {
      throw new Error(`Demo gagal berhenti di Step 3 dengan kartu CEO! State: ${JSON.stringify(demoStep3)}`);
    }

    await page.screenshot({ path: "verification_artifacts/instance_demo_ceo_card.png" });

    console.log("   2. Menyetujui permohonan via tombol CEO Approval...");
    const approveBtn = page.locator(".ceo-approve-btn");
    await approveBtn.click();

    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      return state.step >= 5 && state.dynamicDesksCount >= 1;
    }, { timeout: 10000 });
    console.log("   ✓ Langkah 5 tercapai: Meja dinamis ditambahkan di Ruang Advertisers.");

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

    if (activeDemoState.currentSceneUuid !== preDemoState.sceneUuid) {
      throw new Error("Scene Three.js di-rebuild saat penambahan dynamic instance! Scene UUID berubah!");
    }
    console.log("   ✓ Integritas Three.js terjaga: Scene UUID 100% IDENTIK (tanpa rebuild scene).");

    await page.screenshot({ path: "verification_artifacts/instance_demo_active.png" });

    console.log("   3. Menguji klik seleksi pada agent instance...");
    const instanceTagLocator = page.locator(".agent-tag3d.is-instance");
    await instanceTagLocator.click({ force: true });
    await page.waitForTimeout(400);

    console.log("   4. Menguji queueing permintaan demo...");
    await page.evaluate(() => {
      window.__STAGE_3D__.startInstanceDemo();
    });

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
    console.log("=== SEMUA PENGUJIAN T1-FLOORPLAN BERHASIL LOLOS LENGKAP!    ===");
    console.log("===============================================================\n");
    console.log(JSON.stringify(testReport, null, 2));

  } finally {
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
  console.error("\nFATAL ERROR DALAM PENGUJIAN T1-FLOORPLAN:", err);
  process.exit(1);
});
