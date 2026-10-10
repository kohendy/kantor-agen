import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set."
  );
}

// Klien Supabase untuk Server Component / Route Handler, berbasis cookie session.
// Hanya anon key - dipakai untuk membaca sesi pengguna yang sedang login.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll dipanggil dari Server Component yang tidak boleh menulis cookie.
          // Proxy (proxy.ts) sudah menangani penyegaran sesi, jadi ini aman diabaikan.
        }
      },
    },
  });
}
