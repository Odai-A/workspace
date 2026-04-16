-- Add item_number for per-item traceability on shelf labels.
ALTER TABLE IF EXISTS public.inventory
  ADD COLUMN IF NOT EXISTS item_number TEXT;

-- Helpful for fast lookups by item number within a user account.
CREATE INDEX IF NOT EXISTS idx_inventory_user_item_number
  ON public.inventory (user_id, item_number);
