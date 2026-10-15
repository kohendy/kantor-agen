// tools/test-choreo-facing.mjs
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

async function main() {
  const tempEmail = `choreo-test-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");

  const { data: tempUserData } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

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

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(2000);

    // Initial rotations
    console.log("=== 1. ROTASI MESH SAAT INISIALISASI ===");
    const initRot = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const res = {};
      agents.forEach(a => {
        const r = stage.getAgentRotation(a.name);
        res[a.name] = r ? +(r.y.toFixed(3)) : null;
      });
      return res;
    });
    console.log(JSON.stringify(initRot, null, 2));

    // Jalankan choreography rapat (start meeting -> end meeting dengan gerak nyata / normal)
    console.log("\n=== 2. MENJALANKAN KOREOGRAFI RAPAT (BUBAR & KEMBALI KE MEJA) ===");
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(true); // teleport ke kursi rapat
    });
    await page.waitForTimeout(1000);

    const duringMeetingRot = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const res = {};
      agents.forEach(a => {
        const r = stage.getAgentRotation(a.name);
        res[a.name] = r ? +(r.y.toFixed(3)) : null;
      });
      return res;
    });
    console.log("Rotasi saat di ruang rapat (menghadap pusat meja rapat):");
    console.log(JSON.stringify(duringMeetingRot, null, 2));

    // Sekarang bubarkan rapat dengan endMeetingNow(false) sehingga agen berjalan kembali ke mejanya
    console.log("\n=== 3. BUBARKAN RAPAT DENGAN GERAKAN BERJALAN NORMAL ===");
    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(false);
    });

    // Tunggu sampai semua agen selesai berjalan kembali ke mejanya (maks 45 detik)
    const startTime = Date.now();
    let allBack = false;
    while (Date.now() - startTime < 45000) {
      await page.waitForTimeout(500);
      const isBusy = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const nonAtlasNames = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS", "HERA", "HEPHAESTUS", "HERMES"
        ];
        return nonAtlasNames.some(n => stage.isChoreoBusy(n));
      });
      if (!isBusy) {
        allBack = true;
        break;
      }
    }
    console.log(`Semua agen selesai kembali ke meja: ${allBack} (${Date.now() - startTime} ms)`);
    await page.waitForTimeout(1000);

    console.log("\n=== 4. ROTASI MESH NYATA SETELAH CHOREOGRAPHY SELESAI ===");
    const afterChoreoRot = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const res = {};
      agents.forEach(a => {
        const r = stage.getAgentRotation(a.name);
        res[a.name] = r ? +(r.y.toFixed(3)) : null;
      });
      return res;
    });
    console.log(JSON.stringify(afterChoreoRot, null, 2));

  } finally {
    if (tempUserData?.user?.id) {
      await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    }
    await browser.close();
  }
}

main().catch(console.error);
