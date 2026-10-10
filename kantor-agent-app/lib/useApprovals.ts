"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { ApprovalRow } from "./types";

const FALLBACK_POLL_MS = 5000;
const VISIBILITY_POLL_MS = 10000;

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
  const visibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authListenerRef = useRef<{ data: { subscription: { unsubscribe: () => void } } } | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchPendingApprovals(supabase);
      setApprovals((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data approvals");
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

  // Polling pengaman 10 detik - hanya saat tab terlihat
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
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

    // Initial check
    handleVisibilityChange();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (visibilityPollRef.current) clearInterval(visibilityPollRef.current);
    };
  }, [refetch]);

  useEffect(() => {
    let mounted = true;

    // Pasang token sesi ke realtime sebelum subscribe
    const setupRealtimeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
        console.debug("realtime auth dipasang");
      }
    };

    setupRealtimeAuth().then(() => {
      if (!mounted) return;

      // Dengarkan perubahan auth (TOKEN_REFRESHED, SIGNED_IN)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
          console.debug("realtime auth dipasang");
        }
      });
      authListenerRef.current = { data: { subscription } };

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
          console.debug(`realtime status: ${status}`);
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
    });

    return () => {
      mounted = false;
      if (authListenerRef.current?.data?.subscription?.unsubscribe) {
        authListenerRef.current.data.subscription.unsubscribe();
      }
    };
  }, [refetch, supabase]);

  return { approvals, loading, error };
}