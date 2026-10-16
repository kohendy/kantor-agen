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

async function testLayout() {
  const tempEmail = `layout-${Date.now()}@kantor-agent.internal`;
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

  const outDir = path.resolve(process.cwd(), "docs/design/polish2");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    // 1. Desktop 1440x900
    const ctx1440 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p1440 = await ctx1440.newPage();
    await p1440.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
    await p1440.fill('input[name="email"]', tempEmail);
    await p1440.fill('input[name="password"]', tempPassword);
    await p1440.click('button[type="submit"]');
    await p1440.waitForFunction(() => window.location.pathname === "/", null, { timeout: 60000 });
    await p1440.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await p1440.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await p1440.waitForTimeout(1000);

    const m1440 = await p1440.evaluate(() => {
      const stageMap = document.querySelector(".stage-map-area");
      const dashGrid = document.querySelector(".dash-grid");
      const stageCard = document.querySelector(".stage-card");
      const detail = document.querySelector(".stage-card .detail");
      const resetBtn = document.querySelector(".stage-reset-btn");
      const rMap = stageMap.getBoundingClientRect();
      const rDetail = detail?.getBoundingClientRect();
      const rReset = resetBtn?.getBoundingClientRect();

      // Check overlap between detail (hint box) and resetBtn (home button)
      let overlapsReset = false;
      if (rDetail && rReset) {
        overlapsReset = !(
          rDetail.right < rReset.left ||
          rDetail.left > rReset.right ||
          rDetail.bottom < rReset.top ||
          rDetail.top > rReset.bottom
        );
      }

      return {
        dashGridW: dashGrid.offsetWidth,
        stageMapW: stageMap.offsetWidth,
        stageMapH: stageMap.offsetHeight,
        stageCardW: stageCard.offsetWidth,
        stageCardH: stageCard.offsetHeight,
        overlapsReset,
        widthRatio: (stageMap.offsetWidth / dashGrid.offsetWidth),
      };
    });

    console.log("1440x900 Layout:", m1440);
    await p1440.screenshot({ path: path.join(outDir, "dashboard-desktop-1440.png") });
    const authStorage = await ctx1440.storageState();
    await ctx1440.close();

    // 2. Desktop 1280x720
    const ctx1280 = await browser.newContext({ viewport: { width: 1280, height: 720 }, storageState: authStorage });
    const p1280 = await ctx1280.newPage();
    await p1280.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await p1280.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await p1280.waitForTimeout(1000);

    const m1280 = await p1280.evaluate(() => {
      const stageMap = document.querySelector(".stage-map-area");
      const dashGrid = document.querySelector(".dash-grid");
      const detail = document.querySelector(".stage-card .detail");
      const resetBtn = document.querySelector(".stage-reset-btn");
      const rDetail = detail?.getBoundingClientRect();
      const rReset = resetBtn?.getBoundingClientRect();

      let overlapsReset = false;
      if (rDetail && rReset) {
        overlapsReset = !(
          rDetail.right < rReset.left ||
          rDetail.left > rReset.right ||
          rDetail.bottom < rReset.top ||
          rDetail.top > rReset.bottom
        );
      }

      return {
        dashGridW: dashGrid.offsetWidth,
        stageMapW: stageMap.offsetWidth,
        stageMapH: stageMap.offsetHeight,
        overlapsReset,
        widthRatio: (stageMap.offsetWidth / dashGrid.offsetWidth),
      };
    });

    console.log("1280x720 Layout:", m1280);
    await p1280.screenshot({ path: path.join(outDir, "dashboard-desktop-1280.png") });

    // Test dismissing hint box by clicking canvas or dismiss button
    console.log("Testing hint box dismissal on 1280...");
    await p1280.click(".hint-dismiss-btn");
    await p1280.waitForTimeout(200);
    const hintCollapsedState = await p1280.evaluate(() => {
      const detail = document.querySelector(".stage-card .detail");
      const pillBtn = document.querySelector(".hint-pill-btn");
      return {
        isCollapsed: detail?.classList.contains("is-hint-collapsed"),
        pillBtnExists: !!pillBtn,
        detailHeight: detail?.offsetHeight,
      };
    });
    console.log("Hint collapsed state:", hintCollapsedState);
    await ctx1280.close();

    // 3. Mobile 390x844
    const ctx390 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      storageState: authStorage,
    });
    const p390 = await ctx390.newPage();
    await p390.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded" });
    await p390.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await p390.waitForTimeout(1000);

    const m390 = await p390.evaluate(() => {
      const stageMap = document.querySelector(".stage-map-area");
      const canvas = document.querySelector("canvas.stage-3d-canvas");
      return {
        stageMapH: stageMap.offsetHeight,
        canvasH: canvas.offsetHeight,
      };
    });
    console.log("Mobile 390 Layout:", m390);
    await p390.screenshot({ path: path.join(outDir, "mobile-view-390.png") });
    await ctx390.close();

  } finally {
    await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    await browser.close();
  }
}

testLayout().catch(console.error);
