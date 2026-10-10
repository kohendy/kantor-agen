"use client";

import { useState } from "react";
import { colorOfAgent } from "@/lib/officeConfig";
import { formatClock } from "@/lib/format";
import type { ApprovalRow } from "@/lib/types";

type Keputusan = "disetujui" | "ditolak";

const CATATAN_MAX_LENGTH = 500;

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

function ApprovalItem({ approval }: { approval: ApprovalRow }) {
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

export function ApprovalPanel({ approvals }: { approvals: ApprovalRow[] }) {
  return (
    <section className="card log approval-panel" aria-label="Menunggu persetujuan">
      <div className="log-head">
        <h2>Menunggu Persetujuan</h2>
        <span>{approvals.length} pending</span>
      </div>
      {approvals.length === 0 ? (
        <div className="empty-state">Tidak ada yang menunggu persetujuan.</div>
      ) : (
        <ul className="log-list approval-list" aria-live="polite">
          {approvals.map((a) => (
            <ApprovalItem key={a.id} approval={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
