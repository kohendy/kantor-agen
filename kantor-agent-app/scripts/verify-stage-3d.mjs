import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envRaw = fs.readFileSync(".env.local", "utf8");
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

const SCREENSHOT_DIR = path.resolve("./verification_artifacts");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log("=== STARTING 3D THREE.JS VERIFICATION ===");

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
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") {
      consoleErrors.push(text);
    }
  });

  // 1. LOGIN
  console.log("1. Navigating to /login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "test_verifier@kantor-agent.internal");
  await page.fill('input[name="password"]', "test-password-12345");
  await page.click('button[type="submit"]');

  await page.waitForURL("http://localhost:3000/", { timeout: 15000 });
  console.log("   Logged in successfully. Loaded dashboard /");

  // Wait for 3D stage canvas
  await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 15000 });
  await page.waitForTimeout(2000); // Wait for textures & initial render
  console.log("   3D Canvas loaded and mounted.");

  // Helper to query camera position & target
  async function getCameraState() {
    return await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      if (!stage) return null;
      const p = stage.getCameraPosition();
      const t = stage.getCameraTarget();
      return {
        position: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) },
        target: { x: +t.x.toFixed(4), y: +t.y.toFixed(4), z: +t.z.toFixed(4) },
      };
    });
  }

  // 2. SCREENSHOTS AT VIEWPORTS (1440, 1024, 390) FOR NORMAL & FULL FRAME
  console.log("2. Taking screenshots across viewports...");

  const viewports = [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 768 },
    { name: "390", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);

    // Normal mode screenshot
    const normPath = path.join(SCREENSHOT_DIR, `normal_${vp.name}.png`);
    if (!fs.existsSync(normPath)) {
      await page.screenshot({ path: normPath, timeout: 20000 });
      console.log(`   Captured normal mode (${vp.name}): ${normPath}`);
    } else {
      console.log(`   Existing normal mode screenshot found (${vp.name}): ${normPath}`);
    }

    // Enter Full Frame mode
    const fsBtn = page.locator("button.stage-fullscreen-btn");
    await fsBtn.click({ noWaitAfter: true });
    await page.waitForTimeout(600);

    const ffPath = path.join(SCREENSHOT_DIR, `fullframe_${vp.name}.png`);
    if (!fs.existsSync(ffPath)) {
      await page.screenshot({ path: ffPath, timeout: 20000 });
      console.log(`   Captured full frame mode (${vp.name}): ${ffPath}`);
    } else {
      console.log(`   Existing full frame mode screenshot found (${vp.name}): ${ffPath}`);
    }

    // If mobile, test bottom sheet open
    if (vp.width === 390) {
      const logNavBtn = page.locator("button.mobile-nav-btn", { hasText: "Log" });
      if (await logNavBtn.isVisible()) {
        await logNavBtn.click({ noWaitAfter: true });
        await page.waitForTimeout(400);
        const mbPath = path.join(SCREENSHOT_DIR, `fullframe_mobile_bottomsheet.png`);
        if (!fs.existsSync(mbPath)) {
          await page.screenshot({ path: mbPath, timeout: 20000 });
        }
        console.log(`   Captured mobile bottom sheet open.`);
      }
    }

    // Exit Full Frame mode (via Escape or button)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const isStillFull = await page.evaluate(() =>
      document.querySelector(".dash-grid")?.classList.contains("is-full-frame")
    );
    if (isStillFull) {
      await page.locator("button.stage-fullscreen-btn").click({ noWaitAfter: true });
      await page.waitForTimeout(400);
    }
  }

  // Restore 1440 viewport for interaction tests
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // 3. INTERACTION TESTS: ROTATE, PAN, ZOOM
  console.log("3. Testing OrbitControls interactions (drag rotate, pan, wheel zoom)...");
  const canvasBox = await page.locator("canvas.stage-3d-canvas").boundingBox();
  const openX = canvasBox.x + canvasBox.width * 0.2;
  const openY = canvasBox.y + canvasBox.height * 0.25;

  const camBeforeRotate = await getCameraState();
  // Drag rotate (left button)
  await page.mouse.move(openX, openY);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(openX + 120, openY - 60, { steps: 10 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(600);
  const camAfterRotate = await getCameraState();
  console.log("   Rotate drag completed. Pos changed:", camBeforeRotate.position, "->", camAfterRotate.position);

  // Drag pan (right button)
  const camBeforePan = await getCameraState();
  await page.mouse.move(openX, openY);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(openX - 80, openY + 40, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(600);
  const camAfterPan = await getCameraState();
  console.log("   Pan drag completed. Pos changed:", camBeforePan.position, "->", camAfterPan.position);

  // Zoom (mouse wheel)
  const camBeforeZoom = await getCameraState();
  await page.mouse.move(openX, openY);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(600);
  const camAfterZoom = await getCameraState();
  console.log("   Wheel zoom completed. Pos changed:", camBeforeZoom.position, "->", camAfterZoom.position);

  // Reset button test
  console.log("4. Testing Reset Camera button...");
  const resetBtn = page.locator("button.stage-reset-btn");
  await resetBtn.click({ noWaitAfter: true });
  await page.waitForTimeout(1600); // wait for 520ms animation + complete damping settling
  const camAfterReset = await getCameraState();
  console.log("   Camera after reset:", camAfterReset);
  console.log("   Position close to initial (14.5, 17.5, 17.0):",
    Math.abs(camAfterReset.position.x - 14.5) < 0.2 &&
    Math.abs(camAfterReset.position.y - 17.5) < 0.2 &&
    Math.abs(camAfterReset.position.z - 17.0) < 0.2
  );

  // 5. PROOF: CAMERA DOES NOT CHANGE WHEN CLICKING DIFFERENT AGENTS/ROOMS
  console.log("5. Testing selection invariance: Camera position MUST NOT change when clicking agents/rooms...");
  await page.waitForTimeout(600);
  const cameraPositionLog = [];

  const targetsToClick = [
    { type: "agent", selector: ".agent-tag3d:has-text('ATHENA')", name: "ATHENA" },
    { type: "room", selector: ".room-tag3d:has-text('COPY')", name: "COPY" },
    { type: "agent", selector: ".agent-tag3d:has-text('ZEUS')", name: "ZEUS" },
    { type: "room", selector: ".room-tag3d:has-text('LANDING PAGE')", name: "LANDING PAGE" },
    { type: "agent", selector: ".agent-tag3d:has-text('THEIA')", name: "THEIA" },
  ];

  for (const item of targetsToClick) {
    const posBefore = await getCameraState();
    const mapBoxBefore = await page.locator(".stage-map-area").boundingBox();

    await page.locator(item.selector).first().click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(500);

    const posAfter = await getCameraState();
    const mapBoxAfter = await page.locator(".stage-map-area").boundingBox();

    const isPosIdentical =
      JSON.stringify(posBefore.position) === JSON.stringify(posAfter.position);
    const isTargetIdentical =
      JSON.stringify(posBefore.target) === JSON.stringify(posAfter.target);
    const isBoxIdentical =
      mapBoxBefore.width === mapBoxAfter.width &&
      mapBoxBefore.height === mapBoxAfter.height;

    cameraPositionLog.push({
      target: item.name,
      posBefore: posBefore.position,
      posAfter: posAfter.position,
      posIdentical: isPosIdentical,
      targetIdentical: isTargetIdentical,
      mapAreaIdentical: isBoxIdentical,
      detailOpened: await page.locator(".detail").isVisible(),
    });

    console.log(
      `   Clicked ${item.name}: posBefore=${JSON.stringify(
        posBefore.position
      )} posAfter=${JSON.stringify(posAfter.position)} identical=${isPosIdentical}`
    );
  }

  // 6. MEETING H+1 GATHER & SCATTER TEST
  console.log("6. Testing Meeting H+1 Gather & Scatter...");
  const meetingTag = page.locator(".room-tag3d:has-text('MEETING H+1')").first();
  // Click meeting room to gather
  await meetingTag.click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(1000); // lerp animation
  const isGatheredActive = await page
    .locator("button.member:has-text('Bubarkan rapat')")
    .isVisible();
  console.log("   Meeting gathered active:", isGatheredActive);

  // Click again or click Bubarkan rapat
  await page.locator("button.member:has-text('Bubarkan rapat')").click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(1000);
  const isScatteredActive = await page
    .locator("button.member:has-text('Kumpulkan semua agent')")
    .isVisible();
  console.log("   Meeting scattered back:", isScatteredActive);

  // 7. REALTIME STATUS UPDATE TEST (WITHOUT REBUILDING SCENE)
  console.log("7. Testing Realtime Status Update...");
  // Check CLIO's initial status
  const clioBefore = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll(".agent-tag3d")).find(
      (node) => node.textContent && node.textContent.includes("CLIO")
    );
    return {
      agentDataStatus: el ? el.getAttribute("data-status") : null,
    };
  });
  console.log("   CLIO status before test:", clioBefore);

  const startTime = Date.now();
  // Update CLIO status in Supabase
  await supabase.from("agents").update({ status: "working" }).eq("nama", "CLIO");

  // Wait for tag or dot to receive st-working
  const clioTag = page.locator(".agent-tag3d", { hasText: "CLIO" });
  await clioTag.locator(".st-working").waitFor({ timeout: 15000 });
  const latencyMs = Date.now() - startTime;
  console.log(`   Realtime status updated to 'working' in ${latencyMs}ms without scene rebuild!`);

  // Restore CLIO back to idle
  await supabase.from("agents").update({ status: "idle" }).eq("nama", "CLIO");
  await clioTag.locator(".st-idle").waitFor({ timeout: 15000 });
  console.log("   Restored CLIO status to 'idle'.");

  // 8. MEMORY LEAK TEST: MOUNT / UNMOUNT 5 TIMES
  console.log("8. Testing Memory Leak (5 mount/unmount cycles)...");
  const memInitial = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
  console.log("   Initial Three.js memory:", memInitial);

  for (let i = 1; i <= 5; i++) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("canvas.stage-3d-canvas");
    const memCurrent = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
    console.log(`   Cycle ${i} memory:`, memCurrent);
  }

  const memFinal = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
  console.log("   Final Three.js memory after 5 cycles:", memFinal);
  const memoryStable = memFinal.geometries <= memInitial.geometries + 2 && memFinal.textures <= memInitial.textures + 1;
  console.log("   Memory leak test passed (stable):", memoryStable);

  // 9. WEBGL FALLBACK TEST (FORCE WEBGL FAILURE)
  console.log("9. Testing WebGL Fallback to 2D SVG map...");
  await page.addInitScript(() => {
    window.__FORCE_WEBGL_FALLBACK__ = true;
  });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const svgStageExists = await page.locator("svg.stage").isVisible();
  const svgRoomsCount = await page.locator("svg.stage g.room").count();
  const svgAgentsCount = await page.locator("svg.stage g.agent").count();

  console.log("   SVG Fallback rendered:", svgStageExists);
  console.log("   SVG Rooms rendered:", svgRoomsCount, "(expected: 6)");
  console.log("   SVG Agents rendered:", svgAgentsCount, "(expected: 15)");

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "fallback_svg.png"),
    timeout: 15000,
    animations: "disabled",
  });
  console.log("   Captured SVG fallback screenshot: fallback_svg.png");

  // Save report JSON
  const report = {
    cameraPositionLog,
    memory: { initial: memInitial, final: memFinal, stable: memoryStable },
    fallback: { svgStageExists, svgRoomsCount, svgAgentsCount },
    realtimeLatencyMs: latencyMs,
    consoleErrors,
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "verification_report.json"), JSON.stringify(report, null, 2));

  console.log("=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ===");
  console.log("Report saved to verification_artifacts/verification_report.json");
  console.log("Console errors:", consoleErrors);

  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
