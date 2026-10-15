// tools/capture-polish1-screenshots.mjs
// Menangkap screenshot beresolusi murni 1280x800 untuk artefak Polish 1 di docs/design/polish1/
// Menguji dan memastikan header PNG (IHDR) secara tegas memiliki width=1280 dan height=800.

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

function assertPngDimensions(filePath, expectedW = 1280, expectedH = 800) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) {
    throw new Error(`File ${filePath} terlalu kecil untuk header PNG (${buf.length} bytes)`);
  }

  // Verifikasi signature PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) {
    throw new Error(`File ${filePath} bukan file PNG valid (signature mismatch)`);
  }

  // Chunk IHDR dimulai dari byte 12 ("IHDR")
  const ihdrType = buf.subarray(12, 16).toString("ascii");
  if (ihdrType !== "IHDR") {
    throw new Error(`File ${filePath} tidak memiliki chunk IHDR yang valid`);
  }

  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);

  if (w !== expectedW || h !== expectedH) {
    throw new Error(
      `Dimensi header PNG tidak sesuai! Harapan ${expectedW}x${expectedH}, didapat ${w}x${h} pada ${filePath}`
    );
  }

  return { w, h, size: buf.length };
}

async function captureAll() {
  console.log("===============================================================");
  console.log("=== PENGAMBILAN SCREENSHOT POLISH 1 (TRUE 1280x800) ===");
  console.log("===============================================================\n");

  const outDir = path.resolve(process.cwd(), "docs", "design", "polish1");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tempEmail = `polish-shot-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  console.log("1. Membuat akun pengujian...");
  const { data: tempUserData, error: tempUserErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (tempUserErr || !tempUserData?.user) {
    throw new Error(`Gagal membuat akun uji: ${tempUserErr?.message}`);
  }
  tempUserId = tempUserData.user.id;

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
    deviceScaleFactor: 1, // Memastikan 1:1 pixel murni (tanpa scaling retina)
  });

  const page = await context.newPage();

  try {
    console.log("2. Memuat aplikasi dan masuk ke Scene 3D...");
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1500);

    // Aktifkan shotMode murni
    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(true);
    });
    await page.waitForTimeout(300);

    const canvasLocator = page.locator("canvas.stage-3d-canvas");

    const shots = [
      {
        id: "01-agent-facing",
        title: "Arah Hadap Agen di Meja (HOME_FACE_BY_AGENT)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("riset");
          });
        },
      },
      {
        id: "02-coplanar-hr-advertiser",
        title: "Dinding HR & Layar Advertiser (Wall Offset >= 0.02, No Z-Fighting)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("advertiser");
          });
        },
      },
      {
        id: "03-reception-bottom-wall",
        title: "Dinding Selatan Resepsi & Lantai Taman Kecil (Batas Bersih z=34.08)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("resepsi");
          });
        },
      },
      {
        id: "04-sosmed-bay-placement",
        title: "Penempatan Meja Bay Sosmed (Margin >= 0.15 dari Dinding Luar)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("sosmed", true);
          });
        },
      },
      {
        id: "05-instance-desks-style",
        title: "Gaya Meja Instance Spesifik Ruangan (Riset / Advertiser Style)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("riset", true);
          });
        },
      },
      {
        id: "06-atrium-foliage",
        title: "Vegetasi Foliage Atrium (Pohon, Tanaman Pot, Bangku, Planter)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.focusRoom("atrium");
          });
        },
      },
      {
        id: "07-hr-queue-badge",
        title: "Badge Antrean HR di Atas Portal (Bebas Glitch Top-Left)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.setShotMode(true);
            window.__STAGE_3D__.focusRoom("hr");
            const badge = document.querySelector(".hr-queue-badge");
            if (badge) badge.classList.add("pulse");
          });
        },
      },
      {
        id: "08-office-overview-1280x800",
        title: "Pemandangan Keseluruhan Kantor Isometrik (44x36)",
        action: async () => {
          await page.evaluate(() => {
            window.__STAGE_3D__.setShotMode(true);
            window.__STAGE_3D__.resetCamera();
          });
        },
      },
    ];

    console.log("3. Menangkap tangkapan layar dan memvalidasi dimensi header PNG...\n");
    const results = [];

    for (const shot of shots) {
      await shot.action();
      await page.waitForTimeout(400);

      const filePath = path.join(outDir, `${shot.id}.png`);
      await canvasLocator.screenshot({ path: filePath });

      const headerInfo = assertPngDimensions(filePath, 1280, 800);
      console.log(`   ✓ [${shot.id}] ${shot.title}`);
      console.log(`     Path: ${filePath}`);
      console.log(`     Dimensi Header: ${headerInfo.w}x${headerInfo.h} px | Ukuran: ${headerInfo.size} bytes\n`);

      results.push({
        id: shot.id,
        title: shot.title,
        file: `${shot.id}.png`,
        width: headerInfo.w,
        height: headerInfo.h,
        size: headerInfo.size,
      });
    }

    console.log("===============================================================");
    console.log(`=== BERHASIL: 8/8 SCREENSHOT 1280x800 TERSIMPAN DI docs/design/polish1/ ===`);
    console.log("===============================================================");

    return results;
  } finally {
    if (tempUserId) {
      await supabase.auth.admin.deleteUser(tempUserId).catch(() => {});
    }
    await browser.close();
  }
}

captureAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  });
