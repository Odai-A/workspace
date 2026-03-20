-- Migration: 021_import_batch_items_raw_row.sql
-- Stores per-row import audit data, including the original/normalized row as JSONB.

CREATE TABLE IF NOT EXISTS import_batch_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,

  fnsku TEXT,
  asin TEXT,
  lpn TEXT,

  enrichment_status TEXT,
  cache_hit BOOLEAN DEFAULT FALSE,
  enrichment_charged BOOLEAN DEFAULT FALSE,
  included_in_inventory BOOLEAN DEFAULT FALSE,

  -- Used by app.py + tests; should be JSONB
  raw_row JSONB
);

CREATE INDEX IF NOT EXISTS idx_import_batch_items_batch_id ON import_batch_items(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_items_batch_row_index ON import_batch_items(import_batch_id, row_index);
CREATE INDEX IF NOT EXISTS idx_import_batch_items_fnsku ON import_batch_items(fnsku) WHERE fnsku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_batch_items_asin ON import_batch_items(asin) WHERE asin IS NOT NULL;

ALTER TABLE import_batch_items ENABLE ROW LEVEL SECURITY;

-- RLS: users can see/insert items for batches they own.
DROP POLICY IF EXISTS "import_batch_items_select_own" ON import_batch_items;
CREATE POLICY "import_batch_items_select_own" ON import_batch_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM import_batches b
      WHERE b.id = import_batch_id
        AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "import_batch_items_insert_own" ON import_batch_items;
CREATE POLICY "import_batch_items_insert_own" ON import_batch_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM import_batches b
      WHERE b.id = import_batch_id
        AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "import_batch_items_update_own" ON import_batch_items;
CREATE POLICY "import_batch_items_update_own" ON import_batch_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM import_batches b
      WHERE b.id = import_batch_id
        AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM import_batches b
      WHERE b.id = import_batch_id
        AND b.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON import_batch_items TO authenticated;

