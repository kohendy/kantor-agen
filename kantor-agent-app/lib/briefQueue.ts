// lib/briefQueue.ts
// State Machine Murni Antrean Brief & Manajer ATLAS
// Tanpa IO langsung, tanpa DOM, tanpa setTimeout.
// Mendukung injeksi clock agar unit test dapat memajukan waktu tanpa delay.

export type BriefMode = "diarahkan" | "manager_bebas";

export type BriefStatus =
  | "antre"
  | "dipertimbangkan"
  | "butuh_klarifikasi"
  | "didelegasikan"
  | "berjalan"
  | "selesai"
  | "dihentikan";

export interface BriefContent {
  produk: string;
  target_audiens: string;
  tujuan: string;
  budget_harian?: number | null;
  catatan_bebas?: string;
}

export interface DepartmentPlanItem {
  id: string;
  nama: string;
  belum_tersedia: boolean;
  alasan?: string;
}

export interface BriefPlan {
  departemen: DepartmentPlanItem[];
  alasan: string;
  asumsi: string[];
  batas_iklan?: {
    target_cpa: number;
    min_spend_sebelum_menilai: number;
    plafon_harian: number;
    kenaikan_maksimal_persen: number;
  };
}

export interface ManagerDecisionOutput {
  keputusan: "delegasi" | "tanya";
  departemen?: DepartmentPlanItem[];
  alasan: string;
  asumsi: string[];
  pertanyaan?: string | null;
  batas_iklan?: {
    target_cpa: number;
    min_spend_sebelum_menilai: number;
    plafon_harian: number;
    kenaikan_maksimal_persen: number;
  };
}

export interface BriefItem {
  id: number;
  judul: string;
  isi: BriefContent;
  mode: BriefMode;
  status: BriefStatus;
  rencana: BriefPlan | null;
  pertanyaan: string | null;
  jawaban: string | null;
  putaran_tanya: number;
  run_id: number | null;
  diproses_sejak: number | null;
  claimed_by: string | null;
  departemen_aktif: string | null;
  dibuat: number;
  diperbarui: number;
}

export type ClockFn = () => number;

/**
 * Robust Brief Queue Manager (State Machine Murni)
 */
export class BriefQueueManager {
  private briefs: BriefItem[] = [];
  private nextId = 1;
  private now: ClockFn;
  private pipelineJalan = true;

  constructor(clock: ClockFn = () => Date.now()) {
    this.now = clock;
  }

  public setPipelineControl(jalan: boolean): void {
    this.pipelineJalan = jalan;
  }

  public isPipelineJalan(): boolean {
    return this.pipelineJalan;
  }

  public enqueueBrief(params: {
    judul: string;
    isi: BriefContent;
    mode: BriefMode;
  }): BriefItem {
    const timestamp = this.now();
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
      dibuat: timestamp,
      diperbarui: timestamp,
    };
    this.briefs.push(item);
    return item;
  }

  /**
   * Mengklaim brief berikutnya secara atomik untuk dipertimbangkan oleh ATLAS.
   * Aturan:
   * 1. Hormati pipeline_control.jalan: jika false, tidak ada klaim baru.
   * 2. Hanya 1 brief dipertimbangkan ATLAS pada satu waktu.
   * 3. Jika brief lain sedang 'butuh_klarifikasi', brief tersebut TIDAK menahan antrean.
   * 4. Idempoten dan atomik: dua pemanggil tidak dapat mengklaim brief yang sama.
   */
  public claimNextForConsideration(workerId: string): BriefItem | null {
    if (!this.pipelineJalan) {
      return null;
    }

    // Periksa apakah ATLAS sedang mempertimbangkan brief lain
    const activelyConsidering = this.briefs.find(
      (b) =>
        b.status === "dipertimbangkan" &&
        b.diproses_sejak !== null &&
        this.now() - b.diproses_sejak < 10 * 60 * 1000 // 10 menit stale threshold
    );

    if (activelyConsidering) {
      return null; // Manager sedang sibuk mempertimbangkan brief lain
    }

    // Cari brief pertama berstatus 'antre' secara FIFO berdasarkan id
    const candidate = this.briefs
      .filter((b) => b.status === "antre")
      .sort((a, b) => a.id - b.id)[0];

    if (!candidate) {
      return null;
    }

    // Klaim atomik
    const timestamp = this.now();
    candidate.status = "dipertimbangkan";
    candidate.diproses_sejak = timestamp;
    candidate.claimed_by = workerId;
    candidate.diperbarui = timestamp;

    return candidate;
  }

  /**
   * Melepas klaim (jika terjadi error/timeout)
   */
  public releaseClaim(briefId: number): void {
    const brief = this.briefs.find((b) => b.id === briefId);
    if (brief && brief.status === "dipertimbangkan") {
      brief.status = "antre";
      brief.diproses_sejak = null;
      brief.claimed_by = null;
      brief.diperbarui = this.now();
    }
  }

  /**
   * Menerima hasil keputusan Manager ATLAS
   */
  public submitManagerDecision(
    briefId: number,
    decision: ManagerDecisionOutput
  ): BriefItem {
    const brief = this.briefs.find((b) => b.id === briefId);
    if (!brief) {
      throw new Error(`Brief dengan ID ${briefId} tidak ditemukan`);
    }
    if (brief.status !== "dipertimbangkan") {
      throw new Error(`Brief ${briefId} tidak sedang dipertimbangkan`);
    }

    const timestamp = this.now();

    if (decision.keputusan === "tanya") {
      brief.status = "butuh_klarifikasi";
      brief.pertanyaan = decision.pertanyaan || "Mohon berikan rincian lebih lanjut";
      brief.diproses_sejak = null;
      brief.claimed_by = null;
      brief.diperbarui = timestamp;
      return brief;
    }

    // Keputusan delegasi
    brief.status = "didelegasikan";
    brief.rencana = {
      departemen: decision.departemen || [
        { id: "riset", nama: "Riset Pasar", belum_tersedia: false },
      ],
      alasan: decision.alasan,
      asumsi: decision.asumsi || [],
      batas_iklan: decision.batas_iklan,
    };
    brief.pertanyaan = null;
    brief.diproses_sejak = null;
    brief.claimed_by = null;
    brief.diperbarui = timestamp;

    // Evaluasi apakah dapat langsung dijalankan jika departemen pertamanya bebas
    this.tryStartDelegated(brief.id);

    return brief;
  }

  /**
   * CEO menjawab pertanyaan klarifikasi
   */
  public answerClarification(briefId: number, jawaban: string): BriefItem {
    const brief = this.briefs.find((b) => b.id === briefId);
    if (!brief) {
      throw new Error(`Brief dengan ID ${briefId} tidak ditemukan`);
    }
    if (brief.status !== "butuh_klarifikasi") {
      throw new Error(`Brief ${briefId} tidak sedang menunggu klarifikasi`);
    }

    const timestamp = this.now();
    brief.jawaban = jawaban;
    brief.putaran_tanya += 1;
    brief.status = "antre"; // Kembali ke antrean untuk dipertimbangkan lagi oleh ATLAS
    brief.diproses_sejak = null;
    brief.claimed_by = null;
    brief.diperbarui = timestamp;

    return brief;
  }

  /**
   * Cek apakah departemen tertentu sedang digunakan oleh brief lain yang sedang berjalan
   */
  public isDepartmentBusy(deptId: string): boolean {
    return this.briefs.some(
      (b) => b.status === "berjalan" && b.departemen_aktif === deptId
    );
  }

  /**
   * Mencoba memulai eksekusi departemen pertama untuk brief yang sudah didelegasikan.
   * Jika departemen pertama bentrok dengan brief yang sedang berjalan, brief menunggu.
   */
  public tryStartDelegated(briefId: number): boolean {
    if (!this.pipelineJalan) {
      return false;
    }

    const brief = this.briefs.find((b) => b.id === briefId);
    if (!brief || brief.status !== "didelegasikan" || !brief.rencana) {
      return false;
    }

    const depts = brief.rencana.departemen;
    if (depts.length === 0) {
      brief.status = "selesai";
      brief.diperbarui = this.now();
      return true;
    }

    const firstDept = depts[0].id;
    if (this.isDepartmentBusy(firstDept)) {
      // Departemen bentrok! Brief tetap berstatus didelegasikan (menunggu departemen bebas)
      return false;
    }

    // Departemen bebas: mulai eksekusi
    const timestamp = this.now();
    brief.status = "berjalan";
    brief.departemen_aktif = firstDept;
    brief.diperbarui = timestamp;

    return true;
  }

  /**
   * Selesaikan departemen saat ini pada brief yang sedang berjalan
   * dan majukan ke departemen berikutnya, atau selesaikan brief.
   */
  public advanceDepartment(briefId: number): BriefItem {
    const brief = this.briefs.find((b) => b.id === briefId);
    if (!brief || brief.status !== "berjalan" || !brief.rencana) {
      throw new Error(`Brief ${briefId} tidak sedang berjalan`);
    }

    const depts = brief.rencana.departemen;
    const currentIdx = depts.findIndex((d) => d.id === brief.departemen_aktif);
    const timestamp = this.now();

    if (currentIdx === -1 || currentIdx >= depts.length - 1) {
      // Seluruh departemen selesai
      brief.status = "selesai";
      brief.departemen_aktif = null;
      brief.diperbarui = timestamp;
    } else {
      const nextDept = depts[currentIdx + 1].id;
      if (this.isDepartmentBusy(nextDept)) {
        // Departemen berikutnya bentrok, lepaskan departemen saat ini dan tunggu
        brief.departemen_aktif = null;
        brief.status = "didelegasikan";
        brief.diperbarui = timestamp;
      } else {
        brief.departemen_aktif = nextDept;
        brief.diperbarui = timestamp;
      }
    }

    // Saat satu departemen bebas, periksa apakah ada brief lain di antrean didelegasikan yang menunggunya
    this.drainWaitingDelegated();

    return brief;
  }

  /**
   * Mencoba menjalankan brief-brief berstatus 'didelegasikan' yang menunggu departemen bebas
   */
  public drainWaitingDelegated(): void {
    if (!this.pipelineJalan) return;

    const waiting = this.briefs
      .filter((b) => b.status === "didelegasikan")
      .sort((a, b) => a.id - b.id);

    for (const b of waiting) {
      this.tryStartDelegated(b.id);
    }
  }

  public stopBrief(briefId: number): BriefItem {
    const brief = this.briefs.find((b) => b.id === briefId);
    if (!brief) {
      throw new Error(`Brief ${briefId} tidak ditemukan`);
    }
    const timestamp = this.now();
    brief.status = "dihentikan";
    brief.departemen_aktif = null;
    brief.diproses_sejak = null;
    brief.claimed_by = null;
    brief.diperbarui = timestamp;

    this.drainWaitingDelegated();
    return brief;
  }

  public getBriefs(): BriefItem[] {
    return [...this.briefs];
  }

  public getBriefById(id: number): BriefItem | undefined {
    return this.briefs.find((b) => b.id === id);
  }
}

