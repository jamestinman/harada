-- Patch: add notes table + conflict-safe upsert function
-- Run this against your Supabase/Postgres project before using the notes feature.

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_index INTEGER,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_goal ON notes(user_id, goal_index);
CREATE INDEX IF NOT EXISTS idx_notes_user_active ON notes(user_id) WHERE deleted_at IS NULL;

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notes" ON notes;
CREATE POLICY "Users can read own notes"
  ON notes
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notes" ON notes;
CREATE POLICY "Users can insert own notes"
  ON notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notes" ON notes;
CREATE POLICY "Users can update own notes"
  ON notes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notes" ON notes;
CREATE POLICY "Users can delete own notes"
  ON notes
  FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

CREATE OR REPLACE FUNCTION upsert_notes_if_newer(in_rows jsonb)
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

    INSERT INTO notes (
      id,
      user_id,
      goal_index,
      content,
      created_at,
      updated_at,
      deleted_at
    )
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      NULLIF(row_data->>'goal_index', '')::integer,
      COALESCE(row_data->>'content', ''),
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (id) DO UPDATE
    SET
      goal_index = EXCLUDED.goal_index,
      content = EXCLUDED.content,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      notes.user_id = auth.uid()
      AND EXCLUDED.updated_at > notes.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_notes_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_notes_if_newer(jsonb) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notes;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
