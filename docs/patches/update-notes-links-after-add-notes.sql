-- Incremental patch after add-notes-table.sql
-- Assumes `notes` table + `upsert_notes_if_newer` already exist.
-- This patch adds note link tables and continuously syncs legacy task markdown notes
-- for all users during app changeover.

-- ---------------------------------------------------------------------------
-- Ensure shared trigger exists (safe if already present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Join tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS note_task_links (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, note_id, task_id)
);

CREATE TABLE IF NOT EXISTS note_goal_links (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  goal_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, note_id, goal_index)
);

CREATE INDEX IF NOT EXISTS idx_note_task_links_user_note ON note_task_links(user_id, note_id);
CREATE INDEX IF NOT EXISTS idx_note_task_links_user_task ON note_task_links(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_note_task_links_user_active ON note_task_links(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_note_goal_links_user_note ON note_goal_links(user_id, note_id);
CREATE INDEX IF NOT EXISTS idx_note_goal_links_user_goal ON note_goal_links(user_id, goal_index);
CREATE INDEX IF NOT EXISTS idx_note_goal_links_user_active ON note_goal_links(user_id) WHERE deleted_at IS NULL;

ALTER TABLE note_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_goal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own note task links" ON note_task_links;
CREATE POLICY "Users can read own note task links"
  ON note_task_links FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own note task links" ON note_task_links;
CREATE POLICY "Users can insert own note task links"
  ON note_task_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own note task links" ON note_task_links;
CREATE POLICY "Users can update own note task links"
  ON note_task_links FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own note task links" ON note_task_links;
CREATE POLICY "Users can delete own note task links"
  ON note_task_links FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own note goal links" ON note_goal_links;
CREATE POLICY "Users can read own note goal links"
  ON note_goal_links FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own note goal links" ON note_goal_links;
CREATE POLICY "Users can insert own note goal links"
  ON note_goal_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own note goal links" ON note_goal_links;
CREATE POLICY "Users can update own note goal links"
  ON note_goal_links FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own note goal links" ON note_goal_links;
CREATE POLICY "Users can delete own note goal links"
  ON note_goal_links FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_note_task_links_updated_at ON note_task_links;
CREATE TRIGGER update_note_task_links_updated_at
  BEFORE UPDATE ON note_task_links
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

DROP TRIGGER IF EXISTS update_note_goal_links_updated_at ON note_goal_links;
CREATE TRIGGER update_note_goal_links_updated_at
  BEFORE UPDATE ON note_goal_links
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- ---------------------------------------------------------------------------
-- Link upsert RPCs used by the app
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_note_task_links_if_newer(in_rows jsonb)
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

    INSERT INTO note_task_links (id, user_id, note_id, task_id, created_at, updated_at, deleted_at)
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      row_data->>'note_id',
      row_data->>'task_id',
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (user_id, note_id, task_id) DO UPDATE
    SET
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      note_task_links.user_id = auth.uid()
      AND EXCLUDED.updated_at > note_task_links.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_note_task_links_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_note_task_links_if_newer(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION upsert_note_goal_links_if_newer(in_rows jsonb)
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

    INSERT INTO note_goal_links (id, user_id, note_id, goal_index, created_at, updated_at, deleted_at)
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      row_data->>'note_id',
      NULLIF(row_data->>'goal_index', '')::integer,
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (user_id, note_id, goal_index) DO UPDATE
    SET
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      note_goal_links.user_id = auth.uid()
      AND EXCLUDED.updated_at > note_goal_links.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_note_goal_links_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_note_goal_links_if_newer(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Global migration (all users)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migrate_notes_links_all_users()
RETURNS TABLE (
  synced_task_markdown_notes INTEGER,
  backfilled_note_goal_links INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row RECORD;
  legacy_note_id TEXT;
  task_sync_count INTEGER := 0;
  goal_link_backfill_count INTEGER := 0;
BEGIN
  -- Backfill note_goal_links from legacy notes.goal_index
  WITH inserted AS (
    INSERT INTO note_goal_links (id, user_id, note_id, goal_index, created_at, updated_at, deleted_at)
    SELECT
      'ngl_' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
      n.user_id,
      n.id,
      n.goal_index,
      COALESCE(n.created_at, NOW()),
      COALESCE(n.updated_at, NOW()),
      NULL
    FROM notes n
    WHERE n.goal_index IS NOT NULL
      AND n.deleted_at IS NULL
    ON CONFLICT (user_id, note_id, goal_index) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO goal_link_backfill_count FROM inserted;

  -- Sync legacy tasks.markdown into deterministic companion notes.
  -- This keeps old app writes working while allowing daily idempotent sweeps.
  FOR task_row IN
    SELECT t.*
    FROM tasks t
    WHERE t.deleted_at IS NULL
  LOOP
    legacy_note_id := 'legacy_task_note_' || replace(task_row.user_id::text, '-', '') || '_' || task_row.id;

    -- If markdown is blank, soft-delete previously synced legacy artifacts (if any).
    IF COALESCE(trim(task_row.markdown), '') = '' THEN
      UPDATE note_task_links
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = task_row.user_id
        AND note_id = legacy_note_id
        AND task_id = task_row.id
        AND deleted_at IS NULL;

      UPDATE note_goal_links
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = task_row.user_id
        AND note_id = legacy_note_id
        AND deleted_at IS NULL;

      UPDATE notes
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = legacy_note_id
        AND user_id = task_row.user_id
        AND deleted_at IS NULL;

      CONTINUE;
    END IF;

    INSERT INTO notes (id, user_id, content, created_at, updated_at, deleted_at)
    VALUES (
      legacy_note_id,
      task_row.user_id,
      task_row.markdown,
      COALESCE(task_row.created_at, NOW()),
      NOW(),
      NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET
      content = EXCLUDED.content,
      updated_at = NOW(),
      deleted_at = NULL
    WHERE
      notes.user_id = EXCLUDED.user_id;

    INSERT INTO note_task_links (id, user_id, note_id, task_id, created_at, updated_at, deleted_at)
    VALUES (
      'ntl_' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
      task_row.user_id,
      legacy_note_id,
      task_row.id,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (user_id, note_id, task_id) DO UPDATE
    SET
      updated_at = NOW(),
      deleted_at = NULL;

    IF task_row.goal_index IS NOT NULL THEN
      -- Keep only the current task goal link active for this legacy note.
      UPDATE note_goal_links
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = task_row.user_id
        AND note_id = legacy_note_id
        AND goal_index IS DISTINCT FROM task_row.goal_index
        AND deleted_at IS NULL;

      INSERT INTO note_goal_links (id, user_id, note_id, goal_index, created_at, updated_at, deleted_at)
      VALUES (
        'ngl_' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
        task_row.user_id,
        legacy_note_id,
        task_row.goal_index,
        NOW(),
        NOW(),
        NULL
      )
      ON CONFLICT (user_id, note_id, goal_index) DO UPDATE
      SET
        updated_at = NOW(),
        deleted_at = NULL;
    ELSE
      UPDATE note_goal_links
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = task_row.user_id
        AND note_id = legacy_note_id
        AND deleted_at IS NULL;
    END IF;

    task_sync_count := task_sync_count + 1;
  END LOOP;

  RETURN QUERY SELECT task_sync_count, goal_link_backfill_count;
END;
$$;

REVOKE ALL ON FUNCTION migrate_notes_links_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION migrate_notes_links_all_users() TO service_role;

-- Execute once now for all users
SELECT * FROM migrate_notes_links_all_users();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE note_task_links;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE note_goal_links;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
