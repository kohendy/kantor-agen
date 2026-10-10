-- Migration: Atomic claim dan release untuk pipeline_runs
-- Memastikan klaim atomik hanya oleh service_role, mencegah race condition
-- antar worker (webhook konkuren atau scheduler 1 menit).

-- 1. Tambah kolom diproses_sejak jika belum ada
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS diproses_sejak timestamptz;

-- 2. Drop signature lama untuk mencegah konflik
DROP FUNCTION IF EXISTS public.claim_pipeline_run();
DROP FUNCTION IF EXISTS public.claim_pipeline_run(bigint);
DROP FUNCTION IF EXISTS public.claim_pipeline_run(integer);
DROP FUNCTION IF EXISTS public.release_pipeline_claim(integer);
DROP FUNCTION IF EXISTS public.release_pipeline_claim(bigint);

-- 3. Fungsi claim_pipeline_run
-- Mengklaim satu run dengan status 'jalan' dan diproses_sejak NULL atau > 5 menit
-- Jika target_run_id diberikan, mengklaim run spesifik tersebut.
CREATE OR REPLACE FUNCTION public.claim_pipeline_run(target_run_id bigint DEFAULT NULL)
RETURNS TABLE (
  id bigint,
  judul text,
  brief jsonb,
  fase text,
  status text,
  iterasi int,
  dibuat timestamptz,
  diperbarui timestamptz,
  diproses_sejak timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pipeline_runs
  SET diproses_sejak = now()
  WHERE public.pipeline_runs.id = (
    SELECT pr.id
    FROM public.pipeline_runs pr
    WHERE pr.status = 'jalan'
      AND (pr.diproses_sejak IS NULL OR pr.diproses_sejak < now() - interval '5 minutes')
      AND (target_run_id IS NULL OR pr.id = target_run_id)
    ORDER BY pr.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    public.pipeline_runs.id,
    public.pipeline_runs.judul,
    public.pipeline_runs.brief,
    public.pipeline_runs.fase,
    public.pipeline_runs.status,
    public.pipeline_runs.iterasi,
    public.pipeline_runs.dibuat,
    public.pipeline_runs.diperbarui,
    public.pipeline_runs.diproses_sejak;
END;
$$;

-- Kunci hak akses eksekusi: hanya service_role
REVOKE ALL ON FUNCTION public.claim_pipeline_run(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pipeline_run(bigint) TO service_role;

-- 4. Fungsi release_pipeline_claim
-- Melepaskan klaim run_id tertentu dengan mengatur diproses_sejak = NULL
CREATE OR REPLACE FUNCTION public.release_pipeline_claim(run_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.pipeline_runs
  SET diproses_sejak = NULL
  WHERE public.pipeline_runs.id = run_id;
END;
$$;

-- Kunci hak akses eksekusi: hanya service_role
REVOKE ALL ON FUNCTION public.release_pipeline_claim(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pipeline_claim(bigint) TO service_role;
