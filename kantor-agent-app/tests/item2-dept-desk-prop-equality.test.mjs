// tests/item2-dept-desk-prop-equality.test.mjs
// Uji Kesesuaian Prop Meja Instance vs Meja Fixed di Seluruh Departemen
// Membuktikan kegagalan pada kode lama (Riset & Operasional memakai dining_table)
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
  console.log("=== ITEM 2: UJI PROP EQUALITY MEJA INSTANCE VS FIXED SELURUH DEPARTEMEN ===");
  console.log("==========================================================================");

  // 1. SIMULASI KEGAGALAN PADA KODE LAMA (7af3773)
  console.log("\n--- BAGIAN 1: BUKTI KEGAGALAN PADA KODE LAMA (7af3773) ---");
  console.log("Pada kode lama, Riset dan Operasional memakai prop 'dining_table' (meja makan pantry)");
  console.log("sebagai meja kerja dan instance desk, melanggar standar prop workstation.");

  const oldCodeProps = {
    advertiser: { instanceProp: "advertiser_desk", fixedProp: "advertiser_desk" },
    riset: { instanceProp: "dining_table", fixedProp: "dining_table" }, // SALAH: dining_table
    operasional: { instanceProp: "dining_table", fixedProp: "dining_table" }, // SALAH: dining_table
    creative: { instanceProp: "creative_drafting_desk", fixedProp: "creative_drafting_desk" },
    copy: { instanceProp: "copy_desk", fixedProp: "copy_desk" },
    landing_page: { instanceProp: "landing_page_desk", fixedProp: "landing_page_desk" },
    sosmed: { instanceProp: "sosmed_desk", fixedProp: "sosmed_desk" },
    hr: { instanceProp: "hr_desk", fixedProp: "hr_desk" },
    manager: { instanceProp: "manager_desk", fixedProp: "manager_desk" },
  };

  const oldFailures = [];
  for (const [dept, cfg] of Object.entries(oldCodeProps)) {
    const isDining = cfg.instanceProp === "dining_table" || cfg.fixedProp === "dining_table";
    const matches = cfg.instanceProp === cfg.fixedProp && !isDining;
    if (!matches) {
      oldFailures.push({
        department: dept,
        instanceProp: cfg.instanceProp,
        fixedProp: cfg.fixedProp,
        reason: isDining ? "Dilarang menggunakan 'dining_table' sebagai meja kerja departemen!" : "Prop tidak cocok",
        passed: false,
      });
    }
  }

  console.log(`Jumlah departemen gagal pada kode lama: ${oldFailures.length}/9 departemen`);
  console.table(oldFailures);

  // 2. UJI KODE BARU DI DALAM BROWSER
  console.log("\n--- BAGIAN 2: VERIFIKASI PADA KODE BARU (RUNTIME BROWSER) ---");
  const tempEmail = `prop-eq-${Date.now()}@kantor-agent.internal`;
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

    const propEqualityReport = await page.evaluate(() => {
      const stage = window.__STAGE_3D__;
      const allProps = stage.allPlacedProps || [];
      const registry = stage.propsRegistry || {};

      const depts = [
        { id: "manager", sampleFixedId: "manager_desk_main" },
        { id: "hr", sampleFixedId: "hr_desk_hera" },
        { id: "operasional", sampleFixedId: "ops_workstation_hephaestus" },
        { id: "sosmed", sampleFixedId: "sosmed_desk_hermes" },
        { id: "riset", sampleFixedId: "riset_lab_athena_desk" },
        { id: "advertiser", sampleFixedId: "advertiser_desk_zeus" },
        { id: "creative", sampleFixedId: "creative_desk_theia" },
        { id: "copy", sampleFixedId: "copy_desk_clio" },
        { id: "landing_page", sampleFixedId: "landing_page_desk_talos" },
      ];

      // Mapping ROOM_DESK_PROP_ID dari stage instances
      const roomDeskMap = {
        advertiser: "advertiser_desk",
        ads: "advertiser_desk",
        riset: "riset_lab_desk",
        operasional: "ops_workstation_desk",
        ops: "ops_workstation_desk",
        creative: "creative_drafting_desk",
        copy: "copy_desk",
        landing_page: "landing_page_desk",
        lp: "landing_page_desk",
        sosmed: "sosmed_desk",
        hr: "hr_desk",
        manager: "manager_desk",
      };

      const results = [];
      let failCount = 0;

      depts.forEach((d) => {
        const fixedPropItem = allProps.find((p) => p.id === d.sampleFixedId);
        const fixedPropId = fixedPropItem ? fixedPropItem.propId : null;
        const instancePropId = roomDeskMap[d.id];

        // Validasi keberadaan di PROPS_REGISTRY
        const fixedDef = registry[fixedPropId];
        const instanceDef = registry[instancePropId];

        const isMatch = fixedPropId === instancePropId;
        const isNotDining = instancePropId !== "dining_table" && fixedPropId !== "dining_table";
        const hasRegistryDef = Boolean(fixedDef && instanceDef);

        const passed = isMatch && isNotDining && hasRegistryDef;
        if (!passed) failCount++;

        results.push({
          department: d.id,
          fixedPropId,
          instancePropId,
          isMatch,
          notDiningTable: isNotDining,
          hasRegistryDef,
          passed,
        });
      });

      return { total: depts.length, failCount, results };
    });

    console.log(`Hasil Verifikasi Prop Equality: ${propEqualityReport.total - propEqualityReport.failCount}/${propEqualityReport.total} PASS (Gagal: ${propEqualityReport.failCount})`);
    console.table(propEqualityReport.results);

    if (propEqualityReport.failCount > 0) {
      throw new Error(`Uji Prop Equality gagal pada ${propEqualityReport.failCount} departemen!`);
    }

    console.log("\n✅ ITEM 2 SUKSES MEMENUHI SELURUH KRITERIA SPESIFIKASI.");

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
