"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useOfficeData } from "@/lib/useOfficeData";
import { useApprovals } from "@/lib/useApprovals";
import { usePipelineRuns } from "@/lib/usePipelineRuns";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { MissionLog } from "@/components/MissionLog";
import { ProgresProyek } from "@/components/ProgresProyek";
import { MulaiProyekModal } from "@/components/MulaiProyekModal";

const OfficeStage3D = dynamic(
  () => import("@/components/OfficeStage3D").then((mod) => mod.OfficeStage3D),
  {
    ssr: false,
    loading: () => (
      <section
        className="card stage-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "360px",
        }}
        aria-label="Peta kantor"
      >
        <p className="note" style={{ color: "var(--muted)" }}>
          Memuat peta kantor 3D...
        </p>
      </section>
    ),
  }
);

export function Dashboard() {
  const { agents, events, loading, error, realtimeConnected } = useOfficeData();
  const { approvals, error: approvalsError } = useApprovals();
  const {
    activeRun,
    error: pipelineError,
    refetch: refetchPipeline,
  } = usePipelineRuns();

  const [isMulaiModalOpen, setIsMulaiModalOpen] = useState(false);
  const [fullFrame, setFullFrame] = useState(false);

  // Collapse states for floating panels in Full Frame mode
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [approvalCollapsed, setApprovalCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  // Mobile bottom-sheet selector ("log" | "approval" | "detail" | null)
  const [mobileActiveSheet, setMobileActiveSheet] = useState<
    "log" | "approval" | "detail" | null
  >(null);

  // Toggle Full Frame
  const handleToggleFullFrame = useCallback(() => {
    setFullFrame((prev) => !prev);
  }, []);

  // Synchronize browser Fullscreen API with fullFrame state
  useEffect(() => {
    if (fullFrame) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }, [fullFrame]);

  // Sync state on fullscreenchange and Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && fullFrame) {
        if (
          e.defaultPrevented ||
          document.querySelector('[role="dialog"][aria-modal="true"]')
        ) {
          return;
        }
        setFullFrame(false);
      }
    }
    function handleFullscreenChange() {
      if (!document.fullscreenElement && fullFrame) {
        setFullFrame(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [fullFrame]);

  // Lock body scroll when fullFrame is active
  useEffect(() => {
    if (fullFrame) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullFrame]);

  const stats = useMemo(() => {
    const n = { working: 0, review: 0, idle: 0 };
    agents.forEach((a) => {
      if (a.status in n) n[a.status as keyof typeof n]++;
    });
    return n;
  }, [agents]);

  return (
    <>
      {!fullFrame && (
        <ProgresProyek
          run={activeRun}
          onOpenMulaiModal={() => setIsMulaiModalOpen(true)}
          onRefetch={refetchPipeline}
        />
      )}

      {(error || approvalsError || pipelineError) && (
        <p className="note" style={{ color: "var(--amber)", margin: "0 0 12px" }}>
          Gagal memuat data dari Supabase:{" "}
          {error ?? approvalsError ?? pipelineError}
        </p>
      )}

      {loading ? (
        <p className="note">Memuat data kantor...</p>
      ) : (
        <div className={`dash-grid ${fullFrame ? "is-full-frame" : ""}`}>
          {/* Floating Top Bar for Full Frame Mode */}
          {fullFrame && (
            <div
              className="stage-stats-floating"
              role="region"
              aria-label="Statistik Realtime"
            >
              <span>
                <i className="pip w" /> <b>{stats.working}</b>bekerja
              </span>
              <span>
                <i className="pip r" /> <b>{stats.review}</b>menunggu review
              </span>
              <span>
                <i className="pip" /> <b>{stats.idle}</b>idle
              </span>
              <span className={`conn ${realtimeConnected ? "on" : "off"}`}>
                {realtimeConnected
                  ? "\u25cf realtime tersambung"
                  : "\u25cb memakai polling cadangan"}
              </span>
            </div>
          )}

          {/* Floating Mobile Bottom Navigation for Full Frame Mode */}
          {fullFrame && (
            <div
              className="stage-mobile-nav-pill"
              role="navigation"
              aria-label="Menu Layar Penuh Ponsel"
            >
              <button
                type="button"
                className={`mobile-nav-btn ${
                  mobileActiveSheet === "log" ? "active" : ""
                }`}
                onClick={() =>
                  setMobileActiveSheet((curr) =>
                    curr === "log" ? null : "log"
                  )
                }
              >
                📜 Log ({events.length})
              </button>
              <button
                type="button"
                className={`mobile-nav-btn ${
                  mobileActiveSheet === "approval" ? "active" : ""
                }`}
                onClick={() =>
                  setMobileActiveSheet((curr) =>
                    curr === "approval" ? null : "approval"
                  )
                }
              >
                📋 Review ({approvals.length})
              </button>
              <button
                type="button"
                className={`mobile-nav-btn ${
                  mobileActiveSheet === "detail" ? "active" : ""
                }`}
                onClick={() =>
                  setMobileActiveSheet((curr) =>
                    curr === "detail" ? null : "detail"
                  )
                }
              >
                🔍 Detail
              </button>
            </div>
          )}

          {/* Mission Log (same component, floating in full frame) */}
          <MissionLog
            events={events}
            isFullFrame={fullFrame}
            isCollapsed={fullFrame ? logCollapsed : false}
            onToggleCollapse={() => setLogCollapsed((c) => !c)}
            isMobileSheetOpen={fullFrame && mobileActiveSheet === "log"}
            onCloseMobileSheet={() => setMobileActiveSheet(null)}
          />

          {/* 3D Office Stage */}
          <OfficeStage3D
            agents={agents}
            events={events}
            realtimeConnected={realtimeConnected}
            fullFrame={fullFrame}
            onToggleFullFrame={handleToggleFullFrame}
            detailCollapsed={detailCollapsed}
            onToggleDetailCollapse={() => setDetailCollapsed((d) => !d)}
            isMobileDetailOpen={fullFrame && mobileActiveSheet === "detail"}
            onCloseMobileDetail={() => setMobileActiveSheet(null)}
          />

          {/* Approval Panel (same component, floating in full frame) */}
          <ApprovalPanel
            approvals={approvals}
            isFullFrame={fullFrame}
            isCollapsed={fullFrame ? approvalCollapsed : false}
            onToggleCollapse={() => setApprovalCollapsed((c) => !c)}
            isMobileSheetOpen={fullFrame && mobileActiveSheet === "approval"}
            onCloseMobileSheet={() => setMobileActiveSheet(null)}
          />
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
