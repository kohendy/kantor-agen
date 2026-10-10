"use client";

import { useState } from "react";
import { useOfficeData } from "@/lib/useOfficeData";
import { useApprovals } from "@/lib/useApprovals";
import { usePipelineRuns } from "@/lib/usePipelineRuns";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { MissionLog } from "@/components/MissionLog";
import { OfficeStage } from "@/components/OfficeStage";
import { ProgresProyek } from "@/components/ProgresProyek";
import { MulaiProyekModal } from "@/components/MulaiProyekModal";

export function Dashboard() {
  const { agents, events, loading, error, realtimeConnected } = useOfficeData();
  const { approvals, error: approvalsError } = useApprovals();
  const {
    activeRun,
    error: pipelineError,
    refetch: refetchPipeline,
  } = usePipelineRuns();
  const [isMulaiModalOpen, setIsMulaiModalOpen] = useState(false);

  return (
    <>
      <ProgresProyek
        run={activeRun}
        onOpenMulaiModal={() => setIsMulaiModalOpen(true)}
        onRefetch={refetchPipeline}
      />

      <ApprovalPanel approvals={approvals} />

      {(error || approvalsError || pipelineError) && (
        <p className="note" style={{ color: "var(--amber)" }}>
          Gagal memuat data dari Supabase:{" "}
          {error ?? approvalsError ?? pipelineError}
        </p>
      )}

      {loading ? (
        <p className="note">Memuat data kantor...</p>
      ) : (
        <div className="main">
          <MissionLog events={events} />
          <OfficeStage
            agents={agents}
            events={events}
            realtimeConnected={realtimeConnected}
          />
        </div>
      )}

      <p className="note">
        Tiap agent menulis satu baris event ke database (format JSON di panel
        jobdesc), lalu halaman ini berlangganan perubahan itu lewat Supabase
        Realtime dan menggerakkan karakter serta log. Jika koneksi realtime
        putus, halaman mengambil data terbaru tiap 5 detik sebagai cadangan.
      </p>

      <MulaiProyekModal
        isOpen={isMulaiModalOpen}
        onClose={() => setIsMulaiModalOpen(false)}
        onSuccess={async () => {
          await refetchPipeline();
        }}
      />
    </>
  );
}

