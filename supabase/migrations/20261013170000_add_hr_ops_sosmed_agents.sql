-- Migration: Tambah agent HERA (HR), HEPHAESTUS (Operasional), dan HERMES (Sosial Media)
-- Idempotent: ON CONFLICT (nama) DO NOTHING

INSERT INTO public.agents (nama, ruangan, peran, status)
VALUES
  ('HERA', 'HR', 'Kepala HR', 'idle'),
  ('HEPHAESTUS', 'Operasional', 'Kepala Operasional', 'idle'),
  ('HERMES', 'Sosial Media', 'Perencana Konten Sosial Media', 'idle')
ON CONFLICT (nama) DO NOTHING;
