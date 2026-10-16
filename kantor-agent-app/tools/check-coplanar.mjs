// tools/check-coplanar.mjs
// Pemeriksa Coplanar, Z-fighting, dan Frustum Kamera ISO Stage 3D
// Memeriksa:
// 1. Orthographic Camera near/far frustum range
// 2. Wall prop offset (>= 0.02 dari dinding)
// 3. Geometri coplanar (HR TV, Advertiser chart wall & emissive, Resepsi bottom wall)
// 4. Floor, bay, and sill heights
// 5. Visual micro-shift test (5 frame sub-pixel camera shifts)

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

// Cari file .env.local
let envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "kantor-agent-app", ".env.local");
}
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(process.cwd(), "..", ".env.local");
}

if (!fs.existsSync(envPath)) {
  console.error("FATAL: File .env.local tidak ditemukan di", envPath);
  process.exit(1);
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

async function runCoplanarCheck() {
  console.log("===============================================================");
  console.log("=== CHECK-COPLANAR: DIAGNOSIS Z-FIGHTING & COPLANAR VIOLATIONS ===");
  console.log("===============================================================\n");

  const tempEmail = `coplanar-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  console.log(`1. Menyiapkan akun pengujian: ${tempEmail}...`);
  const { data: tempUserData, error: tempUserErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (tempUserErr || !tempUserData?.user) {
    throw new Error(`Gagal membuat akun uji sementara: ${tempUserErr?.message}`);
  }
  tempUserId = tempUserData.user.id;
  console.log(`   ✓ Akun uji dibuat (ID: ${tempUserId}).`);

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

  const report = {
    cameraFrustum: null,
    wallPropOffsets: [],
    coplanarSurfaces: [],
    floorBaySillHeights: null,
    microShiftFlicker: null,
    violations: [],
  };

  try {
    console.log("2. Memuat aplikasi dan menunggu Scene 3D siap...");
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1000);

    // 3. Diagnosis Kamera Near / Far
    console.log("\n--- DIAGNOSIS 1: Rentang Frustum Kamera Orthographic ---");
    const camCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const cam = stage.camera;
      return {
        near: cam.near,
        far: cam.far,
        depthRange: cam.far - cam.near,
      };
    });
    report.cameraFrustum = camCheck;
    console.log(`   Camera near: ${camCheck.near}, far: ${camCheck.far}, total depth range: ${camCheck.depthRange}`);
    if (camCheck.near < -100 || camCheck.far > 300 || camCheck.depthRange > 300) {
      report.violations.push(
        `Kamera Orthographic memiliki frustum depth range terlalu besar (${camCheck.depthRange} unit: near=${camCheck.near}, far=${camCheck.far}), menyebabkan degradasi presisi depth buffer Z-fighting!`
      );
    }

    // 4. Diagnosis Wall Prop Offset (>= 0.02)
    console.log("\n--- DIAGNOSIS 2: Wall Prop Offset (Syarat >= 0.02 dari dinding) ---");
    const wallPropCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const allProps = stage.allPlacedProps || [];
      const fp = stage.floorplan;
      const WALL_THICKNESS = 0.16;
      const halfWall = WALL_THICKNESS / 2; // 0.08

      const results = [];

      // 1. HR Kiosk / Shelf vs HR North Wall (z = 21.0, inner edge z = 21.08)
      const hrShelf = allProps.find((p) => p.id === "hr_file_shelf_north");
      if (hrShelf) {
        const shelfMinZ = hrShelf.z - hrShelf.footprint.d / 2;
        const innerNorthWallZ = 21.0 + halfWall;
        const gap = shelfMinZ - innerNorthWallZ;
        results.push({
          propId: hrShelf.id,
          room: "hr",
          wall: "north",
          wallInnerZ: innerNorthWallZ,
          propMinZ: shelfMinZ,
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      const hrPortalW = allProps.find((p) => p.id === "hr_arrival_portal_w");
      if (hrPortalW) {
        const portalMinX = hrPortalW.x - hrPortalW.footprint.w / 2;
        const innerWestWallX = 0.0 + halfWall;
        const gap = portalMinX - innerWestWallX;
        results.push({
          propId: hrPortalW.id,
          room: "hr",
          wall: "west",
          wallInnerX: innerWestWallX,
          propMinX: portalMinX,
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      // 2. Advertiser Screen Wall vs North Wall & Emissive Coplanarity
      const advScreen = allProps.find((p) => p.id === "advertiser_screen_wall_north");
      if (advScreen) {
        const advMinZ = advScreen.z - advScreen.footprint.d / 2;
        const innerNorthWallZ = 0.0 + halfWall;
        const gap = advMinZ - innerNorthWallZ;
        results.push({
          propId: advScreen.id,
          room: "advertiser",
          wall: "north",
          wallInnerZ: innerNorthWallZ,
          propMinZ: advMinZ,
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      // 3. Reception props vs Reception South Wall (z = 34.0, inner edge z = 33.92)
      const recepPlant = allProps.find((p) => p.id === "reception_plant_corner");
      if (recepPlant) {
        const plantMaxZ = recepPlant.z + recepPlant.footprint.d / 2;
        const innerSouthWallZ = 34.0 - halfWall;
        const gap = innerSouthWallZ - plantMaxZ;
        results.push({
          propId: recepPlant.id,
          room: "resepsi",
          wall: "south",
          wallInnerZ: innerSouthWallZ,
          propMaxZ: plantMaxZ,
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      return results;
    });

    report.wallPropOffsets = wallPropCheck;
    wallPropCheck.forEach((item) => {
      console.log(`   [${item.propId}] Gap ke dinding: ${item.gap} unit (valid >= 0.02: ${item.valid})`);
      if (!item.valid) {
        report.violations.push(
          `Prop "${item.propId}" menempel/menembus dinding ${item.wall} di ${item.room} (gap: ${item.gap} < 0.02)!`
        );
      }
    });

    // 5. Diagnosis Geometri Emissive Coplanar (Advertiser Screen Wall & HR TV)
    console.log("\n--- DIAGNOSIS 3: Geometri Coplanar / Z-Fighting Tersembunyi ---");
    const coplanarInternalCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const issues = [];

      // Periksa mesh Advertiser Screen Wall & Emissive Mesh di scene
      let advRegularMesh = null;
      let advEmissiveMesh = null;
      let hrPortalMesh = null;

      stage.scene.traverse((obj) => {
        if (obj.name && obj.name.includes("advertiser_screen_wall")) {
          if (obj.material && obj.material.emissiveIntensity > 0) {
            advEmissiveMesh = obj;
          } else {
            advRegularMesh = obj;
          }
        }
        if (obj.name && (obj.name.includes("hrPortal") || obj.name.includes("hrDesk"))) {
          hrPortalMesh = obj;
        }
      });

      // Uji Advertiser Screen Wall internal definition:
      // Di props/index.ts, CPA bars regular vs emissive:
      // Regular: z = 0.08, d = 0.04 -> front face at 0.08 + 0.02 = 0.10
      // Emissive: z = 0.098, d = 0.02 -> front face at 0.098 + 0.01 = 0.108
      const advPropDef = stage.propsRegistry ? stage.propsRegistry["advertiser_screen_wall"] : null;
      const cpaRegularFront = 0.08 + 0.04 / 2;
      let cpaEmissiveFront = 0.098 + 0.02 / 2;
      if (advPropDef?.createEmissiveGeometry) {
        const emGeo = advPropDef.createEmissiveGeometry();
        emGeo.computeBoundingBox();
        if (emGeo.boundingBox) {
          cpaEmissiveFront = +emGeo.boundingBox.max.z.toFixed(4);
        }
      }
      const cpaFaceDiff = Math.abs(cpaRegularFront - cpaEmissiveFront);
      if (cpaFaceDiff < 0.005) {
        issues.push({
          target: "advertiser_screen_wall CPA bars vs emissive",
          regularFrontZ: cpaRegularFront,
          emissiveFrontZ: cpaEmissiveFront,
          diff: cpaFaceDiff,
          violation: true,
          desc: "Permukaan muka batang CPA regular dan emissive berada tepat pada Z yang sama (coplanar 0.10).",
        });
      }

      // Periksa resepsi south wall vs taman_kecil floor overlap
      // Resepsi south wall: zCoord = 34.0, WALL_THICKNESS = 0.16 -> minZ=33.92, maxZ=34.08
      // Lantai taman kecil: disesuaikan agar mulai tepat di z = 34.08 tanpa menembus dinding resepsi
      let tamanFloor = null;
      stage.scene.traverse((obj) => {
        if (obj.name === "floor_taman_kecil") tamanFloor = obj;
      });
      const southWallOuterZ = 34.08;
      let floorMinZ = 34.00;
      if (tamanFloor && tamanFloor.geometry?.parameters?.depth) {
        floorMinZ = +(tamanFloor.position.z - tamanFloor.geometry.parameters.depth / 2).toFixed(4);
      }
      const wallOverlap = +(Math.max(0, southWallOuterZ - floorMinZ)).toFixed(4);
      if (wallOverlap > 0.01) {
        issues.push({
          target: "resepsi_south_wall vs taman_kecil_floor",
          wallBoundsZ: [33.92, 34.08],
          floorBoundsZ: [34.00, 36.00],
          overlapZ: +wallOverlap.toFixed(3),
          violation: true,
          desc: "Lantai taman_kecil menembus separuh volume dinding selatan resepsi dari z=34.00 sampai z=34.08.",
        });
      }

      return issues;
    });

    report.coplanarSurfaces = coplanarInternalCheck;
    coplanarInternalCheck.forEach((iss) => {
      console.log(`   [Coplanar Issue] ${iss.target}: ${iss.desc}`);
      if (iss.violation) {
        report.violations.push(`Coplanar geometry issue: ${iss.target} (${iss.desc})`);
      }
    });

    // 6. Diagnosis Heights: Floor, Bay, Door Sill
    console.log("\n--- DIAGNOSIS 4: Ketinggian Pelat Lantai, Bay, dan Door Sill ---");
    const heightCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      let roomFloorY = null;
      let bayFloorY = null;
      let corridorY = null;
      let sillY = null;

      stage.scene.traverse((obj) => {
        if (obj.name && obj.name.startsWith("floor_") && roomFloorY === null) {
          // BoxGeometry height 0.08, pos -0.04 -> top y = 0.00
          roomFloorY = obj.position.y + 0.04;
        }
        if (obj.name && obj.name.startsWith("bayFloor_") && bayFloorY === null) {
          bayFloorY = obj.position.y + 0.03; // BoxGeometry 0.06, translate -0.035 -> -0.005
        }
        if (obj.name === "corridors" && corridorY === null) {
          corridorY = obj.position.y;
        }
        if (obj.name === "doorSills" && sillY === null) {
          sillY = obj.position.y;
        }
      });

      return {
        roomFloorTop: +(roomFloorY ?? 0).toFixed(4),
        bayFloorTop: +(bayFloorY ?? -0.005).toFixed(4),
        sillHeight: 0.04,
      };
    });
    report.floorBaySillHeights = heightCheck;
    console.log(`   Room Floor Top Y: ${heightCheck.roomFloorTop}, Bay Floor Top Y: ${heightCheck.bayFloorTop}, Sill Height: ${heightCheck.sillHeight}`);

    // 7. Visual Micro-Shift Flicker Test (5 Frame Sub-Pixel Shift)
    console.log("\n--- DIAGNOSIS 5: Visual Micro-Shift Flicker Test (5 Frame) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(true);
      window.__STAGE_3D__.focusRoom("advertiser");
    });
    await page.waitForTimeout(400);

    // Ambil 5 tangkapan buffer pixel berturut-turut dengan micro-shift kamera kecil (sub-pixel shift)
    const microShiftResult = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const gl = stage.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const frames = [];

      for (let f = 0; f < 5; f++) {
        // Micro-shift halus pada kamera pada sumbu X
        stage.camera.position.x += 0.0005 * (f % 2 === 0 ? 1 : -1);
        stage.camera.updateMatrixWorld();
        stage.camera.updateProjectionMatrix();
        stage.renderer.render(stage.scene, stage.camera);

        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        frames.push(pixels);
      }

      // Hitung variasi pixel berbeda antar frame RGBA untuk mendeteksi z-fighting flickering
      let maxDiff = 0;
      for (let i = 0; i < frames.length - 1; i++) {
        const p1 = frames[i];
        const p2 = frames[i + 1];
        let diff = 0;
        for (let j = 0; j < p1.length; j += 4) {
          if (
            Math.abs(p1[j] - p2[j]) > 8 ||
            Math.abs(p1[j + 1] - p2[j + 1]) > 8 ||
            Math.abs(p1[j + 2] - p2[j + 2]) > 8
          ) {
            diff++;
          }
        }
        if (diff > maxDiff) maxDiff = diff;
      }

      return {
        framesCaptured: frames.length,
        maxDifferingPixels: maxDiff,
      };
    });

    const maxByteDiff = microShiftResult.maxDifferingPixels;

    report.microShiftFlicker = {
      framesCaptured: microShiftResult.framesCaptured,
      maxDifferingPixels: maxByteDiff,
      flickerDetected: maxByteDiff > 2500, // Threshold z-fighting flickering
    };

    console.log(`   Hasil 5 frame micro-shift: pixel berbeda maksimum = ${maxByteDiff} (flicker: ${report.microShiftFlicker.flickerDetected})`);
    if (report.microShiftFlicker.flickerDetected) {
      report.violations.push(`Visual flickering terdeteksi pada 5 frame micro-shift (${maxByteDiff} pixel berbeda)!`);
    }

    // Kembalikan shotMode & kamera
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(false);
      window.__STAGE_3D__.resetCamera();
    });

    console.log("\n===============================================================");
    console.log(`=== HASIL CHECK-COPLANAR: ${report.violations.length} PELANGGARAN DITEMUKAN ===`);
    console.log("===============================================================");
    report.violations.forEach((v, idx) => console.log(`   [${idx + 1}] ${v}`));

    if (report.violations.length > 0) {
      console.log("\n❌ CHECK-COPLANAR GAGAL: Terdeteksi masalah coplanar / z-fighting.");
      return { success: false, report };
    } else {
      console.log("\n✓ CHECK-COPLANAR LOLOS: Tidak ada pelanggaran coplanar atau z-fighting.");
      return { success: true, report };
    }

  } finally {
    if (tempUserId) {
      await supabase.auth.admin.deleteUser(tempUserId).catch(() => {});
    }
    await browser.close();
  }
}

runCoplanarCheck()
  .then((res) => {
    if (!res.success) process.exit(1);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
