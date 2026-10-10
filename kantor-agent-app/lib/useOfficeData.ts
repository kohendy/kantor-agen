"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
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

async function fetchAgents(
  supabase: ReturnType<typeof createClient>
): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("nama, ruangan, peran, status")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchEvents(
  supabase: ReturnType<typeof createClient>
): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, waktu, agent, status, pesan")
    .order("id", { ascending: false })
    .limit(EVENTS_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export function useOfficeData(): OfficeData {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetchAll = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([fetchAgents(supabase), fetchEvents(supabase)]);
      setAgents(a);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data dari Supabase");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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
    let mounted = true;

    const channel = supabase
      .channel("kantor-agent-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          if (!mounted) return;
          const row = payload.new as EventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev;
            return [row, ...prev].slice(0, EVENTS_LIMIT);
          });

          // Status agen ikut berubah saat agent memproses event baru,
          // jadi segarkan daftar agen setiap ada INSERT event.
          fetchAgents(supabase)
            .then((latest) => {
              if (!mounted) return;
              setAgents(latest);
            })
            .catch((err) => {
              if (!mounted) return;
              setError(
                err instanceof Error ? err.message : "Gagal memuat data dari Supabase"
              );
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agents" },
        (payload) => {
          if (!mounted) return;
          const row = payload.new as AgentRow;
          setAgents((prev) => prev.map((a) => (a.nama === row.nama ? row : a)));
        }
      )
      .subscribe((status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") {
          refetchAll();
          setRealtimeConnected(true);
        } else {
          setRealtimeConnected(false);
        }
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [refetchAll, supabase]);

  return { agents, events, loading, error, realtimeConnected };
}