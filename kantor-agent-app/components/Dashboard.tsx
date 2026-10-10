"use client";

import { useOfficeData } from "@/lib/useOfficeData";
import { useApprovals } from "@/lib/useApprovals";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { MissionLog } from "@/components/MissionLog";
import { OfficeStage } from "@/components/OfficeStage";

export function Dashboard() {
  const { agents, events, loading, error, realtimeConnected } = useOfficeData();
  const { approvals, error: approvalsError } = useApprovals();

  return (
    <>
      <ApprovalPanel approvals={approvals} />

      {(error || approvalsError) && (
        <p className="note" style={{ color: "var(--amber)" }}>
          Gagal memuat data dari Supabase: {error ?? approvalsError}
        </p>
      )}

      {loading ? (
        <p className="note">Memuat data kantor...</p>
      ) : (
        <div className="main">
          <MissionLog events={events} />
          <OfficeStage agents={agents} events={events} realtimeConnected={realtimeConnected} />
        </div>
      )}

      <p className="note">
        Tiap agent menulis satu baris event ke database (format JSON di panel jobdesc), lalu
        halaman ini berlangganan perubahan itu lewat Supabase Realtime dan menggerakkan karakter
        serta log. Jika koneksi realtime putus, halaman mengambil data terbaru tiap 5 detik
        sebagai cadangan.
      </p>
    </>
  );
}
