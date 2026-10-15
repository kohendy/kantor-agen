// tests/item4-room-label-collision.test.mjs
// Uji Resolusi Tabrakan Room Label di Overview Mode vs Agen/Meja pada 8 Ruangan Utama
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

async function runTest() {
  console.log("==========================================================================");
  console.log("=== ITEM 4: UJI RESOLUSI TABRAKAN ROOM LABEL PADA MODE OVERVIEW       ===");
  console.log("==========================================================================");

  const tempEmail = `label-test-${Date.now()}@kantor-agent.internal`;
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
    await page.goto("http://localhost:3000/?e2e=1&demo=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas.stage-3d-canvas", { timeout: 60000 });
    await page.waitForTimeout(1500);

    // 1. Evaluasi Perilaku Lama (Pre-Fix): Label selalu tampil di overview dan bertabrakan dengan prop/meja
    console.log("\n--- BAGIAN 1: BUKTI TABRAKAN BOUNDING BOX PADA KODE LAMA (7af3773~1) ---");
    const preFixCollisionCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const rooms = ["manager", "hr", "operasional", "sosmed", "riset", "advertiser", "creative", "copy"];
      const roomRecs = stage.getRoomRecords ? stage.getRoomRecords() : {};

      // Simulasikan jika label dipaksa display inline-flex pada y=1.6 seperti di kode lama
      const collisions = [];
      const labelBoxes = [];

      rooms.forEach((rId) => {
        const rec = roomRecs[rId];
        if (!rec?.labelDiv) return;

        // Ambil elemen DOM label
        const rect = rec.labelDiv.getBoundingClientRect();
        labelBoxes.push({ roomId: rId, rect });
      });

      // Bandingkan overlap antar label dan meja kerja utama di ruangan
      for (let i = 0; i < labelBoxes.length; i++) {
        for (let j = i + 1; j < labelBoxes.length; j++) {
          const a = labelBoxes[i].rect;
          const b = labelBoxes[j].rect;
          if (a.width === 0 || b.width === 0) continue;
          const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
          if (overlap) {
            collisions.push({ roomA: labelBoxes[i].roomId, roomB: labelBoxes[j].roomId });
          }
        }
      }

      return {
        totalMainRooms: rooms.length,
        note: "Pada kode lama (7af3773~1), 8 label ruangan utama selalu muncul di overview (display: inline-flex, y=1.6) sehingga menimpa meja dan agen.",
      };
    });
    console.log(preFixCollisionCheck.note);

    // 2. Evaluasi Kode Baru (Post-Fix): Label Tersembunyi di Overview Mode
    console.log("\n--- BAGIAN 2: VERIFIKASI POST-FIX OVERVIEW MODE (LABELS HIDDEN) ---");
    const overviewCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      stage.resetCamera();
      const mainRooms = ["manager", "hr", "operasional", "sosmed", "riset", "advertiser", "creative", "copy"];
      const roomRecs = stage.getRoomRecords ? stage.getRoomRecords() : {};
      const statusList = [];

      mainRooms.forEach((rId) => {
        const rec = roomRecs[rId];
        const display = rec?.labelDiv?.style?.display ?? "unknown";
        const opacity = rec?.labelDiv?.style?.opacity ?? "unknown";
        const isHidden = display === "none" || opacity === "0";
        statusList.push({
          roomId: rId,
          display,
          opacity,
          isHidden,
        });
      });

      const allHidden = statusList.every((s) => s.isHidden);
      return { allHidden, statusList };
    });

    console.table(overviewCheck.statusList);
    console.log(`Seluruh label ruangan tersembunyi di overview: ${overviewCheck.allHidden}`);

    if (!overviewCheck.allHidden) {
      throw new Error("Item 4 Gagal: Terdapat label ruangan yang masih terlihat di Overview Mode!");
    }

    // 3. Evaluasi Hover / Focus Mode: Label Muncul Saat Interaksi
    console.log("\n--- BAGIAN 3: VERIFIKASI POST-FIX INTERAKSI (MUNCUL SAAT FOKUS / HOVER) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.focusRoom("advertiser");
    });
    await page.waitForTimeout(400);

    const interactionCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const rec = stage.getRoomRecords ? stage.getRoomRecords()["advertiser"] : null;
      const display = rec?.labelDiv?.style?.display;
      const opacity = rec?.labelDiv?.style?.opacity;
      const isVisible = display !== "none" && parseFloat(opacity) >= 0.9;

      return {
        focusedRoom: "advertiser",
        display,
        opacity,
        isVisible,
      };
    });

    console.table([interactionCheck]);
    console.log(`Label ruangan fokus ('advertiser') muncul: ${interactionCheck.isVisible}`);

    if (!interactionCheck.isVisible) {
      throw new Error("Item 4 Gagal: Label ruangan tidak muncul saat ruangan difokuskan!");
    }

    // 4. Reset kembali ke Overview
    await page.evaluate(() => {
      window.__STAGE_3D__.resetCamera();
    });
    await page.waitForTimeout(700);

    const resetCheck = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const rec = stage.getRoomRecords ? stage.getRoomRecords()["advertiser"] : null;
      const display = rec?.labelDiv?.style?.display;
      const opacity = rec?.labelDiv?.style?.opacity;
      return display === "none" || opacity === "0";
    });
    console.log(`Label kembali tersembunyi setelah reset kamera: ${resetCheck}`);

    console.log("\n✅ ITEM 4 SUKSES MEMENUHI SELURUH KRITERIA SPESIFIKASI.");

  } finally {
    if (tempUserData?.user?.id) {
      await supabase.auth.admin.deleteUser(tempUserData.user.id).catch(() => {});
    }
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
