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

async function testTouchGestures() {
  const tempEmail = `touch-cdp-${Date.now()}@kantor-agent.internal`;
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
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("console", (m) => console.log("BROWSER LOG:", m.text()));

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1000);

    // Scroll canvas into view
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas.stage-3d-canvas");
      canvas?.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await page.waitForTimeout(300);

    const canvasBox = await page.evaluate(() => {
      const canvas = document.querySelector("canvas.stage-3d-canvas");
      const r = canvas.getBoundingClientRect();
      return {
        centerX: Math.floor(r.left + r.width / 2),
        centerY: Math.floor(r.top + r.height / 2),
        width: r.width,
        height: r.height,
      };
    });
    console.log("Canvas box:", canvasBox);

    const cdp = await context.newCDPSession(page);

    const initCam = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        pos: stage.camera.position.clone(),
        target: stage.controls.target.clone(),
        zoom: stage.camera.zoom,
      };
    });
    console.log("Initial camera state:", initCam);

    const cx = canvasBox.centerX;
    const cy = canvasBox.centerY;

    // 1. One-Finger Pan
    console.log("Testing 1-Finger Pan via CDP...");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: cy, id: 1 }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx - step * 10, y: cy - step * 8, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(200);

    const postPanCam = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        pos: stage.camera.position.clone(),
        target: stage.controls.target.clone(),
        zoom: stage.camera.zoom,
      };
    });
    console.log("Post 1-Finger Pan camera state:", postPanCam);
    const panDist = Math.hypot(
      postPanCam.target.x - initCam.target.x,
      postPanCam.target.z - initCam.target.z
    );
    console.log(`Pan distance moved: ${panDist.toFixed(4)} (PASS > 0.1: ${panDist > 0.1})`);

    // 2. Two-Finger Pinch (Zoom)
    console.log("Testing 2-Finger Pinch via CDP...");
    const prePinchZoom = postPanCam.zoom;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: cx - 40, y: cy, id: 1 },
        { x: cx + 40, y: cy, id: 2 },
      ],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: cx - 40 - step * 8, y: cy, id: 1 },
          { x: cx + 40 + step * 8, y: cy, id: 2 },
        ],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(200);

    const postPinchCam = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        pos: stage.camera.position.clone(),
        target: stage.controls.target.clone(),
        zoom: stage.camera.zoom,
      };
    });
    console.log("Post 2-Finger Pinch camera state:", postPinchCam);
    const zoomDiff = Math.abs(postPinchCam.zoom - prePinchZoom);
    console.log(`Zoom change: ${zoomDiff.toFixed(4)} (PASS > 0.05: ${zoomDiff > 0.05})`);

    // 3. Double-Tap < 350ms to Reset Camera
    console.log("Testing Double-Tap < 350ms to Reset Camera via CDP...");
    // Send all 4 touch messages back-to-back in the same WebSocket frame queue
    await Promise.all([
      cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      }),
      cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      }),
      cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      }),
      cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      }),
    ]);

    // Wait for reset animation
    await page.waitForTimeout(700);

    const postResetCam = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      return {
        pos: stage.camera.position.clone(),
        target: stage.controls.target.clone(),
        zoom: stage.camera.zoom,
      };
    });
    console.log("Post Double-Tap Reset camera state:", postResetCam);
    const targetResetDist = Math.hypot(
      postResetCam.target.x - initCam.target.x,
      postResetCam.target.z - initCam.target.z
    );
    const zoomResetDist = Math.abs(postResetCam.zoom - 1.0);
    console.log(`Reset verification: target dist to init = ${targetResetDist.toFixed(4)}, zoom diff from 1.0 = ${zoomResetDist.toFixed(4)} (PASS: ${targetResetDist < 0.1 && zoomResetDist < 0.05})`);

  } finally {
    await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    await browser.close();
  }
}

testTouchGestures().catch(console.error);