// tests/instanceRequests.test.mjs
// Unit Test untuk State Machine Permintaan Instance Baru (lib/stage3d/instanceRequests.ts)
// Menjamin urutan state, antrean FIFO, isolasi clock, dan aturan satu pada satu waktu.

import assert from "node:assert";
import test from "node:test";
import {
  InstanceRequestManager,
  SCENARIO_DEFINITIONS,
} from "../lib/stage3d/instanceRequests.ts";

test("1. Skenario A (Riset): alur state lengkap tanpa persetujuan CEO", () => {
  let simulatedTime = 1000;
  const mgr = new InstanceRequestManager(() => simulatedTime);
  const actions = [];
  mgr.subscribe((act) => actions.push(act.type));

  const req = mgr.request("riset");
  assert.strictEqual(req.state, "antre");
  assert.strictEqual(req.scenario, "riset");
  assert.strictEqual(req.deptHead, "ATHENA");
  assert.strictEqual(req.requiresApproval, false);
  assert.strictEqual(mgr.getQueueLength(), 0);
  assert.strictEqual(mgr.getActiveRequest()?.id, req.id);
  assert.deepStrictEqual(actions, ["dept_head_to_hr"]);

  // Dept head tiba di HR -> HERA menerima, status 'diminta'
  simulatedTime += 2000;
  mgr.advance(req.id, "diminta");
  assert.strictEqual(req.state, "diminta");
  assert.strictEqual(actions[actions.length - 1], "hera_nod");

  // Siapkan meja
  simulatedTime += 1500;
  mgr.advance(req.id, "menyiapkan");
  assert.strictEqual(req.state, "menyiapkan");
  assert.strictEqual(actions[actions.length - 1], "ops_prepare");

  // HEPHAESTUS selesai
  simulatedTime += 3000;
  mgr.advance(req.id, "siap");
  assert.strictEqual(req.state, "siap");
  assert.strictEqual(actions[actions.length - 1], "ops_ready");

  // Agen baru datang
  simulatedTime += 2000;
  mgr.advance(req.id, "datang");
  assert.strictEqual(req.state, "datang");
  assert.strictEqual(actions[actions.length - 1], "agent_spawn_and_walk");

  // Agen duduk
  simulatedTime += 4000;
  mgr.advance(req.id, "duduk");
  assert.strictEqual(req.state, "duduk");
  assert.strictEqual(actions[actions.length - 1], "agent_seated");

  // Permintaan selesai
  simulatedTime += 2000;
  mgr.advance(req.id, "selesai");
  assert.strictEqual(req.state, "selesai");
  assert.strictEqual(mgr.getActiveRequest(), null);
  assert(actions.includes("dept_head_return"));
  assert(actions.includes("request_completed"));
});

test("2. Skenario B (Iklan): menunggu persetujuan CEO, alur disetujui", () => {
  let simulatedTime = 5000;
  const mgr = new InstanceRequestManager(() => simulatedTime);
  const actions = [];
  mgr.subscribe((act) => actions.push(act.type));

  const req = mgr.request("iklan");
  assert.strictEqual(req.state, "antre");
  assert.strictEqual(req.requiresApproval, true);

  mgr.advance(req.id, "diminta");
  assert.strictEqual(req.state, "diminta");

  mgr.advance(req.id, "menunggu_persetujuan");
  assert.strictEqual(req.state, "menunggu_persetujuan");
  assert.strictEqual(actions[actions.length - 1], "show_approval_card");

  // CEO menyetujui
  const approved = mgr.approveCeo();
  assert.strictEqual(approved, true);
  assert.strictEqual(req.state, "menyiapkan");
  assert.strictEqual(actions[actions.length - 1], "ops_prepare");

  mgr.advance(req.id, "siap");
  mgr.advance(req.id, "datang");
  mgr.advance(req.id, "duduk");
  mgr.advance(req.id, "selesai");
  assert.strictEqual(req.state, "selesai");
});

test("3. Skenario B (Iklan): CEO menolak, alur berakhir tanpa ekspansi", () => {
  let simulatedTime = 10000;
  const mgr = new InstanceRequestManager(() => simulatedTime);
  const actions = [];
  mgr.subscribe((act) => actions.push(act.type));

  const req = mgr.request("iklan");
  mgr.advance(req.id, "diminta");
  mgr.advance(req.id, "menunggu_persetujuan");

  const rejected = mgr.rejectCeo();
  assert.strictEqual(rejected, true);
  assert.strictEqual(req.state, "ditolak");
  assert.strictEqual(mgr.isExpanded("advertiser"), false);
  assert.strictEqual(mgr.getActiveRequest(), null);
  assert(actions.includes("dept_head_rejected"));
});

test("4. Dua permintaan beruntun diproses FIFO satu per satu", () => {
  let simulatedTime = 20000;
  const mgr = new InstanceRequestManager(() => simulatedTime);
  const actions = [];
  mgr.subscribe((act) => actions.push(act.type));

  const req1 = mgr.request("riset");
  const req2 = mgr.request("sosmed");

  assert.strictEqual(req1.state, "antre");
  assert.strictEqual(req2.state, "antre");
  assert.strictEqual(mgr.getActiveRequest()?.id, req1.id);
  assert.strictEqual(mgr.getQueueLength(), 1);

  // Selesaikan req1
  mgr.advance(req1.id, "diminta");
  mgr.advance(req1.id, "menyiapkan");
  mgr.advance(req1.id, "siap");
  mgr.advance(req1.id, "datang");
  mgr.advance(req1.id, "duduk");
  mgr.advance(req1.id, "selesai");

  // req1 selesai -> req2 otomatis dipromosikan ke 'diminta'
  assert.strictEqual(req1.state, "selesai");
  assert.strictEqual(req2.state, "diminta");
  assert.strictEqual(mgr.getQueueLength(), 0);
  assert.strictEqual(mgr.getActiveRequest()?.id, req2.id);

  // Selesaikan req2
  mgr.setExpanded("sosmed", true);
  mgr.advance(req2.id, "menyiapkan");
  mgr.advance(req2.id, "siap");
  mgr.advance(req2.id, "datang");
  mgr.advance(req2.id, "duduk");
  mgr.advance(req2.id, "selesai");
  assert.strictEqual(req2.state, "selesai");
  assert.strictEqual(mgr.getActiveRequest(), null);
});

test("5. Reset mengosongkan antrean, ekspansi, dan entitas", () => {
  const mgr = new InstanceRequestManager();
  mgr.request("riset");
  mgr.request("iklan");
  mgr.request("sosmed");
  mgr.setExpanded("sosmed", true);

  assert.strictEqual(mgr.getRequests().length, 3);
  assert.strictEqual(mgr.getQueueLength(), 2);
  assert.strictEqual(mgr.isExpanded("sosmed"), true);

  mgr.reset();
  assert.strictEqual(mgr.getRequests().length, 0);
  assert.strictEqual(mgr.getQueueLength(), 0);
  assert.strictEqual(mgr.getActiveRequest(), null);
  assert.strictEqual(mgr.isExpanded("sosmed"), false);
});
