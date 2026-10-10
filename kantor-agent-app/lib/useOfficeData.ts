"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { AgentRow, EventRow } from "./types";

const EVENTS_LIMIT = 40;
const FALLBACK_POLL_MS = 5000;
const VISIBILITY_POLL_MS = 10000;

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
  const visibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authListenerRef = useRef<{ data: { subscription: { unsubscribe: () => void } } } | null>(null);

  const refetchAll = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([fetchAgents(supabase), fetchEvents(supabase)]);
      setAgents((prev) => (JSON.stringify(prev) === JSON.stringify(a) ? prev : a));
      setEvents((prev) => (JSON.stringify(prev) === JSON.stringify(e) ? prev : e));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data dari Supabase");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Polling cadangan: 5 detik saat realtime putus (dijalankan di useEffect terpisah).
  // Polling pengaman: 10 detik saat tab terlihat, TERLEPAS dari status realtime.
  useEffect(() => {
    // Polling cadangan 5 detik
    if (realtimeConnected) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } else {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          refetchAll();
        }, FALLBACK_POLL_MS);
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [realtimeConnected, refetchAll]);

  // Polling pengaman 10 detik - hanya saat tab terlihat
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Saat tab kembali terlihat, refetch segera sekali
        refetchAll();
        if (!visibilityPollRef.current) {
          visibilityPollRef.current = setInterval(() => {
            refetchAll();
          }, VISIBILITY_POLL_MS);
        }
      } else {
        if (visibilityPollRef.current) {
          clearInterval(visibilityPollRef.current);
          visibilityPollRef.current = null;
        }
      }
    };

    // Initial check
    handleVisibilityChange();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (visibilityPollRef.current) clearInterval(visibilityPollRef.current);
    };
  }, [refetchAll]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Pasang token sesi ke realtime sebelum subscribe
    const setupRealtimeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
          console.debug("realtime auth dipasang");
        }
      } catch (err) {
        console.debug("realtime setAuth gagal:", err);
      }
    };

    setupRealtimeAuth().then(() => {
      if (!mounted) return;

      // Dengarkan perubahan auth (TOKEN_REFRESHED, SIGNED_IN)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.access_token) {
          supabase.realtime.setAuth(session.access_token).catch((err) => {
            console.debug("realtime setAuth gagal:", err);
          });
          console.debug("realtime auth dipasang");
        }
      });
      authListenerRef.current = { data: { subscription } };

      if (!mounted) return;

      channel = supabase
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
                setAgents((prev) => (JSON.stringify(prev) === JSON.stringify(latest) ? prev : latest));
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
            setAgents((prev) =>
              prev.map((a) => (a.nama === row.nama ? row : a))
            );
          }
        )
        .subscribe((status) => {
          if (!mounted) return;
          console.debug(`realtime status: ${status}`);
          if (status === "SUBSCRIBED") {
            refetchAll();
            setRealtimeConnected(true);
          } else {
            setRealtimeConnected(false);
          }
        });
    });

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (authListenerRef.current?.data?.subscription?.unsubscribe) {
        authListenerRef.current.data.subscription.unsubscribe();
      }
    };
  }, [refetchAll, supabase]);

  return { agents, events, loading, error, realtimeConnected };
}