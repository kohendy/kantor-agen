import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Status run yang boleh dihentikan.
const STOPPABLE_STATUSES = ["jalan", "menunggu_persetujuan", "butuh_keputusan"];

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const runId = Number(idParam);
  if (!Number.isInteger(runId) || runId <= 0) {
    return Response.json({ error: "ID proyek tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "Belum login" }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? "";
  const approverEmails = parseApproverEmails();
  if (!email || !approverEmails.includes(email)) {
    return Response.json(
      { error: "Hanya approver yang berhak menghentikan proyek" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Baca run saat ini untuk validasi status.
  const { data: existingRun, error: readError } = await admin
    .from("pipeline_runs")
    .select("id, judul, status")
    .eq("id", runId)
    .maybeSingle();

  if (readError) {
    return Response.json(
      { error: readError.message || "Gagal membaca data proyek" },
      { status: 500 }
    );
  }
  if (!existingRun) {
    return Response.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  }
  if (!STOPPABLE_STATUSES.includes(existingRun.status)) {
    return Response.json(
      { error: `Proyek tidak bisa dihentikan dari status '${existingRun.status}'` },
      { status: 409 }
    );
  }

  // Update status menjadi 'dihentikan'. Gunakan kondisi WHERE agar aman secara
  // konkuren (jangan timpa status yang sudah berubah di antara baca dan tulis).
  const { data: updated, error: updateError } = await admin
    .from("pipeline_runs")
    .update({
      status: "dihentikan",
      diperbarui: new Date().toISOString(),
    })
    .eq("id", runId)
    .in("status", STOPPABLE_STATUSES)
    .select("id, judul")
    .maybeSingle();

  if (updateError) {
    return Response.json(
      { error: updateError.message || "Gagal menghentikan proyek" },
      { status: 500 }
    );
  }
  if (!updated) {
    // Run sudah berubah status secara konkuren.
    return Response.json(
      { error: "Proyek sudah berubah status, tidak bisa dihentikan" },
      { status: 409 }
    );
  }

  // Set semua approvals pending milik run ini menjadi 'kedaluwarsa'.
  await admin
    .from("approvals")
    .update({ status: "kedaluwarsa" })
    .eq("run_id", runId)
    .eq("status", "pending");

  // Catat event sistem. Gunakan agen valid (ATHENA) dengan status 'done'.
  await admin.from("events").insert({
    agent: "ATHENA",
    status: "done",
    pesan: `Proyek "${updated.judul}" dihentikan oleh ${email}`,
  });

  return Response.json({ ok: true, run: updated });
}
