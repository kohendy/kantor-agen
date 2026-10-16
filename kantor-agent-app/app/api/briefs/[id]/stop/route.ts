import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const STOPPABLE_BRIEF_STATUSES = [
  "antre",
  "dipertimbangkan",
  "butuh_klarifikasi",
  "didelegasikan",
  "berjalan",
];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const briefId = Number(idParam);
  if (!Number.isInteger(briefId) || briefId <= 0) {
    return Response.json({ error: "ID brief tidak valid" }, { status: 400 });
  }

  // 1. Verifikasi pengguna & peran approver via session cookie
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "Belum login" }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? "";
  const approverEmails = parseApproverEmails();
  if (!email || !approverEmails.includes(email)) {
    return Response.json(
      { error: "Hanya approver/CEO yang berhak menghentikan brief" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // 2. Baca brief untuk validasi status
  const { data: brief, error: readError } = await admin
    .from("briefs")
    .select("*")
    .eq("id", briefId)
    .maybeSingle();

  if (readError) {
    return Response.json(
      { error: readError.message || "Gagal membaca data brief" },
      { status: 500 }
    );
  }
  if (!brief) {
    return Response.json({ error: "Brief tidak ditemukan" }, { status: 404 });
  }
  if (!STOPPABLE_BRIEF_STATUSES.includes(brief.status)) {
    return Response.json(
      { error: `Brief tidak bisa dihentikan dari status '${brief.status}'` },
      { status: 409 }
    );
  }

  // 3. Jika brief sedang 'dipertimbangkan', lepaskan klaim atomik
  if (brief.status === "dipertimbangkan") {
    await admin.rpc("release_brief_claim", { target_brief_id: briefId });
  }

  // 4. Jika brief memiliki run_id yang masih berjalan di pipeline_runs, hentikan juga
  if (brief.run_id) {
    await admin
      .from("pipeline_runs")
      .update({
        status: "dihentikan",
        diperbarui: new Date().toISOString(),
      })
      .eq("id", brief.run_id)
      .eq("status", "jalan");
  }

  // 5. Update status brief menjadi 'dihentikan'
  const { data: updatedBrief, error: updateError } = await admin
    .from("briefs")
    .update({
      status: "dihentikan",
      diproses_sejak: null,
      diperbarui: new Date().toISOString(),
    })
    .eq("id", briefId)
    .select()
    .single();

  if (updateError || !updatedBrief) {
    return Response.json(
      { error: updateError?.message || "Gagal membatalkan brief" },
      { status: 500 }
    );
  }

  // Catat event pembatalan
  await admin.from("events").insert({
    agent: "ATLAS",
    status: "idle",
    pesan: `Brief #${briefId} ("${brief.judul}") dihentikan oleh CEO`,
  });

  return Response.json({ brief: updatedBrief, status: "dihentikan" });
}
