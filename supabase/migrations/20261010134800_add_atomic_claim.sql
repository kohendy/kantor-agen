-- Migration: Add atomic claim mechanism for pipeline_runs
-- Prevents duplicate processing when webhook and scheduler trigger simultaneously

-- Add diproses_sejak column
ALTER TABLE pipeline_runs
ADD COLUMN IF NOT EXISTS diproses_sejak TIMESTAMPTZ DEFAULT NULL;

-- Add index for faster querying of unclaimed or stale runs
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_diproses_sejak 
ON pipeline_runs(status, diproses_sejak) 
WHERE status = 'jalan';

-- Comment explaining the column purpose
COMMENT ON COLUMN pipeline_runs.diproses_sejak IS 
'Timestamp when this run was claimed for processing. NULL = unclaimed. Stale if older than 5 minutes.';

-- Function to atomically claim a pipeline run
-- SECURITY: DEFINER with locked search_path, only service_role can execute
CREATE OR REPLACE FUNCTION claim_pipeline_run()
RETURNS TABLE (
  id INTEGER,
  brief JSONB,
  fase TEXT,
  status TEXT,
  diproses_sejak TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE pipeline_runs
  SET diproses_sejak = now()
  WHERE pipeline_runs.id = (
    SELECT pipeline_runs.id 
    FROM pipeline_runs
    WHERE pipeline_runs.status = 'jalan' 
      AND (pipeline_runs.diproses_sejak IS NULL 
           OR pipeline_runs.diproses_sejak < now() - interval '5 minutes')
    ORDER BY pipeline_runs.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    pipeline_runs.id,
    pipeline_runs.brief,
    pipeline_runs.fase,
    pipeline_runs.status,
    pipeline_runs.diproses_sejak,
    pipeline_runs.created_at,
    pipeline_runs.updated_at;
END;
$$;

-- Function to release a claim
-- SECURITY: DEFINER with locked search_path, only service_role can execute
CREATE OR REPLACE FUNCTION release_pipeline_claim(run_id INTEGER)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pipeline_runs
  SET diproses_sejak = NULL
  WHERE id = run_id;
END;
$$;

-- SECURITY: Revoke from all, grant only to service_role
REVOKE EXECUTE ON FUNCTION claim_pipeline_run() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_pipeline_run() FROM anon;
REVOKE EXECUTE ON FUNCTION claim_pipeline_run() FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_pipeline_run() TO service_role;

REVOKE EXECUTE ON FUNCTION release_pipeline_claim(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION release_pipeline_claim(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION release_pipeline_claim(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION release_pipeline_claim(INTEGER) TO service_role;

-- Comments
COMMENT ON FUNCTION claim_pipeline_run() IS 
'SECURITY DEFINER: Atomically claims one unclaimed or stale (>5min) run with status=jalan. Only service_role can execute.';

COMMENT ON FUNCTION release_pipeline_claim(INTEGER) IS 
'SECURITY DEFINER: Releases the claim on a run by clearing diproses_sejak. Only service_role can execute.';
