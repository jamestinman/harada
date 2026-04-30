-- MLAuth agent API: human opt-in, per-agent approvals, email→user lookup for service role.
-- Run in Supabase SQL Editor after main schema.

-- ---------------------------------------------------------------------------
-- Lookup auth user by email (service role only — used by server agent API)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(lookup_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_user_id_by_email(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Human opt-in for agent HTTP API
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_agent_api_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_agent_api_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent api settings" ON user_agent_api_settings;
CREATE POLICY "Users read own agent api settings"
  ON user_agent_api_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own agent api settings" ON user_agent_api_settings;
CREATE POLICY "Users insert own agent api settings"
  ON user_agent_api_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own agent api settings" ON user_agent_api_settings;
CREATE POLICY "Users update own agent api settings"
  ON user_agent_api_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_agent_api_settings_updated_at ON user_agent_api_settings;
CREATE TRIGGER update_user_agent_api_settings_updated_at
  BEFORE UPDATE ON user_agent_api_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Per-agent access requests / approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_dumbname text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_dumbname)
);

CREATE INDEX IF NOT EXISTS idx_agent_access_user_status
  ON agent_access_requests(user_id, status);

ALTER TABLE agent_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent access requests" ON agent_access_requests;
CREATE POLICY "Users read own agent access requests"
  ON agent_access_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own agent access requests" ON agent_access_requests;
CREATE POLICY "Users update own agent access requests"
  ON agent_access_requests FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own agent access requests" ON agent_access_requests;
CREATE POLICY "Users delete own agent access requests"
  ON agent_access_requests FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_agent_access_requests_updated_at ON agent_access_requests;
CREATE TRIGGER update_agent_access_requests_updated_at
  BEFORE UPDATE ON agent_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();
