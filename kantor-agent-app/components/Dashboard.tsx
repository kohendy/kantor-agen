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

      {(error || approvalsError || pipelineError) && (
        <p className="note" style={{ color: "var(--amber)", margin: "0 0 12px" }}>
          Gagal memuat data dari Supabase:{" "}
          {error ?? approvalsError ?? pipelineError}
        </p>
      )}

      {loading ? (
        <p className="note">Memuat data kantor...</p>
      ) : (
        <div className="dash-grid">
          <MissionLog events={events} />
          <OfficeStage
            agents={agents}
            events={events}
            realtimeConnected={realtimeConnected}
          />
          <ApprovalPanel approvals={approvals} />
        </div>
      )}

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

