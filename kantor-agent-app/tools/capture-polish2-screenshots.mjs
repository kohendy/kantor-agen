// tools/capture-polish2-screenshots.mjs
// Pengambil artefak tangkapan layar untuk Polish 2 di docs/design/polish2/
// Menjamin ukuran dan header PNG (IHDR) valid sesuai dimensi spesifikasi.

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

export function assertPngDimensions(filePath, expectedW, expectedH) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) {
    throw new Error(`File ${filePath} terlalu kecil untuk header PNG (${buf.length} bytes)`);
  }
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) {
    throw new Error(`File ${filePath} bukan file PNG valid`);
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedW || h !== expectedH) {
    throw new Error(
      `Dimensi header PNG mismatch! Harapan ${expectedW}x${expectedH}, didapat ${w}x${h} pada ${filePath}`
    );
  }
  return { w, h, size: buf.length };
}

async function capture() {
  const mode = process.argv[2] || "before"; // "before" | "after" | "all"
  console.log(`=== PENGAMBILAN ARTEFAK POLISH 2: MODE '${mode.toUpperCase()}' ===\n`);

  const outDir = path.resolve(process.cwd(), "..", "docs", "design", "polish2");
  const localOutDir = path.resolve(process.cwd(), "docs", "design", "polish2");
  for (const d of [outDir, localOutDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  const tempEmail = `polish2-shot-${Date.now()}@kantor-agent.internal`;
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

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await desktopContext.newPage();
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });

    const cookies = await desktopContext.cookies();

    if (mode === "before" || mode === "all") {
      // 1. Overview Siang Sebelum (Canvas Saja 1280x800)
      console.log("Menangkap overview siang sebelum...");
      await page.goto("http://localhost:3000/?e2e=1&demo=1&shot=1&jam=12", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(2000);
      const canvas = await page.$("canvas.stage-3d-canvas");
      const shotBeforePath = path.join(outDir, "overview-siang-before.png");
      await canvas.screenshot({ path: shotBeforePath });
      assertPngDimensions(shotBeforePath, 1280, 800);
      fs.copyFileSync(shotBeforePath, path.join(localOutDir, "overview-siang-before.png"));
      console.log(`Saved: overview-siang-before.png (${fs.statSync(shotBeforePath).size} bytes)`);

      // 2. Lantai Departemen Sebelum (Canvas Saja 1280x800)
      console.log("Menangkap lantai departemen sebelum...");
      const deptShotBeforePath = path.join(outDir, "dept-floors-before.png");
      await canvas.screenshot({ path: deptShotBeforePath });
      assertPngDimensions(deptShotBeforePath, 1280, 800);
      fs.copyFileSync(deptShotBeforePath, path.join(localOutDir, "dept-floors-before.png"));
      console.log(`Saved: dept-floors-before.png (${fs.statSync(deptShotBeforePath).size} bytes)`);
    }

    if (mode === "after" || mode === "all") {
      console.log("\n--- Menangkap Artefak Setelah Perbaikan (AFTER) ---");

      // 1. Overview Siang After (Canvas Saja 1280x800, jam 12)
      console.log("1. Menangkap overview siang after (1280x800)...");
      await page.goto("http://localhost:3000/?e2e=1&demo=1&shot=1&jam=12", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(2000);
      let canvas = await page.$("canvas.stage-3d-canvas");
      const shotAfterPath = path.join(outDir, "overview-siang-after.png");
      await canvas.screenshot({ path: shotAfterPath });
      assertPngDimensions(shotAfterPath, 1280, 800);
      fs.copyFileSync(shotAfterPath, path.join(localOutDir, "overview-siang-after.png"));
      console.log(`Saved: overview-siang-after.png (${fs.statSync(shotAfterPath).size} bytes)`);

      // 2. Lantai Departemen After (Canvas Saja 1280x800, jam 12)
      console.log("2. Menangkap lantai departemen after (1280x800)...");
      const deptShotAfterPath = path.join(outDir, "dept-floors-after.png");
      await canvas.screenshot({ path: deptShotAfterPath });
      assertPngDimensions(deptShotAfterPath, 1280, 800);
      fs.copyFileSync(deptShotAfterPath, path.join(localOutDir, "dept-floors-after.png"));
      console.log(`Saved: dept-floors-after.png (${fs.statSync(deptShotAfterPath).size} bytes)`);

      // 3. Kolam Cahaya Decal Malam After (Canvas Saja 1280x800, jam 22)
      console.log("3. Menangkap kolam cahaya malam after (1280x800, jam 22)...");
      await page.goto("http://localhost:3000/?e2e=1&demo=1&shot=1&jam=22", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(2000);
      canvas = await page.$("canvas.stage-3d-canvas");
      const nightShotAfterPath = path.join(outDir, "night-lights-after.png");
      await canvas.screenshot({ path: nightShotAfterPath });
      assertPngDimensions(nightShotAfterPath, 1280, 800);
      fs.copyFileSync(nightShotAfterPath, path.join(localOutDir, "night-lights-after.png"));
      console.log(`Saved: night-lights-after.png (${fs.statSync(nightShotAfterPath).size} bytes)`);

      // 4. Dashboard Desktop 1440x900 (Full Viewport)
      console.log("4. Menangkap dashboard desktop (1440x900)...");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(1500);
      const dash1440Path = path.join(outDir, "dashboard-desktop-1440.png");
      await page.screenshot({ path: dash1440Path });
      assertPngDimensions(dash1440Path, 1440, 900);
      fs.copyFileSync(dash1440Path, path.join(localOutDir, "dashboard-desktop-1440.png"));
      console.log(`Saved: dashboard-desktop-1440.png (${fs.statSync(dash1440Path).size} bytes)`);

      // 5. Dashboard Desktop 1280x720 (Full Viewport)
      console.log("5. Menangkap dashboard desktop (1280x720)...");
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(1500);
      const dash1280Path = path.join(outDir, "dashboard-desktop-1280.png");
      await page.screenshot({ path: dash1280Path });
      assertPngDimensions(dash1280Path, 1280, 720);
      fs.copyFileSync(dash1280Path, path.join(localOutDir, "dashboard-desktop-1280.png"));
      console.log(`Saved: dashboard-desktop-1280.png (${fs.statSync(dash1280Path).size} bytes)`);

      // 6. Mobile View 390x844 (Full Viewport)
      console.log("6. Menangkap tampilan mobile (390x844)...");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
      await page.waitForTimeout(1500);
      const mobile390Path = path.join(outDir, "mobile-view-390.png");
      await page.screenshot({ path: mobile390Path });
      assertPngDimensions(mobile390Path, 390, 844);
      fs.copyFileSync(mobile390Path, path.join(localOutDir, "mobile-view-390.png"));
      console.log(`Saved: mobile-view-390.png (${fs.statSync(mobile390Path).size} bytes)`);

      console.log("\nSeluruh 6 tangkapan layar Polish 2 berhasil diverifikasi dengan header PNG valid!");
    }

    await desktopContext.close();
  } finally {
    await browser.close();
    if (tempUserId) {
      await supabase.auth.admin.deleteUser(tempUserId);
    }
    process.exit(0);
  }
}

capture()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
