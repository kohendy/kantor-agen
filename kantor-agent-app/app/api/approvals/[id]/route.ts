import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Keputusan = "disetujui" | "ditolak";
type AdminClient = ReturnType<typeof createAdminClient>;

interface Body {
  keputusan?: Keputusan;
  catatan?: string;
}

const CATATAN_MAX_LENGTH = 500;
const N8N_TIMEOUT_MS = 10_000;

function parseApproverEmails(): string[] {
  const raw = process.env.APPROVER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Lepaskan klaim supaya approval ini bisa dicoba lagi oleh request berikutnya.
// Hanya berlaku kalau status masih 'pending' (belum ditutup oleh update lain).
async function releaseClaim(admin: AdminClient, approvalId: number) {
  await admin
    .from("approvals")
    .update({ diputuskan: null, diputuskan_oleh: null })
    .eq("id", approvalId)
    .eq("status", "pending");
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
  if (catatan && catatan.length > CATATAN_MAX_LENGTH) {
    return Response.json(
      { error: `Catatan maksimal ${CATATAN_MAX_LENGTH} karakter` },
      { status: 400 }
    );
  }

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

  const { data: existing, error: existingError } = await admin
    .from("approvals")
    .select("id, status, run_id, step_id")
    .eq("id", approvalId)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: "Gagal membaca data approval" }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Approval tidak ditemukan" }, { status: 404 });
  }

  // 3. Klaim atomik: hanya satu request yang boleh lanjut memproses approval.
  // WHERE status='pending' AND diputuskan IS NULL mencegah dua request
  // memproses approval yang sama secara bersamaan.
  const { data: claimed, error: claimError } = await admin
    .from("approvals")
    .update({ diputuskan_oleh: email, diputuskan: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "pending")
    .is("diputuskan", null)
    .select("id");

  if (claimError) {
    return Response.json({ error: "Gagal mengklaim approval" }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return Response.json(
      { error: "Approval ini sedang/sudah diproses" },
      { status: 409 }
    );
  }

  // JIKA APPROVAL PUNYA RUN_ID: Alur orkestrator dispatcher (JANGAN pakai resume_url).
  if (existing.run_id) {
    // Baca status run dan pipeline_control sebelum mengubah apa pun.
    const [runResult, controlResult] = await Promise.all([
      admin
        .from("pipeline_runs")
        .select("id, status")
        .eq("id", existing.run_id)
        .maybeSingle(),
      admin
        .from("pipeline_control")
        .select("jalan")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    const runStatus = runResult.data?.status ?? null;
    const pipelineJalan = controlResult.data?.jalan ?? true;

    // Cek apakah run sudah dihentikan/selesai atau pipeline dimatikan.
    const runSudahTutup =
      runStatus === "dihentikan" || runStatus === "selesai";
    const pipelineDimatikan = pipelineJalan === false;

    // 1. Simpan keputusan di approvals (selalu dilakukan).
    const { data: finalUpdate, error: updateError } = await admin
      .from("approvals")
      .update({ status: body.keputusan, catatan })
      .eq("id", approvalId)
      .eq("status", "pending")
      .select("id");

    if (updateError || !finalUpdate || finalUpdate.length === 0) {
      await releaseClaim(admin, approvalId);
      return Response.json(
        { error: "Gagal mencatat keputusan approval proyek" },
        { status: 500 }
      );
    }

    // 2. Simpan catatan sebagai umpan balik di step (selalu dilakukan, jika ada).
    if (existing.step_id && catatan) {
      try {
        const { data: stepData } = await admin
          .from("pipeline_steps")
          .select("id, input")
          .eq("id", existing.step_id)
          .maybeSingle();

        if (stepData) {
          const currentInput =
            typeof stepData.input === "object" && stepData.input !== null
              ? (stepData.input as Record<string, unknown>)
              : {};
          await admin
            .from("pipeline_steps")
            .update({
              input: { ...currentInput, umpan_balik: catatan },
              diperbarui: new Date().toISOString(),
            })
            .eq("id", existing.step_id);
        }
      } catch (err) {
        console.error("Gagal menyimpan umpan balik di step:", err);
      }
    }

    // 3 & 4: Jika run sudah tutup atau pipeline dimatikan, BERHENTI di sini —
    // jangan ubah status run, jangan panggil dispatcher.
    if (runSudahTutup || pipelineDimatikan) {
      return Response.json({ ok: true });
    }

    // 5. Hanya jika run masih 'menunggu_persetujuan': set status 'jalan' secara
    // kondisional (WHERE status='menunggu_persetujuan') agar tidak menimpa
    // status lain yang mungkin sudah berubah secara konkuren.
    if (runStatus === "menunggu_persetujuan") {
      await admin
        .from("pipeline_runs")
        .update({
          status: "jalan",
          diperbarui: new Date().toISOString(),
        })
        .eq("id", existing.run_id)
        .eq("status", "menunggu_persetujuan");
    }

    // 6. Panggil webhook dispatcher. Kegagalan tidak menggagalkan respons
    // (pengaman scheduler 1 menit n8n adalah jaring pengaman).
    const dispatcherUrl = process.env.N8N_DISPATCHER_URL;
    if (dispatcherUrl && dispatcherUrl.startsWith("https://")) {
      try {
        await fetch(dispatcherUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approval_decided",
            approval_id: approvalId,
            run_id: existing.run_id,
            step_id: existing.step_id,
            keputusan: body.keputusan,
            catatan,
          }),
          signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
        });
      } catch (dispatcherErr) {
        console.error("Gagal memanggil webhook dispatcher:", dispatcherErr);
      }
    }

    return Response.json({ ok: true });
  }

  // ALUR LAMA (tanpa run_id): tetap gunakan resume_url seperti semula
  const { data: secret, error: secretError } = await admin
    .from("approval_secrets")
    .select("resume_url")
    .eq("approval_id", approvalId)
    .maybeSingle();

  if (secretError || !secret?.resume_url) {
    await releaseClaim(admin, approvalId);
    return Response.json(
      { error: "Resume URL tidak ditemukan untuk approval ini" },
      { status: 500 }
    );
  }

  // Keamanan: jangan pernah fetch ke URL yang bukan https, dan jangan
  // menampilkan nilainya di respons kalau tidak valid.
  if (!secret.resume_url.startsWith("https://")) {
    await releaseClaim(admin, approvalId);
    return Response.json({ error: "Resume URL tidak valid" }, { status: 500 });
  }

  // 4. Teruskan keputusan ke n8n. resume_url tidak pernah diikutkan ke
  // respons browser. Kegagalan sementara (timeout/jaringan/5xx) melepas
  // klaim supaya approval bisa dicoba lagi; hanya 404/410 (execution sudah
  // tidak ada) yang menandai approval sebagai kedaluwarsa.
  let resumeResponse: Response;
  try {
    resumeResponse = await fetch(secret.resume_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keputusan: body.keputusan, catatan }),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });
  } catch {
    await releaseClaim(admin, approvalId);
    return Response.json(
      { error: "n8n sedang tidak bisa dihubungi, coba lagi sebentar lagi" },
      { status: 502 }
    );
  }

  if (!resumeResponse.ok) {
    if (resumeResponse.status === 404 || resumeResponse.status === 410) {
      await admin
        .from("approvals")
        .update({ status: "kedaluwarsa" })
        .eq("id", approvalId)
        .eq("status", "pending");
      return Response.json(
        { error: "Execution n8n sudah kedaluwarsa" },
        { status: 502 }
      );
    }

    await releaseClaim(admin, approvalId);
    if (resumeResponse.status >= 500) {
      return Response.json(
        { error: "n8n sedang tidak bisa dihubungi, coba lagi sebentar lagi" },
        { status: 502 }
      );
    }
    return Response.json({ error: "n8n menolak keputusan ini" }, { status: 502 });
  }

  // 5. Sukses: catat keputusan di approvals. diputuskan/diputuskan_oleh
  // sudah terisi lewat langkah klaim di atas.
  const { data: finalUpdate, error: updateError } = await admin
    .from("approvals")
    .update({ status: body.keputusan, catatan })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    return Response.json(
      { error: "Keputusan terkirim ke n8n tapi gagal dicatat di database" },
      { status: 500 }
    );
  }
  if (!finalUpdate || finalUpdate.length === 0) {
    return Response.json(
      {
        error:
          "Keputusan terkirim ke n8n tapi approval sudah berubah status di database",
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
