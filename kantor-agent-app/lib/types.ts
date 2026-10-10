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
  event_id: number;
  agent: string;
  ringkasan: string | null;
  status: ApprovalStatus;
  catatan: string | null;
  dibuat: string;
  diputuskan: string | null;
  diputuskan_oleh: string | null;
}
