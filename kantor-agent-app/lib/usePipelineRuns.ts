"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { PipelineRunRow } from "./types";

const FALLBACK_POLL_MS = 5000;
const VISIBILITY_POLL_MS = 10000;

interface PipelineRunsData {
  runs: PipelineRunRow[];
  activeRun: PipelineRunRow | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function fetchPipelineRuns(
  supabase: ReturnType<typeof createClient>
): Promise<PipelineRunRow[]> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("id, judul, brief, fase, status, iterasi, dibuat, diperbarui")
    .order("id", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data as PipelineRunRow[]) ?? [];
}

export function usePipelineRuns(): PipelineRunsData {
  const supabase = useMemo(() => createClient(), []);
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchPipelineRuns(supabase);
      setRuns((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data proyek");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Polling cadangan: 5 detik saat realtime putus
  useEffect(() => {
    if (realtimeConnected) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } else {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          refetch();
        }, FALLBACK_POLL_MS);
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [realtimeConnected, refetch]);

  // Polling pengaman saat tab aktif
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetch();
        if (!visibilityPollRef.current) {
          visibilityPollRef.current = setInterval(() => {
            refetch();
          }, VISIBILITY_POLL_MS);
        }
      } else {
        if (visibilityPollRef.current) {
          clearInterval(visibilityPollRef.current);
          visibilityPollRef.current = null;
        }
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (visibilityPollRef.current) clearInterval(visibilityPollRef.current);
    };
  }, [refetch]);

  // Realtime subscription
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch (err) {
        console.debug("realtime setAuth pipeline_runs gagal:", err);
      }
    };

    setupRealtimeAuth().then(() => {
      if (!mounted) return;

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.access_token) {
          supabase.realtime.setAuth(session.access_token).catch(() => {});
        }
      });
      authSubscriptionRef.current = subscription;

      if (!mounted) {
        subscription.unsubscribe();
        authSubscriptionRef.current = null;
        return;
      }

      channel = supabase
        .channel("kantor-agent-pipeline-runs")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pipeline_runs" },
          () => {
            if (!mounted) return;
            refetch();
          }
        )
        .subscribe((status) => {
          if (!mounted) return;
          if (status === "SUBSCRIBED") {
            refetch();
            setRealtimeConnected(true);
          } else {
            setRealtimeConnected(false);
          }
        });
    });

    return () => {
      mounted = false;
      if (authSubscriptionRef.current) {
        authSubscriptionRef.current.unsubscribe();
        authSubscriptionRef.current = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refetch, supabase]);

  // Cari proyek aktif pertama (yang belum selesai / dihentikan, atau yang paling baru)
  const activeRun = useMemo(() => {
    const active = runs.find(
      (r) => r.status === "jalan" || r.status === "menunggu_persetujuan" || r.status === "butuh_keputusan"
    );
    return active ?? runs[0] ?? null;
  }, [runs]);

  return { runs, activeRun, loading, error, refetch };
}
