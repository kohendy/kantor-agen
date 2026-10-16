-- Migration: Tabel briefs, indeks antrean FIFO, fungsi atomic claim, RLS, dan Realtime
-- Idempotent DDL

-- 1. Buat tabel briefs jika belum ada
CREATE TABLE IF NOT EXISTS public.briefs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  judul text NOT NULL,
  isi jsonb NOT NULL,
  mode text NOT NULL CHECK (mode IN ('diarahkan', 'manager_bebas')),
  status text NOT NULL DEFAULT 'antre' CHECK (status IN ('antre', 'dipertimbangkan', 'butuh_klarifikasi', 'didelegasikan', 'berjalan', 'selesai', 'dihentikan')),
  rencana jsonb DEFAULT NULL,
  pertanyaan text DEFAULT NULL,
  jawaban text DEFAULT NULL,
  putaran_tanya int NOT NULL DEFAULT 0,
  run_id bigint REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  diproses_sejak timestamptz DEFAULT NULL,
  dibuat timestamptz DEFAULT now(),
  diperbarui timestamptz DEFAULT now()
);

-- 2. Indeks antrean FIFO dan status klaim
CREATE INDEX IF NOT EXISTS idx_briefs_status_id ON public.briefs(status, id);
CREATE INDEX IF NOT EXISTS idx_briefs_diproses_sejak ON public.briefs(status, diproses_sejak);
CREATE INDEX IF NOT EXISTS idx_briefs_run_id ON public.briefs(run_id);

-- 3. RLS: SELECT hanya untuk authenticated, insert/update/delete hanya service_role
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'briefs' AND policyname = 'Allow authenticated select briefs'
  ) THEN
    CREATE POLICY "Allow authenticated select briefs"
      ON public.briefs FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 4. Tambahkan ke Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'briefs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.briefs;
  END IF;
END $$;

-- 5. Fungsi klaim atomik brief untuk dipertimbangkan Manager ATLAS
-- Memastikan:
-- - pipeline_control.jalan = true (jika false, tidak ada klaim baru)
-- - Hanya 1 brief yang sedang dipertimbangkan Manager pada satu waktu (FIFO)
-- - Menggunakan FOR UPDATE SKIP LOCKED untuk menghindari perebutan antar pemanggil bersamaan
CREATE OR REPLACE FUNCTION public.claim_brief_for_consideration()
RETURNS TABLE (
  id bigint,
  judul text,
  isi jsonb,
  mode text,
  status text,
  rencana jsonb,
  pertanyaan text,
  jawaban text,
  putaran_tanya integer,
  run_id bigint,
  dibuat timestamp with time zone,
  diperbarui timestamp with time zone,
  diproses_sejak timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Cek pipeline_control
  IF NOT EXISTS (
    SELECT 1 FROM public.pipeline_control WHERE id = 1 AND jalan = true
  ) THEN
    RETURN;
  END IF;

  -- Pastikan tidak ada brief yang saat ini sedang aktif dipertimbangkan (< 10 menit)
  IF EXISTS (
    SELECT 1 FROM public.briefs
    WHERE public.briefs.status = 'dipertimbangkan'
      AND public.briefs.diproses_sejak IS NOT NULL
      AND public.briefs.diproses_sejak >= now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.briefs
  SET status = 'dipertimbangkan',
      diproses_sejak = now(),
      diperbarui = now()
  WHERE public.briefs.id = (
    SELECT b.id
    FROM public.briefs b
    WHERE b.status = 'antre'
      AND (b.diproses_sejak IS NULL OR b.diproses_sejak < now() - interval '10 minutes')
    ORDER BY b.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    public.briefs.id,
    public.briefs.judul,
    public.briefs.isi,
    public.briefs.mode,
    public.briefs.status,
    public.briefs.rencana,
    public.briefs.pertanyaan,
    public.briefs.jawaban,
    public.briefs.putaran_tanya,
    public.briefs.run_id,
    public.briefs.dibuat,
    public.briefs.diperbarui,
    public.briefs.diproses_sejak;
END;
$function$;

-- 6. Fungsi melepas klaim brief jika terjadi kegagalan atau selesai proses
CREATE OR REPLACE FUNCTION public.release_brief_claim(target_brief_id bigint)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.briefs
  SET diproses_sejak = NULL,
      diperbarui = now()
  WHERE id = target_brief_id;
END;
$function$;

-- 7. Batasi eksekusi fungsi hanya untuk service_role
REVOKE EXECUTE ON FUNCTION public.claim_brief_for_consideration() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_brief_for_consideration() FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_brief_for_consideration() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_brief_for_consideration() TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_brief_claim(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_brief_claim(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_brief_claim(bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_brief_claim(bigint) TO service_role;
