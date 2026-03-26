-- Migration: audit + rate limiting for catalog sync operations
-- Adds triggered_by (who ran the sync) and source (nuvemshop/google_sheets) to catalog_sync_runs

-- 1. Add audit columns to catalog_sync_runs
ALTER TABLE public.catalog_sync_runs
  ADD COLUMN IF NOT EXISTS triggered_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'nuvemshop';

-- 2. Index for querying sync runs by admin
CREATE INDEX IF NOT EXISTS idx_catalog_sync_runs_triggered_by
  ON public.catalog_sync_runs(triggered_by);

-- 3. Comment for documentation
COMMENT ON COLUMN public.catalog_sync_runs.triggered_by IS 'UUID of the admin who triggered this sync run';
COMMENT ON COLUMN public.catalog_sync_runs.source IS 'Sync source: nuvemshop, google_sheets';
