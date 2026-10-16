// tests/polish1-preflight.test.mjs
// Pengujian Pra-Polish 1 untuk membuktikan kegagalan (FAIL) pada kode sebelum perbaikan:
// 1. Arah hadap 19 agen (rotation diff < 20° dari vektor kursi-ke-meja)
// 2. Batas meja bay_sosmed (margin >= 0.15 dari dinding luar z=36.0, tidak menonjol)
// 3. Gaya prop meja instance sesuai ruangan (Riset lab table, Advertiser desk)
// 4. Duplikasi badge antrean HR di canvas top-left (0,0)
// 5. Vegetasi foliage atrium (4-6 pohon, 4-6 tanaman pot, 2 bangku, 1 planter tengah)

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

const baseDir = fs.existsSync(path.resolve(process.cwd(), "kantor-agent-app"))
  ? path.resolve(process.cwd(), "kantor-agent-app")
  : process.cwd();

const appRequire = createRequire(path.resolve(baseDir, "package.json"));
const { chromium } = appRequire("playwright");
const { createClient } = appRequire("@supabase/supabase-js");

let envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "kantor-agent-app", ".env.local");
}
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "..", ".env.local");
}

const envRaw = fs.readFileSync(envPath, "utf8");
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

async function runPreflightTests() {
  console.log("===============================================================");
  console.log("=== POLISH 1 PRE-FLIGHT TESTS: VERIFIKASI KEGAGALAN PRE-FIX ===");
  console.log("===============================================================\n");

  const tempEmail = `preflight-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  const { data: tempUserData } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });
  tempUserId = tempUserData?.user?.id;

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

  const testResults = {
    agentFacing: { passed: false, details: [] },
    sosmedDeskBoundary: { passed: false, details: null },
    instanceDeskStyle: { passed: false, details: [] },
    hrQueueBadgeTopLeft: { passed: false, details: null },
    atriumFoliage: { passed: false, details: null },
  };

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1000);

    // =========================================================================
    // TES 1: ARAH HADAP 19 AGEN (Selisih Sudut < 20° dari Vektor Kursi-ke-Meja)
    // =========================================================================
    console.log("--- TES 1: Uji Arah Hadap 19 Agen di Meja Rumah ---");
    const facingCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const allProps = stage.allPlacedProps || [];
      const homePositions = stage.getHomePositions();

      // Peta agen ke meja kerjanya
      const deskMap = {
        ATLAS: "manager_desk_main",
        HERA: "hr_desk_hera",
        HEPHAESTUS: "ops_workstation_hephaestus",
        HERMES: "sosmed_desk_hermes",
        ATHENA: "riset_lab_athena_desk",
        ARGUS: "riset_lab_argus_desk",
        METIS: "riset_lab_metis_desk",
        ZEUS: "advertiser_desk_zeus",
        ARTEMIS: "advertiser_desk_artemis",
        PLUTUS: "advertiser_desk_plutus",
        THEIA: "creative_desk_theia",
        LYRA: "creative_desk_lyra",
        IRIS: "creative_desk_iris",
        CLIO: "copy_desk_clio",
        ERATO: "copy_desk_erato",
        DAPHNE: "copy_desk_daphne",
        HESTIA: "landing_page_desk_hestia",
        THEMIS: "landing_page_desk_themis",
        TALOS: "landing_page_desk_talos",
      };

      const results = [];
      let failCount = 0;

      agents.forEach((ag) => {
        const deskId = deskMap[ag.name];
        const deskProp = allProps.find((p) => p.id === deskId);
        const hp = homePositions[ag.name];
        const rec = stage.getAgentRecord(ag.name);

        if (!deskProp || !hp || !rec) {
          results.push({
            name: ag.name,
            error: "Desk/homePos/record tidak ditemukan",
            diffDeg: 999,
            passed: false,
          });
          failCount++;
          return;
        }

        // Vektor dari kursi ke meja (posisi prop meja)
        const dx = deskProp.x - hp[0];
        const dz = deskProp.z - hp[1];
        // Sudut Three.js atan2(dx, dz)
        let expectedAngle = Math.atan2(dx, dz);
        // Normalisasi ke [-PI, PI]
        while (expectedAngle > Math.PI) expectedAngle -= 2 * Math.PI;
        while (expectedAngle < -Math.PI) expectedAngle += 2 * Math.PI;

        let actualAngle = rec.group.rotation.y;
        while (actualAngle > Math.PI) actualAngle -= 2 * Math.PI;
        while (actualAngle < -Math.PI) actualAngle += 2 * Math.PI;

        let diff = Math.abs(actualAngle - expectedAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const diffDeg = +((diff * 180) / Math.PI).toFixed(1);

        const passed = diffDeg < 20;
        if (!passed) failCount++;

        results.push({
          name: ag.name,
          actualAngle: +actualAngle.toFixed(3),
          expectedAngle: +expectedAngle.toFixed(3),
          diffDeg,
          passed,
        });
      });

      return {
        totalAgents: agents.length,
        failCount,
        allPassed: failCount === 0,
        results,
      };
    });

    testResults.agentFacing = facingCheck;
    console.log(`   Total Agen: ${facingCheck.totalAgents}, Gagal Arah: ${facingCheck.failCount}/19`);
    facingCheck.results.filter((r) => !r.passed).forEach((r) => {
      console.log(`   ❌ Agen ${r.name}: actual=${r.actualAngle} rad, expected=${r.expectedAngle} rad, selisih=${r.diffDeg}° (harus < 20°)`);
    });

    // =========================================================================
    // TES 2: BATAS MEJA BAY_SOSMED (Margin >= 0.15, Tidak Menonjol Keluar z=36.0)
    // =========================================================================
    console.log("\n--- TES 2: Uji Batas Meja Dynamic Instance di bay_sosmed ---");
    const sosmedBoundaryCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const room = stage.floorplan.rooms.find((r) => r.id === "sosmed");
      const bay = stage.floorplan.bays.find((b) => b.roomId === "sosmed");
      
      // Ambil slot meja sosmed saat ekspansi
      const slotPos = window.__STAGE_3D__.calculateRoomSlotPosition
        ? window.__STAGE_3D__.calculateRoomSlotPosition(room, 1, true)
        : null;

      // Ambil posisi meja sebenarnya dari calculateRoomSlotPosition / createDeskMesh
      let deskZ = slotPos?.deskPos ? slotPos.deskPos.z : 35.8;
      let deskDepth = 0.65;
      let maxZ = +(deskZ + deskDepth / 2).toFixed(3);
      const outerWallZ = bay.z + bay.d; // 34 + 2 = 36.0
      const protrusion = +(maxZ - outerWallZ).toFixed(3);
      const margin = +(outerWallZ - maxZ).toFixed(3);

      return {
        bayBoundsZ: [bay.z, outerWallZ],
        deskPositionZ: deskZ,
        deskDepth,
        deskMaxZ: maxZ,
        outerWallZ,
        protrusion,
        margin,
        isProtruding: protrusion > 0,
        validMargin: margin >= 0.15,
      };
    });

    testResults.sosmedDeskBoundary = sosmedBoundaryCheck;
    console.log(`   Posisi Meja Z: ${sosmedBoundaryCheck.deskPositionZ}, Max Z Footprint: ${sosmedBoundaryCheck.deskMaxZ}, Dinding Luar Z: ${sosmedBoundaryCheck.outerWallZ}`);
    console.log(`   Menonjol keluar dinding: ${sosmedBoundaryCheck.isProtruding} (${sosmedBoundaryCheck.protrusion} unit), Margin: ${sosmedBoundaryCheck.margin} (syarat >= 0.15)`);
    if (sosmedBoundaryCheck.isProtruding || !sosmedBoundaryCheck.validMargin) {
      console.log(`   ❌ TES 2 GAGAL: Meja Sosmed menonjol keluar gedung melewati outer wall z=36.0!`);
    }

    // =========================================================================
    // TES 3: GAYA PROP MEJA INSTANCE SESUAI RUANGAN
    // =========================================================================
    console.log("\n--- TES 3: Uji Gaya Prop Meja Instance Sesuai Ruangan ---");
    const deskStyleCheck = await page.evaluate(() => {
      // Uji apakah createDeskMesh menghasilkan prop sesuai tipe ruangan atau generic plank
      const stage = window.__STAGE_3D__;
      const risetRoom = stage.floorplan.rooms.find((r) => r.id === "riset");
      const adsRoom = stage.floorplan.rooms.find((r) => r.id === "advertiser");
      const risetDesk = window.__STAGE_3D__.createDeskMesh ? window.__STAGE_3D__.createDeskMesh(risetRoom, 3) : null;
      const adsDesk = window.__STAGE_3D__.createDeskMesh ? window.__STAGE_3D__.createDeskMesh(adsRoom, 1) : null;
      const hasRoomSpecificStyles =
        Boolean(risetDesk && adsDesk &&
        risetDesk.deskMesh.geometry.uuid !== adsDesk.deskMesh.geometry.uuid);

      return {
        hasRoomSpecificStyles,
        desc: hasRoomSpecificStyles
          ? "createDeskMesh mengadopsi model prop spesifik ruangan (dining_table vs advertiser_desk)."
          : "createDeskMesh menggunakan BoxGeometry plank generic tanpa mengadopsi model prop ruangan (dining_table, advertiser_desk, dll).",
      };
    });
    testResults.instanceDeskStyle = deskStyleCheck;
    console.log(`   Gaya Meja Instance Spesifik Ruangan: ${deskStyleCheck.hasRoomSpecificStyles}`);
    if (!deskStyleCheck.hasRoomSpecificStyles) {
      console.log(`   ❌ TES 3 GAGAL: ${deskStyleCheck.desc}`);
    }

    // =========================================================================
    // TES 4: DUPLIKASI BADGE ANTREAN HR DI CANVAS TOP-LEFT (0,0)
    // =========================================================================
    console.log("\n--- TES 4: Uji Posisi Badge Antrean HR (Cegah Loncat ke Top-Left 0,0) ---");
    // Memicu kemunculan antrean HR
    await page.evaluate(() => {
      window.__STAGE_3D__.requestInstance("riset");
      window.__STAGE_3D__.requestInstance("iklan");
    });
    await page.waitForTimeout(400);

    const badgePosCheck = await page.evaluate(() => {
      const badge = document.querySelector(".hr-queue-badge");
      if (!badge) return { found: false };

      const rect = badge.getBoundingClientRect();
      const style = window.getComputedStyle(badge);
      const isTopLeft = rect.left <= 20 && rect.top <= 20;

      return {
        found: true,
        text: badge.textContent,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        animationName: style.animationName,
        isTopLeft,
      };
    });

    testResults.hrQueueBadgeTopLeft = badgePosCheck;
    console.log(`   Badge HR ditemukan: ${badgePosCheck.found}, Rect: [left=${badgePosCheck.rect?.left}, top=${badgePosCheck.rect?.top}], Animasi: ${badgePosCheck.animationName}`);
    if (badgePosCheck.isTopLeft) {
      console.log(`   ❌ TES 4 GAGAL: Badge antrean HR meloncat ke pojok kiri atas canvas (0,0) akibat @keyframes pulseQueue meng-override transform CSS2D!`);
    }

    await page.evaluate(() => window.__STAGE_3D__.resetInstanceDemo());
    await page.waitForTimeout(300);

    // =========================================================================
    // TES 5: VEGETASI ATRIUM (Pohon, Tanaman Pot, Bangku, Planter Tengah)
    // =========================================================================
    console.log("\n--- TES 5: Uji Keberadaan Foliage Atrium ---");
    const foliageCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const allProps = stage.allPlacedProps || [];
      const atriumProps = allProps.filter((p) => p.roomId === "atrium" || (p.x >= 21 && p.x <= 28 && p.z >= 11 && p.z <= 21));

      let treeCount = 0;
      let plantCount = 0;
      let benchCount = 0;
      let planterCount = 0;

      atriumProps.forEach((p) => {
        if (p.propId === "voxel_tree") treeCount++;
        if (p.propId === "potted_plant") plantCount++;
        if (p.propId === "atrium_bench") benchCount++;
        if (p.propId === "atrium_planter" || p.propId.includes("planter")) planterCount++;
      });

      return {
        totalAtriumProps: atriumProps.length,
        treeCount,
        plantCount,
        benchCount,
        planterCount,
        meetsRequirement: treeCount >= 4 && treeCount <= 6 && plantCount >= 4 && plantCount <= 6 && benchCount >= 2 && planterCount >= 1,
      };
    });

    testResults.atriumFoliage = foliageCheck;
    console.log(`   Foliage Atrium: ${foliageCheck.treeCount} pohon (syarat 4-6), ${foliageCheck.plantCount} tanaman pot (syarat 4-6), ${foliageCheck.benchCount} bangku (syarat >= 2), ${foliageCheck.planterCount} center planter (syarat >= 1)`);
    if (!foliageCheck.meetsRequirement) {
      console.log(`   ❌ TES 5 GAGAL: Foliage Atrium belum lengkap sesuai spesifikasi.`);
    }

    console.log("\n===============================================================");
    console.log("=== RANGKUMAN PRE-FLIGHT TESTS ===");
    console.log("===============================================================");
    console.log(JSON.stringify(testResults, null, 2));

    const allPassed =
      facingCheck.allPassed &&
      !sosmedBoundaryCheck.isProtruding &&
      sosmedBoundaryCheck.validMargin &&
      deskStyleCheck.hasRoomSpecificStyles &&
      !badgePosCheck.isTopLeft &&
      foliageCheck.meetsRequirement;

    if (!allPassed) {
      console.log("\nBukti kegagalan pre-fix terkonfirmasi secara sah!");
      return { success: false, results: testResults };
    }
    return { success: true, results: testResults };

  } finally {
    if (tempUserId) {
      await supabase.auth.admin.deleteUser(tempUserId).catch(() => {});
    }
    await browser.close();
  }
}

runPreflightTests()
  .then((res) => {
    if (!res.success) process.exit(1);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal preflight error:", err);
    process.exit(1);
  });
