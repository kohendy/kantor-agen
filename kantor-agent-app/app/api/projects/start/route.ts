import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface StartProjectBody {
  judul?: string;
  produk?: string;
  target_audiens?: string;
  tujuan?: string;
  budget_harian?: number | string | null;
}

// Batas panjang teks brief
const MAX_JUDUL = 120;
const MAX_TEKS = 1000;

const N8N_TIMEOUT_MS = 10_000;

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  let body: StartProjectBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  const produk = typeof body.produk === "string" ? body.produk.trim() : "";
  const targetAudiens =
    typeof body.target_audiens === "string" ? body.target_audiens.trim() : "";
  const tujuan = typeof body.tujuan === "string" ? body.tujuan.trim() : "";
  const rawBudget = body.budget_harian;
  const budgetHarian =
    rawBudget !== null && rawBudget !== undefined && rawBudget !== ""
      ? Number(rawBudget)
      : null;

  // Validasi wajib isi
  if (!judul) {
    return Response.json({ error: "Judul proyek wajib diisi" }, { status: 400 });
  }
  if (!produk) {
    return Response.json({ error: "Produk wajib diisi" }, { status: 400 });
  }
  if (!targetAudiens) {
    return Response.json({ error: "Target audiens wajib diisi" }, { status: 400 });
  }
  if (!tujuan) {
    return Response.json({ error: "Tujuan kampanye wajib diisi" }, { status: 400 });
  }

  // Validasi panjang teks
  if (judul.length > MAX_JUDUL) {
    return Response.json(
      { error: `Judul maksimal ${MAX_JUDUL} karakter` },
      { status: 400 }
    );
  }
  if (produk.length > MAX_TEKS) {
    return Response.json(
      { error: `Produk maksimal ${MAX_TEKS} karakter` },
      { status: 400 }
    );
  }
  if (targetAudiens.length > MAX_TEKS) {
    return Response.json(
      { error: `Target audiens maksimal ${MAX_TEKS} karakter` },
      { status: 400 }
    );
  }
  if (tujuan.length > MAX_TEKS) {
    return Response.json(
      { error: `Tujuan kampanye maksimal ${MAX_TEKS} karakter` },
      { status: 400 }
    );
  }

  // Validasi budget: jangan NaN, harus >= 0 jika diisi
  if (budgetHarian !== null && (isNaN(budgetHarian) || budgetHarian < 0)) {
    return Response.json(
      { error: "Budget harian harus berupa angka >= 0" },
      { status: 400 }
    );
  }

  // 1. Verifikasi pengguna lewat session cookie
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "Belum login" }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? "";
  const approverEmails = parseApproverEmails();
  if (!email || !approverEmails.includes(email)) {
    return Response.json(
      { error: "Hanya approver yang berhak memulai proyek baru" },
      { status: 403 }
    );
  }

  // 2. Buat pipeline_runs via admin client
  const admin = createAdminClient();
  const brief = {
    produk,
    target_audiens: targetAudiens,
    tujuan,
    budget_harian: budgetHarian,
  };

  const { data: run, error: insertError } = await admin
    .from("pipeline_runs")
    .insert({
      judul,
      brief,
      fase: "riset",
      status: "jalan",
      iterasi: 1,
    })
    .select()
    .single();

  if (insertError || !run) {
    return Response.json(
      { error: insertError?.message || "Gagal membuat proyek baru di database" },
      { status: 500 }
    );
  }

  // Catat event sistem dengan agen valid dan status 'done' (bukan 'working').
  await admin.from("events").insert({
    agent: "ATHENA",
    status: "done",
    pesan: `Proyek "${judul}" dimulai, dispatcher orkestrasi dipanggil`,
  });

  // 3. Panggil webhook dispatcher
  const dispatcherUrl = process.env.N8N_DISPATCHER_URL;
  if (dispatcherUrl && dispatcherUrl.startsWith("https://")) {
    try {
      await fetch(dispatcherUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mulai_proyek",
          run_id: run.id,
          fase: run.fase,
          brief,
        }),
        signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      });
    } catch (err) {
      console.error("Gagal memanggil webhook dispatcher:", err);
      // Biarkan tetap sukses karena scheduler 1 menit n8n adalah pengaman
    }
  }

  return Response.json({ ok: true, run });
}
