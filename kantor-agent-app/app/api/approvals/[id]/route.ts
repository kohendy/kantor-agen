import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Keputusan = "disetujui" | "ditolak";

interface Body {
  keputusan?: Keputusan;
  catatan?: string;
}

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const approvalId = Number(idParam);
  if (!Number.isInteger(approvalId) || approvalId <= 0) {
    return Response.json({ error: "ID approval tidak valid" }, { status: 400 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  if (body.keputusan !== "disetujui" && body.keputusan !== "ditolak") {
    return Response.json(
      { error: "keputusan harus 'disetujui' atau 'ditolak'" },
      { status: 400 }
    );
  }
  const catatan = typeof body.catatan === "string" ? body.catatan.trim() || null : null;

  // 1. Verifikasi pengguna lewat session cookie (getUser, bukan getSession).
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "Belum login" }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? "";
  const approverEmails = parseApproverEmails();
  if (!email || !approverEmails.includes(email)) {
    return Response.json(
      { error: "Akun ini tidak punya izin menyetujui/menolak" },
      { status: 403 }
    );
  }

  // 2. Dari sini pakai service role key, hanya di server.
  const admin = createAdminClient();

  const { data: approval, error: approvalError } = await admin
    .from("approvals")
    .select("id, status")
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError) {
    return Response.json({ error: "Gagal membaca data approval" }, { status: 500 });
  }
  if (!approval) {
    return Response.json({ error: "Approval tidak ditemukan" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return Response.json(
      { error: "Approval ini sudah diproses sebelumnya" },
      { status: 409 }
    );
  }

  const { data: secret, error: secretError } = await admin
    .from("approval_secrets")
    .select("resume_url")
    .eq("approval_id", approvalId)
    .maybeSingle();

  if (secretError || !secret?.resume_url) {
    return Response.json(
      { error: "Resume URL tidak ditemukan untuk approval ini" },
      { status: 500 }
    );
  }

  // 3. Teruskan keputusan ke n8n. Kalau n8n menolak atau execution sudah
  // kedaluwarsa, tandai approval 'kedaluwarsa' dan kembalikan error jelas.
  // resume_url tidak pernah diikutkan ke respons browser.
  let resumeResponse: Response;
  try {
    resumeResponse = await fetch(secret.resume_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keputusan: body.keputusan, catatan }),
    });
  } catch {
    await admin
      .from("approvals")
      .update({ status: "kedaluwarsa" })
      .eq("id", approvalId)
      .eq("status", "pending");
    return Response.json(
      { error: "Gagal menghubungi n8n, approval ditandai kedaluwarsa" },
      { status: 502 }
    );
  }

  if (!resumeResponse.ok) {
    await admin
      .from("approvals")
      .update({ status: "kedaluwarsa" })
      .eq("id", approvalId)
      .eq("status", "pending");
    return Response.json(
      {
        error:
          resumeResponse.status === 404 || resumeResponse.status === 410
            ? "Execution n8n sudah kedaluwarsa"
            : "n8n menolak keputusan ini",
      },
      { status: 502 }
    );
  }

  // 4. Sukses: catat keputusan di approvals.
  const { error: updateError } = await admin
    .from("approvals")
    .update({
      status: body.keputusan,
      diputuskan: new Date().toISOString(),
      diputuskan_oleh: email,
      catatan,
    })
    .eq("id", approvalId)
    .eq("status", "pending");

  if (updateError) {
    return Response.json(
      { error: "Keputusan terkirim ke n8n tapi gagal dicatat di database" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
