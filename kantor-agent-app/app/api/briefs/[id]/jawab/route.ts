import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processNextBriefInQueue } from "@/lib/briefService";

interface JawabBody {
  jawaban?: string;
}

const MAX_JAWABAN = 1000;

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
  const briefId = Number(idParam);
  if (!Number.isInteger(briefId) || briefId <= 0) {
    return Response.json({ error: "ID brief tidak valid" }, { status: 400 });
  }

  let body: JawabBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  const jawaban = typeof body.jawaban === "string" ? body.jawaban.trim() : "";
  if (!jawaban) {
    return Response.json({ error: "Jawaban klarifikasi wajib diisi" }, { status: 400 });
  }
  if (jawaban.length > MAX_JAWABAN) {
    return Response.json(
      { error: `Jawaban maksimal ${MAX_JAWABAN} karakter` },
      { status: 400 }
    );
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
      { error: "Hanya approver/CEO yang berhak menjawab klarifikasi" },
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
  if (brief.status !== "butuh_klarifikasi") {
    return Response.json(
      { error: `Brief tidak sedang membutuhkan klarifikasi (status: '${brief.status}')` },
      { status: 409 }
    );
  }

  // 3. Update brief: simpan jawaban, naikkan putaran_tanya, dan kembalikan ke status 'antre'
  const nextPutaran = (brief.putaran_tanya || 0) + 1;
  const { data: updatedBrief, error: updateError } = await admin
    .from("briefs")
    .update({
      jawaban,
      putaran_tanya: nextPutaran,
      status: "antre",
      diproses_sejak: null,
      diperbarui: new Date().toISOString(),
    })
    .eq("id", briefId)
    .select()
    .single();

  if (updateError || !updatedBrief) {
    return Response.json(
      { error: updateError?.message || "Gagal memperbarui brief dengan jawaban" },
      { status: 500 }
    );
  }

  // Catat event jawaban dari CEO
  await admin.from("events").insert({
    agent: "ATLAS",
    status: "idle",
    pesan: `CEO menjawab klarifikasi brief #${briefId} (putaran ${nextPutaran}): "${jawaban.slice(
      0,
      120
    )}"`,
  });

  // 4. Pemicuan non-blocking pemrosesan antrean
  processNextBriefInQueue(admin).catch((e) => {
    console.error("[POST /api/briefs/[id]/jawab] Error processing queue background:", e);
  });

  return Response.json({ brief: updatedBrief, status: "antre" });
}
