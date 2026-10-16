"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { BriefRow } from "./types";

const FALLBACK_POLL_MS = 4000;

interface BriefsData {
  briefs: BriefRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function fetchBriefs(
  supabase: ReturnType<typeof createClient>
): Promise<BriefRow[]> {
  const { data, error } = await supabase
    .from("briefs")
    .select("*")
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useBriefs(): BriefsData {
  const supabase = useMemo(() => createClient(), []);
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchBriefs(supabase);
      setBriefs((prev) =>
        JSON.stringify(prev) === JSON.stringify(data) ? prev : data
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data briefs");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Polling cadangan saat realtime putus
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

  // Supabase Realtime channel
  useEffect(() => {
    refetch();

    const channel = supabase
      .channel("briefs-realtime-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "briefs",
        },
        () => {
          refetch();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refetch]);

  return { briefs, loading, error, refetch };
}
