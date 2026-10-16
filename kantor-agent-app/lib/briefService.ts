// lib/briefService.ts
// Service pemrosesan antrean brief di sisi server (Route Handlers & Background Workers)
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const N8N_TIMEOUT_MS = 30_000;

export async function processNextBriefInQueue(admin: AdminClient) {
  // 1. Periksa kontrol darurat pipeline_control
  const { data: pc, error: pcErr } = await admin
    .from("pipeline_control")
    .select("jalan")
    .eq("id", 1)
    .single();

  if (pcErr || !pc || !pc.jalan) {
    return { claimed: false, reason: "pipeline_stopped" };
  }

  // 2. Lakukan klaim atomik via RPC claim_brief_for_consideration
  const { data: claimedRows, error: claimErr } = await admin.rpc(
    "claim_brief_for_consideration"
  );

  if (claimErr) {
    console.error("[briefService] Error claim_brief_for_consideration:", claimErr);
    return { claimed: false, reason: "claim_rpc_error", error: claimErr.message };
  }

  if (!claimedRows || claimedRows.length === 0) {
    return { claimed: false, reason: "no_brief_or_busy" };
  }

  const brief = claimedRows[0];
  const atlasWebhookUrl =
    process.env.N8N_ATLAS_WEBHOOK_URL ||
    "https://n8n-pst7ppfu6txm.jkt2.sumopod.my.id/webhook/atlas-manager";

  // 3. Siapkan payload pemanggilan ATLAS
  const payload = {
    brief_id: brief.id,
    mode: brief.mode,
    putaran_tanya: brief.putaran_tanya || 0,
    judul: brief.judul,
    jawaban: brief.jawaban || null,
    brief: {
      id: brief.id,
      produk: brief.isi?.produk || "",
      target_audiens: brief.isi?.target_audiens || "",
      tujuan: brief.isi?.tujuan || "",
      budget_harian: brief.isi?.budget_harian,
      catatan_bebas: brief.isi?.catatan_bebas || "",
    },
    status_departemen: {},
  };

  let atlasData: any = null;
  try {
    const resp = await fetch(atlasWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });

    if (!resp.ok) {
      throw new Error(`ATLAS webhook returned status ${resp.status}`);
    }

    atlasData = await resp.json();
  } catch (err) {
    console.error(`[briefService] Gagal memanggil ATLAS webhook untuk brief #${brief.id}:`, err);
    // Lepaskan klaim agar brief dapat dicoba lagi nanti
    await admin.rpc("release_brief_claim", { target_brief_id: brief.id });
    await admin.from("events").insert({
      agent: "ATLAS",
      status: "idle",
      pesan: `Gagal memanggil ATLAS untuk brief #${brief.id}: ${
        err instanceof Error ? err.message : String(err)
      }. Klaim dilepas kembali ke antrean.`,
    });
    return { claimed: true, success: false, error: "atlas_call_failed" };
  }

  // 4. Proses hasil keputusan ATLAS
  if (atlasData.status === "ok" && atlasData.valid) {
    if (atlasData.keputusan === "tanya") {
      await admin
        .from("briefs")
        .update({
          status: "butuh_klarifikasi",
          pertanyaan: atlasData.pertanyaan,
          diproses_sejak: null,
          diperbarui: new Date().toISOString(),
        })
        .eq("id", brief.id);

      return {
        claimed: true,
        success: true,
        brief_id: brief.id,
        keputusan: "tanya",
        pertanyaan: atlasData.pertanyaan,
      };
    }

    if (atlasData.keputusan === "delegasi") {
      const depts = atlasData.departemen || [];
      const firstDept = depts[0]?.id || "riset";

      // Cek apakah ada run di fase pertama yang sedang jalan
      const { data: busyRuns } = await admin
        .from("pipeline_runs")
        .select("id")
        .eq("status", "jalan")
        .eq("fase", firstDept);

      const isDeptBusy = busyRuns && busyRuns.length > 0;

      if (!isDeptBusy && firstDept === "riset") {
        // Buat pipeline_runs untuk departemen riset yang tersedia
        const { data: newRun } = await admin
          .from("pipeline_runs")
          .insert({
            judul: brief.judul,
            brief: brief.isi,
            fase: "riset",
            status: "jalan",
            iterasi: 1,
          })
          .select()
          .single();

        await admin
          .from("briefs")
          .update({
            status: "berjalan",
            rencana: {
              departemen: depts,
              alasan: atlasData.alasan,
              asumsi: atlasData.asumsi,
            },
            run_id: newRun?.id || null,
            diproses_sejak: null,
            diperbarui: new Date().toISOString(),
          })
          .eq("id", brief.id);

        // Panggil orchestrator dispatcher jika URL terkonfigurasi
        const dispatcherUrl = process.env.N8N_DISPATCHER_URL;
        if (dispatcherUrl && newRun) {
          fetch(dispatcherUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "mulai_proyek",
              run_id: newRun.id,
              fase: "riset",
              brief: brief.isi,
            }),
            signal: AbortSignal.timeout(10_000),
          }).catch((e) => console.warn("[briefService] Gagal panggil dispatcher:", e));
        }

        return {
          claimed: true,
          success: true,
          brief_id: brief.id,
          keputusan: "delegasi",
          status: "berjalan",
          departemen_aktif: firstDept,
        };
      } else {
        // Departemen pertama sibuk atau belum tersedia -> status 'didelegasikan'
        await admin
          .from("briefs")
          .update({
            status: "didelegasikan",
            rencana: {
              departemen: depts,
              alasan: atlasData.alasan,
              asumsi: atlasData.asumsi,
            },
            diproses_sejak: null,
            diperbarui: new Date().toISOString(),
          })
          .eq("id", brief.id);

        return {
          claimed: true,
          success: true,
          brief_id: brief.id,
          keputusan: "delegasi",
          status: "didelegasikan",
          alasan: isDeptBusy
            ? `Departemen ${firstDept} sedang sibuk; antre untuk eksekusi`
            : `Departemen ${firstDept} belum tersedia; delegasi tercatat`,
        };
      }
    }
  }

  // Jika format output ATLAS tidak valid atau status gagal
  await admin.rpc("release_brief_claim", { target_brief_id: brief.id });
  return {
    claimed: true,
    success: false,
    error: atlasData.pesan || "Keputusan ATLAS tidak valid",
  };
}
