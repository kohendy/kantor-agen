"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { ApprovalRow } from "./types";

const FALLBACK_POLL_MS = 5000;

interface ApprovalsData {
  approvals: ApprovalRow[];
  loading: boolean;
  error: string | null;
}

async function fetchPendingApprovals(
  supabase: ReturnType<typeof createClient>
): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "id, event_id, agent, ringkasan, status, catatan, dibuat, diputuskan, diputuskan_oleh"
    )
    .eq("status", "pending")
    .order("dibuat", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Mengambil daftar approvals berstatus 'pending' dan berlangganan perubahan
// realtime di tabel approvals supaya panel langsung update tanpa refresh.
export function useApprovals(): ApprovalsData {
  const supabase = useMemo(() => createClient(), []);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchPendingApprovals(supabase);
      setApprovals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data approvals");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (realtimeConnected) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      refetch();
    }, FALLBACK_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [realtimeConnected, refetch]);

  useEffect(() => {
    let mounted = true;

    const channel = supabase
      .channel("kantor-agent-approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals" },
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

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [refetch, supabase]);

  return { approvals, loading, error };
}
