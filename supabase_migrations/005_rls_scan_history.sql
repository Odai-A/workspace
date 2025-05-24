-- supabase_migrations/005_rls_scan_history.sql
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

-- Users can only access scan_history belonging to their tenant_id
CREATE POLICY "Allow users to access scan_history of their tenant" ON scan_history
FOR ALL
USING (tenant_id = ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'tenant_id')::uuid )
WITH CHECK (tenant_id = ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'tenant_id')::uuid );

-- Allow backend service role to do anything
CREATE POLICY "Allow service_role full access on scan_history" ON scan_history
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role'); 