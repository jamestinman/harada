-- Patch: task URL field (client field `url` → column `tasks.url`)
-- Run against your Supabase/Postgres project after deploying app code that sends `url` in task rows.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS url TEXT;

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
    IF (row_data->>'user_id')::uuid IS DISTINCT FROM auth.uid() THEN
      CONTINUE;
    END IF;

    INSERT INTO tasks (
      id,
      user_id,
      title,
      markdown,
      url,
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
      NULLIF(row_data->>'url', ''),
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
      url = EXCLUDED.url,
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
