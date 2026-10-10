// Tipe data yang dipetakan langsung dari skema Supabase (tabel agents, events, approvals).
export type AgentStatus = "working" | "review" | "idle";
export type EventStatus = "working" | "done" | "review";
export type ApprovalStatus = "pending" | "disetujui" | "ditolak" | "kedaluwarsa";

export interface AgentRow {
  nama: string;
  ruangan: string;
  peran: string;
  status: AgentStatus;
}

export interface EventRow {
  id: number;
  waktu: string;
  agent: string;
  status: EventStatus;
  pesan: string;
}

export interface ApprovalRow {
  id: number;
  event_id: number | null;
  agent: string;
  ringkasan: string | null;
  status: ApprovalStatus;
  catatan: string | null;
  dibuat: string;
  diputuskan: string | null;
  diputuskan_oleh: string | null;
  run_id?: number | null;
  step_id?: number | null;
  gate?: string | null;
}

export type PipelineRunStatus =
  | "jalan"
  | "menunggu_persetujuan"
  | "butuh_keputusan"
  | "selesai"
  | "dihentikan";

export interface ProjectBrief {
  produk: string;
  target_audiens: string;
  tujuan: string;
  budget_harian?: number | null;
  [key: string]: unknown;
}

export interface PipelineRunRow {
  id: number;
  judul: string;
  brief: ProjectBrief;
  fase: string;
  status: PipelineRunStatus;
  iterasi: number;
  dibuat: string;
  diperbarui: string;
}

export type PipelineStepStatus = "menunggu" | "jalan" | "selesai" | "gagal";

export interface PipelineStepRow {
  id: number;
  run_id: number;
  agen: string | null;
  fase: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: PipelineStepStatus;
  revisi_ke: number;
  dibuat: string;
  diperbarui: string;
}

