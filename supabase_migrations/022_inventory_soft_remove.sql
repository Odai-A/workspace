-- Soft-remove from inventory UI: rows stay in Supabase; only hidden from the list.
-- 1) inventory: flag row instead of DELETE
-- 2) manifest_data: never deleted from UI; track hidden manifest ids separately

-- Inventory rows: hide from list without deleting the record
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS hidden_from_inventory_list BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inventory.hidden_from_inventory_list IS 'When true, row is omitted from inventory UI but remains in the database.';

CREATE INDEX IF NOT EXISTS idx_inventory_visible
  ON inventory (user_id)
  WHERE hidden_from_inventory_list = FALSE;

-- Optional index when inventory.tenant_id exists (some projects never added this column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'tenant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_tenant_visible
      ON inventory (tenant_id)
      WHERE hidden_from_inventory_list = FALSE AND tenant_id IS NOT NULL;
  END IF;
END $$;

-- Manifest rows: hide from combined inventory view without deleting manifest_data
CREATE TABLE IF NOT EXISTS inventory_hidden_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  manifest_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_hidden_manifest_user_manifest UNIQUE (user_id, manifest_id)
);

COMMENT ON TABLE inventory_hidden_manifest IS 'Manifest IDs the user removed from the inventory list; manifest_data rows are not deleted.';

CREATE INDEX IF NOT EXISTS idx_inventory_hidden_manifest_user ON inventory_hidden_manifest (user_id);

ALTER TABLE inventory_hidden_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own inventory_hidden_manifest" ON inventory_hidden_manifest;
CREATE POLICY "Users manage own inventory_hidden_manifest"
  ON inventory_hidden_manifest
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
