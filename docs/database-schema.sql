-- Harada Chart + Tasks Database Schema for Supabase
-- Run this in your Supabase SQL Editor.
--
-- This introduces a row-per-task model to avoid race conditions where two
-- devices overwrite the full todos array in a single row.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger function for updated_at
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Charts (keep as canonical grid holder; todos will move to tasks table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harada_charts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'My Harada Chart',
  grid JSONB NOT NULL DEFAULT '[]'::jsonb,
  todos JSONB NOT NULL DEFAULT '[]'::jsonb, -- legacy compatibility; can be dropped later
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_harada_charts_user_id ON harada_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_harada_charts_updated_at ON harada_charts(updated_at);

ALTER TABLE harada_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own charts" ON harada_charts;
CREATE POLICY "Users can read own charts"
  ON harada_charts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own charts" ON harada_charts;
CREATE POLICY "Users can insert own charts"
  ON harada_charts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own charts" ON harada_charts;
CREATE POLICY "Users can update own charts"
  ON harada_charts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own charts" ON harada_charts;
CREATE POLICY "Users can delete own charts"
  ON harada_charts
  FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_harada_charts_updated_at ON harada_charts;
CREATE TRIGGER update_harada_charts_updated_at
  BEFORE UPDATE ON harada_charts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Tasks (new granular table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, -- client-generated id e.g. todo_...
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  list_type TEXT NOT NULL DEFAULT 'goal' CHECK (list_type IN ('goal', 'custom')),
  list_id TEXT NOT NULL DEFAULT 'goal:none',
  list_name TEXT,
  goal_index INTEGER,
  parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  ordering DOUBLE PRECISION NOT NULL DEFAULT (extract(epoch from now()) * 1000),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

-- Existing databases: add pin support (safe to run once)
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_list_parent_order ON tasks(user_id, list_id, parent_id, ordering);
CREATE INDEX IF NOT EXISTS idx_tasks_user_active ON tasks(user_id) WHERE deleted_at IS NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tasks" ON tasks;
CREATE POLICY "Users can read own tasks"
  ON tasks
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
CREATE POLICY "Users can insert own tasks"
  ON tasks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
CREATE POLICY "Users can update own tasks"
  ON tasks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;
CREATE POLICY "Users can delete own tasks"
  ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Conflict-safe helper RPC for row-level sync
-- ---------------------------------------------------------------------------
-- Use this in the client to push an array of task rows from an offline outbox.
-- The function only overwrites when incoming.updated_at is newer than stored.
CREATE OR REPLACE FUNCTION upsert_tasks_if_newer(in_rows jsonb)
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
    -- Enforce user isolation inside function as well.
    IF (row_data->>'user_id')::uuid IS DISTINCT FROM auth.uid() THEN
      CONTINUE;
    END IF;

    INSERT INTO tasks (
      id,
      user_id,
      title,
      markdown,
      status,
      list_type,
      list_id,
      list_name,
      goal_index,
      parent_id,
      ordering,
      pinned,
      created_at,
      updated_at,
      deleted_at
    )
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      COALESCE(row_data->>'title', ''),
      COALESCE(row_data->>'markdown', ''),
      COALESCE(row_data->>'status', 'todo'),
      COALESCE(row_data->>'list_type', 'goal'),
      COALESCE(row_data->>'list_id', 'goal:none'),
      row_data->>'list_name',
      NULLIF(row_data->>'goal_index', '')::integer,
      row_data->>'parent_id',
      COALESCE((row_data->>'ordering')::double precision, extract(epoch from now()) * 1000),
      COALESCE((row_data->>'pinned')::boolean, false),
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (id) DO UPDATE
    SET
      title = EXCLUDED.title,
      markdown = EXCLUDED.markdown,
      status = EXCLUDED.status,
      list_type = EXCLUDED.list_type,
      list_id = EXCLUDED.list_id,
      list_name = EXCLUDED.list_name,
      goal_index = EXCLUDED.goal_index,
      parent_id = EXCLUDED.parent_id,
      ordering = EXCLUDED.ordering,
      pinned = EXCLUDED.pinned,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      tasks.user_id = auth.uid()
      AND EXCLUDED.updated_at > tasks.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_tasks_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_tasks_if_newer(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE harada_charts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Optional cleanup after app code no longer reads harada_charts.todos:
-- ALTER TABLE harada_charts DROP COLUMN IF EXISTS todos;
