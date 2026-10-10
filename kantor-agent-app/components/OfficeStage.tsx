"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGENTS,
  AGENT_RENDER_ORDER,
  HOME_POSITIONS,
  ROOMS,
  SEATS,
  STATUS_LABEL,
  colorOfAgent,
  roomOfAgent,
} from "@/lib/officeConfig";
import type { AgentRow, EventRow } from "@/lib/types";
import { RoomShape } from "./RoomShape";
import { AgentShape } from "./AgentShape";

type Selection = { type: "room" | "agent"; id: string } | null;

function pill(status: string) {
  const cls = status === "working" ? "w" : status === "review" ? "r" : "";
  return (
    <span className={`pill ${cls}`}>{STATUS_LABEL[status] ?? status}</span>
  );
}

export function OfficeStage({
  agents,
  events,
  realtimeConnected,
}: {
  agents: AgentRow[];
  events: EventRow[];
  realtimeConnected: boolean;
}) {
  const [selected, setSelected] = useState<Selection>(null);
  const [gathered, setGathered] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!infoOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        infoContainerRef.current &&
        !infoContainerRef.current.contains(event.target as Node)
      ) {
        setInfoOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setInfoOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [infoOpen]);

  const agentByName = useMemo(() => {
    const map: Record<string, AgentRow> = {};
    agents.forEach((a) => {
      map[a.nama] = a;
    });
    return map;
  }, [agents]);

  const lastEventByAgent = useMemo(() => {
    const map: Record<string, EventRow> = {};
    // events sudah terurut terbaru di atas, ambil kemunculan pertama per agent.
    for (const ev of events) {
      if (!map[ev.agent]) map[ev.agent] = ev;
    }
    return map;
  }, [events]);

  const statusOf = (name: string) => agentByName[name]?.status ?? "idle";

  const meetingRoom = ROOMS.find((r) => r.meeting)!;

  const positions = useMemo(() => {
    const pos: Record<string, [number, number]> = {};
    AGENT_RENDER_ORDER.forEach((name, i) => {
      pos[name] = gathered
        ? [meetingRoom.x + SEATS[i][0], meetingRoom.y + SEATS[i][1]]
        : HOME_POSITIONS[name];
    });
    return pos;
  }, [gathered, meetingRoom]);

  const stats = useMemo(() => {
    const n = { working: 0, review: 0, idle: 0 };
    agents.forEach((a) => {
      if (a.status in n) n[a.status as keyof typeof n]++;
    });
    return n;
  }, [agents]);

  function selectRoom(id: string) {
    if (id === "meeting") setGathered((g) => !g);
    setSelected({ type: "room", id });
  }
  function selectAgent(name: string) {
    setSelected({ type: "agent", id: name });
  }

  function renderDetail() {
    if (!selected) {
      return (
        <p className="hint">
          Klik ruangan atau karakter untuk membuka jobdesc. Klik ruang Meeting H+1 untuk
          mengumpulkan semua agent, klik lagi untuk membubarkan. Titik di label karakter
          menandai status: menyala berarti bekerja, kuning berarti menunggu review.
        </p>
      );
    }
    if (selected.type === "room") {
      const room = ROOMS.find((r) => r.id === selected.id);
      if (!room) return null;
      if (room.meeting) {
        return (
          <>
            <h3 style={{ color: room.color }}>{room.name}</h3>
            <p>{room.desc}</p>
            <p>
              {gathered
                ? "Semua agent sedang berkumpul. Arahkan kursor ke karakter untuk melihat namanya."
                : "Agent sedang bekerja di ruangan masing-masing."}
            </p>
            <button
              className="member"
              type="button"
              style={{ "--c": room.color } as React.CSSProperties}
              onClick={() => setGathered((g) => !g)}
            >
              {gathered ? "Bubarkan rapat" : "Kumpulkan semua agent"}
            </button>
          </>
        );
      }
      return (
        <>
          <h3 style={{ color: room.color }}>{room.name}</h3>
          <p>{room.desc}</p>
          <div className="lbl">Anggota ruangan</div>
          <div className="members">
            {room.agents.map((n) => {
              const cfg = AGENTS[n];
              return (
                <button
                  key={n}
                  className="member"
                  type="button"
                  style={{ "--c": room.color } as React.CSSProperties}
                  onClick={() => selectAgent(n)}
                >
                  {cfg.lead ? "\u2605 " : ""}
                  {n} {"\u00b7"} {cfg.role}
                </button>
              );
            })}
          </div>
        </>
      );
    }
    const name = selected.id;
    const cfg = AGENTS[name];
    const room = roomOfAgent(name);
    const status = statusOf(name);
    const lastEvent = lastEventByAgent[name];
    const json = lastEvent ? JSON.stringify(lastEvent, null, 2) : "(belum ada event)";
    return (
      <>
        <h3 style={{ color: room?.color }}>
          {cfg.lead ? "\u2605 " : ""}
          {name} {pill(status)}
        </h3>
        <p>
          <b>{cfg.role}</b>, ruang {room?.name.toLowerCase()}. {cfg.desc}
        </p>
        <div className="cols">
          <div>
            <div className="lbl">Tool</div>
            <div className="chips">
              {cfg.tools.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl">Event terakhir yang ditulis ke database</div>
            <pre className="json">{json}</pre>
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="card stage-card" aria-label="Peta kantor">
      <div className="stats">
        <span>
          <i className="pip w" /> <b>{stats.working}</b>bekerja
        </span>
        <span>
          <i className="pip r" /> <b>{stats.review}</b>menunggu review
        </span>
        <span>
          <i className="pip" /> <b>{stats.idle}</b>idle
        </span>
        <span className={`conn ${realtimeConnected ? "on" : "off"}`}>
          {realtimeConnected ? "\u25cf realtime tersambung" : "\u25cb memakai polling cadangan"}
        </span>
      </div>
      <div className="stage-map-area">
        <div className="stage-svg-wrap">
          <svg
            className={`stage${gathered ? " gathered" : ""}`}
            viewBox="0 0 940 560"
            role="group"
            aria-label="Kantor isometrik dengan enam ruangan"
          >
            {ROOMS.slice()
              .sort((a, b) => a.x + a.y - (b.x + b.y))
              .map((room) => (
                <RoomShape
                  key={room.id}
                  room={room}
                  selected={
                    (selected?.type === "room" && selected.id === room.id) ||
                    (selected?.type === "agent" &&
                      roomOfAgent(selected.id)?.id === room.id)
                  }
                  onSelect={selectRoom}
                />
              ))}
            <g id="agents">
              {AGENT_RENDER_ORDER.map((name) => (
                <AgentShape
                  key={name}
                  name={name}
                  role={AGENTS[name].role}
                  color={colorOfAgent(name)}
                  status={statusOf(name)}
                  isLead={!!AGENTS[name].lead}
                  pos={positions[name]}
                  selected={selected?.type === "agent" && selected.id === name}
                  onSelect={selectAgent}
                />
              ))}
            </g>
          </svg>
        </div>
        <div className="stage-info-wrap" ref={infoContainerRef}>
          <button
            type="button"
            className="stage-info-btn"
            aria-label="Informasi"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((prev) => !prev)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          {infoOpen && (
            <div
              className="stage-info-popover"
              role="region"
              aria-label="Informasi Sinkronisasi Realtime"
            >
              <p>
                Tiap agent menulis satu baris event ke database (format JSON di
                panel jobdesc), lalu halaman ini berlangganan perubahan itu
                lewat Supabase Realtime dan menggerakkan karakter serta log. Jika
                koneksi realtime putus, halaman mengambil data terbaru tiap 5
                detik sebagai cadangan.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="detail">{renderDetail()}</div>
    </section>
  );
}
