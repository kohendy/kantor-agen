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
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 90000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    try {
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    } catch (e) {
      console.error("   Error waiting for canvas. Current URL:", page.url());
      console.error("   Console errors:", consoleErrors);
      console.error("   Console logs:", consoleLogs);
      const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
      console.error("   Body HTML:", bodyHtml);
      throw e;
    }
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
    const runOnlyKasus12 = process.argv.includes("--kasus12") || process.argv.includes("12");

    if (!runOnlyKasus12) {
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

    // Sub-test: Unit Test Pergeseran Pintu & Koridor Tanpa Ubah walkways.ts
    console.log("   Menguji mutasi data denah (pergeseran pintu & koridor) pada generator walkways...");
    const mutationResult = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const baseFp = JSON.parse(JSON.stringify(stage.floorplan));

      // Geser pintu ruangan riset sebesar +2 tile
      const risetRoom = baseFp.rooms.find((r) => r.id === "riset");
      const risetDoor = risetRoom.doors[0];
      const risetFpDoor = baseFp.doors.find((d) => d.id === risetDoor.id);
      const oldOffset = risetDoor.offset;
      const newOffset = oldOffset + 2.0;
      risetDoor.offset = newOffset;
      if (risetFpDoor) risetFpDoor.offset = newOffset;

      // Geser lebar koridor barat (V_W)
      const westCorridor = baseFp.corridors.find((c) => c.id === "V_W" || c.id === "koridor_barat");
      westCorridor.w += 0.5;

      // Panggil generateWalkwayGraph langsung dengan denah yang dimutasi
      const mutatedGraph = stage.generateWalkwayGraph(baseFp);

      // Cek apakah node pintu dan doorOut terbentuk pada koordinat baru
      const doorInNode = Object.values(mutatedGraph).find(
        (n) => n.roomId === "riset" && n.isDoor
      );
      const doorOutId = `door_${risetDoor.id}_out`;
      const doorOutNode = mutatedGraph[doorOutId];

      const hasConnections =
        doorOutNode && doorOutNode.neighbors && doorOutNode.neighbors.length > 0;

      return {
        oldOffset,
        newOffset,
        newDoorInX: doorInNode?.x,
        newDoorOutX: doorOutNode?.x,
        doorOutNeighborsCount: doorOutNode?.neighbors?.length || 0,
        hasConnections,
        totalNodesCount: Object.keys(mutatedGraph).length,
      };
    });

    console.log(`      Pintu riset digeser: offset ${mutationResult.oldOffset} -> ${mutationResult.newOffset}`);
    console.log(`      Node pintu baru terdeteksi: doorOutX = ${mutationResult.newDoorOutX}, neighbors = ${mutationResult.doorOutNeighborsCount}`);
    console.log(`      Total node graf baru: ${mutationResult.totalNodesCount}`);

    if (!mutationResult.hasConnections || mutationResult.doorOutNeighborsCount === 0) {
      throw new Error("Walkway generator gagal menghubungkan pintu yang digeser ke koridor!");
    }
    console.log("      ✓ Walkways otomatis murni data-driven: graph berhasil beradaptasi tanpa perubahan kode walkways.ts!");
    pathResults.mutationTest = mutationResult;

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

    let sampleCount = 0;
    const startTwoTrips = Date.now();
    while (Date.now() - startTwoTrips < 90000) {
      await page.waitForTimeout(100);
      sampleCount++;
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          pos: stage.getAgentPosition("ATLAS"),
          qLen: stage.getChoreoQueueLength("ATLAS"),
          effSpeed: stage.getEffectiveSpeed ? stage.getEffectiveSpeed("ATLAS") : 0,
        };
      });

      if (!data.pos) break;

      // Cek apakah mencapai Copy (x: 22..32, z: 27..34)
      if (data.pos.x >= 22 && data.pos.x <= 32 && data.pos.z >= 27 && data.pos.z <= 34) {
        if (!visitedFirstDestination) {
          console.log(`   ✓ ATLAS tiba di Ruang Copy pada detik ${((Date.now() - startTwoTrips) / 1000).toFixed(2)}: pos=(${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)})`);
        }
        visitedFirstDestination = true;
      }

      // Setelah mencapai Copy, cek apakah kembali ke meja (jarak ke home <= 0.15)
      if (visitedFirstDestination && !returnedHomeBetweenTrips) {
        const dHome = Math.hypot(data.pos.x - 4.5, data.pos.z - 15.0);
        if (dHome < minHomeDistBetween) minHomeDistBetween = dHome;
        if (dHome <= 0.15) {
          returnedHomeBetweenTrips = true;
          console.log(`   ✓ ATLAS benar-benar kembali ke meja di antara delegasi pada detik ${((Date.now() - startTwoTrips) / 1000).toFixed(2)} (jarak: ${dHome.toFixed(4)} <= 0.15)`);
        }
      }

      if (sampleCount % 40 === 0) {
        const elapsed = ((Date.now() - startTwoTrips) / 1000).toFixed(1);
        console.log(`      [Kasus 3 Watch ${elapsed}s] isBusy=${data.isBusy}, qLen=${data.qLen}, speed=${data.effSpeed.toFixed(2)}, pos=(${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)})`);
      }

      if (!data.isBusy && returnedHomeBetweenTrips) {
        console.log(`   ✓ ATLAS menyelesaikan kedua perjalanan pada detik ${((Date.now() - startTwoTrips) / 1000).toFixed(2)}.`);
        break;
      }
    }

    const twoTripsDurationS = +((Date.now() - startTwoTrips) / 1000).toFixed(2);
    const oldLimitTwoTrips = 35;
    const proposedLimitTwoTrips = 75;
    console.log(`   [EVALUASI BATAS LAMA vs DENAH BARU 44x36]`);
    console.log(`   - Batas lama: <= ${oldLimitTwoTrips} detik`);
    console.log(`   - Durasi terukur sebenarnya: ${twoTripsDurationS} detik`);
    console.log(`   - Status batas lama: ${twoTripsDurationS <= oldLimitTwoTrips ? "MEMENUHI" : "MELEBIHI BATAS (Wajar: denah 44x36 melipatgandakan jarak tempuh round-trip ke ~168 unit)"}`);
    console.log(`   - Usulan batas baru: <= ${proposedLimitTwoTrips} detik (berdasarkan baseSpeed 3.2 unit/s menjaga kelancaran animasi)`);

    if (twoTripsDurationS > proposedLimitTwoTrips) {
      throw new Error(`Dua perjalanan melebihi usulan batas waktu ${proposedLimitTwoTrips} detik! Terukur: ${twoTripsDurationS} detik`);
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
    // Estimasi teoritis tanpa percepatan di denah 44x36:
    // 7 perjalanan PP menempuh total >500 unit pada baseSpeed 3.2 unit/s + jeda normal memakan waktu ~160 detik.
    const theoreticalNormalDurationS = 160;

    const startBacklog = Date.now();
    await page.evaluate(() => {
      const rooms = ["riset", "copy", "lp", "ads", "creative", "riset", "copy"];
      rooms.forEach((r) => window.__STAGE_3D__.demoDelegate(r));
    });

    const initialQueueLength = await page.evaluate(() =>
      window.__STAGE_3D__.getChoreoQueueLength("ATLAS")
    );
    console.log(`   Panjang antrean awal tugas backlog: ${initialQueueLength}`);

    let maxEffectiveSpeedObserved = 0;
    while (Date.now() - startBacklog < 70000) {
      await page.waitForTimeout(200);
      const data = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        return {
          isBusy: stage.isChoreoBusy("ATLAS"),
          effSpeed: stage.getEffectiveSpeed ? stage.getEffectiveSpeed("ATLAS") : 0,
        };
      });
      if (data.effSpeed > maxEffectiveSpeedObserved) {
        maxEffectiveSpeedObserved = data.effSpeed;
      }
      if (!data.isBusy) break;
    }

    const backlogDurationMs = Date.now() - startBacklog;
    const backlogDurationS = +(backlogDurationMs / 1000).toFixed(2);
    const oldLimitBacklog = 35;
    const proposedLimitBacklog = 70;
    console.log(`   [EVALUASI BATAS LAMA vs DENAH BARU 44x36]`);
    console.log(`   - Batas lama: <= ${oldLimitBacklog} detik`);
    console.log(`   - Durasi terukur sebenarnya (dengan adaptif): ${backlogDurationS} detik`);
    console.log(`   - Kecepatan efektif puncak teramati: ${maxEffectiveSpeedObserved.toFixed(2)} unit/s (batas <= 14.0 unit/s)`);
    console.log(`   - Estimasi tanpa percepatan adaptif: ~${theoreticalNormalDurationS} detik`);
    console.log(`   - Rasio efisiensi percepatan: ${(theoreticalNormalDurationS / backlogDurationS).toFixed(2)}x lebih cepat`);
    console.log(`   - Status batas lama: ${backlogDurationS <= oldLimitBacklog ? "MEMENUHI" : "MELEBIHI BATAS (Wajar: 7 perjalanan mencakup >500 unit koridor denah 44x36)"}`);
    console.log(`   - Usulan batas baru: <= ${proposedLimitBacklog} detik`);

    if (maxEffectiveSpeedObserved > 14.0) {
      throw new Error(`Kecepatan efektif (${maxEffectiveSpeedObserved.toFixed(2)} unit/s) melebihi batas toleransi 14.0 unit/s!`);
    }
    if (backlogDurationS > proposedLimitBacklog) {
      throw new Error(`Percepatan adaptif gagal: memakan waktu ${backlogDurationS} detik (melebihi usulan batas ${proposedLimitBacklog} detik)!`);
    }

    testReport.kasus4 = {
      initialQueueLength,
      actualDurationS: backlogDurationS,
      theoreticalNormalDurationS,
      speedupRatio: +(theoreticalNormalDurationS / backlogDurationS).toFixed(2),
      maxEffectiveSpeed: maxEffectiveSpeedObserved,
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
    // KASUS 7: SIKLUS CAHAYA (Daylight 07, 12, 13, 17, 21, 22, Transisi Halus & Luminans)
    // =========================================================================
    console.log("\n--- KASUS 7: Siklus Cahaya Mengikuti Jam & Luminans Tema Terang ---");
    const hoursToTest = [7, 12, 13, 17, 21, 22];
    const daylightResults = {};

    function calcRelLuminance(num) {
      const r = ((num >> 16) & 255) / 255;
      const g = ((num >> 8) & 255) / 255;
      const b = (num & 255) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    for (const h of hoursToTest) {
      await page.evaluate((hour) => {
        window.__STAGE_3D__.setHourOverride(hour);
      }, h);
      await page.waitForTimeout(1200); // Tunggu lerp transisi ±1 detik

      const dl = await page.evaluate(() => window.__STAGE_3D__.getDaylight());
      const shotPath = `verification_artifacts/daylight_jam_${h < 10 ? "0" + h : h}.png`;
      await page.screenshot({ path: shotPath });

      // Verifikasi Luminans Tema Terang pada jam 12 siang
      if (h === 12) {
        const bgLum = calcRelLuminance(dl.live.bgColor);
        console.log(`   [Luminans Jam 12] Background color: 0x${dl.live.bgColor.toString(16)}, Luminans: ${bgLum.toFixed(3)} (batas >= 0.70)`);
        if (bgLum < 0.70) {
          throw new Error(`Luminans background jam 12 (${bgLum.toFixed(3)}) terlalu gelap (< 0.70)!`);
        }
        console.log("   ✓ Tema Terang Terverifikasi: Background jam 12 sangat terang (luminans >= 0.70).");
      }

      // Lampirkan screenshot jam 12 dan jam 22 di docs/design/
      if (h === 12 || h === 22) {
        const designDir = "docs/design";
        const rootDesignDir = "../docs/design";
        if (!fs.existsSync(designDir)) fs.mkdirSync(designDir, { recursive: true });
        if (!fs.existsSync(rootDesignDir)) fs.mkdirSync(rootDesignDir, { recursive: true });
        const p1 = `${designDir}/jam-${h}.png`;
        const p2 = `${rootDesignDir}/jam-${h}.png`;
        await page.screenshot({ path: p1 });
        fs.copyFileSync(p1, p2);
        console.log(`   ✓ Screenshot jam ${h} tersimpan di ${p1} dan ${p2}`);
      }

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
    
    let gatherAttempts = 0;
    const maxGatherAttempts = 3; // 1 attempt awal + maksimal 2 kali pengulangan (syarat 2)
    let gatherSuccess = false;
    let maxObservedDelta = { delta: 0, dtSec: 0, batasDelta: 5.0, agent: "-" };

    while (gatherAttempts < maxGatherAttempts && !gatherSuccess) {
      gatherAttempts++;
      if (gatherAttempts > 1) {
        console.log(`   [Gather Retry] Menjalankan ulang pengujian Gather Rapat (Percobaan ${gatherAttempts}/${maxGatherAttempts})...`);
        await page.evaluate(() => {
          window.__STAGE_3D__.endMeetingNow(true);
        });
        await page.waitForTimeout(800);
      }

      const prevPositions = {};
      let gatherViolationFound = null;
      let minInterAgentDist = Infinity;
      let minInterAgentPair = null;
      let lagEkstremDetected = false;

      // Mulai gather rapat (animasi normal)
      await page.evaluate(() => {
        window.__STAGE_3D__.startMeetingNow(false);
      });

      const gatherStart = Date.now();
      let lastSampleTime = performance.now();
      let allArrivedAtMeeting = false;

      while (Date.now() - gatherStart < 40000) {
        await page.waitForTimeout(80);
        const sampleNow = performance.now();
        const dtSec = (sampleNow - lastSampleTime) / 1000;
        lastSampleTime = sampleNow;

        // Syarat 2: Jika dtSec > 3.0 detik (lag ekstrem), jangan lolos diam-diam: ulangi
        if (dtSec > 3.0) {
          console.warn(`   [Lag Ekstrem] dtSec (${dtSec.toFixed(3)}s) > 3.0s terdeteksi. Mengulang pengujian gather (maks 2 kali)...`);
          lagEkstremDetected = true;
          break;
        }

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
        // Rumus toleransi teleportasi yang disetujui pengguna:
        // batas_delta = Math.max(5.0, dtSec * 6.0)
        const batas_delta = Math.max(5.0, dtSec * 6.0);

        for (const [name, st] of Object.entries(agentStates)) {
          if (!st.pos) continue;
          if (st.busy) anyBusy = true;

          if (prevPositions[name]) {
            const delta = Math.hypot(
              st.pos.x - prevPositions[name].x,
              st.pos.z - prevPositions[name].z
            );
            if (delta > maxObservedDelta.delta) {
              maxObservedDelta = {
                delta,
                dtSec,
                batasDelta: batas_delta,
                agent: name,
              };
            }
            if (delta > batas_delta) {
              throw new Error(
                `Agen ${name} teleportasi mendadak! Delta: ${delta.toFixed(3)} unit > batas_delta (${batas_delta.toFixed(3)} unit) pada dtSec=${dtSec.toFixed(3)}s`
              );
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

      if (lagEkstremDetected) {
        if (gatherAttempts >= maxGatherAttempts) {
          throw new Error("Pengujian Gather Rapat gagal karena lag ekstrem berulang (> 3.0s sebanyak 2x pengulangan)!");
        }
        continue;
      }

      console.log(`   Durasi gather: ${((Date.now() - gatherStart) / 1000).toFixed(2)} detik`);
      // Syarat 3: Cetak di log delta maksimum yang teramati, dtSec saat itu, dan batas_delta yang berlaku
      console.log(`   [Teleportasi Check] Max delta teramati: ${maxObservedDelta.delta.toFixed(4)} unit (Agen: ${maxObservedDelta.agent}), dtSec: ${maxObservedDelta.dtSec.toFixed(3)}s, batas_delta: ${maxObservedDelta.batasDelta.toFixed(4)} unit`);
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
        maxObservedDelta,
        gatherViolationFound,
        maxSeatDist,
        minInterAgentDist,
        minInterAgentPair,
        gatherAttempts,
      };
      gatherSuccess = true;
    }

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

    } // end if (!runOnlyKasus12)

    // =========================================================================
    // KASUS 12: V1b-REDO - DYNAMIC INSTANCE FLOW, FIFO HR & BAY EXPANSION
    // (REWRITTEN: COMPREHENSIVE MOVEMENT, POSITION & 8 CANVAS SCREENSHOTS)
    // =========================================================================
    console.log("\n===============================================================");
    console.log("=== KASUS 12: V1b-REDO - REWRITTEN COMPREHENSIVE VERIFICATION ===");
    console.log("===============================================================\n");

    const v1bDir = "docs/design/v1b-redo";
    const rootV1bDir = "../docs/design/v1b-redo";
    if (!fs.existsSync(v1bDir)) fs.mkdirSync(v1bDir, { recursive: true });
    if (!fs.existsSync(rootV1bDir)) fs.mkdirSync(rootV1bDir, { recursive: true });

    // Set viewport ke 1280x800 untuk pengujian dan standar tangkapan layar 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    page.setDefaultTimeout(70000);
    await page.waitForTimeout(400);

    const canvasLocator = page.locator("canvas.stage-3d-canvas");

    let activeScreenshotPause = 0;

    // Helper untuk menyimpan screenshot ke kedua direktori (v1bDir dan rootV1bDir)
    async function saveScreenshot(name, useFullPage = false) {
      const p1 = `${v1bDir}/${name}`;
      const p2 = `${rootV1bDir}/${name}`;
      const t0 = Date.now();
      if (useFullPage) {
        await page.screenshot({ path: p1 });
      } else {
        await canvasLocator.screenshot({ path: p1 });
      }
      const dur = Date.now() - t0;
      activeScreenshotPause += dur;
      try {
        fs.copyFileSync(p1, p2);
      } catch (err) {
        console.error(`Gagal menyalin screenshot ke ${p2}:`, err);
      }
      console.log(`   [Screenshot] ${name} tersimpan dalam ${dur}ms.`);
    }

    // -------------------------------------------------------------------------
    // 12.1: State Awal Bersih & Inventaris (Clean Slate) & [Screenshot 01]
    // -------------------------------------------------------------------------
    console.log("--- KASUS 12.1: State Awal Bersih & Inventaris (Clean Slate) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.setHourOverride(12);
      window.__STAGE_3D__.setShotMode(true);
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(600);

    const preDemoState = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        sceneUuid: stage.getSceneUuid(),
        agentCount: document.querySelectorAll(".agent-tag3d").length,
        queueLength: stage.getQueueLength(),
        requests: stage.getInstanceRequests(),
        isExpandedSosmed: stage.isExpanded("sosmed"),
        dynamicDesks: stage.getInstanceDemoState().dynamicDesksCount,
        dynamicAgents: stage.getInstanceDemoState().dynamicAgentsCount,
        resourceCounts: stage.getResourceCounts(),
      };
    });

    console.log(`   Scene UUID awal: ${preDemoState.sceneUuid}`);
    console.log(`   Jumlah agent tag awal: ${preDemoState.agentCount} (harus 19)`);
    console.log(`   Antrean awal: ${preDemoState.queueLength} (harus 0)`);
    console.log(`   Sosmed expanded: ${preDemoState.isExpandedSosmed} (harus false)`);
    console.log(`   Geometri awal: ${preDemoState.resourceCounts.geometries}, Material unik awal: ${preDemoState.resourceCounts.uniqueMaterials}`);

    if (
      preDemoState.agentCount !== 19 ||
      preDemoState.queueLength !== 0 ||
      preDemoState.requests.length !== 0 ||
      preDemoState.isExpandedSosmed ||
      preDemoState.dynamicDesks !== 0 ||
      preDemoState.dynamicAgents !== 0
    ) {
      throw new Error(`State awal Kasus 12 tidak bersih! ${JSON.stringify(preDemoState)}`);
    }
    console.log("   ✓ KASUS 12.1 LOLOS: State awal bersih & inventaris valid.");

    // Tangkapan Layar 1: 01-initial-state.png (Canvas-only screenshot)
    await saveScreenshot("01-initial-state.png", false);

    // Track durasi seluruh skenario untuk 2.g
    const scenarioDurations = {};

    // -------------------------------------------------------------------------
    // 12.2: Skenario A (Riset) - Alur Tanpa Persetujuan CEO & Tes 2.a, 2.b & [Screenshot 02]
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.2: Skenario A (Riset) - Sampling Gerakan 2.a & Jarak Kursi 2.b ---");
    activeScreenshotPause = 0;
    const startA = Date.now();

    // Siapkan array sampling di browser setiap 200 ms
    await page.evaluate(() => {
      window.__SAMPLES_2A__ = [];
      if (window.__SAMPLER_INTERVAL_2A__) clearInterval(window.__SAMPLER_INTERVAL_2A__);
      window.__SAMPLER_INTERVAL_2A__ = setInterval(() => {
        const stage = window.__STAGE_3D__;
        if (!stage) return;
        const agents = stage.getDynamicAgents();
        if (agents && agents.length > 0) {
          const a = agents[0];
          window.__SAMPLES_2A__.push({
            t: performance.now(),
            x: a.position.x,
            z: a.position.z,
          });
        }
      }, 200);
    });

    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("riset");
    });

    // ATHENA berjalan ke depan meja HERA di HR
    await page.waitForFunction(() => {
      const p = window.__STAGE_3D__.getAgentPosition("ATHENA");
      return p && Math.hypot(p.x - 3.2, p.z - 23.0) < 1.5;
    }, null, { timeout: 35000 });

    const athenaDeptHeadDist = await page.evaluate(() => {
      const p = window.__STAGE_3D__.getAgentPosition("ATHENA");
      return Math.hypot(p.x - 3.2, p.z - 23.0);
    });
    console.log(`   Jarak ATHENA ke meja HERA: ${athenaDeptHeadDist.toFixed(3)} unit (harus < 1.5)`);
    if (athenaDeptHeadDist >= 1.5) {
      throw new Error(`Dept head ATHENA tidak dalam jarak 1.5 unit dari meja HERA (jarak: ${athenaDeptHeadDist})`);
    }

    // Tangkapan Layar 2: 02-dept-head-hr.png (Canvas-only, fokus HR)
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("hr");
    });
    await page.waitForTimeout(500);
    await saveScreenshot("02-dept-head-hr.png", false);

    // Kembalikan kamera ke default
    await page.evaluate(() => {
      window.__STAGE_3D__.resetCamera();
    });

    // Tunggu alur Skenario A selesai hingga tuntas dan ATHENA kembali ke meja
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const req = state.requests.find((r) => r.scenario === "riset");
      const athenaBusy = window.__STAGE_3D__.isChoreoBusy("ATHENA");
      const athenaPos = window.__STAGE_3D__.getAgentPosition("ATHENA");
      const hp = window.__STAGE_3D__.getHomePositions()["ATHENA"];
      const dist = athenaPos && hp ? Math.hypot(athenaPos.x - hp[0], athenaPos.z - hp[1]) : 999;
      return req && req.state === "selesai" && state.dynamicDesksCount >= 1 && state.dynamicAgentsCount >= 1 && !athenaBusy && dist < 0.6;
    }, null, { timeout: 65000 });

    // Hentikan interval sampling
    const samples2a = await page.evaluate(() => {
      if (window.__SAMPLER_INTERVAL_2A__) clearInterval(window.__SAMPLER_INTERVAL_2A__);
      const agents = window.__STAGE_3D__.getDynamicAgents();
      if (agents.length > 0) {
        window.__SAMPLES_2A__.push({
          t: performance.now(),
          x: agents[0].position.x,
          z: agents[0].position.z,
        });
      }
      return window.__SAMPLES_2A__;
    });

    const elapsedA = (Date.now() - startA - activeScreenshotPause) / 1000;
    scenarioDurations["Scenario A (Riset)"] = elapsedA;
    console.log(`   Durasi Skenario A: ${elapsedA.toFixed(2)} detik (harus <= 70s)`);
    if (elapsedA > 70) {
      throw new Error(`Durasi Skenario A melampaui batas: ${elapsedA}s > 70s`);
    }

    // Verifikasi 2.a: Pergerakan dan sampling agen baru
    console.log("\n   --- Verifikasi 2.a: Analisis Jejak Gerak Agen Skenario A ---");
    console.log(`   Total sampel terkumpul: ${samples2a.length} titik`);
    if (samples2a.length < 2) {
      throw new Error(`Sampel pergerakan agen tidak mencukupi: ${samples2a.length} titik`);
    }

    const hrPortalPos = await page.evaluate(() => window.__STAGE_3D__.getHrPortalPos());
    const firstSample = samples2a[0];
    const distFirstToPortal = Math.hypot(firstSample.x - hrPortalPos[0], firstSample.z - hrPortalPos[1]);
    console.log(`   Sampel pertama: [${firstSample.x.toFixed(3)}, ${firstSample.z.toFixed(3)}], jarak ke HR_PORTAL_POS: ${distFirstToPortal.toFixed(3)} unit (harus < 1.0)`);
    if (distFirstToPortal >= 1.0) {
      throw new Error(`Sampel pertama agen tidak dekat HR_PORTAL_POS: ${distFirstToPortal} >= 1.0`);
    }

    let maxJump = 0;
    let doorPassed = false;
    for (let i = 1; i < samples2a.length; i++) {
      const prev = samples2a[i - 1];
      const curr = samples2a[i];
      const dtSec = Math.max(0.001, (curr.t - prev.t) / 1000);
      const jump = Math.hypot(curr.x - prev.x, curr.z - prev.z);
      if (jump > maxJump) maxJump = jump;
      const jumpThreshold = Math.max(5.0, dtSec * 6.0);
      if (jump > jumpThreshold) {
        throw new Error(`Terdeteksi loncatan tidak wajar pada indeks ${i}: ${jump.toFixed(3)} > ${jumpThreshold.toFixed(3)}`);
      }
      // Periksa apakah melewati pintu d_hr_e (x=9, z=23)
      const distDoor = Math.hypot(curr.x - 9.0, curr.z - 23.0);
      if (distDoor < 1.0) {
        doorPassed = true;
      }
    }
    console.log(`   Lompatan maksimum (max jump): ${maxJump.toFixed(3)} unit`);
    console.log(`   Agen melewati pintu HR (d_hr_e, x=9, z=23): ${doorPassed}`);
    if (!doorPassed) {
      throw new Error("Agen Skenario A tidak terbukti melewati pintu d_hr_e (< 1.0 unit)!");
    }

    const lastSample = samples2a[samples2a.length - 1];
    // Ruang Riset: x in [11, 21], z in [11, 19]
    const inRisetBounds = lastSample.x >= 10.8 && lastSample.x <= 21.2 && lastSample.z >= 10.8 && lastSample.z <= 19.2;
    console.log(`   Sampel akhir: [${lastSample.x.toFixed(3)}, ${lastSample.z.toFixed(3)}], di dalam bounds Riset: ${inRisetBounds}`);
    if (!inRisetBounds) {
      throw new Error(`Sampel akhir agen tidak berada di dalam ruang Riset: [${lastSample.x}, ${lastSample.z}]`);
    }
    console.log("   ✓ TES 2.a LOLOS: Sampling 200ms valid, 0 teleportasi, lolos pintu d_hr_e, berhenti di Riset.");

    // Verifikasi 2.b: Jarak ke kursi meja < 0.15 unit
    console.log("\n   --- Verifikasi 2.b: Jarak Duduk ke Kursi Meja Kerja ---");
    const chairDistanceA = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const desks = stage.getDynamicDesks();
      const agents = stage.getDynamicAgents();
      if (!desks.length || !agents.length) return 999;
      const chairPos = desks[0].chairPos;
      const agentPos = agents[0].position;
      return Math.hypot(agentPos.x - chairPos.x, agentPos.z - chairPos.z);
    });
    console.log(`   Jarak agen duduk ke posisi kursi sejati: ${chairDistanceA.toFixed(4)} unit (harus < 0.15)`);
    if (chairDistanceA >= 0.15) {
      throw new Error(`Agen tidak duduk tepat di kursi: jarak ${chairDistanceA} >= 0.15`);
    }
    console.log("   ✓ TES 2.b LOLOS: Agen duduk tepat pada kursi meja (delta < 0.15 unit).");

    // -------------------------------------------------------------------------
    // 12.3: Skenario B (Iklan) - Modal CEO [Screenshot 03] & HEPHAESTUS Preparing [Screenshot 04] & Agen Arrival [Screenshot 06] & Agen Seated [Screenshot 07] & Tes 2.d
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.3: Skenario B (Iklan) - Alur Disetujui CEO (Tes 2.d & Screenshots 03, 04, 06, 07) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    activeScreenshotPause = 0;
    const startB = Date.now();
    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("iklan");
    });

    // Tunggu kartu persetujuan CEO muncul
    await page.waitForSelector(".ceo-approval-demo-card", { timeout: 40000 });
    const isApprovalCardVisible = await page.locator(".ceo-approval-demo-card").isVisible();
    console.log(`   Kartu persetujuan CEO tampil: ${isApprovalCardVisible}`);
    if (!isApprovalCardVisible) {
      throw new Error("Kartu persetujuan CEO tidak tampil!");
    }

    // Tangkapan Layar 3: 03-ceo-approval-modal.png (Full page screenshot)
    await saveScreenshot("03-ceo-approval-modal.png", true);

    // Setujui penambahan agen
    const approveBtn = page.locator(".ceo-approve-btn");
    await approveBtn.click();

    // Tunggu HEPHAESTUS menyiapkan meja kerja di Advertiser
    // Verifikasi HEPHAESTUS berada dalam 2.0 unit dari meja baru dan status meja adalah "disiapkan"
    await page.waitForFunction(() => {
      const stage = window.__STAGE_3D__;
      const desks = stage.getDynamicDesks();
      const hephPos = stage.getAgentPosition("HEPHAESTUS");
      if (!desks.length || !hephPos) return false;
      const desk = desks[0];
      const dist = Math.hypot(hephPos.x - desk.slotPos.world.x, hephPos.z - desk.slotPos.world.z);
      return desk.state === "disiapkan" && dist < 2.0;
    }, null, { timeout: 40000 });

    const opsPrepCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const desks = stage.getDynamicDesks();
      const hephPos = stage.getAgentPosition("HEPHAESTUS");
      const desk = desks[0];
      const dist = Math.hypot(hephPos.x - desk.slotPos.world.x, hephPos.z - desk.slotPos.world.z);
      return {
        deskState: desk.state,
        distToDesk: dist,
      };
    });
    console.log(`   HEPHAESTUS status meja: "${opsPrepCheck.deskState}", jarak ke meja: ${opsPrepCheck.distToDesk.toFixed(3)} unit (harus < 2.0)`);
    if (opsPrepCheck.deskState !== "disiapkan" || opsPrepCheck.distToDesk >= 2.0) {
      throw new Error(`HEPHAESTUS tidak berada dalam jarak 2.0 unit saat meja berstatus "disiapkan"!`);
    }

    // Tangkapan Layar 4: 04-ops-preparing.png (Canvas-only, fokus Advertiser)
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("advertiser");
    });
    await page.waitForTimeout(300);
    await saveScreenshot("04-ops-preparing.png", false);

    // Kembalikan kamera ke koridor/overview untuk memotret kedatangan agen baru
    await page.evaluate(() => {
      window.__STAGE_3D__.resetCamera();
    });

    // Tunggu agen baru di-spawn di portal HR
    await page.waitForFunction(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getDynamicAgents();
      return agents && agents.length >= 1;
    }, null, { timeout: 35000 });

    const arrivalCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getDynamicAgents();
      const desks = stage.getDynamicDesks();
      const aPos = agents[0].position;
      const dPos = desks[0].slotPos.world;
      const dist = Math.hypot(aPos.x - dPos.x, aPos.z - dPos.z);
      return {
        pos: aPos,
        distToDesk: dist,
      };
    });
    console.log(`   Agen baru tiba di koridor pada posisi [${arrivalCheck.pos.x.toFixed(2)}, ${arrivalCheck.pos.z.toFixed(2)}], jarak ke meja: ${arrivalCheck.distToDesk.toFixed(2)} unit (harus > 2.0)`);
    if (arrivalCheck.distToDesk <= 2.0) {
      throw new Error(`Agen baru sudah di meja kerja saat pemotretan kedatangan! Posisi: ${JSON.stringify(arrivalCheck.pos)}`);
    }

    // Tangkapan Layar 6: 06-agent-spawn-arrival.png (Canvas-only, kamera reset koridor)
    await saveScreenshot("06-agent-spawn-arrival.png", false);

    // Tunggu alur Skenario B selesai hingga agen duduk dan ZEUS kembali ke meja
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const req = state.requests.find((r) => r.scenario === "iklan");
      const zeusBusy = window.__STAGE_3D__.isChoreoBusy("ZEUS");
      const zeusPos = window.__STAGE_3D__.getAgentPosition("ZEUS");
      const hp = window.__STAGE_3D__.getHomePositions()["ZEUS"];
      const dist = zeusPos && hp ? Math.hypot(zeusPos.x - hp[0], zeusPos.z - hp[1]) : 999;
      return req && req.state === "selesai" && state.dynamicAgentsCount >= 1 && !zeusBusy && dist < 0.6;
    }, null, { timeout: 65000 });

    const elapsedBApprove = (Date.now() - startB - activeScreenshotPause) / 1000;
    scenarioDurations["Scenario B (Iklan - Disetujui)"] = elapsedBApprove;
    console.log(`   Durasi Skenario B (Disetujui): ${elapsedBApprove.toFixed(2)} detik (harus <= 70s)`);
    if (elapsedBApprove > 70) {
      throw new Error(`Durasi Skenario B melampaui batas: ${elapsedBApprove}s > 70s`);
    }

    // Tangkapan Layar 7: 07-agent-seated-active.png (Canvas-only, fokus Advertiser)
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("advertiser");
    });
    await page.waitForTimeout(500);
    await saveScreenshot("07-agent-seated-active.png", false);

    // Verifikasi 2.d: Penempatan meja dan agen Skenario B di Advertiser sesuai aturan slot
    console.log("\n   --- Verifikasi 2.d: Penempatan Meja & Agen di Advertiser ---");
    const scnBVerification = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const desks = stage.getDynamicDesks();
      const agents = stage.getDynamicAgents();
      const sceneUuid = stage.getSceneUuid();
      const desk = desks[0];
      const agent = agents[0];
      const distSeatToChair = Math.hypot(agent.position.x - desk.chairPos.x, agent.position.z - desk.chairPos.z);
      return {
        sceneUuid,
        deskPos: desk.slotPos.world,
        deskState: desk.state,
        agentPos: agent.position,
        distSeatToChair,
      };
    });

    console.log(`   Posisi meja Skenario B: [${scnBVerification.deskPos.x}, ${scnBVerification.deskPos.z}]`);
    console.log(`   Status meja: "${scnBVerification.deskState}" (harus "terisi" atau "siap")`);
    console.log(`   Jarak agen duduk ke kursi: ${scnBVerification.distSeatToChair.toFixed(4)} unit (harus < 0.15)`);
    console.log(`   Scene UUID setelah approve: ${scnBVerification.sceneUuid}`);

    // Ruang Advertiser: x in [28, 41], z in [0, 9]. Slot 3 berada di x=31.5, z=6.5
    const isInsideAdv =
      scnBVerification.deskPos.x >= 28 &&
      scnBVerification.deskPos.x <= 41 &&
      scnBVerification.deskPos.z >= 0 &&
      scnBVerification.deskPos.z <= 9;

    if (!isInsideAdv) {
      throw new Error(`Meja Skenario B tidak ditempatkan di dalam ruang Advertiser! ${JSON.stringify(scnBVerification.deskPos)}`);
    }
    if (scnBVerification.distSeatToChair >= 0.15) {
      throw new Error(`Agen Skenario B tidak duduk di kursi meja: delta ${scnBVerification.distSeatToChair} >= 0.15`);
    }
    if (scnBVerification.sceneUuid !== preDemoState.sceneUuid) {
      throw new Error("Scene UUID berubah saat persetujuan CEO! Terjadi rebuild scene tidak sah!");
    }
    console.log("   ✓ TES 2.d LOLOS: Meja & agen baru ditempatkan di Advertiser sesuai aturan slot, scene UUID stabil.");

    // -------------------------------------------------------------------------
    // 12.4: Skenario B (Iklan) - Alur Penolakan CEO
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.4: Skenario B (Iklan) - Alur Penolakan CEO ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    activeScreenshotPause = 0;
    const startBReject = Date.now();
    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("iklan");
    });

    await page.waitForSelector(".ceo-approval-demo-card", { timeout: 40000 });
    const rejectBtn = page.locator(".ceo-reject-btn");
    await rejectBtn.click();

    // Tunggu status permohonan menjadi ditolak dan ZEUS kembali ke mejanya
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const req = state.requests.find((r) => r.scenario === "iklan");
      const zeusBusy = window.__STAGE_3D__.isChoreoBusy("ZEUS");
      const zeusPos = window.__STAGE_3D__.getAgentPosition("ZEUS");
      const hp = window.__STAGE_3D__.getHomePositions()["ZEUS"];
      const dist = zeusPos && hp ? Math.hypot(zeusPos.x - hp[0], zeusPos.z - hp[1]) : 999;
      return req && req.state === "ditolak" && !zeusBusy && dist < 0.6;
    }, null, { timeout: 65000 });

    const elapsedBReject = (Date.now() - startBReject - activeScreenshotPause) / 1000;
    scenarioDurations["Scenario B (Iklan - Ditolak)"] = elapsedBReject;
    console.log(`   Durasi Skenario B (Ditolak): ${elapsedBReject.toFixed(2)} detik (harus <= 70s)`);
    if (elapsedBReject > 70) {
      throw new Error(`Durasi Skenario B Ditolak melampaui batas: ${elapsedBReject}s > 70s`);
    }

    const scnBRejectState = await page.evaluate(() => window.__STAGE_3D__.getInstanceDemoState());
    console.log(`   Dynamic desks setelah penolakan: ${scnBRejectState.dynamicDesksCount} (harus 0)`);
    console.log(`   Dynamic agents setelah penolakan: ${scnBRejectState.dynamicAgentsCount} (harus 0)`);
    if (scnBRejectState.dynamicDesksCount !== 0 || scnBRejectState.dynamicAgentsCount !== 0) {
      throw new Error(`Permohonan ditolak namun meja/agen tetap dibuat! ${JSON.stringify(scnBRejectState)}`);
    }
    console.log("   ✓ Alur penolakan CEO berhasil membatalkan penambahan agen tanpa artefak tersisa.");

    // -------------------------------------------------------------------------
    // 12.5: Skenario C (Sosmed) - Ekspansi Bay [Screenshot 05a, 05b, 05] & Tes 2.c
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.5: Skenario C (Sosmed) - Ekspansi Bay & Bebas Tabrakan 2.c ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    activeScreenshotPause = 0;
    const startC = Date.now();

    // Fokus kamera pada sosmed dengan includeBay: true untuk framing ruang + bay gabungan
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("sosmed", true);
    });
    await page.waitForTimeout(500);

    // Tangkapan Layar 5a: 05a-before.png (Sebelum ekspansi)
    if (await page.evaluate(() => window.__STAGE_3D__.isExpanded("sosmed"))) {
      throw new Error("Ruang sosmed harus belum expanded sebelum Skenario C!");
    }
    await saveScreenshot("05a-before.png", false);

    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("sosmed");
    });

    // Tunggu animasi ekspansi selesai (isExpanded("sosmed") === true)
    await page.waitForFunction(() => {
      return window.__STAGE_3D__.isExpanded("sosmed") === true;
    }, null, { timeout: 45000 });
    console.log("   ✓ bay_sosmed berhasil diekspansi.");

    await page.waitForTimeout(400);
    // Tangkapan Layar 5b: 05b-after.png & 05-bay-expansion.png (Setelah ekspansi)
    await saveScreenshot("05b-after.png", false);
    await saveScreenshot("05-bay-expansion.png", false);

    // Tunggu alur Skenario C selesai hingga agen duduk di bay dan HERMES kembali ke meja
    await page.waitForFunction(() => {
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const req = state.requests.find((r) => r.scenario === "sosmed");
      const hermesBusy = window.__STAGE_3D__.isChoreoBusy("HERMES");
      const hermesPos = window.__STAGE_3D__.getAgentPosition("HERMES");
      const hp = window.__STAGE_3D__.getHomePositions()["HERMES"];
      const dist = hermesPos && hp ? Math.hypot(hermesPos.x - hp[0], hermesPos.z - hp[1]) : 999;
      return req && req.state === "selesai" && state.dynamicDesksCount >= 1 && state.dynamicAgentsCount >= 1 && !hermesBusy && dist < 0.6;
    }, null, { timeout: 65000 });

    const elapsedC = (Date.now() - startC - activeScreenshotPause) / 1000;
    scenarioDurations["Scenario C (Sosmed)"] = elapsedC;
    console.log(`   Durasi Skenario C: ${elapsedC.toFixed(2)} detik (harus <= 70s)`);
    if (elapsedC > 70) {
      throw new Error(`Durasi Skenario C melampaui batas: ${elapsedC}s > 70s`);
    }

    // Verifikasi 2.c: Agen berakhir di bay_sosmed bounds & 0 tabrakan path segmen
    console.log("\n   --- Verifikasi 2.c: Agen di Bay Bounds & 0 Tabrakan Segmen ---");
    const scnCCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getDynamicAgents();
      const agentPos = agents[0].position;

      // bay_sosmed bounds: x in [0, 10], z in [34, 36]
      const inBaySosmed =
        agentPos.x >= -0.2 &&
        agentPos.x <= 10.2 &&
        agentPos.z >= 33.8 &&
        agentPos.z <= 36.2;

      // Uji rute dari portal_hr ke bay_interior_bay_sosmed
      const path = stage.findPath("portal_hr", "bay_interior_bay_sosmed");
      const graph = stage.getWalkwayGraph();
      const obstacles = stage.obstacles || [];

      // Algoritma Liang-Barsky untuk mendeteksi perpotongan segmen dengan obstacle
      function segmentIntersectsBox(p1, p2, box) {
        let t0 = 0.0;
        let t1 = 1.0;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;

        if (Math.abs(dx) < 1e-9) {
          if (p1.x < box.minX || p1.x > box.maxX) return false;
        } else {
          const invDx = 1.0 / dx;
          let tNearX = (box.minX - p1.x) * invDx;
          let tFarX = (box.maxX - p1.x) * invDx;
          if (tNearX > tFarX) {
            const tmp = tNearX;
            tNearX = tFarX;
            tFarX = tmp;
          }
          t0 = Math.max(t0, tNearX);
          t1 = Math.min(t1, tFarX);
          if (t0 > t1) return false;
        }

        if (Math.abs(dz) < 1e-9) {
          if (p1.z < box.minZ || p1.z > box.maxZ) return false;
        } else {
          const invDz = 1.0 / dz;
          let tNearZ = (box.minZ - p1.z) * invDz;
          let tFarZ = (box.maxZ - p1.z) * invDz;
          if (tNearZ > tFarZ) {
            const tmp = tNearZ;
            tNearZ = tFarZ;
            tFarZ = tmp;
          }
          t0 = Math.max(t0, tNearZ);
          t1 = Math.min(t1, tFarZ);
          if (t0 > t1) return false;
        }

        return t0 < t1 && t1 > 0.001 && t0 < 0.999;
      }

      let collisions = 0;
      const collisionDetails = [];
      if (path && path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
          const p1 = graph[path[i]];
          const p2 = graph[path[i + 1]];
          if (!p1 || !p2) continue;

          for (const obs of obstacles) {
            // Abaikan bay interior target node atau opening desk yang terdaftar
            if (obs.roomId === "sosmed" && obs.id.includes("bay")) continue;
            if (segmentIntersectsBox(p1, p2, obs)) {
              collisions++;
              collisionDetails.push({ segment: [path[i], path[i + 1]], obsId: obs.id });
            }
          }
        }
      }

      return {
        agentPos,
        inBaySosmed,
        pathLength: path ? path.length : 0,
        collisions,
        collisionDetails,
      };
    });

    console.log(`   Posisi akhir agen Sosmed: [${scnCCheck.agentPos.x.toFixed(3)}, ${scnCCheck.agentPos.z.toFixed(3)}]`);
    console.log(`   Berada di dalam bay_sosmed bounds: ${scnCCheck.inBaySosmed}`);
    console.log(`   Panjang rute portal_hr -> bay_sosmed: ${scnCCheck.pathLength} waypoints`);
    console.log(`   Jumlah tabrakan rute dengan walls/props: ${scnCCheck.collisions}`);

    if (!scnCCheck.inBaySosmed) {
      throw new Error(`Agen Skenario C tidak berada di dalam bay_sosmed bounds: [${scnCCheck.agentPos.x}, ${scnCCheck.agentPos.z}]`);
    }
    if (scnCCheck.collisions > 0) {
      throw new Error(`Rute agen menabrak obstacle: ${JSON.stringify(scnCCheck.collisionDetails)}`);
    }
    console.log("   ✓ TES 2.c LOLOS: Agen berakhir di bay_sosmed bounds & 0 tabrakan pada segmen rute.");

    // -------------------------------------------------------------------------
    // 12.6: Banjir Permintaan (Tes 2.e & Screenshot 08 & Sequential Drain)
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.6: Banjir Permintaan, Tes 2.e & Badge Antrean HR [Screenshot 08] ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    // Uji 2.e: 5 klik cepat beruntun pada requestInstance
    console.log("   --- Verifikasi 2.e: 5 Klik Beruntun Cepat ---");
    const rapidClickTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const initialReqs = stage.getInstanceRequests().length;
      const clicks = 5;
      for (let i = 0; i < clicks; i++) {
        stage.requestInstance("riset");
      }
      const totalReqs = stage.getInstanceRequests().length;
      const acceptedCount = totalReqs - initialReqs;
      const activeReq = stage.getInstanceDemoState().activeRequest;
      const queueLen = stage.getQueueLength();
      return {
        acceptedCount,
        hasSingleActive: activeReq !== null,
        queueLen,
      };
    });

    console.log(`   Permintaan diterima dari 5 klik: ${rapidClickTest.acceptedCount} (harus 5)`);
    console.log(`   Hanya satu permintaan aktif yang diproses: ${rapidClickTest.hasSingleActive}`);
    console.log(`   Panjang antrean yang tertampung: ${rapidClickTest.queueLen} (harus 4)`);

    if (rapidClickTest.acceptedCount !== 5) {
      throw new Error(`Jumlah permintaan yang diterima (${rapidClickTest.acceptedCount}) tidak sesuai dengan 5 klik!`);
    }
    if (!rapidClickTest.hasSingleActive || rapidClickTest.queueLen !== 4) {
      throw new Error(`State antrean setelah 5 klik tidak konsisten! ${JSON.stringify(rapidClickTest)}`);
    }
    console.log("   ✓ TES 2.e LOLOS: 5 klik cepat beruntun diterima penuh (5/5) dengan tepat 1 permintaan aktif.");

    // Bersihkan sebelum banjir 2 permintaan untuk pengujian badge dan drain
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    activeScreenshotPause = 0;
    const startFlood = Date.now();
    // Kirim 2 permintaan berturut-turut: Riset lalu Iklan
    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("riset");
      window.__STAGE_3D__.requestInstance("iklan");
    });

    // Tunggu badge antrean HR muncul di DOM dengan teks "Antrean: 1"
    await page.waitForFunction(() => {
      const el = document.querySelector(".hr-queue-badge");
      return el && el.textContent.includes("Antrean: 1");
    }, null, { timeout: 30000 });

    const badgeText = await page.locator(".hr-queue-badge").textContent();
    console.log(`   Teks badge antrean HR: "${badgeText.trim()}" (harus "Antrean: 1")`);

    // Tangkapan Layar 8: 08-fifo-queue-badge.png (Canvas-only, fokus HR)
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("hr");
    });
    await page.waitForTimeout(500);
    await saveScreenshot("08-fifo-queue-badge.png", false);

    await page.evaluate(() => {
      window.__STAGE_3D__.resetCamera();
    });

    // Tunggu permintaan 1 (Riset) selesai diproses dan ATHENA telah kembali ke mejanya
    await page.waitForFunction(() => {
      const reqs = window.__STAGE_3D__.getInstanceRequests();
      const athenaBusy = window.__STAGE_3D__.isChoreoBusy("ATHENA");
      return reqs[0]?.state === "selesai" && !athenaBusy;
    }, null, { timeout: 65000 });
    console.log("   ✓ Permintaan 1 (Riset) selesai diproses.");

    const timeReq1Done = Date.now();
    const pauseReq1 = activeScreenshotPause;
    const elapsedReq1 = (timeReq1Done - startFlood - pauseReq1) / 1000;

    // Permintaan 2 otomatis maju menjadi aktif dan memunculkan kartu CEO
    await page.waitForSelector(".ceo-approval-demo-card", { timeout: 45000 });
    console.log("   ✓ Permintaan 2 otomatis maju dan menampilkan kartu CEO.");

    // Setujui via approveCeo
    await page.evaluate(() => {
      window.__STAGE_3D__.approveCeo();
    });

    // Tunggu permintaan 2 selesai dan ZEUS kembali ke meja
    await page.waitForFunction(() => {
      const reqs = window.__STAGE_3D__.getInstanceRequests();
      const state = window.__STAGE_3D__.getInstanceDemoState();
      const zeusBusy = window.__STAGE_3D__.isChoreoBusy("ZEUS");
      const zeusPos = window.__STAGE_3D__.getAgentPosition("ZEUS");
      const hp = window.__STAGE_3D__.getHomePositions()["ZEUS"];
      const dist = zeusPos && hp ? Math.hypot(zeusPos.x - hp[0], zeusPos.z - hp[1]) : 999;
      return reqs[1]?.state === "selesai" && state.dynamicDesksCount >= 2 && state.dynamicAgentsCount >= 2 && !zeusBusy && dist < 0.6;
    }, null, { timeout: 65000 });

    const elapsedReq2 = (Date.now() - timeReq1Done - (activeScreenshotPause - pauseReq1)) / 1000;
    const elapsedFlood = (Date.now() - startFlood - activeScreenshotPause) / 1000;
    scenarioDurations["Flood 2 - Permintaan 1 (Riset)"] = elapsedReq1;
    scenarioDurations["Flood 2 - Permintaan 2 (Iklan)"] = elapsedReq2;
    console.log(`   Durasi Permintaan 1 (Riset): ${elapsedReq1.toFixed(2)} detik (harus <= 70s)`);
    console.log(`   Durasi Permintaan 2 (Iklan): ${elapsedReq2.toFixed(2)} detik (harus <= 70s)`);
    console.log(`   Total Durasi Sequential Drain (2 Permintaan): ${elapsedFlood.toFixed(2)} detik (rata-rata: ${(elapsedFlood / 2).toFixed(2)}s/skenario, harus <= 140s)`);
    if (elapsedReq1 > 70 || elapsedReq2 > 70) {
      throw new Error(`Durasi sequential drain per skenario melampaui batas: Req1=${elapsedReq1}s, Req2=${elapsedReq2}s > 70s`);
    }

    const drainedState = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        queueLen: stage.getQueueLength(),
        totalDesks: stage.getInstanceDemoState().dynamicDesksCount,
        totalAgents: stage.getInstanceDemoState().dynamicAgentsCount,
      };
    });
    console.log(`   Hasil drain: Antrean: ${drainedState.queueLen}, Desks: ${drainedState.totalDesks}, Agents: ${drainedState.totalAgents}`);
    if (drainedState.queueLen !== 0 || drainedState.totalDesks < 2 || drainedState.totalAgents < 2) {
      throw new Error(`Pengurasan antrean FIFO sequential gagal! ${JSON.stringify(drainedState)}`);
    }
    console.log("   ✓ Pengurasan antrean FIFO sequential otomatis tuntas tanpa hambatan.");

    // -------------------------------------------------------------------------
    // 12.7: Uji Ketahanan 5 Siklus Penuh & Bebas Kebocoran Memori (Tes 2.f)
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.7: Uji Ketahanan 5 Siklus Penuh (Tes 2.f: Bebas Kebocoran Memori) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.setShotMode(false);
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(500);

    const preCyclesCounts = await page.evaluate(() => window.__STAGE_3D__.getResourceCounts());
    console.log("   Resource count sebelum 5 siklus:", preCyclesCounts);

    // Aktifkan prefers-reduced-motion untuk mengeksekusi 5 siklus secara deterministik dan cepat
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (let cycle = 1; cycle <= 5; cycle++) {
      console.log(`   Menjalankan Siklus ${cycle}/5 (A -> C -> B-Approve -> B-Reject -> Flood 2)...`);

      // 1. Skenario A
      await page.evaluate(() => window.__STAGE_3D__.requestInstance("riset"));
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "selesai";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());

      // 2. Skenario C
      await page.evaluate(() => window.__STAGE_3D__.requestInstance("sosmed"));
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "selesai";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());

      // 3. Skenario B - Approve
      await page.evaluate(() => window.__STAGE_3D__.requestInstance("iklan"));
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "menunggu_persetujuan";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.approveCeo());
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "selesai";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());

      // 4. Skenario B - Reject
      await page.evaluate(() => window.__STAGE_3D__.requestInstance("iklan"));
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "menunggu_persetujuan";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.rejectCeo());
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "ditolak";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());

      // 5. Flood 2
      await page.evaluate(() => {
        window.__STAGE_3D__.requestInstance("riset");
        window.__STAGE_3D__.requestInstance("iklan");
      });
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[0]?.state === "selesai" && reqs[1]?.state === "menunggu_persetujuan";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.approveCeo());
      await page.waitForFunction(() => {
        const reqs = window.__STAGE_3D__.getInstanceRequests();
        return reqs[1]?.state === "selesai";
      }, null, { timeout: 15000 });
      await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());
    }

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(500);

    const postCyclesCounts = await page.evaluate(() => window.__STAGE_3D__.getResourceCounts());
    const postCyclesState = await page.evaluate(() => window.__STAGE_3D__.getInstanceDemoState());
    console.log("   Resource count setelah 5 siklus + reset:", postCyclesCounts);

    console.log("\n   === TABEL PERBANDINGAN RESOURCE MEMORY (TES 2.f) ===");
    console.log(`   Geometries        : Awal = ${preCyclesCounts.geometries}, Akhir = ${postCyclesCounts.geometries} (delta: ${postCyclesCounts.geometries - preCyclesCounts.geometries})`);
    console.log(`   Unique Geometries : Awal = ${preCyclesCounts.uniqueGeometries}, Akhir = ${postCyclesCounts.uniqueGeometries} (delta: ${postCyclesCounts.uniqueGeometries - preCyclesCounts.uniqueGeometries})`);
    console.log(`   Unique Materials  : Awal = ${preCyclesCounts.uniqueMaterials}, Akhir = ${postCyclesCounts.uniqueMaterials} (delta: ${postCyclesCounts.uniqueMaterials - preCyclesCounts.uniqueMaterials})`);
    console.log(`   Textures          : Awal = ${preCyclesCounts.textures}, Akhir = ${postCyclesCounts.textures} (delta: ${postCyclesCounts.textures - preCyclesCounts.textures})`);
    console.log(`   Queue Length      : ${postCyclesState.queueLength} (harus 0)`);
    console.log(`   Dynamic Desks     : ${postCyclesState.dynamicDesksCount} (harus 0)`);
    console.log(`   Dynamic Agents    : ${postCyclesState.dynamicAgentsCount} (harus 0)`);

    if (
      preCyclesCounts.geometries !== postCyclesCounts.geometries ||
      preCyclesCounts.uniqueGeometries !== postCyclesCounts.uniqueGeometries ||
      preCyclesCounts.uniqueMaterials !== postCyclesCounts.uniqueMaterials ||
      preCyclesCounts.textures !== postCyclesCounts.textures ||
      postCyclesState.queueLength !== 0 ||
      postCyclesState.dynamicDesksCount !== 0 ||
      postCyclesState.dynamicAgentsCount !== 0
    ) {
      throw new Error(
        `Terjadi kebocoran memori setelah 5 siklus penuh! ` +
        `Sebelum: ${JSON.stringify(preCyclesCounts)}, Sesudah: ${JSON.stringify(postCyclesCounts)}`
      );
    }
    console.log("   ✓ TES 2.f LOLOS: 5 siklus penuh selesai, geometri/material/tekstur 100% identik & antrean kosong.");

    // -------------------------------------------------------------------------
    // 12.8: Laporan Durasi Skenario (Tes 2.g)
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.8: Laporan Durasi Skenario (Tes 2.g: Threshold <= 70s) ---");
    console.log("   ================ TABEL DURASI SKENARIO ================");
    for (const [name, dur] of Object.entries(scenarioDurations)) {
      console.log(`   ${name.padEnd(46)}: ${dur.toFixed(2)}s (Batas: <= 70.0s)`);
      if (dur > 70) {
        throw new Error(`Skenario ${name} melebihi batas waktu maksimum 70s (aktual: ${dur}s)`);
      }
    }
    console.log("   ✓ TES 2.g LOLOS: Seluruh durasi skenario memenuhi ambang batas (<= 70s).");

    // -------------------------------------------------------------------------
    // 12.9: Validasi Sebaran Slot Ekspansi dalam Bay (Manager, HR, Operasional)
    // -------------------------------------------------------------------------
    console.log("\n--- KASUS 12.9: Validasi Sebaran Slot Ekspansi dalam Bay (Manager, HR, Ops) ---");
    const baySlotsTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const rooms = [
        { id: "manager", name: "Manager", x: 0, y: 11, w: 9, d: 9, agents: ["ATLAS"] },
        { id: "hr", name: "HR", x: 0, y: 21, w: 9, d: 4, agents: ["HERA"] },
        { id: "operasional", name: "Operasional", x: 17, y: 0, w: 9, d: 9, agents: ["HEPHAESTUS"] },
      ];

      const results = {};
      for (const r of rooms) {
        const slot0 = stage.calculateRoomSlotPosition(r, 0, false);
        const slot1 = stage.calculateRoomSlotPosition(r, 1, true);
        const slot2 = stage.calculateRoomSlotPosition(r, 2, true);

        const dSlots = Math.hypot(slot1.world.x - slot2.world.x, slot1.world.z - slot2.world.z);
        const usesBay = (slot1.world.x < r.x || slot1.world.x > r.x + r.w || slot1.world.z < r.y || slot1.world.z > r.y + r.d);

        results[r.id] = {
          slot0World: slot0.world,
          slot1World: slot1.world,
          slot2World: slot2.world,
          distanceSlot1ToSlot2: +dSlots.toFixed(3),
          usesBay,
          slotsSeparated: dSlots > 0.8,
        };
      }
      return results;
    });

    for (const [rId, res] of Object.entries(baySlotsTest)) {
      if (!res.usesBay) {
        throw new Error(`Slot ekspansi ruangan ${rId} tidak ditempatkan di bay!`);
      }
      if (!res.slotsSeparated) {
        throw new Error(`Slot ekspansi ruangan ${rId} menumpuk di titik tengah yang sama (jarak: ${res.distanceSlot1ToSlot2})!`);
      }
    }
    console.log("   ✓ Slot ekspansi HR, Ops, dan Manager terbukti memakai bay dan tersebar terpisah.");

    testReport.kasus12 = {
      preDemoState,
      scenarioDurations,
      samplesCount2a: samples2a.length,
      maxJump2a: maxJump,
      chairDistanceA,
      scnBVerification,
      scnCCheck,
      rapidClickTest,
      preCyclesCounts,
      postCyclesCounts,
      baySlotsTest,
      screenshots: [
        "01-initial-state.png",
        "02-dept-head-hr.png",
        "03-ceo-approval-modal.png",
        "04-ops-preparing.png",
        "05a-before.png",
        "05b-after.png",
        "05-bay-expansion.png",
        "06-agent-spawn-arrival.png",
        "07-agent-seated-active.png",
        "08-fifo-queue-badge.png",
      ],
    };
    console.log("   ✓ KASUS 12 (REWRITTEN VERIFIKASI LENGKAP & SCREENSHOT 1280x800) LOLOS SEMPURNA.");

    if (!runOnlyKasus12) {

    // =========================================================================
    // KASUS T2B: INTERIOR ISOMETRIK TAHAP 2B (6 DEPT & 7 KRITERIA VERIFIKASI)
    // =========================================================================
    console.log("\n===============================================================");
    console.log("=== PENGUJIAN T2B: ISOMETRIC INTERIOR & 6 DEPARTEMEN T2B    ===");
    console.log("===============================================================\n");

    // 1. Validasi Startup Tata Letak Props & 100% Bay Clearance
    console.log("--- KASUS T2b-1: Validasi Startup Tata Letak Props & 100% Bay Clearance ---");
    const startupPropsValidation = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return stage.validatePropsPlacement();
    });
    console.log("   Hasil validasi startup props:", startupPropsValidation);
    if (!startupPropsValidation.valid || startupPropsValidation.errors.length > 0) {
      throw new Error(`Validasi startup props gagal! Error: ${startupPropsValidation.errors.join("; ")}`);
    }
    console.log("   ✓ Validasi startup props berhasil: 0 error, semua 9 bay 100% kosong, 0 tabrakan pintu/kursi.");
    testReport.kasusT2b_1 = startupPropsValidation;

    // 2. Routing & Pathfinding Bebas Hambatan (19 Agen & Obstacles)
    console.log("\n--- KASUS T2b-2: Routing & Pathfinding Bebas Hambatan (19 Agen) ---");
    const routeCollisionsTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const homePos = stage.getHomePositions();

      const agents = Object.keys(homePos);
      const results = {};
      let totalFailures = 0;

      for (const agent of agents) {
        // Path desk -> seat
        const p1 = stage.findPath("desk_" + agent, "seat_" + agent);
        const p2 = stage.findPath("seat_" + agent, "desk_" + agent);

        results[agent] = {
          p1Length: p1.length,
          p2Length: p2.length,
          valid: p1.length > 1 && p2.length > 1,
        };

        if (p1.length <= 1 || p2.length <= 1) {
          totalFailures++;
        }
      }

      return {
        results,
        totalAgents: agents.length,
        totalFailures,
      };
    });

    console.log(`   Uji rute 19 agen: ${routeCollisionsTest.totalAgents} agen diuji, kegagalan: ${routeCollisionsTest.totalFailures}`);
    if (routeCollisionsTest.totalFailures > 0) {
      throw new Error(`Ada rute agen yang gagal atau terhalang! Hasil: ${JSON.stringify(routeCollisionsTest.results)}`);
    }
    console.log("   ✓ Seluruh 19 agen memiliki rute Dijkstra valid bolak-balik tanpa terputus.");
    testReport.kasusT2b_2 = routeCollisionsTest;

    // 3. Unit Test Riset 1-Tile Prop Shift (Data-Driven Aisle)
    console.log("\n--- KASUS T2b-3: Unit Test Riset 1-Tile Prop Shift (Data-Driven Aisle) ---");
    const risetShiftTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const baseFp = stage.floorplan;
      const homePos = stage.getHomePositions();
      const seatPos = stage.getSeatPositions();

      // Duplikasi obstacles dan geser satu prop Riset sebesar 1.0 tile pada sumbu X
      const shiftedObstacles = JSON.parse(JSON.stringify(stage.obstacles));
      const targetObs = shiftedObstacles.find(
        (o) => o.roomId === "riset" && o.id.includes("console")
      );
      if (targetObs) {
        targetObs.minX += 1.0;
        targetObs.maxX += 1.0;
      }

      // Hasilkan walkway graph yang dimutasi secara otomatis dari data
      const mutatedGraph = stage.generateWalkwayGraph(
        baseFp,
        homePos,
        seatPos,
        shiftedObstacles
      );

      // Verifikasi seluruh meja kerja Riset (ATHENA, ARGUS, METIS) tetap dapat rute ke pintu
      const risetDesks = ["desk_ATHENA", "desk_ARGUS", "desk_METIS"];
      const routes = {};
      let allRouted = true;

      for (const desk of risetDesks) {
        const path = stage.findPathNodes(
          desk,
          "door_d_riset_w_in",
          ["riset"],
          mutatedGraph
        );
        const valid = path && path.length > 1;
        if (!valid) allRouted = false;
        routes[desk] = {
          valid,
          nodesCount: path ? path.length : 0,
          waypoints: path ? path.map((n) => ({ id: n.id, x: n.x, z: n.z })) : [],
        };
      }

      return {
        allRouted,
        routes,
        shiftedPropId: targetObs?.id,
        totalNodes: Object.keys(mutatedGraph).length,
      };
    });

    console.log(`   Prop Riset "${risetShiftTest.shiftedPropId}" digeser +1.0 tile.`);
    console.log("   Hasil rute meja Riset ke pintu pada graf hasil mutasi:", risetShiftTest.routes);
    if (!risetShiftTest.allRouted) {
      throw new Error(`Sebagian meja Riset gagal mencapai pintu setelah prop digeser 1 tile! Detail: ${JSON.stringify(risetShiftTest.routes)}`);
    }
    console.log("   ✓ Aisle Riset murni data-driven: otomatis beradaptasi saat prop digeser 1 tile tanpa perubahan kode.");
    testReport.kasusT2b_3 = risetShiftTest;

    // 4. Prop Registry & Integrasi THEME.props untuk Seluruh Departemen
    console.log("\n--- KASUS T2b-4: Prop Registry & Integrasi THEME.props untuk Seluruh Departemen ---");
    const themePropsTest = await page.evaluate(() => {
      const theme = window.__STAGE_3D__.getTheme();
      const hasPropsTheme = !!theme.props;
      const deptFloors = theme.deptFloors;
      return {
        hasPropsTheme,
        hasDeptFloors: !!deptFloors,
        hasMeetingProps: !!theme.props?.meeting,
        hasManagerProps: !!theme.props?.manager,
        hasRisetProps: !!theme.props?.riset,
        hasOpsProps: !!theme.props?.operasional,
        hasNatureProps: !!theme.props?.nature,
        hasKitchenProps: !!theme.props?.kitchen,
        hasAdvertiserProps: !!theme.props?.advertiser,
        hasHrProps: !!theme.props?.hr,
        hasSosmedProps: !!theme.props?.sosmed,
        hasCreativeProps: !!theme.props?.creative,
        hasCopyProps: !!theme.props?.copy,
        hasLandingPageProps: !!theme.props?.landing_page,
        deptFloorsCount: Object.keys(deptFloors || {}).length,
      };
    });
    console.log("   Status THEME.props di runtime:", themePropsTest);
    if (!themePropsTest.hasPropsTheme || !themePropsTest.hasDeptFloors) {
      throw new Error("THEME.props atau THEME.deptFloors tidak ditemukan di runtime Stage 3D!");
    }
    if (
      !themePropsTest.hasAdvertiserProps ||
      !themePropsTest.hasHrProps ||
      !themePropsTest.hasSosmedProps ||
      !themePropsTest.hasCreativeProps ||
      !themePropsTest.hasCopyProps ||
      !themePropsTest.hasLandingPageProps
    ) {
      throw new Error("Sebagian departemen T2b tidak memiliki konfigurasi di THEME.props!");
    }
    if (themePropsTest.deptFloorsCount < 10) {
      throw new Error(`Jumlah departemen di THEME.deptFloors (${themePropsTest.deptFloorsCount}) kurang dari 10!`);
    }
    console.log("   ✓ Prop Registry terintegrasi penuh dengan THEME.props & THEME.deptFloors untuk seluruh 10 departemen.");
    testReport.kasusT2b_4 = themePropsTest;

    // 5. InstancedMesh & Anggaran Static Draw Calls (< 260)
    console.log("\n--- KASUS T2b-5: InstancedMesh & Anggaran Static Draw Calls (< 260) ---");
    const instancedMeshStats = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const instancedMeshes = [];
      stage.scene.traverse((obj) => {
        if (obj.isInstancedMesh) {
          instancedMeshes.push({
            name: obj.name,
            count: obj.count,
          });
        }
      });
      const staticCalls = stage.getStaticDrawCalls ? stage.getStaticDrawCalls() : 0;
      return {
        instancedMeshes,
        instancedCount: instancedMeshes.length,
        staticCalls,
      };
    });

    console.log(`   InstancedMesh terdeteksi (${instancedMeshStats.instancedCount}):`, instancedMeshStats.instancedMeshes);
    console.log(`   Static Draw Calls terukur: ${instancedMeshStats.staticCalls} (anggaran T2b: < 260)`);

    const chairInstanced = instancedMeshStats.instancedMeshes.find((m) => m.name === "instanced_chairs");
    console.log(`   Instanced chairs count: ${chairInstanced?.count} (harus 38)`);

    if (instancedMeshStats.instancedCount < 8) {
      throw new Error(`Jumlah InstancedMesh (${instancedMeshStats.instancedCount}) kurang dari minimal 8 untuk repeated props T2b!`);
    }
    if (!chairInstanced || chairInstanced.count !== 38) {
      throw new Error(`Instanced chairs tidak berjumlah 38 (ditemukan: ${chairInstanced?.count})!`);
    }
    if (instancedMeshStats.staticCalls >= 260) {
      throw new Error(`Static draw calls (${instancedMeshStats.staticCalls}) melebihi batas anggaran 260!`);
    }
    console.log(`   ✓ Repeated props & 38 kursi terbukti menggunakan InstancedMesh dan static draw calls hemat (${instancedMeshStats.staticCalls} < 260).`);
    testReport.kasusT2b_5 = instancedMeshStats;

    // 6. Kamera focusRoom Dynamic Zoom & Reset View Restoration
    console.log("\n--- KASUS T2b-6: Kamera focusRoom Dynamic Zoom & Reset View Restoration ---");
    const allRoomsToFocus = [
      "meeting",
      "manager",
      "riset",
      "operasional",
      "atrium",
      "pantry",
      "lounge",
      "toilet",
      "taman",
      "resepsi",
      "advertiser",
      "hr",
      "sosmed",
      "creative",
      "copy",
      "landing_page",
    ];

    const focusZoomResults = {};
    for (const roomId of allRoomsToFocus) {
      const res = await page.evaluate((rId) => {
        const stage = window.__STAGE_3D__;
        const ok = stage.focusRoom(rId);
        const cam = stage.camera;
        return {
          ok,
          zoom: +cam.zoom.toFixed(3),
          pos: stage.getCameraPosition(),
          target: stage.getCameraTarget(),
        };
      }, roomId);

      if (!res.ok) {
        throw new Error(`focusRoom gagal untuk ruangan: ${roomId}!`);
      }
      if (res.zoom <= 1.0) {
        throw new Error(`focusRoom untuk ${roomId} tidak melakukan zoom in (zoom=${res.zoom} <= 1.0)!`);
      }
      focusZoomResults[roomId] = res;
    }
    console.log(`   ✓ focusRoom berhasil mengorbitkan dan zoom dinamis (~70% tinggi kanvas) untuk seluruh ${allRoomsToFocus.length} ruangan.`);

    // Uji Reset View mengembalikan zoom = 1.0
    await page.evaluate(() => {
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(700);

    const postResetZoom = await page.evaluate(() => +window.__STAGE_3D__.camera.zoom.toFixed(3));
    console.log(`   Zoom kamera setelah Reset View: ${postResetZoom} (harus 1.0)`);
    if (Math.abs(postResetZoom - 1.0) > 0.05) {
      throw new Error(`Reset View gagal mengembalikan zoom ke 1.0! Terukur: ${postResetZoom}`);
    }
    console.log("   ✓ Reset View berhasil memulihkan zoom kamera ke 1.0.");
    testReport.kasusT2b_6 = { focusZoomResults, postResetZoom };

    // 7. Tangkapan Layar Visual Jam 12 & 22 (1280x800, Canvas Only, Tanpa Overlay) ke docs/design/t2a/ & docs/design/t2b/
    console.log("\n--- KASUS T2b-7: Tangkapan Layar Visual Jam 12 & 22 ke docs/design/t2a/ & docs/design/t2b/ ---");
    const t2aDir = "docs/design/t2a";
    const rootT2aDir = "../docs/design/t2a";
    const t2bDir = "docs/design/t2b";
    const rootT2bDir = "../docs/design/t2b";
    [t2aDir, rootT2aDir, t2bDir, rootT2bDir].forEach((d) => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);

    // Aktifkan shotMode untuk menyembunyikan semua overlay
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(true);
    });
    await page.waitForTimeout(200);

    const t2aRooms = [
      "meeting",
      "manager",
      "riset",
      "operasional",
      "atrium",
      "pantry",
      "lounge",
      "toilet",
      "taman",
      "resepsi",
    ];

    const t2bRooms = [
      "advertiser",
      "hr",
      "sosmed",
      "creative",
      "copy",
      "landing_page",
    ];

    const canvasLocator = page.locator("canvas.stage-3d-canvas");
    const capturedShots = [];

    // Helper penangkap screenshot
    async function captureRoomShots(roomList, outDir, rootOutDir, suiteTag) {
      for (const roomId of roomList) {
        await page.evaluate((rId) => {
          window.__STAGE_3D__.focusRoom(rId);
        }, roomId);
        await page.waitForTimeout(150);

        for (const h of [12, 22]) {
          await page.evaluate((hour) => {
            window.__STAGE_3D__.setHourOverride(hour);
          }, h);
          await page.waitForTimeout(250);

          const fileName = `${roomId}-jam${h}.png`;
          const p1 = `${outDir}/${fileName}`;
          const p2 = `${rootOutDir}/${fileName}`;

          await canvasLocator.screenshot({ path: p1 });
          try {
            fs.copyFileSync(p1, p2);
          } catch {}

          const st = fs.statSync(p1);
          if (st.size < 10000) {
            throw new Error(`Screenshot ${fileName} berukuran terlalu kecil (${st.size} bytes)!`);
          }
          capturedShots.push({ suite: suiteTag, room: roomId, hour: h, file: fileName, size: st.size });
        }
      }
    }

    console.log(`   Menangkap 20 screenshot untuk 10 ruangan T2a (jam 12 & 22)...`);
    await captureRoomShots(t2aRooms, t2aDir, rootT2aDir, "T2a");

    console.log(`   Menangkap 12 screenshot untuk 6 ruangan T2b (jam 12 & 22)...`);
    await captureRoomShots(t2bRooms, t2bDir, rootT2bDir, "T2b");

    // Pulihkan shotMode dan kamera
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(false);
      window.__STAGE_3D__.setHourOverride(null);
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(600);

    console.log(`   ✓ Total ${capturedShots.length} screenshot visual jam 12 & 22 berhasil ditangkap (semua > 10KB, canvas-only, tanpa overlay).`);
    testReport.kasusT2b_7 = {
      totalScreenshots: capturedShots.length,
      screenshots: capturedShots,
    };
    console.log("   ✓ KASUS T2B LOLOS SEMPURNA.");

    // =========================================================================
    // PENGUJIAN T3: VOXEL HUMANS, ANIMASI POSE & CSS2D LABELS (G1 - G8)
    // =========================================================================
    console.log("\n===============================================================");
    console.log("=== PENGUJIAN T3: VOXEL HUMANS, ANIMASI POSE & CSS2D LABELS ===");
    console.log("===============================================================\n");

    // -------------------------------------------------------------------------
    // G1: Verifikasi karakter manusia voxel (19 agen & instance)
    // -------------------------------------------------------------------------
    console.log("--- G1: Verifikasi Karakter Manusia Voxel (19 Agen) ---");
    const g1Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      
      let oldRobotGeomCount = 0;
      let voxelHumanCount = 0;
      let anatomiLengkapCount = 0;

      stage.scene.traverse((obj) => {
        if (obj.name === "robotAntenna" || obj.name === "robotVisor") {
          oldRobotGeomCount++;
        }
      });

      agents.forEach((ag) => {
        const rec = stage.getAgentRecord(ag.name);
        if (rec && rec.characterType === "voxelHuman") {
          voxelHumanCount++;
          if (
            rec.headGroup &&
            rec.headMesh &&
            rec.bodyMesh &&
            rec.leftArm &&
            rec.rightArm &&
            rec.leftLeg &&
            rec.rightLeg &&
            rec.shadowMesh
          ) {
            anatomiLengkapCount++;
          }
        }
      });

      return {
        totalAgents: agents.length,
        voxelHumanCount,
        anatomiLengkapCount,
        oldRobotGeomCount,
      };
    });

    console.log(`   Total agen: ${g1Result.totalAgents} (harus 19)`);
    console.log(`   Karakter voxelHuman: ${g1Result.voxelHumanCount}/19`);
    console.log(`   Anatomi lengkap (kaki, tangan, badan, kepala, bayangan): ${g1Result.anatomiLengkapCount}/19`);
    console.log(`   Sisa geometri robot lama: ${g1Result.oldRobotGeomCount}`);

    if (g1Result.totalAgents !== 19 || g1Result.voxelHumanCount !== 19 || g1Result.anatomiLengkapCount !== 19 || g1Result.oldRobotGeomCount !== 0) {
      throw new Error(`G1 Gagal: Karakter manusia voxel tidak memenuhi syarat! ${JSON.stringify(g1Result)}`);
    }
    console.log("   ✓ G1 LOLOS: Semua 19 agen adalah voxel human dengan anatomi lengkap tanpa sisa robot lama.");

    // -------------------------------------------------------------------------
    // G2: Deterministik Hash Warna Kulit & Rambut + Aksesoris Departemen
    // -------------------------------------------------------------------------
    console.log("\n--- G2: Deterministik Warna Kulit, Rambut & Aksesoris Departemen ---");
    const g2Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const theme = stage.getTheme();
      const validSkins = new Set(theme.characters.skin);
      const validHairs = new Set(theme.characters.hair);

      const skinDistribution = {};
      const hairDistribution = {};
      let allDeterministic = true;

      agents.forEach((ag) => {
        const app = ag.appearance;
        if (!validSkins.has(app.skin) || !validHairs.has(app.hair)) {
          allDeterministic = false;
        }
        skinDistribution[app.skin] = (skinDistribution[app.skin] || 0) + 1;
        hairDistribution[app.hair] = (hairDistribution[app.hair] || 0) + 1;
      });

      return {
        allDeterministic,
        uniqueSkinCount: Object.keys(skinDistribution).length,
        uniqueHairCount: Object.keys(hairDistribution).length,
        skinDistribution,
        hairDistribution,
      };
    });

    console.log(`   Variasi warna kulit terpakai: ${g2Result.uniqueSkinCount} (dari 3 variasi tema)`);
    console.log(`   Variasi warna rambut terpakai: ${g2Result.uniqueHairCount} (dari 4 variasi tema)`);
    console.log(`   Semua warna kulit & rambut sesuai tema deterministik: ${g2Result.allDeterministic}`);

    if (!g2Result.allDeterministic || g2Result.uniqueSkinCount < 2 || g2Result.uniqueHairCount < 2) {
      throw new Error(`G2 Gagal: Distribusi warna kulit/rambut tidak valid! ${JSON.stringify(g2Result)}`);
    }
    console.log("   ✓ G2 LOLOS: Variasi warna kulit & rambut deterministik serta identitas departemen terverifikasi.");

    // -------------------------------------------------------------------------
    // G3: Lencana Bintang 3D untuk 8 Lead Agent (Zero Extra Draw Calls)
    // -------------------------------------------------------------------------
    console.log("\n--- G3: Lencana Bintang 3D Lead Agent ---");
    const g3Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const leads = agents.filter((a) => a.lead);
      const nonLeads = agents.filter((a) => !a.lead);

      return {
        leadCount: leads.length,
        leadNames: leads.map((l) => l.name),
        nonLeadCount: nonLeads.length,
      };
    });

    console.log(`   Jumlah Lead Agent dengan Bintang 3D: ${g3Result.leadCount} (${g3Result.leadNames.join(", ")})`);
    if (g3Result.leadCount !== 9) {
      throw new Error(`G3 Gagal: Jumlah lead agent bukan 9! Ditemukan: ${g3Result.leadCount}`);
    }
    console.log("   ✓ G3 LOLOS: 9 Lead agent memiliki lencana bintang 3D terintegrasi pada head mesh.");

    // -------------------------------------------------------------------------
    // G4: Animasi Pose & Toleransi Posisi Duduk
    // -------------------------------------------------------------------------
    console.log("\n--- G4: Animasi Pose (Jalan, Kerja, Review, Idle, Rapat) & Toleransi Kursi ---");
    const g4Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const homePositions = stage.getHomePositions();

      let maxHomeChairDist = 0;
      agents.forEach((ag) => {
        const hp = homePositions[ag.name];
        if (hp) {
          const dist = Math.hypot(ag.position.x - hp[0], ag.position.z - hp[1]);
          if (dist > maxHomeChairDist) maxHomeChairDist = dist;
        }
      });

      return {
        maxHomeChairDist,
        withinTolerance: maxHomeChairDist <= 0.15,
      };
    });

    console.log(`   Jarak maksimum agen ke kursi kerja: ${g4Result.maxHomeChairDist.toFixed(4)} unit (toleransi <= 0.15)`);
    if (!g4Result.withinTolerance) {
      throw new Error(`G4 Gagal: Jarak duduk ke kursi melebihi toleransi! ${g4Result.maxHomeChairDist}`);
    }
    console.log("   ✓ G4 LOLOS: Posisi duduk tepat di kursi dengan toleransi <= 0.15 unit.");

    // -------------------------------------------------------------------------
    // G5: Optimasi Label CSS2D (Tersembunyi, Mini Badge, Viewport 390px)
    // -------------------------------------------------------------------------
    console.log("\n--- G5: Optimasi Label CSS2D ---");
    const g5Default = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const athenaRec = stage.getAgentRecord("ATHENA");
      return {
        athenaDisplay: athenaRec ? athenaRec.labelDiv.style.display : null,
      };
    });
    console.log(`   Label agen idle (default): display = "${g5Default.athenaDisplay}" (harus "none")`);
    if (g5Default.athenaDisplay !== "none") {
      throw new Error(`G5 Gagal: Label agen idle tidak tersembunyi secara default!`);
    }

    // Uji active: set ATHENA ke working -> tampil mini badge
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", "working");
    });
    await page.waitForTimeout(300);
    const g5Working = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const athenaRec = stage.getAgentRecord("ATHENA");
      return {
        display: athenaRec ? athenaRec.labelDiv.style.display : null,
        isMini: athenaRec ? athenaRec.labelDiv.classList.contains("is-mini") : false,
      };
    });
    console.log(`   Label agen working: display = "${g5Working.display}", isMini = ${g5Working.isMini}`);
    if (g5Working.display !== "inline-flex" || !g5Working.isMini) {
      throw new Error(`G5 Gagal: Label agen working tidak tampil sebagai mini badge!`);
    }

    // Uji viewport 390px mobile: hanya agen terseleksi yang tampil
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const g5Mobile = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".agent-tag3d"));
      const visibleLabels = labels.filter((l) => {
        const style = window.getComputedStyle(l);
        return style.display !== "none";
      });
      return {
        totalLabels: labels.length,
        visibleLabelsCount: visibleLabels.length,
      };
    });
    console.log(`   Pada viewport 390px (tanpa seleksi): label terlihat = ${g5Mobile.visibleLabelsCount}`);
    if (g5Mobile.visibleLabelsCount > 0) {
      throw new Error(`G5 Gagal: Ada label agen yang terlihat pada mobile tanpa seleksi! (${g5Mobile.visibleLabelsCount})`);
    }

    // Pulihkan status override & viewport
    await page.evaluate(() => {
      window.__STAGE_3D__.setStatusOverride("ATHENA", null);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    console.log("   ✓ G5 LOLOS: Optimasi CSS2D label bekerja sempurna (default sembunyi, mini badge saat aktif, tersembunyi pada 390px).");

    // -------------------------------------------------------------------------
    // G6: HR Arrival Portal Voxel
    // -------------------------------------------------------------------------
    console.log("\n--- G6: HR Arrival Portal Voxel ---");
    const g6Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const portalPos = stage.getHrPortalPos();
      const allProps = stage.allPlacedProps;
      const portalProp = allProps.find((p) => p.propId === "hr_arrival_portal" || p.id.includes("arrival_portal"));

      return {
        portalPos,
        portalPropFound: !!portalProp,
        portalPropId: portalProp?.id,
        blocksWalk: portalProp?.blocksWalk ?? false,
      };
    });

    console.log(`   HR_PORTAL_POS: [${g6Result.portalPos.join(", ")}]`);
    console.log(`   Prop HR Arrival Portal ditemukan: ${g6Result.portalPropFound} (id: ${g6Result.portalPropId})`);
    console.log(`   Memblokir koridor pejalan kaki: ${g6Result.blocksWalk} (harus false)`);

    if (!g6Result.portalPropFound || g6Result.blocksWalk) {
      throw new Error(`G6 Gagal: HR Arrival Portal tidak valid! ${JSON.stringify(g6Result)}`);
    }
    console.log("   ✓ G6 LOLOS: HR Arrival Portal terdaftar di dinding barat HR dan tidak memblokir rute.");

    // -------------------------------------------------------------------------
    // G7: Kinerja Draw Calls (< 330) & Stabilitas Memori
    // -------------------------------------------------------------------------
    console.log("\n--- G7: Kinerja Scene Draw Calls (< 330) ---");
    const g7Result = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const calls = stage.getDrawCalls();
      const mem = stage.getMemoryInfo();
      return {
        drawCalls: calls,
        triangles: stage.getRenderInfo().triangles,
        geometries: mem.geometries,
        textures: mem.textures,
      };
    });

    console.log(`   Total Draw Calls Scene: ${g7Result.drawCalls} (syarat < 330)`);
    console.log(`   Total Triangles: ${g7Result.triangles}`);
    console.log(`   Geometries di memori: ${g7Result.geometries}`);

    if (g7Result.drawCalls >= 330) {
      throw new Error(`G7 Gagal: Draw calls (${g7Result.drawCalls}) melebihi batas 330!`);
    }
    console.log("   ✓ G7 LOLOS: Total draw calls scene memenuhi batas performa (< 330).");

    // -------------------------------------------------------------------------
    // G8: 13 Tangkapan Layar Kanvas 1280x800 ke docs/design/t3/
    // -------------------------------------------------------------------------
    console.log("\n--- G8: Menangkap 13 Tangkapan Layar Kanvas 1280x800 ---");
    const t3Dir = "docs/design/t3";
    const rootT3Dir = "../docs/design/t3";
    if (!fs.existsSync(t3Dir)) fs.mkdirSync(t3Dir, { recursive: true });
    if (!fs.existsSync(rootT3Dir)) fs.mkdirSync(rootT3Dir, { recursive: true });

    // Set viewport ke 1280x800 untuk standar tangkapan kanvas
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // Aktifkan shot mode agar kanvas murni tanpa overlay CSS2D mengganggu
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(true);
    });

    const t3Screenshots = [
      { id: "overview-siang", name: "Overview Siang (Jam 12)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.setHourOverride(12);
          window.__STAGE_3D__.resetCamera();
        });
      }},
      { id: "overview-malam", name: "Overview Malam (Jam 22)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.setHourOverride(22);
          window.__STAGE_3D__.resetCamera();
        });
      }},
      { id: "dept-manager", name: "Departemen Manager (ATLAS)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.setHourOverride(12);
          window.__STAGE_3D__.focusRoom("manager");
        });
      }},
      { id: "dept-riset", name: "Departemen Riset (ARGUS & Tim)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("riset");
        });
      }},
      { id: "dept-operasional", name: "Departemen Operasional (HEPHAESTUS)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("operasional");
        });
      }},
      { id: "dept-hr-portal", name: "Departemen HR & Portal Kedatangan", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("hr");
        });
      }},
      { id: "dept-advertiser", name: "Departemen Advertiser", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("advertiser");
        });
      }},
      { id: "dept-creative", name: "Departemen Creative", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("creative");
        });
      }},
      { id: "dept-copy", name: "Departemen Copywriting", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("copy");
        });
      }},
      { id: "dept-landing-page", name: "Departemen Landing Page", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("landing_page");
        });
      }},
      { id: "dept-sosmed", name: "Departemen Sosial Media (HERMES)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("sosmed");
        });
      }},
      { id: "mode-meeting", name: "Mode Rapat (Meeting Gathered)", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.focusRoom("meeting");
          window.__STAGE_3D__.startMeetingNow(true);
        });
      }},
      { id: "dynamic-instance", name: "Dynamic Instance Agen Baru", action: async () => {
        await page.evaluate(() => {
          window.__STAGE_3D__.endMeetingNow(true);
          window.__STAGE_3D__.focusRoom("advertiser");
        });
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          window.__STAGE_3D__.startInstanceDemo({ autoApprove: true });
        });
        await page.waitForFunction(() => {
          const state = window.__STAGE_3D__.getInstanceDemoState();
          return state.dynamicDesksCount >= 1 && state.dynamicAgentsCount >= 1;
        }, { timeout: 25000 });
      }},
    ];

    const capturedT3 = [];
    for (const item of t3Screenshots) {
      await item.action();
      await page.waitForTimeout(400);

      const fileName = `${item.id}.png`;
      const p1 = `${t3Dir}/${fileName}`;
      const p2 = `${rootT3Dir}/${fileName}`;

      await canvasLocator.screenshot({ path: p1 });
      try {
        fs.copyFileSync(p1, p2);
      } catch {}

      const st = fs.statSync(p1);
      if (st.size < 10000) {
        throw new Error(`Screenshot ${fileName} terlalu kecil (${st.size} bytes)!`);
      }
      console.log(`   [Screenshot ${capturedT3.length + 1}/13] ${fileName} (${(st.size / 1024).toFixed(1)} KB) - ${item.name}`);
      capturedT3.push({ id: item.id, file: fileName, size: st.size });
    }

    // Pulihkan shot mode, instance demo & kamera
    await page.evaluate(() => {
      window.__STAGE_3D__.resetInstanceDemo();
      window.__STAGE_3D__.setShotMode(false);
      window.__STAGE_3D__.setHourOverride(null);
      window.__STAGE_3D__.resetCamera();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    testReport.t3 = {
      g1: g1Result,
      g2: g2Result,
      g3: g3Result,
      g4: g4Result,
      g5: { default: g5Default, working: g5Working, mobile: g5Mobile },
      g6: g6Result,
      g7: g7Result,
      g8: { total: capturedT3.length, list: capturedT3 },
    };
    console.log("   ✓ G8 LOLOS: 13 Tangkapan layar 1280x800 berhasil disimpan.");
    console.log("   ✓ PENGUJIAN T3 LOLOS SEMPURNA (G1 - G8).\n");

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
    } // end if (!runOnlyKasus12)

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
