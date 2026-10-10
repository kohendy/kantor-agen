"use client";

import { useState } from "react";
import type { PipelineRunRow, PipelineRunStatus } from "@/lib/types";

interface ProgresProyekProps {
  run: PipelineRunRow | null;
  onOpenMulaiModal: () => void;
  onRefetch: () => Promise<void>;
}

const FASES = [
  { key: "riset", label: "Riset" },
  { key: "copy_creative", label: "Copy & Creative" },
  { key: "landing_page", label: "Landing Page" },
  { key: "ads", label: "Ads" },
  { key: "iklan_berjalan", label: "Iklan Berjalan" },
];

function getStatusBadge(status: PipelineRunStatus) {
  switch (status) {
    case "jalan":
      return <span className="step-status-tag status-jalan">Sedang Jalan</span>;
    case "menunggu_persetujuan":
      return <span className="step-status-tag status-menunggu">Menunggu Review</span>;
    case "butuh_keputusan":
      return <span className="step-status-tag status-butuh-keputusan">Butuh Keputusan</span>;
    case "selesai":
      return <span className="step-status-tag status-selesai">Selesai</span>;
    case "dihentikan":
      return <span className="step-status-tag status-butuh-keputusan">Dihentikan</span>;
    default:
      return null;
  }
}

export function ProgresProyek({
  run,
  onOpenMulaiModal,
  onRefetch,
}: ProgresProyekProps) {
  const [stopping, setStopping] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  async function handleHentikanProyek() {
    if (!run) return;
    const confirmStop = window.confirm(
      `Yakin ingin menghentikan proyek "${run.judul}"? Status akan diubah menjadi dihentikan.`
    );
    if (!confirmStop) return;

    setStopping(true);
    try {
      const res = await fetch(`/api/projects/${run.id}/stop`, {
        method: "POST",
      });
      if (res.ok) {
        await onRefetch();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal menghentikan proyek");
      }
    } catch {
      alert("Gagal menghubungi server untuk menghentikan proyek");
    } finally {
      setStopping(false);
    }
  }

  if (!run) {
    return (
      <div className="card project-card">
        <div className="project-topbar">
          <div className="project-info">
            <h2>Alur Proyek Kampanye</h2>
          </div>
          <div className="project-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenMulaiModal}
            >
              + Mulai Proyek Baru
            </button>
          </div>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Belum ada proyek yang berjalan. Klik <strong>+ Mulai Proyek Baru</strong> untuk
          mengisi brief kampanye dan menjalankan orkestrasi otomatis antar-agen.
        </p>
      </div>
    );
  }

  const currentFaseKey = (run.fase || "riset").toLowerCase();
  const currentIdx = FASES.findIndex(
    (f) =>
      f.key === currentFaseKey ||
      (currentFaseKey.includes("copy") && f.key === "copy_creative") ||
      (currentFaseKey.includes("landing") && f.key === "landing_page") ||
      (currentFaseKey.includes("iklan") && f.key === "iklan_berjalan")
  );
  const isFinished = run.status === "selesai";
  const isStopped = run.status === "dihentikan";

  return (
    <div className="card project-card">
      <div className="project-topbar">
        <div className="project-info">
          <h2>
            {run.judul} {getStatusBadge(run.status)}
            <span className="iterasi">(Iterasi #{run.iterasi})</span>
          </h2>
        </div>
        <div className="project-actions">
          <button
            type="button"
            className="pause"
            style={{ fontSize: "11px", padding: "6px 10px" }}
            onClick={() => setShowBrief((v) => !v)}
          >
            {showBrief ? "Tutup Brief" : "Lihat Brief"}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={stopping || isFinished || isStopped}
            onClick={handleHentikanProyek}
          >
            {stopping ? "Menghentikan..." : "Hentikan Proyek"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onOpenMulaiModal}
          >
            + Proyek Baru
          </button>
        </div>
      </div>

      {showBrief && run.brief && (
        <div
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            padding: "10px 14px",
            marginBottom: "14px",
            fontSize: "12px",
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <strong style={{ color: "var(--cyan)" }}>Produk:</strong>{" "}
            {run.brief.produk || "-"}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong style={{ color: "var(--cyan)" }}>Target Audiens:</strong>{" "}
            {run.brief.target_audiens || "-"}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong style={{ color: "var(--cyan)" }}>Tujuan:</strong>{" "}
            {run.brief.tujuan || "-"}
          </div>
          {run.brief.budget_harian ? (
            <div>
              <strong style={{ color: "var(--cyan)" }}>Budget Harian:</strong> Rp{" "}
              {Number(run.brief.budget_harian).toLocaleString("id-ID")}
            </div>
          ) : null}
        </div>
      )}

      {/* Stepper 5 Fase */}
      <div className="stepper-container">
        {FASES.map((fase, idx) => {
          let nodeClass = "";
          let statusText = "Menunggu";

          if (isFinished) {
            nodeClass = "completed";
            statusText = "Selesai";
          } else if (isStopped && idx === currentIdx) {
            nodeClass = "stopped";
            statusText = "Dihentikan";
          } else if (idx < currentIdx) {
            nodeClass = "completed";
            statusText = "Selesai";
          } else if (idx === currentIdx) {
            if (run.status === "jalan") {
              nodeClass = "active";
              statusText = "Jalan";
            } else if (run.status === "menunggu_persetujuan") {
              nodeClass = "warning";
              statusText = "Review";
            } else if (run.status === "butuh_keputusan") {
              nodeClass = "warning";
              statusText = "Keputusan";
            }
          }

          return (
            <div key={fase.key} className={`step-node ${nodeClass}`}>
              <div className="step-circle">
                {idx < currentIdx || isFinished ? "✓" : idx + 1}
              </div>
              <div className="step-name">{fase.label}</div>
              <div className="step-sub">
                <span
                  className={`step-status-tag ${
                    nodeClass === "completed"
                      ? "status-selesai"
                      : nodeClass === "active"
                      ? "status-jalan"
                      : nodeClass === "warning"
                      ? "status-menunggu"
                      : nodeClass === "stopped"
                      ? "status-butuh-keputusan"
                      : "status-idle"
                  }`}
                >
                  {statusText}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
