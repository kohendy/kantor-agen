// tools/capture-dept-shots.mjs
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

function assertPngDimensions(filePath, expectedW = 1280, expectedH = 800) {
  const buf = fs.readFileSync(filePath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedW || h !== expectedH) {
    throw new Error(`Dimensi header PNG tidak sesuai: ${w}x${h}`);
  }
  return { w, h };
}

async function main() {
  const outDir = path.resolve(process.cwd(), "docs", "design", "polish1");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tempEmail = `dept-shot-${Date.now()}@kantor-agent.internal`;
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

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      window.__STAGE_3D__.setShotMode(true);
    });
    await page.waitForTimeout(300);

    const depts = [
      { id: "dept-sosmed", room: "sosmed" },
      { id: "dept-creative", room: "creative" },
      { id: "dept-copy", room: "copy" },
      { id: "dept-landing-page", room: "landing_page" },
      { id: "dept-hr", room: "hr" },
      { id: "dept-riset", room: "riset" },
      { id: "dept-advertiser", room: "advertiser" },
    ];

    const canvas = page.locator("canvas.stage-3d-canvas");

    for (const d of depts) {
      console.log(`Fokus ke ruangan ${d.room}...`);
      await page.evaluate((r) => {
        window.__STAGE_3D__.focusRoom(r);
      }, d.room);
      await page.waitForTimeout(1200);

      const filePath = path.join(outDir, `${d.id}-1280x800.png`);
      await canvas.screenshot({ path: filePath });
      const dims = assertPngDimensions(filePath, 1280, 800);
      console.log(`   ✓ Tersimpan: ${filePath} (${dims.w}x${dims.h})`);
    }

  } finally {
    if (tempUserData?.user?.id) {
      await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    }
    await browser.close();
  }
}

main().catch(console.error);
