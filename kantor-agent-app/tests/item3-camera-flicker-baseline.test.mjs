// tests/item3-camera-flicker-baseline.test.mjs
// Pengujian Side-by-Side readPixels Flicker Pre-Fix (7af3773~1) vs Post-Fix di bawah shift ±0.02
// Threshold diturunkan dari baseline (< 10% dari nilai pre-fix), menggantikan nilai sembarang 2500.
import path from "path";
import fs from "fs";
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

async function runTest() {
  console.log("==========================================================================");
  console.log("=== ITEM 3: UJI READPIXELS FLICKER PRE-FIX VS POST-FIX (SHIFT ±0.02)   ===");
  console.log("=== Threshold diturunkan dari baseline (< 10% pre-fix value)           ===");
  console.log("==========================================================================");

  const tempEmail = `flicker-test-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");

  const { data: tempUserData } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1500);

    // Fokus ke area geometri coplanar advertiser screen wall
    await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      stage.setShotMode(true);
      stage.controls.target.set(34.5, 0.8, 0.35);
      stage.camera.position.set(34.5 + 4, 0.8 + 4, 0.35 + 4);
      stage.camera.zoom = 4.0;
      stage.camera.updateProjectionMatrix();
      stage.camera.updateMatrixWorld();
    });
    await page.waitForTimeout(400);

    const flickerReport = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const gl = stage.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const dir = new stage.camera.position.constructor();
      stage.camera.getWorldDirection(dir);

      let advEm = null;
      stage.scene.traverse((obj) => {
        if (obj.name === "prop_em_advertiser_screen_wall_north") advEm = obj;
      });

      function measureFlicker(shiftAmount = 0.02) {
        const origPos = stage.camera.position.clone();
        const frames = [];

        for (let f = 0; f < 5; f++) {
          const shift = (f % 2 === 0 ? 1 : -1) * shiftAmount;
          stage.camera.position.copy(origPos).addScaledVector(dir, shift);
          stage.camera.updateMatrixWorld();
          stage.camera.updateProjectionMatrix();
          stage.renderer.render(stage.scene, stage.camera);

          const pixels = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          frames.push(pixels);
        }

        stage.camera.position.copy(origPos);
        stage.camera.updateMatrixWorld();
        stage.camera.updateProjectionMatrix();
        stage.renderer.render(stage.scene, stage.camera);

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

      // 1. Post-Fix (near=-50, far=150, emissive offset z=0.098)
      stage.camera.near = -50;
      stage.camera.far = 150;
      stage.camera.updateProjectionMatrix();
      const postFixDiff = measureFlicker(0.02);

      // 2. Pre-Fix Baseline (7af3773~1: near=-200, far=500, coplanar screen wall z=0.09)
      stage.camera.near = -200;
      stage.camera.far = 500;
      stage.camera.updateProjectionMatrix();
      if (advEm) {
        advEm.position.z -= 0.008; // kembalikan ke kondisi coplanar pre-fix
      }
      const baselineDiff = measureFlicker(0.02);

      // Restore
      if (advEm) {
        advEm.position.z += 0.008;
      }
      stage.camera.near = -50;
      stage.camera.far = 150;
      stage.camera.updateProjectionMatrix();

      return {
        bufferWidth: w,
        bufferHeight: h,
        shiftUnits: 0.02,
        baselineDiff,
        postFixDiff,
      };
    });

    const baseline = flickerReport.baselineDiff;
    const postFix = flickerReport.postFixDiff;
    const thresholdPct = 10.0;
    const maxAllowedPixels = Math.floor(baseline * (thresholdPct / 100));
    const passed = postFix <= maxAllowedPixels;
    const actualPct = +((postFix / baseline) * 100).toFixed(1);

    console.log(`\n--- HASIL PENGUKURAN READPIXELS FLICKER (Camera Shift: ±0.02 unit) ---`);
    console.table([
      {
        kondisi: "Pre-Fix Baseline (7af3773~1, near=-200/500, coplanar)",
        differingPixels: baseline,
        threshold: "-",
        status: "BASELINE",
      },
      {
        kondisi: "Post-Fix (Polish 1, near=-50/150, offset >= 0.02)",
        differingPixels: postFix,
        threshold: `<= ${maxAllowedPixels} (< 10% baseline)`,
        status: passed ? "PASS" : "FAIL",
      },
    ]);

    console.log(`\nDetail Perhitungan:`);
    console.log(`- Pre-Fix Baseline: ${baseline} pixels`);
    console.log(`- Threshold Diturunkan (< 10% baseline): <= ${maxAllowedPixels} pixels (bukan angka sembarang 2500)`);
    console.log(`- Post-Fix Terukur: ${postFix} pixels`);
    console.log(`- Rasio Pengurangan: ${actualPct}% dari baseline`);
    console.log(`- Status Kelulusan: ${passed ? "LULUS (PASS)" : "GAGAL (FAIL)"}`);

    if (!passed) {
      throw new Error(`Item 3 Gagal: postFix (${postFix} px) melebihi threshold < 10% baseline (${maxAllowedPixels} px)!`);
    }

    console.log("\n✅ ITEM 3 SUKSES MEMENUHI SELURUH KRITERIA SPESIFIKASI.");

  } finally {
    if (tempUserData?.user?.id) {
      await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    }
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
