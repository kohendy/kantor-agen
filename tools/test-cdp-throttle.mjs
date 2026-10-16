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

async function testThrottle() {
  const tempEmail = `cdp-throttle-${Date.now()}@kantor-agent.internal`;
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1000);

    const cdp = await context.newCDPSession(page);

    // Initial normal state
    const initialQuality = await page.evaluate(() => {
      return window.__STAGE_3D__.getQualityState();
    });
    console.log("Initial quality:", initialQuality);

    // Apply CPU throttle rate 4
    console.log("Applying CPU throttle rate 4...");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // Wait and poll tier until it drops to low
    let lowReached = false;
    let lowQuality = null;
    const startThrottle = Date.now();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const q = await page.evaluate(() => window.__STAGE_3D__.getQualityState());
      if (q.tier === "low") {
        lowReached = true;
        lowQuality = q;
        console.log(`Tier dropped to low after ${Date.now() - startThrottle}ms:`, q);
        break;
      }
    }

    if (!lowReached) {
      const q = await page.evaluate(() => window.__STAGE_3D__.getQualityState());
      console.log("Tier did NOT drop to low:", q);
    }

    // Remove throttle rate (rate: 1)
    console.log("Removing CPU throttle (rate: 1)...");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // Wait and poll recovery to high
    let highReached = false;
    let highQuality = null;
    const startRecovery = Date.now();
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(250);
      const q = await page.evaluate(() => window.__STAGE_3D__.getQualityState());
      if (q.tier === "high") {
        highReached = true;
        highQuality = q;
        console.log(`Tier recovered to high after ${Date.now() - startRecovery}ms:`, q);
        break;
      }
    }

    if (!highReached) {
      const q = await page.evaluate(() => window.__STAGE_3D__.getQualityState());
      console.log("Tier did NOT recover to high. Final state:", q);
    }

  } finally {
    await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    await browser.close();
  }
}

testThrottle().catch(console.error);