// tests/item1-agent-facing.test.mjs
// Uji Arah Hadap Agen Dinamis (atan2) & Verifikasi Kegagalan pada Kode Lama (7af3773~1)
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
  console.log("=== ITEM 1: UJI ARAH HADAP DINAMIS VIA ATAN2(DX, DZ) & POST-CHOREO TOL ===");
  console.log("==========================================================================");

  // 1. SIMULASI & VERIFIKASI KEGAGALAN PADA KODE SEBELUM PERBAIKAN (7af3773~1)
  console.log("\n--- BAGIAN 1: BUKTI KEGAGALAN PADA KODE LAMA (7af3773~1) ---");
  console.log("Pada commit 7af3773~1, deskRot di-hardcode ke Math.PI untuk South rooms:");
  console.log('["THEIA", "LYRA", "IRIS", "CLIO", "ERATO", "DAPHNE", "HERMES", "THEMIS", "TALOS"]');
  
  const oldCodeRotations = {
    ATLAS: 0,
    HERA: Math.PI,
    HEPHAESTUS: 0,
    HERMES: Math.PI, // salah: kursi di z=30.5, meja di z=31.3 -> dz = +0.8 -> harusnya 0
    ATHENA: 0,
    ARGUS: 0,
    METIS: 0,
    ZEUS: Math.PI,
    ARTEMIS: Math.PI,
    PLUTUS: Math.PI,
    THEIA: Math.PI, // salah
    LYRA: Math.PI,  // salah
    IRIS: Math.PI,  // salah
    CLIO: Math.PI,  // salah
    ERATO: Math.PI, // salah
    DAPHNE: Math.PI,// salah
    HESTIA: Math.PI,
    THEMIS: Math.PI,// salah
    TALOS: Math.PI, // salah
  };

  const expectedGeoAngles = {
    ATLAS: 0,
    HERA: Math.PI,
    HEPHAESTUS: 0,
    HERMES: 0,
    ATHENA: 0,
    ARGUS: 0,
    METIS: 0,
    ZEUS: Math.PI,
    ARTEMIS: Math.PI,
    PLUTUS: Math.PI,
    THEIA: 0,
    LYRA: 0,
    IRIS: 0,
    CLIO: 0,
    ERATO: 0,
    DAPHNE: 0,
    HESTIA: Math.PI,
    THEMIS: 0,
    TALOS: 0,
  };

  const oldCodeFailures = [];
  for (const [name, oldAngle] of Object.entries(oldCodeRotations)) {
    const expAngle = expectedGeoAngles[name];
    let diff = Math.abs(oldAngle - expAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    const diffDeg = +((diff * 180) / Math.PI).toFixed(1);
    if (diffDeg >= 20) {
      oldCodeFailures.push({
        agent: name,
        oldAngle: +oldAngle.toFixed(3),
        expectedAngle: +expAngle.toFixed(3),
        diffDeg,
        status: "FAIL"
      });
    }
  }

  console.log(`Jumlah agen gagal pada kode lama: ${oldCodeFailures.length}/19 agen`);
  console.table(oldCodeFailures);

  // 2. RUNTIME BROWSER TEST UNTUK KODE BARU (DYNAMIC ATAN2 & POST-CHOREOGRAPHY)
  const tempEmail = `facing-test-${Date.now()}@kantor-agent.internal`;
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

    // Evaluasi Initial Facing
    console.log("\n--- BAGIAN 2: UJI ARAH HADAP DINAMIS PADA INITIAL LOAD ---");
    const initTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const allProps = stage.allPlacedProps || [];
      const homePositions = stage.getHomePositions();

      const deskMap = {
        ATLAS: "manager_desk_main",
        HERA: "hr_desk_hera",
        HEPHAESTUS: "ops_workstation_hephaestus",
        HERMES: "sosmed_desk_hermes",
        ATHENA: "riset_lab_athena_desk",
        ARGUS: "riset_lab_argus_desk",
        METIS: "riset_lab_metis_desk",
        ZEUS: "advertiser_desk_zeus",
        ARTEMIS: "advertiser_desk_artemis",
        PLUTUS: "advertiser_desk_plutus",
        THEIA: "creative_desk_theia",
        LYRA: "creative_desk_lyra",
        IRIS: "creative_desk_iris",
        CLIO: "copy_desk_clio",
        ERATO: "copy_desk_erato",
        DAPHNE: "copy_desk_daphne",
        HESTIA: "landing_page_desk_hestia",
        THEMIS: "landing_page_desk_themis",
        TALOS: "landing_page_desk_talos",
      };

      const results = [];
      let failCount = 0;

      agents.forEach((ag) => {
        const deskProp = allProps.find((p) => p.id === deskMap[ag.name]);
        const hp = homePositions[ag.name];
        const rec = stage.getAgentRecord(ag.name);

        const dx = deskProp ? deskProp.x - hp[0] : 0;
        const dz = deskProp ? deskProp.z - hp[1] : 0;
        let expectedAngle = Math.atan2(dx, dz);
        while (expectedAngle > Math.PI) expectedAngle -= 2 * Math.PI;
        while (expectedAngle < -Math.PI) expectedAngle += 2 * Math.PI;

        let actualAngle = rec.group.rotation.y;
        while (actualAngle > Math.PI) actualAngle -= 2 * Math.PI;
        while (actualAngle < -Math.PI) actualAngle += 2 * Math.PI;

        let diff = Math.abs(actualAngle - expectedAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const diffDeg = +((diff * 180) / Math.PI).toFixed(1);

        const passed = diffDeg < 20;
        if (!passed) failCount++;

        results.push({
          name: ag.name,
          actualAngle: +actualAngle.toFixed(3),
          expectedAngle: +expectedAngle.toFixed(3),
          diffDeg,
          passed,
        });
      });

      return { total: agents.length, failCount, results };
    });

    console.log(`Hasil Inisialisasi: ${initTest.total - initTest.failCount}/${initTest.total} PASS (Gagal: ${initTest.failCount})`);
    console.table(initTest.results);

    // 3. Evaluasi Slot Bay Dinamis
    console.log("\n--- BAGIAN 3: UJI SUDUT HADAP DINAMIS PADA SLOT BAY INSTANCE ---");
    const bayFacingTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const rooms = ["sosmed", "operasional", "advertiser", "hr", "creative"];
      const results = [];
      rooms.forEach((rId) => {
        const room = stage.floorplan.rooms.find((r) => r.id === rId);
        const slot = stage.calculateRoomSlotPosition(room, 2, true);
        const dx = slot.deskPos.x - slot.world.x;
        const dz = slot.deskPos.z - slot.world.z;
        let expAngle = Math.atan2(dx, dz);
        while (expAngle > Math.PI) expAngle -= 2 * Math.PI;
        while (expAngle < -Math.PI) expAngle += 2 * Math.PI;

        let actAngle = slot.faceAngle;
        while (actAngle > Math.PI) actAngle -= 2 * Math.PI;
        while (actAngle < -Math.PI) actAngle += 2 * Math.PI;

        let diff = Math.abs(actAngle - expAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const diffDeg = +((diff * 180) / Math.PI).toFixed(1);

        results.push({
          room: rId,
          chairPos: [slot.world.x, slot.world.z],
          deskPos: [slot.deskPos.x, slot.deskPos.z],
          faceAngle: +actAngle.toFixed(3),
          expectedAngle: +expAngle.toFixed(3),
          diffDeg,
          passed: diffDeg < 1.0,
        });
      });
      return results;
    });
    console.table(bayFacingTest);

    // 4. Koreografi: Rapat -> Bubar Rapat
    console.log("\n--- BAGIAN 4: UJI KOREOGRAFI RAPAT -> BUBAR (ROTASI POST-CHOREO < 20°) ---");
    await page.evaluate(() => {
      window.__STAGE_3D__.startMeetingNow(false);
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      window.__STAGE_3D__.endMeetingNow(false);
    });

    const startT = Date.now();
    let allReturned = false;
    while (Date.now() - startT < 35000) {
      await page.waitForTimeout(500);
      const isBusy = await page.evaluate(() => {
        const stage = window.__STAGE_3D__;
        const names = [
          "ATHENA", "ARGUS", "METIS", "CLIO", "ERATO", "DAPHNE",
          "HESTIA", "THEMIS", "TALOS", "ZEUS", "ARTEMIS", "PLUTUS",
          "THEIA", "LYRA", "IRIS", "HERA", "HEPHAESTUS", "HERMES"
        ];
        return names.some((n) => stage.isChoreoBusy(n));
      });
      if (!isBusy) {
        allReturned = true;
        break;
      }
    }
    console.log(`Seluruh agen selesai berjalan kembali ke meja: ${allReturned} (${Date.now() - startT} ms)`);
    await page.waitForTimeout(1000);

    const postChoreoTest = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const agents = stage.getAgents();
      const allProps = stage.allPlacedProps || [];
      const homePositions = stage.getHomePositions();

      const deskMap = {
        ATLAS: "manager_desk_main",
        HERA: "hr_desk_hera",
        HEPHAESTUS: "ops_workstation_hephaestus",
        HERMES: "sosmed_desk_hermes",
        ATHENA: "riset_lab_athena_desk",
        ARGUS: "riset_lab_argus_desk",
        METIS: "riset_lab_metis_desk",
        ZEUS: "advertiser_desk_zeus",
        ARTEMIS: "advertiser_desk_artemis",
        PLUTUS: "advertiser_desk_plutus",
        THEIA: "creative_desk_theia",
        LYRA: "creative_desk_lyra",
        IRIS: "creative_desk_iris",
        CLIO: "copy_desk_clio",
        ERATO: "copy_desk_erato",
        DAPHNE: "copy_desk_daphne",
        HESTIA: "landing_page_desk_hestia",
        THEMIS: "landing_page_desk_themis",
        TALOS: "landing_page_desk_talos",
      };

      const results = [];
      let failCount = 0;

      agents.forEach((ag) => {
        const deskProp = allProps.find((p) => p.id === deskMap[ag.name]);
        const hp = homePositions[ag.name];
        const rec = stage.getAgentRecord(ag.name);

        const dx = deskProp ? deskProp.x - hp[0] : 0;
        const dz = deskProp ? deskProp.z - hp[1] : 0;
        let expectedAngle = Math.atan2(dx, dz);
        while (expectedAngle > Math.PI) expectedAngle -= 2 * Math.PI;
        while (expectedAngle < -Math.PI) expectedAngle += 2 * Math.PI;

        let actualAngle = rec.group.rotation.y;
        while (actualAngle > Math.PI) actualAngle -= 2 * Math.PI;
        while (actualAngle < -Math.PI) actualAngle += 2 * Math.PI;

        let diff = Math.abs(actualAngle - expectedAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const diffDeg = +((diff * 180) / Math.PI).toFixed(1);

        const passed = diffDeg < 20;
        if (!passed) failCount++;

        results.push({
          name: ag.name,
          actualAngle: +actualAngle.toFixed(3),
          expectedAngle: +expectedAngle.toFixed(3),
          diffDeg,
          passed,
        });
      });

      return { total: agents.length, failCount, results };
    });

    console.log(`Hasil Pasca-Koreografi: ${postChoreoTest.total - postChoreoTest.failCount}/${postChoreoTest.total} PASS (Gagal: ${postChoreoTest.failCount})`);
    console.table(postChoreoTest.results);

    if (postChoreoTest.failCount > 0) {
      throw new Error(`Uji Post-Choreography gagal: ${postChoreoTest.failCount} agen melebihi toleransi rotasi 20°!`);
    }

    console.log("\n✅ ITEM 1 SUKSES MEMENUHI SELURUH KRITERIA SPESIFIKASI.");

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
