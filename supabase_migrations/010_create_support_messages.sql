-- Create support_messages table for storing customer support requests
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  subject TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other', -- 'bug', 'feature', 'question', 'other'
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  admin_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own messages
CREATE POLICY "Users can view their own support messages" ON support_messages
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own messages
CREATE POLICY "Users can create support messages" ON support_messages
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do everything (for admin access)
CREATE POLICY "Service role full access on support_messages" ON support_messages
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_support_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_support_messages_updated_at
BEFORE UPDATE ON support_messages
FOR EACH ROW
EXECUTE FUNCTION update_support_messages_updated_at();




