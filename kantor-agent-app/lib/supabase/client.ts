"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Gagal cepat di console browser dev supaya mudah ketahuan env belum di-set.
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set."
  );
}

// Klien browser berbasis cookie session (bukan localStorage), hanya anon key.
// Jangan pernah menaruh service role key di kode web app.
export function createClient() {
  return createBrowserClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}
