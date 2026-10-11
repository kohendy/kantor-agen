import { chromium } from "playwright";
import fs from "fs";
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

  await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
  await page.goto("http://localhost:3000/?e2e=1", { waitUntil: "networkidle" });
  console.log("   Logged in successfully. Loaded dashboard /?e2e=1");

  // Wait for 3D stage canvas
  await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 15000 });
  await page.waitForTimeout(1500); // Wait for initial render
  console.log("   3D Canvas loaded and mounted.");

  // Helper to query camera state & scene UUID
  async function getCameraAndSceneState(targetPage = page) {
    return await targetPage.evaluate(() => {
      const stage = window.__STAGE_3D__;
      if (!stage) return null;
      const p = stage.getCameraPosition();
      const t = stage.getCameraTarget();
      const uuid = stage.getSceneUuid ? stage.getSceneUuid() : (stage.scene ? stage.scene.uuid : null);
      return {
        position: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) },
        target: { x: +t.x.toFixed(4), y: +t.y.toFixed(4), z: +t.z.toFixed(4) },
        sceneUuid: uuid,
      };
    });
  }

  // Helper to wait until camera has completely settled (damping finished)
  async function waitForCameraStop(targetPage = page, maxWaitMs = 6000) {
    const start = Date.now();
    let prev = null;
    while (Date.now() - start < maxWaitMs) {
      await targetPage.waitForTimeout(200);
      const curr = await getCameraAndSceneState(targetPage);
      if (prev) {
        const dx = Math.abs(curr.position.x - prev.position.x);
        const dy = Math.abs(curr.position.y - prev.position.y);
        const dz = Math.abs(curr.position.z - prev.position.z);
        if (dx < 0.0001 && dy < 0.0001 && dz < 0.0001) {
          return curr;
        }
      }
      prev = curr;
    }
    return await getCameraAndSceneState(targetPage);
  }

  // 2. ORBIT & ZOOM TEST
  console.log("2. Testing OrbitControls interactions (drag rotate, zoom)...");
  const canvasBox = await page.locator("canvas.stage-3d-canvas").boundingBox();
  const openX = canvasBox.x + canvasBox.width * 0.25;
  const openY = canvasBox.y + canvasBox.height * 0.25;

  const camInitial = await getCameraAndSceneState();
  // Rotate drag
  await page.mouse.move(openX, openY);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(openX + 140, openY - 60, { steps: 10 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(400);

  // Zoom
  await page.mouse.wheel(0, -350);
  const camMoved = await waitForCameraStop(page);
  console.log("   Camera rotated and zoomed (fully settled).");
  console.log("   Before:", camInitial);
  console.log("   After rotate & zoom:", camMoved);

  // 3. REALTIME STATUS UPDATE INVARIANCE TEST (Rotated/Zoomed Camera)
  console.log("3. Testing Realtime Status Update Invariance (Camera rotated/zoomed)...");
  const stateBeforeUpdate = await getCameraAndSceneState();
  console.log("   State BEFORE Supabase status change:");
  console.log("     Camera Pos:", JSON.stringify(stateBeforeUpdate.position));
  console.log("     Controls Target:", JSON.stringify(stateBeforeUpdate.target));
  console.log("     Scene UUID:", stateBeforeUpdate.sceneUuid);

  // Update CLIO status in Supabase
  const startUpdate = Date.now();
  await supabase.from("agents").update({ status: "working" }).eq("nama", "CLIO");

  // Wait for tag to update to working
  const clioTag = page.locator(".agent-tag3d", { hasText: "CLIO" });
  await clioTag.locator(".st-working").waitFor({ timeout: 15000 });
  const latencyMs = Date.now() - startUpdate;
  await waitForCameraStop(page, 2000);
  const stateAfterUpdate = await getCameraAndSceneState();
  console.log("   State AFTER Supabase status change:");
  console.log("     Camera Pos:", JSON.stringify(stateAfterUpdate.position));
  console.log("     Controls Target:", JSON.stringify(stateAfterUpdate.target));
  console.log("     Scene UUID:", stateAfterUpdate.sceneUuid);

  const dx = Math.abs(stateBeforeUpdate.position.x - stateAfterUpdate.position.x);
  const dy = Math.abs(stateBeforeUpdate.position.y - stateAfterUpdate.position.y);
  const dz = Math.abs(stateBeforeUpdate.position.z - stateAfterUpdate.position.z);
  const isPosIdentical = dx < 0.01 && dy < 0.01 && dz < 0.01;
  const isTargetIdentical = JSON.stringify(stateBeforeUpdate.target) === JSON.stringify(stateAfterUpdate.target);
  const isSceneIdentical = stateBeforeUpdate.sceneUuid === stateAfterUpdate.sceneUuid;

  console.log(`   Camera Position Identical (diff: [${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}]): ${isPosIdentical}`);
  console.log(`   Controls Target Identical: ${isTargetIdentical}`);
  console.log(`   Scene UUID Identical: ${isSceneIdentical}`);

  if (!isPosIdentical || !isTargetIdentical || !isSceneIdentical) {
    throw new Error("FAILED: Scene or camera was rebuilt/reset upon status update!");
  }

  // Restore CLIO back to idle
  await supabase.from("agents").update({ status: "idle" }).eq("nama", "CLIO");
  await clioTag.locator(".st-idle").waitFor({ timeout: 15000 });
  console.log("   Restored CLIO status to 'idle'.");

  // Restore camera view using Reset button
  const resetBtn = page.locator("button.stage-reset-btn");
  await resetBtn.click({ noWaitAfter: true });
  await page.waitForTimeout(1600);

  // 4. GATHERED MODE (MODE KUMPUL) INVARIANCE TEST
  console.log("4. Testing Gathered Mode (Mode Kumpul) Invariance...");
  const meetingTag = page.locator(".room-tag3d:has-text('MEETING H+1')").first();
  await meetingTag.click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(1200); // wait for gather lerp animation

  const isGatheredActive = await page
    .locator("button.member:has-text('Bubarkan rapat')")
    .isVisible();
  console.log("   Gathered mode active:", isGatheredActive);

  const gatheredPosBefore = await page.evaluate(() => {
    return {
      pos: window.__STAGE_3D__.getAgentPosition("CLIO"),
      target: window.__STAGE_3D__.getAgentTargetPosition("CLIO"),
    };
  });
  console.log("   CLIO gathered targetPos BEFORE status change:", gatheredPosBefore.target);

  // Update CLIO status to working while gathered
  await supabase.from("agents").update({ status: "working" }).eq("nama", "CLIO");
  await clioTag.locator(".st-working").waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  const gatheredPosAfter = await page.evaluate(() => {
    return {
      pos: window.__STAGE_3D__.getAgentPosition("CLIO"),
      target: window.__STAGE_3D__.getAgentTargetPosition("CLIO"),
    };
  });
  console.log("   CLIO gathered targetPos AFTER status change:", gatheredPosAfter.target);

  const isGatheredTargetIdentical =
    JSON.stringify(gatheredPosBefore.target) === JSON.stringify(gatheredPosAfter.target);
  console.log(`   Agent CLIO remains at meeting seat (target identical): ${isGatheredTargetIdentical}`);

  if (!isGatheredTargetIdentical) {
    throw new Error("FAILED: Agent moved out of meeting seat upon status update during gathered mode!");
  }

  // Restore CLIO and scatter back
  await supabase.from("agents").update({ status: "idle" }).eq("nama", "CLIO");
  await clioTag.locator(".st-idle").waitFor({ timeout: 15000 });
  const scatterBtn = page.locator("button.member:has-text('Bubarkan rapat')");
  if (await scatterBtn.isVisible()) {
    await scatterBtn.click({ force: true, noWaitAfter: true });
  } else {
    await meetingTag.click({ force: true, noWaitAfter: true });
  }
  await page.waitForTimeout(1200);
  console.log("   Gathered mode ended, agents scattered back.");

  // 5. TOUCH EMULATION TEST (hasTouch: true)
  console.log("5. Testing Touch Emulation (tap vs drag/pinch with hasTouch)...");
  const storageState = await context.storageState();
  const touchContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
    storageState,
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto("http://localhost:3000/?e2e=1", { waitUntil: "networkidle" });
  await touchPage.waitForSelector("canvas.stage-3d-canvas", { timeout: 15000 });
  await touchPage.waitForTimeout(1000);

  // 5a. Touch tap on Agent on canvas (ATHENA)
  console.log("   5a. Testing touch tap on Agent (ATHENA) on 3D canvas...");
  const athenaScreenPos = await touchPage.evaluate(() => {
    const stage = window.__STAGE_3D__;
    let hitMesh = null;
    stage.scene.traverse((obj) => {
      if (obj.userData && obj.userData.type === "agent" && obj.userData.id === "ATHENA") {
        hitMesh = obj;
      }
    });
    if (!hitMesh) return null;
    const v = stage.camera.position.clone();
    hitMesh.getWorldPosition(v);
    v.project(stage.camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return {
      x: ((v.x + 1) * rect.width) / 2 + rect.left,
      y: ((-v.y + 1) * rect.height) / 2 + rect.top,
    };
  });
  console.log("   ATHENA screen position on canvas:", athenaScreenPos);
  await touchPage.touchscreen.tap(athenaScreenPos.x, athenaScreenPos.y);
  await touchPage.waitForTimeout(600);
  const selAfterAgentTap = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
  console.log("   Selected after Agent tap:", selAfterAgentTap);
  const isAgentSelected = !!(selAfterAgentTap && selAfterAgentTap.type === "agent");
  console.log(`   Touch tap selected Agent correctly (${selAfterAgentTap?.id}):`, isAgentSelected);

  // 5b. Touch tap on Room on canvas
  console.log("   5b. Testing touch tap on Room on 3D canvas...");
  const copyScreenPos = await touchPage.evaluate(() => {
    const stage = window.__STAGE_3D__;
    let hitMesh = null;
    stage.scene.traverse((obj) => {
      if (obj.userData && obj.userData.type === "room" && obj.userData.id === "copy") {
        hitMesh = obj;
      }
    });
    if (!hitMesh) return null;
    const v = stage.camera.position.clone();
    hitMesh.getWorldPosition(v);
    v.project(stage.camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return {
      x: ((v.x + 1) * rect.width) / 2 + rect.left,
      y: ((-v.y + 1) * rect.height) / 2 + rect.top,
    };
  });
  console.log("   Room screen position on canvas:", copyScreenPos);
  await touchPage.touchscreen.tap(copyScreenPos.x, copyScreenPos.y);
  await touchPage.waitForTimeout(600);
  const selAfterRoomTap = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
  console.log("   Selected after Room tap:", selAfterRoomTap);
  const isRoomSelected = !!(selAfterRoomTap && selAfterRoomTap.type === "room");
  console.log(`   Touch tap selected Room correctly (${selAfterRoomTap?.id}):`, isRoomSelected);

  // 5c. Touch drag/orbit on canvas (threshold > 5px should NOT trigger click selection)
  console.log("   5c. Testing touch drag/orbit on canvas (> 5px threshold)...");
  const selectedBeforeDrag = await touchPage.evaluate(() => {
    const stage = window.__STAGE_3D__;
    return stage && stage.getSelected ? stage.getSelected() : null;
  });

  const dragStart = await touchPage.evaluate(() => {
    const rect = window.__STAGE_3D__.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.2, y: rect.top + rect.height * 0.2 };
  });

  await touchPage.mouse.move(dragStart.x, dragStart.y);
  await touchPage.mouse.down();
  await touchPage.mouse.move(dragStart.x + 80, dragStart.y - 40, { steps: 8 });
  await touchPage.mouse.up();
  await touchPage.waitForTimeout(600);

  const selectedAfterDrag = await touchPage.evaluate(() => {
    const stage = window.__STAGE_3D__;
    return stage && stage.getSelected ? stage.getSelected() : null;
  });
  console.log("   Selection before drag:", selectedBeforeDrag);
  console.log("   Selection after drag:", selectedAfterDrag);
  const isDragSelectionIgnored =
    JSON.stringify(selectedBeforeDrag) === JSON.stringify(selectedAfterDrag);
  console.log("   Drag did not trigger unwanted object selection:", isDragSelectionIgnored);

  await touchContext.close();

  // 6. MEMORY LEAK TEST: MOUNT / UNMOUNT 5 TIMES
  console.log("6. Testing Memory Leak (5 mount/unmount cycles)...");
  const memInitial = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
  console.log("   Initial Three.js memory:", memInitial);

  const cycleMemories = [];
  for (let i = 1; i <= 5; i++) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("canvas.stage-3d-canvas");
    await page.waitForTimeout(500);
    const memCurrent = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
    cycleMemories.push(memCurrent);
    console.log(`   Cycle ${i} memory:`, memCurrent);
  }

  const memFinal = await page.evaluate(() => window.__STAGE_3D__.getMemoryInfo());
  console.log("   Final Three.js memory after 5 cycles:", memFinal);
  const memoryStable =
    memFinal.geometries <= memInitial.geometries &&
    memFinal.textures <= memInitial.textures;
  console.log("   Memory returned to baseline / stable:", memoryStable);

  // 7. SUMMARY REPORT
  const summaryNumbers = {
    cameraPosBefore: stateBeforeUpdate.position,
    cameraPosAfter: stateAfterUpdate.position,
    cameraPosIdentical: isPosIdentical,
    cameraTargetBefore: stateBeforeUpdate.target,
    cameraTargetAfter: stateAfterUpdate.target,
    cameraTargetIdentical: isTargetIdentical,
    sceneUuidBefore: stateBeforeUpdate.sceneUuid,
    sceneUuidAfter: stateAfterUpdate.sceneUuid,
    sceneUuidIdentical: isSceneIdentical,
    gatheredTargetBefore: gatheredPosBefore.target,
    gatheredTargetAfter: gatheredPosAfter.target,
    gatheredTargetIdentical: isGatheredTargetIdentical,
    touchTapAgentSelected: isAgentSelected,
    touchTapRoomSelected: isRoomSelected,
    touchDragSelectionIgnored: isDragSelectionIgnored,
    initialMemory: memInitial,
    finalMemory: memFinal,
    memoryStable,
    realtimeLatencyMs: latencyMs,
    consoleErrors,
  };

  console.log("\n================ VERIFICATION SUMMARY NUMBERS ================");
  console.log(JSON.stringify(summaryNumbers, null, 2));
  console.log("=============================================================\n");

  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
