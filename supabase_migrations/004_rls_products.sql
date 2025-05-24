-- supabase_migrations/004_rls_manifest_data.sql
ALTER TABLE manifest_data ENABLE ROW LEVEL SECURITY;

-- Users can only access manifest_data belonging to their tenant_id
CREATE POLICY "Allow users to access manifest_data of their tenant" ON manifest_data
FOR ALL
USING (tenant_id = ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'tenant_id')::uuid )
WITH CHECK (tenant_id = ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'tenant_id')::uuid );

-- Allow backend service role to do anything
CREATE POLICY "Allow service_role full access on manifest_data" ON manifest_data
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role'); 