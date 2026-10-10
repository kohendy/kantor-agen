import { colorOfAgent } from "@/lib/officeConfig";
import { formatClock } from "@/lib/format";
import type { EventRow } from "@/lib/types";

// Dipindahkan dari fungsi `addLog()` pada prototipe, versi read-only dari data nyata.
// Tombol "Setujui" dihapus untuk sementara sesuai permintaan (anon tidak punya izin
// INSERT/UPDATE di Supabase, jadi tidak ada aksi tulis yang bisa dilakukan dari sini).
export function MissionLog({ events }: { events: EventRow[] }) {
  return (
    <section className="card log mission-log-panel" aria-label="Mission Log">
      <div className="log-head">
        <h2>Mission Log</h2>
        <span>terbaru di atas</span>
      </div>
      {events.length === 0 ? (
        <div className="empty-state">Belum ada aktivitas.</div>
      ) : (
        <ul className="log-list" aria-live="polite">
          {events.map((ev) => (
            <li key={ev.id} className={ev.status === "review" ? "review" : ""}>
              <time>{formatClock(ev.waktu)}</time>
              <span />
              <div className="msg">
                <span className="tag" style={{ "--c": colorOfAgent(ev.agent) } as React.CSSProperties}>
                  {ev.agent}
                </span>
                <span className="txt">{ev.pesan}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
