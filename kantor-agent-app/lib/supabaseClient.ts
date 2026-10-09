"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Gagal cepat di console browser dev supaya mudah ketahuan env belum di-set.
  // Tidak melempar error saat build karena Next.js bisa evaluasi modul ini di server juga.
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set."
  );
}

// Hanya anon key yang dipakai di sini. Jangan pernah menaruh service role key di kode web app.
export const supabase = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
  {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
