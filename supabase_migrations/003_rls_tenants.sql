-- supabase_migrations/003_rls_tenants.sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Users can see their own tenant record if their auth.users.raw_user_meta_data.tenant_id matches
CREATE POLICY "Allow users to see their own tenant" ON tenants
FOR SELECT
USING (id = ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'tenant_id')::uuid );

-- Allow backend service role to do anything (used for admin operations, webhooks)
CREATE POLICY "Allow service_role full access" ON tenants
FOR ALL
USING (auth.role() = 'service_role'); 