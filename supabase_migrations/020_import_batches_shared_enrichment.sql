-- Migration: 020_import_batches_shared_enrichment.sql
-- Creates shared import batch tracking plus the global enrichment lock used to
-- coordinate marketplace/enrichment work across concurrent imports.

-- 1) Global lock table (used by try_lock_enrichment / release_enrichment_lock)
CREATE TABLE IF NOT EXISTS global_enrichment_locks (
  canonical_key TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ NOT NULL
);

-- 2) Shared import batch table
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  import_session_id TEXT,
  file_name TEXT,

  include_in_inventory BOOLEAN DEFAULT FALSE,
  enrichment_mode TEXT DEFAULT 'missing_only',
  max_enrichment_calls INTEGER DEFAULT 100,

  rows_total INTEGER DEFAULT 0,
  chunk_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing',

  -- Finalized metrics
  rows_valid INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  enrichments_charged INTEGER DEFAULT 0,
  enrichments_deferred INTEGER DEFAULT 0,
  inventory_upserted INTEGER DEFAULT 0,
  products_touched INTEGER DEFAULT 0,
  manifest_rows_touched INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_id ON import_batches(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);

-- 3) Enrichment lock functions (copied from your Supabase SQL)
CREATE OR REPLACE FUNCTION public.try_lock_enrichment(p_key text, p_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_until TIMESTAMPTZ := v_now + (p_seconds * INTERVAL '1 second');
    r global_enrichment_locks%ROWTYPE;
BEGIN
    IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
        RETURN FALSE;
    END IF;

    DELETE FROM global_enrichment_locks
    WHERE locked_until < v_now;

    SELECT * INTO r
    FROM global_enrichment_locks
    WHERE canonical_key = p_key
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO global_enrichment_locks (canonical_key, locked_until)
        VALUES (p_key, v_until);
        RETURN TRUE;
    END IF;

    IF r.locked_until < v_now THEN
        UPDATE global_enrichment_locks
        SET locked_at = v_now, locked_until = v_until
        WHERE canonical_key = p_key;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_enrichment_lock(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_key IS NOT NULL THEN
        DELETE FROM global_enrichment_locks WHERE canonical_key = p_key;
    END IF;
END;
$function$;

-- Enable RLS
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can manage their own import batches
DROP POLICY IF EXISTS "import_batches_select_own" ON import_batches;
CREATE POLICY "import_batches_select_own" ON import_batches
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "import_batches_insert_own" ON import_batches;
CREATE POLICY "import_batches_insert_own" ON import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "import_batches_update_own" ON import_batches;
CREATE POLICY "import_batches_update_own" ON import_batches
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Grants (optional; keep consistent with other migrations)
GRANT SELECT, INSERT, UPDATE ON import_batches TO authenticated;

