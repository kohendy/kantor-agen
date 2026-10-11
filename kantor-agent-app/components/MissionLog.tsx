import { colorOfAgent } from "@/lib/officeConfig";
import { formatClock } from "@/lib/format";
import type { EventRow } from "@/lib/types";

// Dipindahkan dari fungsi `addLog()` pada prototipe, versi read-only dari data nyata.
// Tombol "Setujui" dihapus untuk sementara sesuai permintaan (anon tidak punya izin
// INSERT/UPDATE di Supabase, jadi tidak ada aksi tulis yang bisa dilakukan dari sini).
export function MissionLog({
  events,
  isFullFrame = false,
  isCollapsed = false,
  onToggleCollapse,
  isMobileSheetOpen = false,
  onCloseMobileSheet,
}: {
  events: EventRow[];
  isFullFrame?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileSheetOpen?: boolean;
  onCloseMobileSheet?: () => void;
}) {
  return (
    <section
      className={`card log mission-log-panel ${
        isFullFrame ? "is-full-frame-panel" : ""
      } ${isCollapsed ? "collapsed" : ""} ${
        isMobileSheetOpen ? "is-mobile-open" : ""
      }`}
      aria-label="Mission Log"
    >
      <div className="log-head">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2>Mission Log</h2>
          {isFullFrame && isCollapsed && (
            <span className="ff-badge">{events.length}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {!isCollapsed && <span>terbaru di atas</span>}
          {isFullFrame && onToggleCollapse && (
            <button
              type="button"
              className="ff-chevron-btn"
              aria-label={
                isCollapsed
                  ? "Buka panel Mission Log"
                  : "Lipat panel Mission Log"
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
      {!isCollapsed &&
        (events.length === 0 ? (
          <div className="empty-state">Belum ada aktivitas.</div>
        ) : (
          <ul className="log-list" aria-live="polite">
            {events.map((ev) => (
              <li
                key={ev.id}
                className={ev.status === "review" ? "review" : ""}
              >
                <time>{formatClock(ev.waktu)}</time>
                <span />
                <div className="msg">
                  <span
                    className="tag"
                    style={
                      { "--c": colorOfAgent(ev.agent) } as React.CSSProperties
                    }
                  >
                    {ev.agent}
                  </span>
                  <span className="txt">{ev.pesan}</span>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
