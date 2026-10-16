import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processNextBriefInQueue } from "@/lib/briefService";

interface CreateBriefBody {
  judul?: string;
  mode?: "diarahkan" | "manager_bebas";
  isi?: {
    produk?: string;
    target_audiens?: string;
    tujuan?: string;
    budget_harian?: number | string | null;
    catatan_bebas?: string;
  };
}

const MAX_JUDUL = 120;
const MAX_TEKS = 1000;

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("briefs")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ briefs: data ?? [] });
}

export async function POST(request: Request) {
  let body: CreateBriefBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  const mode = body.mode === "manager_bebas" ? "manager_bebas" : "diarahkan";
  const isi = body.isi || {};

  const produk = typeof isi.produk === "string" ? isi.produk.trim() : "";
  const targetAudiens =
    typeof isi.target_audiens === "string" ? isi.target_audiens.trim() : "";
  const tujuan = typeof isi.tujuan === "string" ? isi.tujuan.trim() : "";
  const catatanBebas =
    typeof isi.catatan_bebas === "string" ? isi.catatan_bebas.trim() : "";

  const rawBudget = isi.budget_harian;
  const budgetHarian =
    rawBudget !== null && rawBudget !== undefined && rawBudget !== ""
      ? Number(rawBudget)
      : null;

  // Validasi judul
  if (!judul) {
    return Response.json({ error: "Judul brief wajib diisi" }, { status: 400 });
  }
  if (judul.length > MAX_JUDUL) {
    return Response.json(
      { error: `Judul maksimal ${MAX_JUDUL} karakter` },
      { status: 400 }
    );
  }

  // Validasi produk
  if (!produk) {
    return Response.json({ error: "Deskripsi produk wajib diisi" }, { status: 400 });
  }
  if (produk.length > MAX_TEKS) {
    return Response.json(
      { error: `Produk maksimal ${MAX_TEKS} karakter` },
      { status: 400 }
    );
  }

  // Validasi teks lainnya
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
  if (catatanBebas.length > MAX_TEKS) {
    return Response.json(
      { error: `Catatan bebas maksimal ${MAX_TEKS} karakter` },
      { status: 400 }
    );
  }

  // Validasi budget harian
  if (budgetHarian !== null && (isNaN(budgetHarian) || budgetHarian < 0)) {
    return Response.json(
      { error: "Budget harian harus berupa angka valid >= 0" },
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
      { error: "Hanya approver/CEO yang berhak memasukkan brief baru" },
      { status: 403 }
    );
  }

  // 2. Simpan brief baru ke tabel briefs dengan status 'antre'
  const admin = createAdminClient();
  const briefContent = {
    produk,
    target_audiens: targetAudiens,
    tujuan,
    budget_harian: budgetHarian,
    catatan_bebas: catatanBebas,
  };

  const { data: brief, error: insertError } = await admin
    .from("briefs")
    .insert({
      judul,
      isi: briefContent,
      mode,
      status: "antre",
    })
    .select()
    .single();

  if (insertError || !brief) {
    return Response.json(
      { error: insertError?.message || "Gagal menyimpan brief ke database" },
      { status: 500 }
    );
  }

  // Catat event penerimaan brief
  await admin.from("events").insert({
    agent: "ATLAS",
    status: "idle",
    pesan: `Brief baru #${brief.id} ("${judul}") masuk antrean (Mode: ${mode})`,
  });

  // 3. Pemicuan non-blocking pemrosesan antrean
  processNextBriefInQueue(admin).catch((e) => {
    console.error("[POST /api/briefs] Error processing queue background:", e);
  });

  return Response.json({ brief, status: "antre" }, { status: 201 });
}
