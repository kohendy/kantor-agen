"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { colorOfAgent } from "@/lib/officeConfig";
import { formatClock } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ApprovalRow, PipelineStepRow, BriefRow } from "@/lib/types";

const emptySubscribe = () => () => {};

type Keputusan = "disetujui" | "ditolak";

const CATATAN_MAX_LENGTH = 500;

interface BriefAngle {
  nama?: string;
  alasan?: string;
  bukti?: string;
  risiko?: string;
}

interface UmpanBalikItem {
  butir?: string;
  status?: string;
  catatan?: string;
  url_bukti?: string[];
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
  tingkat_bukti?: string;
  umpan_balik_ditangani?: UmpanBalikItem[];
  [key: string]: unknown;
}

function renderAnnotated(text: unknown): React.ReactNode {
  if (typeof text !== "string") {
    return text ? String(text) : null;
  }
  if (!text) return "";

  const badges: { key: string; label: string; className: string }[] = [];
  const lower = text.toLowerCase();

  const isLeadingInferensi = /^\s*inferensi:\s*/i.test(text);
  const hasInferensi = isLeadingInferensi || /\binferensi:\s*/i.test(text);
  const hasHistoris = lower.includes("(data historis") || /\bdata historis\b/i.test(text);
  const hasIndikatif = lower.includes("(indikatif)");
  const hasKonteks = lower.includes("(konteks berbeda dari target)");

  if (hasInferensi) {
    badges.push({ key: "inferensi", label: "Inferensi", className: "brief-badge inferensi" });
  }
  if (hasHistoris) {
    badges.push({ key: "historis", label: "Data historis", className: "brief-badge historis" });
  }
  if (hasIndikatif) {
    badges.push({ key: "indikatif", label: "Indikatif", className: "brief-badge indikatif" });
  }
  if (hasKonteks) {
    badges.push({ key: "konteks", label: "Konteks berbeda", className: "brief-badge konteks" });
  }

  let displayText = text;
  if (isLeadingInferensi) {
    displayText = text.replace(/^\s*inferensi:\s*/i, "");
  }

  if (badges.length === 0) {
    return displayText;
  }

  return (
    <>
      <span className="brief-badges">
        {badges.map((b) => (
          <span key={b.key} className={b.className}>
            {b.label}
          </span>
        ))}
      </span>
      {displayText}
    </>
  );
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

  // Kunci scroll body selama modal terbuka
  useEffect(() => {
    if (!isClient) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isClient]);

  // Listener keyboard: Escape (fase capture) dan Jebakan Fokus (Tab trap)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusableSelector =
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusableEls = Array.from(
          dialog.querySelectorAll<HTMLElement>(focusableSelector)
        ).filter(
          (el) =>
            el.offsetParent !== null ||
            window.getComputedStyle(el).display !== "none"
        );

        if (focusableEls.length === 0) {
          e.preventDefault();
          dialog.focus();
          return;
        }

        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
          // Tab mundur (Shift+Tab)
          if (
            document.activeElement === firstEl ||
            document.activeElement === dialog ||
            !dialog.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          // Tab maju (Tab)
          if (
            document.activeElement === lastEl ||
            document.activeElement === dialog ||
            !dialog.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
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
  let rawOutput = step?.output;
  if (typeof rawOutput === "string") {
    try {
      rawOutput = JSON.parse(rawOutput);
    } catch {
      // Abaikan jika bukan JSON string valid
    }
  }
  const output: BriefRisetOutput =
    rawOutput && typeof rawOutput === "object"
      ? (rawOutput as BriefRisetOutput)
      : {};
  const keyakinan = (output.keyakinan || "sedang").toLowerCase();
  const angles = Array.isArray(output.angle_rekomendasi)
    ? output.angle_rekomendasi
    : [];
  const kompetitor = Array.isArray(output.kompetitor) ? output.kompetitor : [];
  const audiens = Array.isArray(output.audiens) ? output.audiens : [];
  const klaim = Array.isArray(output.klaim_berisiko) ? output.klaim_berisiko : [];
  const celah = Array.isArray(output.celah_data) ? output.celah_data : [];
  const sumber = Array.isArray(output.sumber) ? output.sumber : [];

  const rawUmpanBalik = Array.isArray(output.umpan_balik_ditangani)
    ? output.umpan_balik_ditangani
    : [];

  const umpanBalikList = rawUmpanBalik
    .filter((item): item is NonNullable<typeof item> => typeof item === "object" && item !== null)
    .map((item, idx) => {
      const butir = typeof item.butir === "string" ? item.butir : `Butir ${idx + 1}`;
      const statusRaw = typeof item.status === "string" ? item.status.trim() : "";
      const statusLower = statusRaw.toLowerCase();

      let statusCode: "ditangani" | "sebagian" | "tidak_ditemukan" | "lainnya" = "lainnya";
      let statusLabel = statusRaw || "Status tidak diketahui";

      if (statusLower === "ditangani") {
        statusCode = "ditangani";
        statusLabel = "Ditangani";
      } else if (statusLower === "sebagian") {
        statusCode = "sebagian";
        statusLabel = "Sebagian";
      } else if (statusLower === "tidak_ditemukan" || statusLower === "tidak ditemukan") {
        statusCode = "tidak_ditemukan";
        statusLabel = "Tidak ditemukan";
      }

      const catatan = typeof item.catatan === "string" ? item.catatan : "";
      const rawUrls = Array.isArray(item.url_bukti) ? item.url_bukti : [];
      const urlBukti = rawUrls.filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0
      );

      return {
        butir,
        statusRaw,
        statusCode,
        statusLabel,
        catatan,
        urlBukti,
      };
    });

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
                    <p className="brief-text">{renderAnnotated(output.ringkasan || "(Belum ada ringkasan)")}</p>
                  </div>

                  {umpanBalikList.length > 0 && (
                    <div className="brief-section">
                      <h4>Umpan Balik Revisi ({umpanBalikList.length})</h4>
                      {umpanBalikList.map((item, idx) => (
                        <div key={idx} className="fb-item">
                          <div className="fb-item-head">
                            <span className="fb-item-butir">
                              {idx + 1}. {renderAnnotated(item.butir)}
                            </span>
                            <span className={`fb-status ${item.statusCode}`}>
                              {item.statusLabel}
                            </span>
                          </div>
                          {item.catatan && (
                            <div className="fb-item-row">
                              <span className="fb-item-label">Catatan:</span>
                              <span className="fb-item-val">{renderAnnotated(item.catatan)}</span>
                            </div>
                          )}
                          <div className="fb-item-row">
                            <span className="fb-item-label">Bukti:</span>
                            <div className="fb-item-val">
                              {item.urlBukti.length === 0 ? (
                                <span className="fb-empty-wrap">
                                  <span className="brief-note">Tidak ada bukti tercantum</span>
                                  {item.statusCode === "ditangani" && (
                                    <span className="brief-note warn"> &bull; ⚠️ Bukti tidak tercantum</span>
                                  )}
                                </span>
                              ) : (
                                <ul className="brief-list fb-proof-list">
                                  {item.urlBukti.map((u, uIdx) => {
                                    const isHttp =
                                      u.startsWith("http://") || u.startsWith("https://");
                                    return (
                                      <li key={uIdx}>
                                        {isHttp ? (
                                          <a
                                            href={u}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="brief-link"
                                          >
                                            {u}
                                          </a>
                                        ) : (
                                          <span>{u}</span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {angles.length > 0 && (
                    <div className="brief-section">
                      <h4>Angle Rekomendasi ({angles.length})</h4>
                      {angles.map((a, idx) => (
                        <div key={idx} className="angle-card">
                          <div className="angle-card-title">
                            {idx + 1}. {renderAnnotated(a.nama || `Angle ${idx + 1}`)}
                          </div>
                          {a.alasan && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Alasan:</span>
                              <span>{renderAnnotated(a.alasan)}</span>
                            </div>
                          )}
                          {a.bukti && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Bukti:</span>
                              <span>{renderAnnotated(a.bukti)}</span>
                            </div>
                          )}
                          {a.risiko && (
                            <div className="angle-card-row">
                              <span className="angle-card-label">Risiko:</span>
                              <span>{renderAnnotated(a.risiko)}</span>
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
                          <li key={idx}>{renderAnnotated(k)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {audiens.length > 0 && (
                    <div className="brief-section">
                      <h4>Target Audiens ({audiens.length})</h4>
                      <ul className="brief-list">
                        {audiens.map((aud, idx) => (
                          <li key={idx}>{renderAnnotated(aud)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {klaim.length > 0 && (
                    <div className="brief-section">
                      <h4>Klaim Berisiko ({klaim.length})</h4>
                      <ul className="brief-list">
                        {klaim.map((kl, idx) => (
                          <li key={idx}>{renderAnnotated(kl)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {celah.length > 0 && (
                    <div className="brief-section">
                      <h4>Celah Data / Butuh Verifikasi ({celah.length})</h4>
                      <ul className="brief-list">
                        {celah.map((c, idx) => (
                          <li key={idx}>{renderAnnotated(c)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(sumber.length > 0 || (typeof output.tingkat_bukti === "string" && output.tingkat_bukti.trim().length > 0)) && (
                    <div className="brief-section">
                      <h4>Sumber hasil pencarian web ({sumber.length})</h4>
                      {typeof output.tingkat_bukti === "string" && output.tingkat_bukti.trim().length > 0 && (
                        <p className="brief-note">Tingkat bukti: {output.tingkat_bukti.trim()}</p>
                      )}
                      {sumber.length > 0 && (
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
                      )}
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

function AtlasClarificationItem({
  brief,
  onAnswered,
}: {
  brief: BriefRow;
  onAnswered?: () => void;
}) {
  const [jawaban, setJawaban] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleKirimJawaban(e: React.FormEvent) {
    e.preventDefault();
    if (!jawaban.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/jawab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jawaban: jawaban.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengirim jawaban klarifikasi");
      }
      setJawaban("");
      onAnswered?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li
      className="log-row approval-row clarification-row"
      style={{
        borderLeft: "3px solid var(--accent, #6366f1)",
        background: "rgba(99, 102, 241, 0.03)",
        padding: "10px",
        marginBottom: "8px",
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div className="log-agent">
        <span
          className="tag"
          style={{ "--c": colorOfAgent("ATLAS") } as React.CSSProperties}
        >
          ATLAS
        </span>
        <span className="log-time">
          {formatClock(brief.diperbarui || brief.dibuat)}
        </span>
      </div>

      <div className="approval-body" style={{ marginTop: "4px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <strong style={{ fontSize: "0.88rem" }}>
            Klarifikasi Brief #{brief.id}: {brief.judul}
          </strong>
          <span
            style={{
              fontSize: "0.72rem",
              background: "rgba(236, 72, 153, 0.15)",
              color: "#ec4899",
              padding: "2px 6px",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            Putaran {brief.putaran_tanya || 0} / 2
          </span>
        </div>

        <div
          style={{
            background: "rgba(99, 102, 241, 0.08)",
            padding: "8px 10px",
            borderRadius: "4px",
            marginBottom: "8px",
            fontSize: "0.85rem",
          }}
        >
          <div
            style={{
              fontSize: "0.74rem",
              color: "var(--muted)",
              marginBottom: "2px",
            }}
          >
            Pertanyaan Klarifikasi ATLAS:
          </div>
          <div style={{ fontWeight: 500, color: "var(--text, #fff)" }}>
            "{brief.pertanyaan}"
          </div>
        </div>

        {error && (
          <div
            style={{
              color: "var(--red, #ef4444)",
              fontSize: "0.78rem",
              marginBottom: "6px",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleKirimJawaban}
          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
        >
          <textarea
            value={jawaban}
            onChange={(e) => setJawaban(e.target.value)}
            placeholder="Ketik jawaban klarifikasi untuk ATLAS..."
            rows={2}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "0.82rem",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "var(--bg, #111)",
              color: "inherit",
              resize: "vertical",
            }}
          />
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}
          >
            <button
              type="submit"
              disabled={submitting || !jawaban.trim()}
              className="btn btn-primary"
              style={{ fontSize: "0.78rem", padding: "4px 10px" }}
            >
              {submitting ? "Mengirim..." : "Kirim Jawaban ke ATLAS"}
            </button>
          </div>
        </form>
      </div>
    </li>
  );
}

export function ApprovalPanel({
  approvals,
  clarificationBriefs = [],
  onBriefAnswered,
  isFullFrame = false,
  isCollapsed = false,
  onToggleCollapse,
  isMobileSheetOpen = false,
  onCloseMobileSheet,
}: {
  approvals: ApprovalRow[];
  clarificationBriefs?: BriefRow[];
  onBriefAnswered?: () => void;
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

  const totalItems = approvals.length + clarificationBriefs.length;

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
            <span className="ff-badge">{totalItems} pending</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {!isCollapsed && <span>{totalItems} pending</span>}
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
        {totalItems === 0 ? (
          <div className="empty-state">Tidak ada yang menunggu persetujuan.</div>
        ) : (
          <ul className="log-list approval-list" aria-live="polite">
            {clarificationBriefs.map((b) => (
              <AtlasClarificationItem
                key={`clarif-${b.id}`}
                brief={b}
                onAnswered={onBriefAnswered}
              />
            ))}
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
