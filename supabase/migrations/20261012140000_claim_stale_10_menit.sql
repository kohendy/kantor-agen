-- Migration: Naikkan batas klaim kedaluwarsa claim_pipeline_run dari 5 menit ke 10 menit
-- Pertahankan SECURITY DEFINER, search_path public, FOR UPDATE SKIP LOCKED, dan grant hanya service_role

CREATE OR REPLACE FUNCTION public.claim_pipeline_run(target_run_id bigint DEFAULT NULL::bigint)
RETURNS TABLE (
  id bigint,
  judul text,
  brief jsonb,
  fase text,
  status text,
  iterasi integer,
  dibuat timestamp with time zone,
  diperbarui timestamp with time zone,
  diproses_sejak timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.pipeline_runs
  SET diproses_sejak = now()
  WHERE public.pipeline_runs.id = (
    SELECT pr.id
    FROM public.pipeline_runs pr
    WHERE pr.status = 'jalan'
      AND (pr.diproses_sejak IS NULL OR pr.diproses_sejak < now() - interval '10 minutes')
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
$function$;

-- Update comment
COMMENT ON FUNCTION public.claim_pipeline_run(bigint) IS
'SECURITY DEFINER: Atomically claims one unclaimed or stale (>10min) run with status=jalan. Only service_role can execute.';

-- Pastikan hak akses: REVOKE dari PUBLIC, anon, authenticated; GRANT hanya ke service_role
REVOKE EXECUTE ON FUNCTION public.claim_pipeline_run(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pipeline_run(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pipeline_run(bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pipeline_run(bigint) TO service_role;
