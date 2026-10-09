"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import type { AgentRow, EventRow } from "./types";

const EVENTS_LIMIT = 40;
const FALLBACK_POLL_MS = 5000;

interface OfficeData {
  agents: AgentRow[];
  events: EventRow[];
  loading: boolean;
  error: string | null;
  realtimeConnected: boolean;
}

async function fetchAgents(): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("nama, ruangan, peran, status")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, waktu, agent, status, pesan")
    .order("id", { ascending: false })
    .limit(EVENTS_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export function useOfficeData(): OfficeData {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetchAll = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([fetchAgents(), fetchEvents()]);
      setAgents(a);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data dari Supabase");
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll cadangan tiap 5 detik, hanya aktif kalau realtime tidak tersambung.
  useEffect(() => {
    if (realtimeConnected) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      refetchAll();
    }, FALLBACK_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [realtimeConnected, refetchAll]);

  useEffect(() => {
    refetchAll();

    const channel = supabase
      .channel("kantor-agent-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev;
            return [row, ...prev].slice(0, EVENTS_LIMIT);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          const row = payload.new as AgentRow;
          setAgents((prev) => prev.map((a) => (a.nama === row.nama ? row : a)));
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agents, events, loading, error, realtimeConnected };
}
