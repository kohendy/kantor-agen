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

async function testNightLive() {
  const tempEmail = `night-live-${Date.now()}@kantor-agent.internal`;
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
    await page.goto("http://localhost:3000/?e2e=1&demo=1&jam=22", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1000);

    const nightStats = await page.evaluate(async () => {
      const stage = window.__STAGE_3D__;
      stage.setHourOverride(22);

      // Wait 3 frames for daylight update to settle
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }

      let pointLightCount = 0;
      let hemiLight = null;
      let ambLight = null;
      let dir1 = null;
      stage.scene.traverse((o) => {
        if (o.isPointLight) pointLightCount++;
        if (o.isHemisphereLight) hemiLight = o;
        if (o.isAmbientLight) ambLight = o;
        if (o.isDirectionalLight && !dir1) dir1 = o;
      });

      const gl = stage.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;

      const agents = ["ATLAS", "ZEUS", "HERA", "ATHENA", "HEPHAESTUS", "HERMES", "THEIA", "CLIO", "HESTIA"];
      const results = [];
      agents.forEach((name) => {
        const pos = stage.getAgentPosition(name);
        const v = pos.clone().project(stage.camera);
        const sx = Math.floor(((v.x + 1) / 2) * w);
        const sy = Math.floor(((v.y + 1) / 2) * h);

        const patchSize = 5;
        const agentPixels = new Uint8Array(patchSize * patchSize * 4);
        gl.readPixels(sx - 2, sy + 18, patchSize, patchSize, gl.RGBA, gl.UNSIGNED_BYTE, agentPixels);

        const floorPixels = new Uint8Array(patchSize * patchSize * 4);
        gl.readPixels(sx - 25, sy - 10, patchSize, patchSize, gl.RGBA, gl.UNSIGNED_BYTE, floorPixels);

        function calcLuminance(pixels) {
          let totalLum = 0;
          let count = pixels.length / 4;
          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i] / 255;
            const g = pixels[i + 1] / 255;
            const b = pixels[i + 2] / 255;
            const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
            const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
            const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
            totalLum += 0.2126 * R + 0.7152 * G + 0.0722 * B;
          }
          return totalLum / count;
        }

        const lumA = calcLuminance(agentPixels);
        const lumF = calcLuminance(floorPixels);
        const cr = (Math.max(lumA, lumF) + 0.05) / (Math.min(lumA, lumF) + 0.05);
        results.push({ name, lumA: +lumA.toFixed(4), lumF: +lumF.toFixed(4), cr: +cr.toFixed(3) });
      });

      const avgCr = +(results.reduce((acc, r) => acc + r.cr, 0) / results.length).toFixed(3);
      const minCr = Math.min(...results.map((r) => r.cr));

      return {
        pointLightCount,
        hasHemiLight: !!hemiLight,
        hemiIntensity: hemiLight ? hemiLight.intensity : 0,
        ambIntensity: ambLight ? ambLight.intensity : 0,
        dir1Intensity: dir1 ? dir1.intensity : 0,
        results,
        avgCr,
        minCr,
        drawCalls: stage.getRenderInfo().calls,
      };
    });

    console.log("Night Live Stats:", nightStats);

    // Capture screenshot at 22:00
    const outDir = path.resolve(process.cwd(), "docs/design/polish2");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const screenPath = path.join(outDir, "night-lights-after.png");
    await page.screenshot({ path: screenPath });
    console.log("Captured night screenshot to:", screenPath);

  } finally {
    await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    await browser.close();
  }
}

testNightLive().catch(console.error);
