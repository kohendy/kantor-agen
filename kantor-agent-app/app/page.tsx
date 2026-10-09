"use client";

import { useOfficeData } from "@/lib/useOfficeData";
import { MissionLog } from "@/components/MissionLog";
import { OfficeStage } from "@/components/OfficeStage";

export default function Home() {
  const { agents, events, loading, error, realtimeConnected } = useOfficeData();

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Kantor Agent</h1>
          <p>
            Kantor kampanye isometrik. Aktivitas di Mission Log berasal dari tabel{" "}
            <code>events</code> di Supabase, bukan data contoh.
          </p>
        </div>
      </header>

      {error && (
        <p className="note" style={{ color: "var(--amber)" }}>
          Gagal memuat data dari Supabase: {error}
        </p>
      )}

      {loading ? (
        <p className="note">Memuat data kantor...</p>
      ) : (
        <div className="main">
          <MissionLog events={events} />
          <OfficeStage agents={agents} events={events} realtimeConnected={realtimeConnected} />
        </div>
      )}

      <p className="note">
        Tiap agent menulis satu baris event ke database (format JSON di panel jobdesc), lalu
        halaman ini berlangganan perubahan itu lewat Supabase Realtime dan menggerakkan karakter
        serta log. Jika koneksi realtime putus, halaman mengambil data terbaru tiap 5 detik
        sebagai cadangan.
      </p>
    </div>
  );
}
