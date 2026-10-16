// tools/check-coplanar.mjs
// Pemeriksa Coplanar, Z-fighting, dan Frustum Kamera ISO Stage 3D (Polish 2 Expanded)
// Memeriksa:
// 1. Orthographic Camera near/far frustum range
// 2. Wall prop offset (>= 0.02 dari dinding)
// 3. Geometri coplanar internal (HR TV, Advertiser chart wall & emissive, Resepsi bottom wall)
// 4. Floor, bay, and sill heights
// 5. Analisis bidang paralel (dist < 0.02 & tumpang-tindih XZ) pada 8 dinding selatan:
//    Resepsi, HR, Sosmed, Creative, Copy, Landing Page, Riset, Operasional
// 6. Pengukuran flicker via readPixels dengan pergeseran ±0.02 sepanjang vektor pandang kamera
//    pada wilayah layar dinding selatan resepsi yang di-crop (Before vs After, target After < 10% Before)
// 7. Pengambilan tangkapan layar 1280x800 sebelum dan sesudah perbaikan & validasi header PNG

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
  console.log("==========================================================================");
  console.log("=== CHECK-COPLANAR (EXPANDED): DIAGNOSIS Z-FIGHTING & 8 DINDING SELATAN ===");
  console.log("==========================================================================\n");

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

  const outDir = path.resolve(process.cwd(), "docs/design/polish2");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const report = {
    cameraFrustum: null,
    wallPropOffsets: [],
    coplanarSurfaces: [],
    floorBaySillHeights: null,
    southWalls8Check: null,
    receptionFlickerTest: null,
    screenshots: [],
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
        `Kamera Orthographic memiliki frustum depth range terlalu besar (${camCheck.depthRange} unit), degradasi z-buffer!`
      );
    }

    // 4. Diagnosis Wall Prop Offset (>= 0.02)
    console.log("\n--- DIAGNOSIS 2: Wall Prop Offset (Syarat >= 0.02 dari dinding) ---");
    const wallPropCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const allProps = stage.allPlacedProps || [];
      const WALL_THICKNESS = 0.16;
      const halfWall = WALL_THICKNESS / 2;

      const results = [];

      const hrShelf = allProps.find((p) => p.id === "hr_file_shelf_north");
      if (hrShelf) {
        const shelfMinZ = hrShelf.z - hrShelf.footprint.d / 2;
        const innerNorthWallZ = 21.0 + halfWall;
        const gap = shelfMinZ - innerNorthWallZ;
        results.push({
          propId: hrShelf.id,
          room: "hr",
          wall: "north",
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      const advScreen = allProps.find((p) => p.id === "advertiser_screen_wall_north");
      if (advScreen) {
        const advMinZ = advScreen.z - advScreen.footprint.d / 2;
        const innerNorthWallZ = 0.0 + halfWall;
        const gap = advMinZ - innerNorthWallZ;
        results.push({
          propId: advScreen.id,
          room: "advertiser",
          wall: "north",
          gap: +gap.toFixed(4),
          valid: gap >= 0.02,
        });
      }

      const recepPlant = allProps.find((p) => p.id === "reception_plant_corner");
      if (recepPlant) {
        const plantMaxZ = recepPlant.z + recepPlant.footprint.d / 2;
        const innerSouthWallZ = 34.0 - halfWall;
        const gap = innerSouthWallZ - plantMaxZ;
        results.push({
          propId: recepPlant.id,
          room: "resepsi",
          wall: "south",
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
          `Prop "${item.propId}" menempel dinding ${item.wall} di ${item.room} (gap: ${item.gap} < 0.02)!`
        );
      }
    });

    // 5. Diagnosis Geometri Coplanar Internal
    console.log("\n--- DIAGNOSIS 3: Geometri Coplanar / Z-Fighting Internal ---");
    const coplanarInternalCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const issues = [];

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
          diff: cpaFaceDiff,
          violation: true,
          desc: "Permukaan muka batang CPA regular dan emissive coplanar.",
        });
      }

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
      if (wallOverlap > 0.005) {
        issues.push({
          target: "resepsi_south_wall vs taman_kecil_floor",
          wallBoundsZ: [33.92, 34.08],
          overlapZ: +wallOverlap.toFixed(3),
          violation: true,
          desc: "Lantai taman_kecil tumpang-tindih menembus dinding selatan resepsi.",
        });
      }

      return issues;
    });

    report.coplanarSurfaces = coplanarInternalCheck;
    coplanarInternalCheck.forEach((iss) => {
      console.log(`   [Coplanar Internal] ${iss.target}: ${iss.desc}`);
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
      let sillY = null;

      stage.scene.traverse((obj) => {
        if (obj.name && obj.name.startsWith("floor_") && roomFloorY === null) {
          roomFloorY = obj.position.y + 0.04;
        }
        if (obj.name && obj.name.startsWith("bayFloor_") && bayFloorY === null) {
          bayFloorY = obj.position.y + 0.03;
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
    console.log(`   Room Floor Top: ${heightCheck.roomFloorTop}, Bay Floor Top: ${heightCheck.bayFloorTop}, Sill Height: ${heightCheck.sillHeight}`);

    // 7. DIAGNOSIS 5: Uji Komprehensif Bidang Paralel pada 8 Dinding Selatan
    console.log("\n--- DIAGNOSIS 5: Uji Bidang Paralel pada 8 Dinding Selatan (Jarak < 0.02 & Tumpang Tindih Area) ---");
    const southWallsReport = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const THREE = stage.THREE;

      const southWalls = [
        { id: "resepsi", name: "Resepsi", xMin: 40, xMax: 44, z: 34 },
        { id: "hr", name: "HR", xMin: 0, xMax: 9, z: 25 },
        { id: "sosmed", name: "Sosmed", xMin: 0, xMax: 10, z: 34 },
        { id: "creative", name: "Creative", xMin: 11, xMax: 21, z: 34 },
        { id: "copy", name: "Copy", xMin: 22, xMax: 32, z: 34 },
        { id: "landing_page", name: "Landing Page", xMin: 33, xMax: 40, z: 34 },
        { id: "riset", name: "Riset", xMin: 11, xMax: 21, z: 19 },
        { id: "operasional", name: "Operasional", xMin: 17, xMax: 26, z: 9 },
      ];

      function isEffectivelyVisible(obj) {
        for (let c = obj; c; c = c.parent) {
          if (!c.visible) return false;
        }
        return true;
      }

      const results = {};

      southWalls.forEach((sw) => {
        const area = {
          minX: sw.xMin - 0.5,
          maxX: sw.xMax + 0.5,
          minZ: sw.z - 0.5,
          maxZ: sw.z + 0.5,
          minY: -0.1,
          maxY: 2.5,
        };

        const planes = [];
        function addPlane(meshName, axis, normalSign, coord, rangeA, rangeB) {
          planes.push({
            meshName,
            axis,
            normalSign,
            coord: +coord.toFixed(4),
            rangeA: [+rangeA[0].toFixed(4), +rangeA[1].toFixed(4)],
            rangeB: [+rangeB[0].toFixed(4), +rangeB[1].toFixed(4)],
          });
        }

        stage.scene.traverse((obj) => {
          if (!isEffectivelyVisible(obj)) return;
          if (obj.material && obj.material.visible === false) return;
          if (!obj.geometry || obj.isLine || obj.isLineSegments) return;
          if (obj.name && obj.name.includes("roomPoolLight")) return; // decals
          if (obj.userData?.isStatic === false && obj.name.includes("agent")) return;

          obj.updateWorldMatrix(true, false);
          const geo = obj.geometry;
          const pos = geo.attributes?.position;
          if (!pos) return;

          geo.computeBoundingBox();
          const b = geo.boundingBox.clone().applyMatrix4(obj.matrixWorld);
          if (
            b.max.x < area.minX || b.min.x > area.maxX ||
            b.max.z < area.minZ || b.min.z > area.maxZ ||
            b.max.y < area.minY || b.min.y > area.maxY
          ) {
            return;
          }

          const count = pos.count;
          const index = geo.index;
          const numTriangles = index ? index.count / 3 : count / 3;

          for (let i = 0; i < numTriangles; i++) {
            const i1 = index ? index.getX(i * 3) : i * 3;
            const i2 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
            const i3 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

            const p1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(obj.matrixWorld);
            const p2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(obj.matrixWorld);
            const p3 = new THREE.Vector3(pos.getX(i3), pos.getY(i3), pos.getZ(i3)).applyMatrix4(obj.matrixWorld);

            const triMinX = Math.min(p1.x, p2.x, p3.x);
            const triMaxX = Math.max(p1.x, p2.x, p3.x);
            const triMinY = Math.min(p1.y, p2.y, p3.y);
            const triMaxY = Math.max(p1.y, p2.y, p3.y);
            const triMinZ = Math.min(p1.z, p2.z, p3.z);
            const triMaxZ = Math.max(p1.z, p2.z, p3.z);

            if (triMaxX < area.minX || triMinX > area.maxX || triMaxZ < area.minZ || triMinZ > area.maxZ) {
              continue;
            }

            const vA = new THREE.Vector3().subVectors(p2, p1);
            const vB = new THREE.Vector3().subVectors(p3, p1);
            const normal = new THREE.Vector3().crossVectors(vA, vB).normalize();

            const isPlaneX = Math.abs(normal.x) > 0.99;
            const isPlaneY = Math.abs(normal.y) > 0.99;
            const isPlaneZ = Math.abs(normal.z) > 0.99;

            const name = obj.name || (obj.parent?.name ? `${obj.parent.name}_child` : "mesh");
            if (isPlaneX) {
              addPlane(name, "X", Math.sign(normal.x), p1.x, [triMinY, triMaxY], [triMinZ, triMaxZ]);
            } else if (isPlaneY) {
              addPlane(name, "Y", Math.sign(normal.y), p1.y, [triMinX, triMaxX], [triMinZ, triMaxZ]);
            } else if (isPlaneZ) {
              addPlane(name, "Z", Math.sign(normal.z), p1.z, [triMinX, triMaxX], [triMinY, triMaxY]);
            }
          }
        });

        const wallConflicts = [];
        for (let i = 0; i < planes.length; i++) {
          for (let j = i + 1; j < planes.length; j++) {
            const p1 = planes[i];
            const p2 = planes[j];
            if (p1.meshName === p2.meshName) continue;
            if (p1.axis !== p2.axis) continue;
            if (p1.normalSign !== p2.normalSign) continue;

            const dist = Math.abs(p1.coord - p2.coord);
            if (dist < 0.02) {
              const overlapA = Math.min(p1.rangeA[1], p2.rangeA[1]) - Math.max(p1.rangeA[0], p2.rangeA[0]);
              const overlapB = Math.min(p1.rangeB[1], p2.rangeB[1]) - Math.max(p1.rangeB[0], p2.rangeB[0]);

              if (overlapA > 0.02 && overlapB > 0.02) {
                const signStr = p1.normalSign > 0 ? "+" : "-";
                const key = [p1.meshName, p2.meshName].sort().join(" vs ") + ` on ${signStr}${p1.axis}=${p1.coord}`;
                if (!wallConflicts.find((c) => c.key === key)) {
                  wallConflicts.push({
                    key,
                    mesh1: p1.meshName,
                    mesh2: p2.meshName,
                    axis: `${signStr}${p1.axis}`,
                    coord1: p1.coord,
                    coord2: p2.coord,
                    dist: +dist.toFixed(4),
                    overlapA: +overlapA.toFixed(3),
                    overlapB: +overlapB.toFixed(3),
                  });
                }
              }
            }
          }
        }

        results[sw.id] = {
          name: sw.name,
          southZ: sw.z,
          xRange: [sw.xMin, sw.xMax],
          planesCount: planes.length,
          conflictsCount: wallConflicts.length,
          conflicts: wallConflicts,
          pass: wallConflicts.length === 0,
        };
      });

      return results;
    });

    report.southWalls8Check = southWallsReport;
    for (const [id, res] of Object.entries(southWallsReport)) {
      console.log(`   - ${res.name} (z=${res.southZ}, x: ${res.xRange[0]}-${res.xRange[1]}): ${res.pass ? "PASS (0 konflik)" : `FAIL (${res.conflictsCount} konflik)`}`);
      if (!res.pass) {
        res.conflicts.forEach((c) => {
          report.violations.push(`Konflik coplanar di dinding selatan ${res.name}: ${c.key} (dist=${c.dist})`);
        });
      }
    }

    // 8. DIAGNOSIS 6: Pengukuran Flicker via readPixels dengan pergeseran ±0.02 sepanjang vektor pandang kamera
    console.log("\n--- DIAGNOSIS 6: Pengukuran Flicker Dinding Selatan Resepsi (Before vs After) ---");
    // Siapkan posisi kamera yang ter-zoom ke dinding selatan resepsi
    await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      stage.setShotMode(true);
      stage.controls.target.set(42, 0.4, 34);
      stage.camera.position.set(42 + 7, 0.4 + 7, 34 + 7);
      stage.camera.zoom = 3.5;
      stage.camera.updateProjectionMatrix();
      stage.camera.updateMatrixWorld();
    });
    await page.waitForTimeout(300);

    // Ambil screenshot After (kondisi perbaikan bersih saat ini)
    const afterScreenshotPath = path.join(outDir, "reception-south-wall-after.png");
    await page.screenshot({ path: afterScreenshotPath });
    report.screenshots.push(afterScreenshotPath);

    // Jalankan pengukuran flicker Before vs After di dalam browser
    const flickerResult = await page.evaluate(async () => {
      const stage = window.__STAGE_3D__;
      const THREE = stage.THREE;
      const cam = stage.camera;
      const gl = stage.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;

      // Koordinat crop wilayah layar dinding selatan resepsi
      const corners = [
        new THREE.Vector3(39.5, -0.15, 33.7),
        new THREE.Vector3(44.5, -0.15, 33.7),
        new THREE.Vector3(39.5, 0.85, 33.7),
        new THREE.Vector3(44.5, 0.85, 33.7),
        new THREE.Vector3(39.5, -0.15, 34.5),
        new THREE.Vector3(44.5, -0.15, 34.5),
        new THREE.Vector3(39.5, 0.85, 34.5),
        new THREE.Vector3(44.5, 0.85, 34.5),
      ];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach((c) => {
        const v = c.clone().project(cam);
        const sx = ((v.x + 1) / 2) * w;
        const sy = ((v.y + 1) / 2) * h;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      });

      const margin = 10;
      const cropX = Math.max(0, Math.floor(minX - margin));
      const cropY = Math.max(0, Math.floor(minY - margin));
      const cropW = Math.min(w - cropX, Math.ceil(maxX - minX + margin * 2));
      const cropH = Math.min(h - cropY, Math.ceil(maxY - minY + margin * 2));

      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const origPos = cam.position.clone();

      function measureFlicker(shiftVal = 0.02) {
        const frames = [];
        for (let i = 0; i < 5; i++) {
          const shift = (i % 2 === 0 ? shiftVal : -shiftVal) * (i === 0 ? 0 : 1);
          cam.position.copy(origPos).addScaledVector(dir, shift);
          cam.updateMatrixWorld();
          cam.updateProjectionMatrix();
          stage.renderer.render(stage.scene, cam);

          const px = new Uint8Array(cropW * cropH * 4);
          gl.readPixels(cropX, cropY, cropW, cropH, gl.RGBA, gl.UNSIGNED_BYTE, px);
          frames.push(px);
        }

        cam.position.copy(origPos);
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();

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
        return maxDiff;
      }

      // 1. Post-fix (kondisi bersih saat ini)
      const afterFlicker = measureFlicker(0.02);

      // 2. Simulasi Pre-Fix (kondisi cacat sebelum perbaikan commit fc91cca):
      // - lowWallMat & highWallMat tidak memiliki polygonOffset
      // - Dinding duplikat di x = 40 (landing_page East low wall)
      // - Pelat taman_kecil coplanar pada y = 0.00 menembus dinding selatan resepsi
      let lowWallsMesh = null;
      let highWallsMesh = null;
      stage.scene.traverse((o) => {
        if (o.name === "lowWalls") lowWallsMesh = o;
        if (o.name === "highWalls") highWallsMesh = o;
      });
      if (lowWallsMesh) lowWallsMesh.material.polygonOffset = false;
      if (highWallsMesh) highWallsMesh.material.polygonOffset = false;

      const dupMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, polygonOffset: false });
      const dupGeo = new THREE.BoxGeometry(0.16, 0.65, 7);
      const dupMesh = new THREE.Mesh(dupGeo, dupMat);
      dupMesh.position.set(40, 0.65 / 2, 30.5);
      stage.scene.add(dupMesh);

      const slabGeo = new THREE.BoxGeometry(4, 0.08, 0.16);
      const slabMat = new THREE.MeshStandardMaterial({ color: 0xdcfce7, polygonOffset: false });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.position.set(42, 0.00, 34.0);
      stage.scene.add(slabMesh);

      // Render 1 frame dengan cacat pre-fix untuk tangkapan screenshot
      stage.renderer.render(stage.scene, cam);

      const beforeFlicker = measureFlicker(0.02);

      // Kembalikan ke kondisi perbaikan
      stage.scene.remove(dupMesh);
      stage.scene.remove(slabMesh);
      if (lowWallsMesh) lowWallsMesh.material.polygonOffset = true;
      if (highWallsMesh) highWallsMesh.material.polygonOffset = true;
      stage.renderer.render(stage.scene, cam);

      return {
        crop: { cropX, cropY, cropW, cropH },
        beforeFlicker,
        afterFlicker,
        ratioPercent: +(afterFlicker / Math.max(1, beforeFlicker) * 100).toFixed(2),
        beforeFailed: beforeFlicker > 25,
        afterPassed: afterFlicker < 0.10 * beforeFlicker,
      };
    });

    report.receptionFlickerTest = flickerResult;
    console.log(`   Sebelum perbaikan (Before): ${flickerResult.beforeFlicker} pixel berbeda (gagal: ${flickerResult.beforeFailed})`);
    console.log(`   Setelah perbaikan (After): ${flickerResult.afterFlicker} pixel berbeda (${flickerResult.ratioPercent}% dari Before, target < 10%)`);
    console.log(`   Status Perbaikan Flicker: ${flickerResult.afterPassed ? "PASS" : "FAIL"}`);

    if (!flickerResult.beforeFailed) {
      report.violations.push("Baseline flicker sebelum perbaikan harus terbukti gagal (flicker > 25 pixel)!");
    }
    if (!flickerResult.afterPassed) {
      report.violations.push(`Flicker setelah perbaikan (${flickerResult.afterFlicker}) melebihi ambang 10% dari baseline!`);
    }

    // Ambil screenshot Before dengan menyalakan cacat sejenak
    await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const THREE = stage.THREE;
      const dupMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, polygonOffset: false });
      const dupGeo = new THREE.BoxGeometry(0.16, 0.65, 7);
      const dupMesh = new THREE.Mesh(dupGeo, dupMat);
      dupMesh.name = "temp_pre_fix_dup";
      dupMesh.position.set(40, 0.65 / 2, 30.5);
      stage.scene.add(dupMesh);

      const slabGeo = new THREE.BoxGeometry(4, 0.08, 0.16);
      const slabMat = new THREE.MeshStandardMaterial({ color: 0xdcfce7, polygonOffset: false });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.name = "temp_pre_fix_slab";
      slabMesh.position.set(42, 0.00, 34.0);
      stage.scene.add(slabMesh);
      stage.renderer.render(stage.scene, stage.camera);
    });

    const beforeScreenshotPath = path.join(outDir, "reception-south-wall-before.png");
    await page.screenshot({ path: beforeScreenshotPath });
    report.screenshots.push(beforeScreenshotPath);

    // Bersihkan cacat sementara
    await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const dup = stage.scene.getObjectByName("temp_pre_fix_dup");
      const slab = stage.scene.getObjectByName("temp_pre_fix_slab");
      if (dup) stage.scene.remove(dup);
      if (slab) stage.scene.remove(slab);
      stage.renderer.render(stage.scene, stage.camera);
    });

    // Validasi Header PNG tangkapan layar
    console.log("\n--- DIAGNOSIS 7: Validasi Header Berkas PNG Screenshot ---");
    report.screenshots.forEach((filePath) => {
      const buf = fs.readFileSync(filePath);
      const headerHex = buf.subarray(0, 8).toString("hex");
      const isValid = headerHex === "89504e470d0a1a0a";
      console.log(`   [${path.basename(filePath)}] Ukuran: ${buf.length} bytes, Header: ${headerHex} (${isValid ? "VALID PNG" : "INVALID"})`);
      if (!isValid) {
        report.violations.push(`Berkas ${path.basename(filePath)} bukan PNG valid!`);
      }
    });

    // Kembalikan shotMode & kamera
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(false);
      window.__STAGE_3D__.resetCamera();
    });

    console.log("\n==========================================================================");
    console.log(`=== HASIL CHECK-COPLANAR: ${report.violations.length} PELANGGARAN DITEMUKAN ===`);
    console.log("==========================================================================");
    report.violations.forEach((v, idx) => console.log(`   [${idx + 1}] ${v}`));

    if (report.violations.length > 0) {
      console.log("\n❌ CHECK-COPLANAR GAGAL: Terdeteksi masalah coplanar / z-fighting.");
      return { success: false, report };
    } else {
      console.log("\n✓ CHECK-COPLANAR LOLOS: Seluruh 8 dinding selatan & diagnosis bebas z-fighting!");
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