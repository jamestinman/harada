-- Patch: mark a single task-linked note as the task's primary note.
-- Run after the notes link tables patch.

ALTER TABLE note_task_links
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_task_links_one_primary_per_task
  ON note_task_links(user_id, task_id)
  WHERE deleted_at IS NULL AND is_primary = TRUE;

WITH ranked_links AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, task_id
      ORDER BY created_at ASC, updated_at ASC, id ASC
    ) AS rn
  FROM note_task_links
  WHERE deleted_at IS NULL
)
UPDATE note_task_links l
SET is_primary = ranked_links.rn = 1,
    updated_at = NOW()
FROM ranked_links
WHERE l.id = ranked_links.id
  AND NOT EXISTS (
    SELECT 1
    FROM note_task_links existing
    WHERE existing.user_id = l.user_id
      AND existing.task_id = l.task_id
      AND existing.deleted_at IS NULL
      AND existing.is_primary = TRUE
  );

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

    IF COALESCE((row_data->>'is_primary')::boolean, FALSE) THEN
      UPDATE note_task_links
      SET is_primary = FALSE,
          updated_at = COALESCE((row_data->>'updated_at')::timestamptz, NOW())
      WHERE user_id = auth.uid()
        AND task_id = row_data->>'task_id'
        AND note_id <> row_data->>'note_id'
        AND deleted_at IS NULL
        AND is_primary = TRUE;
    END IF;

    INSERT INTO note_task_links (
      id,
      user_id,
      note_id,
      task_id,
      is_primary,
      created_at,
      updated_at,
      deleted_at
    )
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      row_data->>'note_id',
      row_data->>'task_id',
      COALESCE((row_data->>'is_primary')::boolean, FALSE),
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (id) DO UPDATE
    SET
      is_primary = EXCLUDED.is_primary,
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
