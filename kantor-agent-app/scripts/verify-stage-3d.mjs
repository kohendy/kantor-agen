import { chromium } from "playwright";
import fs from "fs";
import crypto from "crypto";
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

// Ensure verification_artifacts directory exists
if (!fs.existsSync("verification_artifacts")) {
  fs.mkdirSync("verification_artifacts", { recursive: true });
}

async function run() {
  console.log("=== STARTING FULL 3D & APPROVAL PANEL VERIFICATION ===");

  // 0a. Buat user E2E sementara lewat admin API
  const tempEmail = `e2e-${Date.now()}@kantor-agent.internal`;
  const tempPassword = crypto.randomBytes(24).toString("base64url");
  let tempUserId = null;

  console.log(`0a. Membuat akun E2E sementara: ${tempEmail}...`);
  const { data: tempUserData, error: tempUserErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (tempUserErr || !tempUserData?.user) {
    throw new Error(`Gagal membuat akun E2E sementara: ${tempUserErr?.message}`);
  }
  tempUserId = tempUserData.user.id;
  console.log(`    ✓ Akun E2E sementara berhasil dibuat (ID: ${tempUserId}).`);

  // 0b. SEED APPROVAL DATA: Ensure at least 8 pending approvals
  console.log("0b. Checking pending approvals in Supabase...");
  const { data: initialPending, error: fetchErr } = await supabase
    .from("approvals")
    .select("id, ringkasan, status")
    .eq("status", "pending");

  if (fetchErr) {
    throw new Error(`Failed to fetch approvals: ${fetchErr.message}`);
  }

  const existingCount = initialPending ? initialPending.length : 0;
  console.log(`   Found ${existingCount} existing pending approvals.`);

  const insertedIds = [];
  const needed = Math.max(0, 8 - existingCount);
  if (needed > 0) {
    console.log(`   Seeding ${needed} test pending approvals to reach 8...`);
    const testAgents = ["CLIO", "ATHENA", "ARGUS", "ZEUS"];
    const seedRows = Array.from({ length: needed }).map((_, i) => ({
      agent: testAgents[i % testAgents.length],
      ringkasan: `[TEST_E2E] Request persetujuan #${existingCount + i + 1} perbaikan PR #8`,
      status: "pending",
      dibuat: new Date(Date.now() - (8 - i) * 60000).toISOString(),
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("approvals")
      .insert(seedRows)
      .select("id");

    if (insertErr) {
      throw new Error(`Failed to seed approvals: ${insertErr.message}`);
    }
    insertedIds.push(...inserted.map((r) => r.id));
    console.log(`   Seeded ${insertedIds.length} approvals: IDs [${insertedIds.join(", ")}]`);
  }

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

  try {
    // 1. LOGIN & DASHBOARD LOAD
    console.log("1. Logging into dashboard...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', tempEmail);
    await page.fill('input[name="password"]', tempPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.goto("http://localhost:3000/?e2e=1", { waitUntil: "networkidle" });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 15000 });
    await page.waitForTimeout(1500);
    console.log("   Dashboard & 3D Stage loaded successfully.");

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

    // 2. VERIFIKASI APPROVAL LIST SCROLLING PADA 1440, 1024, DAN 390 PX
    console.log("2. Testing Approval List Scrolling on 1440, 1024, and 390 px...");
    const approvalResults = {};

    // 2a. Viewport 1440px (Desktop)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);
    const count1440 = await page.locator(".approval-panel .approval-item").count();
    const scrollInfo1440 = await page.evaluate(() => {
      const el = document.querySelector(".approval-panel-body .log-list");
      return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, isScrollable: el.scrollHeight > el.clientHeight } : null;
    });

    // Scroll to last item
    const lastItem1440 = page.locator(".approval-panel .approval-item").last();
    await lastItem1440.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const lastItemButtons1440 = {
      approveVisible: await lastItem1440.locator("button.approve-ok").isVisible(),
      rejectVisible: await lastItem1440.locator("button.approve-no").isVisible(),
    };
    await page.screenshot({ path: "verification_artifacts/approval_scroll_1440px.png" });
    console.log(`   1440px: count=${count1440}, scrollable=${scrollInfo1440?.isScrollable} (${scrollInfo1440?.scrollHeight}px / ${scrollInfo1440?.clientHeight}px), buttons=${JSON.stringify(lastItemButtons1440)}`);
    approvalResults.v1440 = { count: count1440, scrollInfo: scrollInfo1440, buttons: lastItemButtons1440 };

    // 2b. Viewport 1024px (Tablet)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(600);
    const count1024 = await page.locator(".approval-panel .approval-item").count();
    const scrollInfo1024 = await page.evaluate(() => {
      const el = document.querySelector(".approval-panel-body .log-list");
      return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, isScrollable: el.scrollHeight > el.clientHeight } : null;
    });
    const lastItem1024 = page.locator(".approval-panel .approval-item").last();
    await lastItem1024.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const lastItemButtons1024 = {
      approveVisible: await lastItem1024.locator("button.approve-ok").isVisible(),
      rejectVisible: await lastItem1024.locator("button.approve-no").isVisible(),
    };
    await page.screenshot({ path: "verification_artifacts/approval_scroll_1024px.png" });
    console.log(`   1024px: count=${count1024}, scrollable=${scrollInfo1024?.isScrollable} (${scrollInfo1024?.scrollHeight}px / ${scrollInfo1024?.clientHeight}px), buttons=${JSON.stringify(lastItemButtons1024)}`);
    approvalResults.v1024 = { count: count1024, scrollInfo: scrollInfo1024, buttons: lastItemButtons1024 };

    // 2c. Viewport 390px (Mobile)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    // Scroll dashboard to approval panel
    await page.locator(".approval-panel").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const count390 = await page.locator(".approval-panel .approval-item").count();
    const scrollInfo390 = await page.evaluate(() => {
      const el = document.querySelector(".approval-panel-body .log-list");
      return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, isScrollable: el.scrollHeight > el.clientHeight } : null;
    });
    const lastItem390 = page.locator(".approval-panel .approval-item").last();
    await lastItem390.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const lastItemButtons390 = {
      approveVisible: await lastItem390.locator("button.approve-ok").isVisible(),
      rejectVisible: await lastItem390.locator("button.approve-no").isVisible(),
    };
    await page.screenshot({ path: "verification_artifacts/approval_scroll_390px.png" });
    console.log(`   390px: count=${count390}, scrollable=${scrollInfo390?.isScrollable} (${scrollInfo390?.scrollHeight}px / ${scrollInfo390?.clientHeight}px), buttons=${JSON.stringify(lastItemButtons390)}`);
    approvalResults.v390 = { count: count390, scrollInfo: scrollInfo390, buttons: lastItemButtons390 };

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);

    // 3. PERSISTENSI CATATAN DI FULL FRAME SAAT DILIPAT & DIBUKA KEMBALI
    console.log("3. Testing Note Persistence in Full Frame Mode (collapse & expand)...");
    const fullFrameBtn = page.locator("button.stage-fullscreen-btn");
    await fullFrameBtn.click();
    await page.waitForSelector(".dash-grid.is-full-frame", { timeout: 5000 });
    await page.waitForTimeout(600);

    const testNoteText = "Uji persistensi catatan PR #8: tidak boleh hilang saat dilipat!";
    const firstNoteTextarea = page.locator(".approval-panel .approval-item textarea.approval-note").first();
    await firstNoteTextarea.fill(testNoteText);
    const filledValue = await firstNoteTextarea.inputValue();
    console.log("   Typed note:", filledValue);

    // Collapse panel
    const chevronBtn = page.locator(".approval-panel button.ff-chevron-btn");
    await chevronBtn.click();
    await page.waitForTimeout(400);

    const isCollapsedState = await page.evaluate(() => {
      const panel = document.querySelector(".approval-panel");
      const body = document.querySelector(".approval-panel-body");
      return {
        hasCollapsedClass: panel?.classList.contains("collapsed"),
        bodyDisplay: body ? window.getComputedStyle(body).display : null,
      };
    });
    console.log("   Panel collapsed state:", isCollapsedState);
    await page.screenshot({ path: "verification_artifacts/fullframe_approval_collapsed.png" });

    // Expand panel back
    await chevronBtn.click();
    await page.waitForTimeout(400);

    const restoredValue = await firstNoteTextarea.inputValue();
    console.log("   Restored note after expand:", restoredValue);
    const isNotePreserved = restoredValue === testNoteText;
    console.log("   Note text preserved exactly:", isNotePreserved);
    await page.screenshot({ path: "verification_artifacts/fullframe_approval_restored.png" });

    if (!isNotePreserved) {
      throw new Error("FAILED: Note was lost when ApprovalPanel was collapsed and reopened in Full Frame!");
    }

    // Exit Full Frame mode
    await fullFrameBtn.click();
    await page.waitForTimeout(600);
    console.log("   Exited Full Frame mode.");

    // 4. PROMPT V: ORBIT, ROTASI, ZOOM & REALTIME STATUS INVARIANCE
    console.log("4. Testing Orbit, Zoom & Realtime Status Invariance...");
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
    console.log("   Camera moved via orbit & zoom.");

    // Check realtime invariance
    const stateBeforeUpdate = await getCameraAndSceneState();
    console.log("   State BEFORE Supabase status change:");
    console.log("     Camera Pos:", JSON.stringify(stateBeforeUpdate.position));
    console.log("     Controls Target:", JSON.stringify(stateBeforeUpdate.target));
    console.log("     Scene UUID:", stateBeforeUpdate.sceneUuid);

    const startUpdate = Date.now();
    await supabase.from("agents").update({ status: "working" }).eq("nama", "CLIO");

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

    // Reset camera
    const resetBtn = page.locator("button.stage-reset-btn");
    await resetBtn.click({ noWaitAfter: true });
    await page.waitForTimeout(1600);

    // 5. PROMPT V: GATHERED MODE (MODE KUMPUL) INVARIANCE
    console.log("5. Testing Gathered Mode (Mode Kumpul) Invariance...");
    const meetingTag = page.locator(".room-tag3d:has-text('MEETING H+1')").first();
    await meetingTag.click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(1200);

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

    // 6. TOUCH EMULATION, MULTI-TOUCH / PINCH & POINTER CANCEL
    console.log("6. Testing Touch Emulation, Multi-Touch Pinch & Pointer Cancel...");
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

    // 6a. Single touch tap on Agent ATHENA
    console.log("   6a. Single touch tap on Agent (ATHENA)...");
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
    await touchPage.touchscreen.tap(athenaScreenPos.x, athenaScreenPos.y);
    await touchPage.waitForTimeout(600);
    const selAfterAgentTap = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
    const isAgentSelected = !!(selAfterAgentTap && selAfterAgentTap.type === "agent");
    console.log(`   Touch tap selected Agent correctly (${selAfterAgentTap?.id}):`, isAgentSelected);

    // 6b. Single touch tap on Room copy
    console.log("   6b. Single touch tap on Room (copy)...");
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
    await touchPage.touchscreen.tap(copyScreenPos.x, copyScreenPos.y);
    await touchPage.waitForTimeout(600);
    const selAfterRoomTap = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
    const isRoomSelected = !!(selAfterRoomTap && selAfterRoomTap.type === "room");
    console.log(`   Touch tap selected Room correctly (${selAfterRoomTap?.id}):`, isRoomSelected);

    // 6c. Single touch drag (> 5px threshold) does NOT trigger selection
    console.log("   6c. Single touch drag (> 5px threshold)...");
    const selectedBeforeDrag = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
    const dragStart = await touchPage.evaluate(() => {
      const rect = window.__STAGE_3D__.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + rect.width * 0.2, y: rect.top + rect.height * 0.2 };
    });
    await touchPage.mouse.move(dragStart.x, dragStart.y);
    await touchPage.mouse.down();
    await touchPage.mouse.move(dragStart.x + 80, dragStart.y - 40, { steps: 8 });
    await touchPage.mouse.up();
    await touchPage.waitForTimeout(600);
    const selectedAfterDrag = await touchPage.evaluate(() => window.__STAGE_3D__.getSelected());
    const isDragSelectionIgnored = JSON.stringify(selectedBeforeDrag) === JSON.stringify(selectedAfterDrag);
    console.log("   Drag did not trigger unwanted object selection:", isDragSelectionIgnored);

    // 6d. MULTI-TOUCH / PINCH SIMULATION
    console.log("   6d. Simulating Multi-Touch Pinch (> 1 pointer active)...");
    // Deselect all first by clicking empty background
    await touchPage.evaluate(() => {
      window.__STAGE_3D__.controls.domElement.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0 }));
    });
    await touchPage.waitForTimeout(300);

    const pinchTestResult = await touchPage.evaluate((pos) => {
      const canvas = document.querySelector("canvas.stage-3d-canvas");
      const initialSel = window.__STAGE_3D__.getSelected();

      // Pointer 1 down directly over ATHENA mesh screen coordinates
      const p1Down = new PointerEvent("pointerdown", {
        pointerId: 101,
        clientX: pos.x,
        clientY: pos.y,
        bubbles: true,
      });
      canvas.dispatchEvent(p1Down);

      const countAfterP1 = window.__STAGE_3D__.getActivePointerCount();

      // Pointer 2 down (pinch gesture second finger)
      const p2Down = new PointerEvent("pointerdown", {
        pointerId: 102,
        clientX: pos.x + 120,
        clientY: pos.y + 80,
        bubbles: true,
      });
      canvas.dispatchEvent(p2Down);

      const countAfterP2 = window.__STAGE_3D__.getActivePointerCount();

      // Move both pointers (pinch zoom)
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 101,
        clientX: pos.x - 20,
        clientY: pos.y - 20,
        bubbles: true,
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 102,
        clientX: pos.x + 140,
        clientY: pos.y + 100,
        bubbles: true,
      }));

      // Lift finger 2 first
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: 102,
        clientX: pos.x + 140,
        clientY: pos.y + 100,
        bubbles: true,
      }));

      const countAfterP2Up = window.__STAGE_3D__.getActivePointerCount();

      // Lift finger 1
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: 101,
        clientX: pos.x,
        clientY: pos.y,
        bubbles: true,
      }));

      const countFinal = window.__STAGE_3D__.getActivePointerCount();
      const finalSel = window.__STAGE_3D__.getSelected();

      return {
        initialSel,
        finalSel,
        countAfterP1,
        countAfterP2,
        countAfterP2Up,
        countFinal,
        selectionIgnored: JSON.stringify(initialSel) === JSON.stringify(finalSel),
      };
    }, athenaScreenPos);

    console.log("   Pinch test active pointer counts:", {
      p1Down: pinchTestResult.countAfterP1,
      p2Down: pinchTestResult.countAfterP2,
      p2Up: pinchTestResult.countAfterP2Up,
      final: pinchTestResult.countFinal,
    });
    console.log("   Pinch gesture ignored selection (no agent chosen):", pinchTestResult.selectionIgnored);

    if (!pinchTestResult.selectionIgnored) {
      throw new Error("FAILED: Multi-touch pinch triggered agent/room selection on pointerup!");
    }

    // 6e. POINTERCANCEL SIMULATION
    console.log("   6e. Simulating pointercancel event...");
    const cancelTestResult = await touchPage.evaluate((pos) => {
      const canvas = document.querySelector("canvas.stage-3d-canvas");
      const initialSel = window.__STAGE_3D__.getSelected();

      // Pointer down over ATHENA
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId: 201,
        clientX: pos.x,
        clientY: pos.y,
        bubbles: true,
      }));

      const countAfterDown = window.__STAGE_3D__.getActivePointerCount();

      // OS cancels pointer gesture (e.g. browser swipe or edge gesture)
      canvas.dispatchEvent(new PointerEvent("pointercancel", {
        pointerId: 201,
        clientX: pos.x,
        clientY: pos.y,
        bubbles: true,
      }));

      const countAfterCancel = window.__STAGE_3D__.getActivePointerCount();

      // Trailing pointerup shouldn't trigger selection even if emitted
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: 201,
        clientX: pos.x,
        clientY: pos.y,
        bubbles: true,
      }));

      const finalSel = window.__STAGE_3D__.getSelected();

      return {
        countAfterDown,
        countAfterCancel,
        selectionIgnored: JSON.stringify(initialSel) === JSON.stringify(finalSel),
      };
    }, athenaScreenPos);

    console.log("   Pointercancel active counts:", {
      down: cancelTestResult.countAfterDown,
      cancel: cancelTestResult.countAfterCancel,
    });
    console.log("   Pointercancel ignored selection:", cancelTestResult.selectionIgnored);

    if (!cancelTestResult.selectionIgnored) {
      throw new Error("FAILED: Pointercancel did not prevent object selection!");
    }

    await touchContext.close();

    // 7. MEMORY LEAK TEST: MOUNT / UNMOUNT 5 TIMES
    console.log("7. Testing Memory Leak (5 mount/unmount cycles)...");
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

    // 8. SUMMARY REPORT
    const summary = {
      approvalScrolling: {
        v1440: approvalResults.v1440,
        v1024: approvalResults.v1024,
        v390: approvalResults.v390,
      },
      notePersistence: {
        noteText: testNoteText,
        restoredValue,
        isPreserved: isNotePreserved,
      },
      cameraInvariance: {
        cameraPosBefore: stateBeforeUpdate.position,
        cameraPosAfter: stateAfterUpdate.position,
        cameraPosIdentical: isPosIdentical,
        cameraTargetBefore: stateBeforeUpdate.target,
        cameraTargetAfter: stateAfterUpdate.target,
        cameraTargetIdentical: isTargetIdentical,
        sceneUuidBefore: stateBeforeUpdate.sceneUuid,
        sceneUuidAfter: stateAfterUpdate.sceneUuid,
        sceneUuidIdentical: isSceneIdentical,
      },
      gatheredMode: {
        gatheredTargetBefore: gatheredPosBefore.target,
        gatheredTargetAfter: gatheredPosAfter.target,
        gatheredTargetIdentical: isGatheredTargetIdentical,
      },
      touchAndPinch: {
        touchTapAgentSelected: isAgentSelected,
        touchTapRoomSelected: isRoomSelected,
        touchDragSelectionIgnored: isDragSelectionIgnored,
        pinchSelectionIgnored: pinchTestResult.selectionIgnored,
        pointerCancelIgnored: cancelTestResult.selectionIgnored,
      },
      memoryInfo: {
        initialMemory: memInitial,
        finalMemory: memFinal,
        memoryStable,
      },
      realtimeLatencyMs: latencyMs,
      consoleErrors,
    };

    console.log("\n================ VERIFICATION SUMMARY NUMBERS ================");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=============================================================\n");
  } finally {
    if (tempUserId) {
      console.log(`Cleaning up temporary E2E user (${tempEmail})...`);
      await supabase.auth.admin.deleteUser(tempUserId).catch((e) => console.error("Gagal hapus user:", e));
      console.log("Cleanup user complete.");
    }
    // CLEANUP TEST DATA IN SUPABASE
    if (insertedIds.length > 0) {
      console.log(`Cleaning up ${insertedIds.length} seeded test approvals from Supabase...`);
      await supabase.from("approvals").delete().in("id", insertedIds);
      console.log("Cleanup complete.");
    }
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
