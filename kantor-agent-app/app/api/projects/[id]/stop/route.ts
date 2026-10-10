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
  const { data: updated, error: updateError } = await admin
    .from("pipeline_runs")
    .update({
      status: "dihentikan",
      diperbarui: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("id, judul")
    .single();

  if (updateError || !updated) {
    return Response.json(
      { error: updateError?.message || "Gagal menghentikan proyek" },
      { status: 500 }
    );
  }

  await admin.from("events").insert({
    agent: "SYSTEM",
    status: "review",
    pesan: `Proyek "${updated.judul}" dihentikan oleh ${email}`,
  });

  return Response.json({ ok: true, run: updated });
}
