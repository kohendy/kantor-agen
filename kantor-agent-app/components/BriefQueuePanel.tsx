"use client";

import { useState } from "react";
import type { BriefRow, BriefStatus } from "@/lib/types";
import { formatClock } from "@/lib/format";

interface BriefQueuePanelProps {
  briefs: BriefRow[];
  loading?: boolean;
  onOpenBriefModal?: () => void;
  onRefresh?: () => void;
}

const STATUS_LABELS: Record<BriefStatus, { label: string; color: string; bg: string }> = {
  antre: { label: "Antre", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" },
  dipertimbangkan: { label: "Dipertimbangkan ATLAS", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
  butuh_klarifikasi: { label: "Butuh Klarifikasi", color: "#ec4899", bg: "rgba(236, 72, 153, 0.15)" },
  didelegasikan: { label: "Didelegasikan", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" },
  berjalan: { label: "Sedang Berjalan", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
  selesai: { label: "Selesai", color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)" },
  dihentikan: { label: "Dihentikan", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
  dibatalkan: { label: "Dihentikan", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
};

export function BriefQueuePanel({
  briefs,
  loading = false,
  onOpenBriefModal,
  onRefresh,
}: BriefQueuePanelProps) {
  const [stoppingId, setStoppingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleStop(briefId: number) {
    if (!confirm(`Hentikan dan batalkan brief #${briefId}?`)) return;
    setStoppingId(briefId);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/briefs/${briefId}/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menghentikan brief");
      }
      onRefresh?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menghentikan brief");
    } finally {
      setStoppingId(null);
    }
  }

  const activeBriefs = briefs.filter(
    (b) => b.status !== "selesai" && b.status !== "dihentikan" && b.status !== "dibatalkan"
  );
  const historyBriefs = briefs.filter(
    (b) => b.status === "selesai" || b.status === "dihentikan" || b.status === "dibatalkan"
  );

  return (
    <section className="card brief-queue-card" aria-label="Antrean Brief">
      <div
        className="card-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.1rem" }}>📑</span>
          <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
            Antrean Brief ATLAS
          </h2>
          <span
            style={{
              fontSize: "0.75rem",
              background: "var(--accent-dim, rgba(99, 102, 241, 0.2))",
              color: "var(--accent, #6366f1)",
              padding: "2px 8px",
              borderRadius: "12px",
              fontWeight: 600,
            }}
          >
            {activeBriefs.length} aktif
          </span>
        </div>

        {onOpenBriefModal && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenBriefModal}
            style={{ fontSize: "0.8rem", padding: "4px 10px" }}
          >
            + Brief Baru
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(239, 68, 68, 0.15)",
            color: "var(--red, #ef4444)",
            fontSize: "0.8rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className="brief-list" style={{ maxHeight: "360px", overflowY: "auto", padding: "8px" }}>
        {loading && briefs.length === 0 ? (
          <p className="note" style={{ textAlign: "center", padding: "20px 0" }}>
            Memuat antrean brief...
          </p>
        ) : briefs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--muted)" }}>
            <p style={{ margin: "0 0 8px", fontSize: "0.9rem" }}>Belum ada brief dalam antrean.</p>
            {onOpenBriefModal && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onOpenBriefModal}
                style={{ fontSize: "0.8rem" }}
              >
                Buat Brief Pertama untuk ATLAS
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {briefs.map((b) => {
              const statusMeta = STATUS_LABELS[b.status] || {
                label: b.status,
                color: "#888",
                bg: "rgba(136, 136, 136, 0.15)",
              };
              const isStoppable =
                b.status !== "selesai" &&
                b.status !== "dihentikan" &&
                b.status !== "dibatalkan";

              return (
                <div
                  key={b.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    background: "var(--card-subtle, rgba(255, 255, 255, 0.02))",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                          #{b.id} {b.judul}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "rgba(255,255,255,0.06)",
                            color: "var(--muted)",
                          }}
                        >
                          {b.mode === "manager_bebas" ? "⚡ Bebas" : "🎯 Diarahkan"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "2px" }}>
                        Produk: {b.isi?.produk || "-"}
                        {b.isi?.budget_harian
                          ? ` • Budget: Rp${Number(b.isi.budget_harian).toLocaleString("id-ID")}/hari`
                          : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "10px",
                          color: statusMeta.color,
                          background: statusMeta.bg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statusMeta.label}
                      </span>

                      {isStoppable && (
                        <button
                          type="button"
                          onClick={() => handleStop(b.id)}
                          disabled={stoppingId === b.id}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border)",
                            color: "var(--red, #ef4444)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          {stoppingId === b.id ? "..." : "Stop"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Pertanyaan klarifikasi jika butuh klarifikasi */}
                  {b.status === "butuh_klarifikasi" && b.pertanyaan && (
                    <div
                      style={{
                        background: "rgba(236, 72, 153, 0.08)",
                        borderLeft: "3px solid #ec4899",
                        padding: "6px 10px",
                        borderRadius: "0 4px 4px 0",
                        fontSize: "0.78rem",
                      }}
                    >
                      <b>ATLAS bertanya:</b> "{b.pertanyaan}"
                    </div>
                  )}

                  {/* Rencana delegasi jika sudah ada */}
                  {b.rencana?.departemen && b.rencana.departemen.length > 0 && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Alur:</span>
                      {b.rencana.departemen.map((d, idx) => (
                        <span
                          key={d.id || idx}
                          style={{
                            background:
                              b.departemen_aktif === d.id
                                ? "rgba(16, 185, 129, 0.2)"
                                : "rgba(255,255,255,0.05)",
                            color:
                              b.departemen_aktif === d.id
                                ? "var(--green, #10b981)"
                                : "inherit",
                            padding: "1px 6px",
                            borderRadius: "3px",
                            fontWeight: b.departemen_aktif === d.id ? 600 : 400,
                          }}
                        >
                          {d.nama || d.id}
                          {idx < (b.rencana?.departemen?.length || 0) - 1 ? " →" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
