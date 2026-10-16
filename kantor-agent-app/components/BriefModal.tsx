"use client";

import { useState } from "react";
import type { BriefMode } from "@/lib/types";

interface BriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BriefModal({ isOpen, onClose, onSuccess }: BriefModalProps) {
  const [judul, setJudul] = useState("");
  const [mode, setMode] = useState<BriefMode>("diarahkan");
  const [produk, setProduk] = useState("");
  const [targetAudiens, setTargetAudiens] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [budgetHarian, setBudgetHarian] = useState("");
  const [catatanBebas, setCatatanBebas] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul,
          mode,
          isi: {
            produk,
            target_audiens: targetAudiens,
            tujuan,
            budget_harian: budgetHarian ? Number(budgetHarian) : null,
            catatan_bebas: catatanBebas,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengirim brief ke ATLAS");
      }

      // Reset form
      setJudul("");
      setMode("diarahkan");
      setProduk("");
      setTargetAudiens("");
      setTujuan("");
      setBudgetHarian("");
      setCatatanBebas("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem" }}>📋</span>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
              Kirim Brief Kampanye ke ATLAS
            </h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div
              className="error-banner"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                color: "var(--red, #ef4444)",
                padding: "8px 12px",
                borderRadius: "6px",
                marginBottom: "12px",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}

          {/* Mode Selector */}
          <div className="form-group" style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "0.85rem" }}>
              Mode Pengambilan Keputusan Manager:
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => setMode("diarahkan")}
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${mode === "diarahkan" ? "var(--accent, #6366f1)" : "var(--border, #333)"}`,
                  background: mode === "diarahkan" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  color: mode === "diarahkan" ? "var(--text, #fff)" : "var(--muted, #888)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                <b>🎯 Diarahkan</b>
                <div style={{ fontSize: "0.74rem", opacity: 0.8, marginTop: "2px" }}>
                  ATLAS patuh instruksi CEO & dapat bertanya maks 2x.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("manager_bebas")}
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${mode === "manager_bebas" ? "var(--accent, #6366f1)" : "var(--border, #333)"}`,
                  background: mode === "manager_bebas" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  color: mode === "manager_bebas" ? "var(--text, #fff)" : "var(--muted, #888)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                <b>⚡ Manager Bebas</b>
                <div style={{ fontSize: "0.74rem", opacity: 0.8, marginTop: "2px" }}>
                  ATLAS mandiri putuskan alur, dilarang bertanya.
                </div>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="brief-judul">Judul Proyek / Brief *</label>
            <input
              id="brief-judul"
              type="text"
              required
              maxLength={120}
              placeholder="Contoh: Peluncuran Sepatu Daur Ulang Plastik Laut"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="brief-produk">Deskripsi Produk *</label>
            <textarea
              id="brief-produk"
              required
              rows={2}
              maxLength={1000}
              placeholder="Jelaskan produk, fitur kunci, harga, dan keunikan"
              value={produk}
              onChange={(e) => setProduk(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className="form-group">
              <label htmlFor="brief-target">Target Audiens</label>
              <input
                id="brief-target"
                type="text"
                maxLength={1000}
                placeholder="Contoh: Dewasa muda 20-35 peduli lingkungan"
                value={targetAudiens}
                onChange={(e) => setTargetAudiens(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="brief-budget">
                Budget Harian (Rp)
                <span style={{ fontSize: "0.72rem", color: "var(--muted, #888)", marginLeft: "4px" }}>
                  (Plafon maks Rp50.000)
                </span>
              </label>
              <input
                id="brief-budget"
                type="number"
                min={0}
                step={5000}
                placeholder="50000"
                value={budgetHarian}
                onChange={(e) => setBudgetHarian(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="brief-tujuan">Tujuan Kampanye</label>
            <input
              id="brief-tujuan"
              type="text"
              maxLength={1000}
              placeholder="Contoh: Peluncuran penuh dari riset hingga iklan konversi"
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="brief-catatan">Catatan Bebas / Arahan Spesifik</label>
            <textarea
              id="brief-catatan"
              rows={2}
              maxLength={1000}
              placeholder="Arahan khusus untuk ATLAS (misal: 'hanya riset', atau catatan positioning)"
              value={catatanBebas}
              onChange={(e) => setCatatanBebas(e.target.value)}
            />
          </div>

          <div className="modal-foot" style={{ marginTop: "14px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Mengirim ke ATLAS..." : "Kirim Brief ke ATLAS"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
