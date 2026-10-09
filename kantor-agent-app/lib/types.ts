// Tipe data yang dipetakan langsung dari skema Supabase (tabel agents & events).
export type AgentStatus = "working" | "review" | "idle";
export type EventStatus = "working" | "done" | "review";

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
