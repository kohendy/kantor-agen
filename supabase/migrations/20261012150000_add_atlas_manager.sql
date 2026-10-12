-- Migration: Tambah agent ATLAS (Manajer Kantor) pada ruangan Manager
-- Idempotent: ON CONFLICT (nama) DO NOTHING

INSERT INTO public.agents (nama, ruangan, peran, status)
VALUES ('ATLAS', 'Manager', 'Manajer Kantor', 'idle')
ON CONFLICT (nama) DO NOTHING;
