-- Migration: Fondasi Orkestrasi
-- Tabel: pipeline_runs, pipeline_steps, pipeline_control, perbarui approvals, RLS & Realtime

-- 1. pipeline_runs
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  judul text NOT NULL,
  brief jsonb NOT NULL,
  fase text NOT NULL DEFAULT 'riset',
  status text NOT NULL DEFAULT 'jalan' CHECK (status IN ('jalan', 'menunggu_persetujuan', 'butuh_keputusan', 'selesai', 'dihentikan')),
  iterasi int NOT NULL DEFAULT 1,
  dibuat timestamptz DEFAULT now(),
  diperbarui timestamptz DEFAULT now()
);

-- 2. pipeline_steps
CREATE TABLE IF NOT EXISTS public.pipeline_steps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  agen text,
  fase text,
  input jsonb,
  output jsonb,
  status text CHECK (status IN ('menunggu', 'jalan', 'selesai', 'gagal')),
  revisi_ke int DEFAULT 0,
  dibuat timestamptz DEFAULT now(),
  diperbarui timestamptz DEFAULT now()
);

-- 3. approvals: tambah kolom run_id, step_id, gate (nullable FK / text)
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS run_id bigint REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS step_id bigint REFERENCES public.pipeline_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gate text;

ALTER TABLE public.approvals ALTER COLUMN event_id DROP NOT NULL;

-- 4. pipeline_control: satu baris (id=1, jalan boolean default true)
CREATE TABLE IF NOT EXISTS public.pipeline_control (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  jalan boolean NOT NULL DEFAULT true
);

INSERT INTO public.pipeline_control (id, jalan)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS aktif: SELECT hanya untuk authenticated, tulis hanya lewat service role
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_control ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_runs' AND policyname = 'Allow authenticated select pipeline_runs'
  ) THEN
    CREATE POLICY "Allow authenticated select pipeline_runs"
      ON public.pipeline_runs FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_steps' AND policyname = 'Allow authenticated select pipeline_steps'
  ) THEN
    CREATE POLICY "Allow authenticated select pipeline_steps"
      ON public.pipeline_steps FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_control' AND policyname = 'Allow authenticated select pipeline_control'
  ) THEN
    CREATE POLICY "Allow authenticated select pipeline_control"
      ON public.pipeline_control FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 6. Tambahkan ke publication supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pipeline_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_runs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pipeline_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_steps;
  END IF;
END $$;
