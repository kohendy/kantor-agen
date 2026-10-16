// tests/naiveBriefQueue.ts
// IMPLEMENTASI NAIF UNTUK PEMBUKTIAN KEGAGALAN DALAM PENGUJIAN UNIT
// Tidak boleh berada di lib/ produksi.

import type {
  BriefItem,
  BriefContent,
  BriefMode,
  ManagerDecisionOutput,
} from "../lib/briefQueue.ts";

export class NaiveBriefQueueManager {
  public briefs: BriefItem[] = [];
  private nextId = 1;
  public pipelineJalan = true;

  public setPipelineControl(jalan: boolean): void {
    this.pipelineJalan = jalan;
  }

  public enqueueBrief(params: {
    judul: string;
    isi: BriefContent;
    mode: BriefMode;
  }): BriefItem {
    const item: BriefItem = {
      id: this.nextId++,
      judul: params.judul,
      isi: params.isi,
      mode: params.mode,
      status: "antre",
      rencana: null,
      pertanyaan: null,
      jawaban: null,
      putaran_tanya: 0,
      run_id: null,
      diproses_sejak: null,
      claimed_by: null,
      departemen_aktif: null,
      dibuat: Date.now(),
      diperbarui: Date.now(),
    };
    this.briefs.push(item);
    return item;
  }

  // Naive: Tidak cek pipelineJalan, tidak cek apakah Manager sedang sibuk,
  // dan memblokir seluruh antrean jika elemen pertama berstatus 'butuh_klarifikasi' (Head-of-Line blocking)
  public claimNextForConsideration(workerId: string): BriefItem | null {
    // BUG 1: Naif mengabaikan pipeline_control!
    // if (!this.pipelineJalan) return null; // DILANGGAR DI NAIF

    // BUG 2: Head of line blocking jika elemen pertama sedang butuh_klarifikasi!
    const firstBrief = this.briefs[0];
    if (firstBrief && firstBrief.status === "butuh_klarifikasi") {
      // Deadlock! Mengira antrean macet karena elemen paling depan belum dijawab
      return null;
    }

    // BUG 3: Balikkan kandidat pertama tanpa atomic check / lock status!
    const candidate = this.briefs.find(
      (b) => b.status === "antre" || b.status === "dipertimbangkan"
    );
    if (!candidate) return null;

    // BUG 4: Menimpa klaim worker lain tanpa memeriksa apakah sudah diklaim
    candidate.status = "dipertimbangkan";
    candidate.claimed_by = workerId;
    return candidate;
  }

  // BUG 5: Menjalankan brief tanpa memeriksa apakah departemen sedang sibuk
  public submitManagerDecision(
    briefId: number,
    decision: ManagerDecisionOutput
  ): BriefItem {
    const brief = this.briefs.find((b) => b.id === briefId)!;
    if (decision.keputusan === "tanya") {
      brief.status = "butuh_klarifikasi";
      brief.pertanyaan = decision.pertanyaan || "tanya";
      return brief;
    }
    brief.status = "berjalan";
    brief.rencana = {
      departemen: decision.departemen || [],
      alasan: decision.alasan,
      asumsi: decision.asumsi,
    };
    // Mengizinkan 2 brief aktif di departemen yang sama secara naif
    brief.departemen_aktif = decision.departemen?.[0]?.id || "riset";
    return brief;
  }
}
