-- Migration: Index pipeline_steps(run_id) dan approvals(run_id)
-- Jangan edit migration sebelumnya (20261010_orchestration_foundation.sql).
-- Index ini mempercepat lookup langsung berdasarkan run_id pada kedua tabel.

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run_id
  ON public.pipeline_steps (run_id);

CREATE INDEX IF NOT EXISTS idx_approvals_run_id
  ON public.approvals (run_id);
