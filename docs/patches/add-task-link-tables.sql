-- Patch: add task goal link table + migrate legacy task goal fields.
-- Safe to run multiple times.
--
-- Compatibility note:
-- This intentionally keeps tasks.goal_index and tasks.parent_id in place.
-- tasks.parent_id remains the primary task hierarchy mechanism; task_goal_links
-- adds optional multi-goal attribution for tasks.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Join table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_goal_links (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  goal_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, task_id, goal_index)
);

CREATE INDEX IF NOT EXISTS idx_task_goal_links_user_task ON task_goal_links(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_goal_links_user_goal ON task_goal_links(user_id, goal_index);
CREATE INDEX IF NOT EXISTS idx_task_goal_links_user_active ON task_goal_links(user_id) WHERE deleted_at IS NULL;

ALTER TABLE task_goal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own task goal links" ON task_goal_links;
CREATE POLICY "Users can read own task goal links"
  ON task_goal_links FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own task goal links" ON task_goal_links;
CREATE POLICY "Users can insert own task goal links"
  ON task_goal_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own task goal links" ON task_goal_links;
CREATE POLICY "Users can update own task goal links"
  ON task_goal_links FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own task goal links" ON task_goal_links;
CREATE POLICY "Users can delete own task goal links"
  ON task_goal_links FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_task_goal_links_updated_at ON task_goal_links;
CREATE TRIGGER update_task_goal_links_updated_at
  BEFORE UPDATE ON task_goal_links
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Link upsert RPCs used by the app
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_task_goal_links_if_newer(in_rows jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  affected_count INTEGER := 0;
BEGIN
  IF in_rows IS NULL OR jsonb_typeof(in_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR row_data IN SELECT value FROM jsonb_array_elements(in_rows) AS t(value)
  LOOP
    IF (row_data->>'user_id')::uuid IS DISTINCT FROM auth.uid() THEN
      CONTINUE;
    END IF;

    INSERT INTO task_goal_links (id, user_id, task_id, goal_index, created_at, updated_at, deleted_at)
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      row_data->>'task_id',
      NULLIF(row_data->>'goal_index', '')::integer,
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (user_id, task_id, goal_index) DO UPDATE
    SET
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      task_goal_links.user_id = auth.uid()
      AND EXCLUDED.updated_at > task_goal_links.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_task_goal_links_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_task_goal_links_if_newer(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Global migration from legacy task goal fields
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS migrate_task_links_all_users();

CREATE OR REPLACE FUNCTION migrate_task_links_all_users()
RETURNS TABLE (
  migrated_task_goal_links INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  goal_link_count INTEGER := 0;
BEGIN
  WITH inserted AS (
    INSERT INTO task_goal_links (id, user_id, task_id, goal_index, created_at, updated_at, deleted_at)
    SELECT
      'tgl_' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
      t.user_id,
      t.id,
      t.goal_index,
      COALESCE(t.created_at, NOW()),
      COALESCE(t.updated_at, NOW()),
      NULL
    FROM tasks t
    WHERE t.goal_index IS NOT NULL
      AND t.deleted_at IS NULL
    ON CONFLICT (user_id, task_id, goal_index) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO goal_link_count FROM inserted;

  RETURN QUERY SELECT goal_link_count;
END;
$$;

REVOKE ALL ON FUNCTION migrate_task_links_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION migrate_task_links_all_users() TO service_role;

-- Execute migration now (all users)
SELECT * FROM migrate_task_links_all_users();

-- Remove the abandoned task-to-task join table if an earlier version of this
-- patch was applied. Task hierarchy is represented by tasks.parent_id.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE task_task_links;
  EXCEPTION WHEN undefined_object OR undefined_table THEN
    NULL;
  END;
END $$;

DROP FUNCTION IF EXISTS upsert_task_task_links_if_newer(jsonb);
DROP TABLE IF EXISTS task_task_links;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_goal_links;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
