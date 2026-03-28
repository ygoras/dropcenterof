-- Add clerk_user_id to auth_users for Clerk integration
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE;

-- Create index for fast lookup by clerk_user_id
CREATE INDEX IF NOT EXISTS idx_auth_users_clerk_user_id ON auth_users(clerk_user_id);

-- Make password_hash optional (Clerk manages passwords)
ALTER TABLE auth_users ALTER COLUMN password_hash SET DEFAULT 'clerk_managed';
