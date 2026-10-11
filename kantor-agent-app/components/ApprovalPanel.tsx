"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { colorOfAgent } from "@/lib/officeConfig";
import { formatClock } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ApprovalRow, PipelineStepRow } from "@/lib/types";

const emptySubscribe = () => () => {};

type Keputusan = "disetujui" | "ditolak";

const CATATAN_MAX_LENGTH = 500;

interface BriefAngle {
  nama?: string;
  alasan?: string;
  bukti?: string;
  risiko?: string;
}

interface BriefRisetOutput {
  ringkasan?: string;
  kompetitor?: string[];
  audiens?: string[];
  angle_rekomendasi?: BriefAngle[];
  klaim_berisiko?: string[];
  celah_data?: string[];
  sumber?: string[];
  keyakinan?: "tinggi" | "sedang" | "rendah" | string;
  [key: string]: unknown;
}

async function kirimKeputusan(id: number, keputusan: Keputusan, catatan: string) {
  const res = await fetch(`/api/approvals/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keputusan, catatan: catatan.trim() || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? "Gagal mengirim keputusan");
  }
  return body;
}

function StepDetailModal({
  stepId,
  gate,
  onClose,
  triggerEl,
}: {
  stepId: number;
  gate?: string | null;
  onClose: () => void;
  triggerEl?: HTMLElement | null;
}) {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [step, setStep] = useState<PipelineStepRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Manajemen fokus: pindah ke modal saat dibuka, kembali ke triggerEl saat ditutup
  useEffect(() => {
    if (isClient) {
      dialogRef.current?.focus();
    }
    return () => {
      triggerEl?.focus();
    };
  }, [isClient, triggerEl]);

  // Listener tombol Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Ambil data step dari Supabase via client authenticated
  useEffect(() => {
    let active = true;

    async function loadStep() {
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase
          .from("pipeline_steps")
          .select("*")
          .eq("id", stepId)
          .single();

        if (!active) return;
        if (err) {
          setError(err.message);
        } else {
          setStep(data as PipelineStepRow);
        }
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Gagal memuat detail");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStep();

    return () => {
      active = false;
    };
  }, [stepId]);

  if (!isClient) return null;

  const isRisetGate = gate?.toLowerCase() === "riset";
  const output: BriefRisetOutput = (step?.output as BriefRisetOutput) ?? {};
  const keyakinan = (output.keyakinan || "sedang").toLowerCase();
  const angles = Array.isArray(output.angle_rekomendasi)
    ? output.angle_rekomendasi
    : [];
  const kompetitor = Array.isArray(output.kompetitor) ? output.kompetitor : [];
  const audiens = Array.isArray(output.audiens) ? output.audiens : [];
  const klaim = Array.isArray(output.klaim_berisiko) ? output.klaim_berisiko : [];
  const celah = Array.isArray(output.celah_data) ? output.celah_data : [];
  const sumber = Array.isArray(output.sumber) ? output.sumber : [];

  const modalContent = (
    <div
      className="brief-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="brief-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isRisetGate ? "Detail Brief Riset" : `Detail Output Step #${stepId}`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="brief-modal-head">
          <h3>{isRisetGate ? "Detail Brief Riset" : `Detail Output Step #${stepId}`}</h3>
          <button
            type="button"
            className="brief-modal-close"
            onClick={onClose}
            aria-label="Tutup modal detail"
          >
            &times;
          </button>
        </div>

        <div className="brief-modal-body">
          {loading && <p className="note">Memuat data detail step #{stepId} dari database...</p>}
          {error && (
            <p className="note" style={{ color: "var(--amber)" }}>
              Gagal memuat data: {error}
            </p>
          )}

          {!loading && !error && !step && (
            <p className="note">Data step #{stepId} tidak ditemukan.</p>
          )}

          {!loading && !error && step && (
            <>
              <div className="brief-meta-bar">
                <span
                  className="tag"
                  style={{ "--c": colorOfAgent(step.agen || "ATHENA") } as React.CSSProperties}
                >
                  {step.agen || "ATHENA"}
                </span>
                {step.fase && <span className="pill">{step.fase}</span>}
                {isRisetGate && (
                  <span className={`badge-keyakinan ${keyakinan}`}>
                    Keyakinan: {output.keyakinan ?? "sedang"}
                  </span>
                )}
                {step.revisi_ke > 0 && (
                  <span className="pill r">Revisi ke-{step.revisi_ke}</span>
                )}
              </div>

              {isRisetGate ? (
                <>
                  <div className="brief-section">
                    <h4>Ringkasan Riset</h4>
                    <p className="brief-text">{output.ringkasan || "(Belum ada ringkasan)"}</p>
                  </div>

                  {angles.length > 0 && (
                    <div className="brief-section">
                      <h4>Angle Rekomendasi ({angles.length})</h4>
                      {angles.map((a, idx) => (
                        <div key={idx} className="angle-card">
                          <div className="angle-card-title">
                            {idx + 1}. {a.nama || `Angle ${idx + 1}`}
                          </div>
                          {a.alasan && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Alasan:</span>
                              <span>{a.alasan}</span>
                            </div>
                          )}
                          {a.bukti && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Bukti:</span>
                              <span>{a.bukti}</span>
                            </div>
                          )}
                          {a.risiko && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Risiko:</span>
                              <span>{a.risiko}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {kompetitor.length > 0 && (
                    <div className="brief-section">
                      <h4>Kompetitor Teridentifikasi ({kompetitor.length})</h4>
                      <ul className="brief-list">
                        {kompetitor.map((k, idx) => (
                          <li key={idx}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {audiens.length > 0 && (
                    <div className="brief-section">
                      <h4>Target Audiens ({audiens.length})</h4>
                      <ul className="brief-list">
                        {audiens.map((aud, idx) => (
                          <li key={idx}>{aud}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {klaim.length > 0 && (
                    <div className="brief-section">
                      <h4>Klaim Berisiko ({klaim.length})</h4>
                      <ul className="brief-list">
                        {klaim.map((kl, idx) => (
                          <li key={idx}>{kl}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {celah.length > 0 && (
                    <div className="brief-section">
                      <h4>Celah Data / Butuh Verifikasi ({celah.length})</h4>
                      <ul className="brief-list">
                        {celah.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sumber.length > 0 && (
                    <div className="brief-section">
                      <h4>Sumber Terverifikasi ({sumber.length})</h4>
                      <ul className="brief-list">
                        {sumber.map((s, idx) => {
                          const isHttp =
                            typeof s === "string" &&
                            (s.startsWith("http://") || s.startsWith("https://"));
                          return (
                            <li key={idx}>
                              {isHttp ? (
                                <a
                                  href={s}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="brief-link"
                                >
                                  {s}
                                </a>
                              ) : (
                                <span>{s}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="brief-section">
                  <h4>Output Step ({step.fase || step.agen || "Output"})</h4>
                  <pre className="brief-json-pre">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function ApprovalItem({
  approval,
  onOpenDetail,
}: {
  approval: ApprovalRow;
  onOpenDetail?: (stepId: number, gate: string | null | undefined, triggerEl: HTMLElement) => void;
}) {
  const [catatan, setCatatan] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(keputusan: Keputusan) {
    setPending(true);
    setError(null);
    try {
      await kirimKeputusan(approval.id, keputusan, catatan);
      // Baris akan hilang dari daftar lewat update realtime pada tabel approvals.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim keputusan");
      setPending(false);
    }
  }

  const isRisetGate = approval.gate?.toLowerCase() === "riset";

  return (
    <li className="approval-item">
      <div className="msg">
        <span
          className="tag"
          style={{ "--c": colorOfAgent(approval.agent) } as React.CSSProperties}
        >
          {approval.agent}
        </span>
        <time>{formatClock(approval.dibuat)}</time>
      </div>
      <p className="approval-ringkasan">{approval.ringkasan ?? "(tanpa ringkasan)"}</p>

      {approval.step_id && (
        <button
          type="button"
          className="btn-detail-riset"
          onClick={(e) => onOpenDetail?.(approval.step_id!, approval.gate, e.currentTarget)}
        >
          {isRisetGate ? "\u{1F50D} Lihat detail riset" : "\u{1F50D} Lihat detail"}
        </button>
      )}

      <textarea
        className="approval-note"
        placeholder="Catatan (opsional)"
        value={catatan}
        disabled={pending}
        onChange={(e) => setCatatan(e.target.value)}
        rows={2}
        maxLength={CATATAN_MAX_LENGTH}
      />
      <p className="note" style={{ margin: "2px 0", fontSize: "0.75rem", opacity: 0.7 }}>
        {catatan.length}/{CATATAN_MAX_LENGTH}
      </p>
      {error && (
        <p className="note" style={{ color: "var(--amber)", margin: "4px 0" }}>
          {error}
        </p>
      )}
      <div className="approval-actions">
        <button
          type="button"
          className="approve approve-ok"
          disabled={pending}
          onClick={() => handle("disetujui")}
        >
          Setujui
        </button>
        <button
          type="button"
          className="approve approve-no"
          disabled={pending}
          onClick={() => handle("ditolak")}
        >
          Tolak
        </button>
      </div>
    </li>
  );
}

export function ApprovalPanel({
  approvals,
  isFullFrame = false,
  isCollapsed = false,
  onToggleCollapse,
  isMobileSheetOpen = false,
  onCloseMobileSheet,
}: {
  approvals: ApprovalRow[];
  isFullFrame?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileSheetOpen?: boolean;
  onCloseMobileSheet?: () => void;
}) {
  const [selectedModal, setSelectedModal] = useState<{
    stepId: number;
    gate?: string | null;
    triggerEl?: HTMLElement | null;
  } | null>(null);

  return (
    <section
      className={`card log approval-panel ${
        isFullFrame ? "is-full-frame-panel" : ""
      } ${isCollapsed ? "collapsed" : ""} ${
        isMobileSheetOpen ? "is-mobile-open" : ""
      }`}
      aria-label="Menunggu persetujuan"
    >
      <div className="log-head">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2>Menunggu Persetujuan</h2>
          {isFullFrame && isCollapsed && (
            <span className="ff-badge">{approvals.length} pending</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {!isCollapsed && <span>{approvals.length} pending</span>}
          {isFullFrame && onToggleCollapse && (
            <button
              type="button"
              className="ff-chevron-btn"
              aria-label={
                isCollapsed
                  ? "Buka panel persetujuan"
                  : "Lipat panel persetujuan"
              }
              onClick={onToggleCollapse}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: isCollapsed ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {isMobileSheetOpen && onCloseMobileSheet && (
            <button
              type="button"
              className="ff-close-btn"
              aria-label="Tutup panel"
              onClick={onCloseMobileSheet}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div
        className="approval-panel-body"
        style={isCollapsed ? { display: "none" } : undefined}
      >
        {approvals.length === 0 ? (
          <div className="empty-state">Tidak ada yang menunggu persetujuan.</div>
        ) : (
          <ul className="log-list approval-list" aria-live="polite">
            {approvals.map((a) => (
              <ApprovalItem
                key={a.id}
                approval={a}
                onOpenDetail={(sid, g, el) =>
                  setSelectedModal({ stepId: sid, gate: g, triggerEl: el })
                }
              />
            ))}
          </ul>
        )}
      </div>

      {selectedModal && (
        <StepDetailModal
          key={selectedModal.stepId}
          stepId={selectedModal.stepId}
          gate={selectedModal.gate}
          triggerEl={selectedModal.triggerEl}
          onClose={() => setSelectedModal(null)}
        />
      )}
    </section>
  );
}
