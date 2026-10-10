"use client";

import { useState } from "react";

interface MulaiProyekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MulaiProyekModal({
  isOpen,
  onClose,
  onSuccess,
}: MulaiProyekModalProps) {
  const [judul, setJudul] = useState("");
  const [produk, setProduk] = useState("");
  const [targetAudiens, setTargetAudiens] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [budgetHarian, setBudgetHarian] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/projects/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul,
          produk,
          target_audiens: targetAudiens,
          tujuan,
          budget_harian: budgetHarian ? Number(budgetHarian) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memulai proyek");
      }

      // Reset form
      setJudul("");
      setProduk("");
      setTargetAudiens("");
      setTujuan("");
      setBudgetHarian("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Mulai Proyek Baru</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <p className="note" style={{ color: "var(--pink)", marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div className="form-group">
            <label htmlFor="proyek-judul">Judul Proyek *</label>
            <input
              id="proyek-judul"
              type="text"
              required
              placeholder="Mis. Kampanye Serum Glowing Ramadhan"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="proyek-produk">Produk / Layanan *</label>
            <input
              id="proyek-produk"
              type="text"
              required
              placeholder="Mis. Paket Serum Vitamin C 20ml"
              value={produk}
              onChange={(e) => setProduk(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="proyek-audiens">Target Audiens *</label>
            <textarea
              id="proyek-audiens"
              required
              rows={2}
              placeholder="Mis. Wanita 22-35 tahun, aktif di Instagram/TikTok, peduli masalah flek hitam"
              value={targetAudiens}
              onChange={(e) => setTargetAudiens(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="proyek-tujuan">Tujuan Kampanye *</label>
            <textarea
              id="proyek-tujuan"
              required
              rows={2}
              placeholder="Mis. Dapatkan 200 konversi penjualan web dengan target CPA di bawah Rp 45.000"
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="proyek-budget">Budget Harian (Opsional, Rp)</label>
            <input
              id="proyek-budget"
              type="number"
              min="0"
              step="10000"
              placeholder="Mis. 300000"
              value={budgetHarian}
              onChange={(e) => setBudgetHarian(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="pause"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? "Memulai..." : "Mulai Proyek & Jalankan Orkestrator"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
